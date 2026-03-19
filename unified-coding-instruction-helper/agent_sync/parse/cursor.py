"""Parse Cursor source directories into canonical models."""

from __future__ import annotations

from pathlib import Path, PurePosixPath

from agent_sync.domain.diagnostics import (
    e002_malformed_frontmatter,
    e003_missing_name,
    e004_missing_description,
    e009_skill_dir_missing_entrypoint,
    w001_filename_name_mismatch,
    w003_deferred_field_stored,
)
from agent_sync.domain.models import Diagnostic, SkillSpec, SubagentSpec, SyncManifest
from agent_sync.parse.frontmatter import FrontmatterParseError, split_frontmatter


# ── Skills ───────────────────────────────────────────────────────────────

def parse_cursor_skills(
    source_root: Path,
    skills_dir: Path,
) -> tuple[list[SkillSpec], list[Diagnostic]]:
    """Recursively scan *skills_dir* for ``SKILL.md`` files.

    Returns ``(skills, diagnostics)``.
    """
    skills: list[SkillSpec] = []
    diagnostics: list[Diagnostic] = []

    if not skills_dir.is_dir():
        return skills, diagnostics

    # Discover skill roots with a pruned walk. Nested package paths are valid,
    # but once a skill root is found, descendant SKILL.md files are assets.
    skill_entrypoints = _discover_skill_entrypoints(skills_dir)
    skill_dirs: set[Path] = {ep.parent.resolve() for ep in skill_entrypoints}

    # Detect directories that have files but no SKILL.md.
    _check_orphan_dirs(skills_dir, skill_dirs, diagnostics)

    # Pass 2: parse each skill.
    for entrypoint in skill_entrypoints:
        skill_dir = entrypoint.parent
        spec, diags = _parse_single_skill(
            source_root, skills_dir, skill_dir, entrypoint,
        )
        diagnostics.extend(diags)
        if spec is not None:
            skills.append(spec)

    return skills, diagnostics


def _parse_single_skill(
    source_root: Path,
    skills_dir: Path,
    skill_dir: Path,
    entrypoint: Path,
) -> tuple[SkillSpec | None, list[Diagnostic]]:
    """Parse a single SKILL.md.  Returns ``(spec_or_None, diagnostics)``."""
    diagnostics: list[Diagnostic] = []

    text = entrypoint.read_text(encoding="utf-8")
    try:
        frontmatter, body = split_frontmatter(text)
    except FrontmatterParseError as exc:
        return None, [e002_malformed_frontmatter(entrypoint, str(exc))]

    name = frontmatter.pop("name", None)
    description = frontmatter.pop("description", None)
    # Skills are session capabilities, not model selectors. Keep model only as
    # canonical source metadata for compatibility and reporting.
    model = frontmatter.pop("model", None)
    disable_inv = frontmatter.pop("disable-model-invocation", False)

    if name is None:
        diagnostics.append(e003_missing_name(entrypoint))
    if description is None:
        diagnostics.append(e004_missing_description(entrypoint))
    if any(d.severity == "error" for d in diagnostics):
        return None, diagnostics

    # Everything remaining is extra frontmatter.
    extra = dict(frontmatter)

    # Compute relative skill directory as PurePosixPath.
    rel = skill_dir.relative_to(skills_dir)
    relative_skill_dir = PurePosixPath(rel.as_posix())

    # Collect companion asset paths, excluding only the skill root entrypoint.
    copied_assets = _collect_asset_paths(skill_dir)

    spec = SkillSpec(
        source_tool="cursor",
        source_root=source_root,
        source_skill_dir=skill_dir,
        relative_skill_dir=relative_skill_dir,
        entrypoint_path=entrypoint,
        name=name,
        description=description,
        body_markdown=body,
        disable_model_invocation=bool(disable_inv),
        model=model,
        extra_frontmatter=extra,
        copied_asset_paths=copied_assets,
    )
    return spec, diagnostics


def _collect_asset_paths(
    skill_dir: Path,
) -> list[PurePosixPath]:
    """Collect non-entrypoint files in *skill_dir*."""
    assets: list[PurePosixPath] = []
    resolved = skill_dir.resolve()

    for path in sorted(skill_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.name == "SKILL.md" and path.parent.resolve() == resolved:
            continue

        rel = path.relative_to(skill_dir)
        assets.append(PurePosixPath(rel.as_posix()))

    return assets


def _discover_skill_entrypoints(skills_dir: Path) -> list[Path]:
    """Find skill roots under *skills_dir* without descending into skills."""
    entrypoints: list[Path] = []

    def walk(dir_path: Path) -> None:
        entrypoint = dir_path / "SKILL.md"
        if entrypoint.is_file():
            entrypoints.append(entrypoint)
            return

        for child in sorted(dir_path.iterdir()):
            if child.is_dir():
                walk(child)

    walk(skills_dir)
    return entrypoints


def _check_orphan_dirs(
    skills_dir: Path,
    skill_dirs: set[Path],
    diagnostics: list[Diagnostic],
) -> None:
    """Detect directories under *skills_dir* that have files but no SKILL.md."""
    dirs_with_files: set[Path] = set()
    for path in skills_dir.rglob("*"):
        if path.is_file():
            dirs_with_files.add(path.parent.resolve())

    for d in sorted(dirs_with_files):
        resolved = d.resolve()
        if resolved in skill_dirs or resolved == skills_dir.resolve():
            continue
        # OK if this dir is a subdirectory of a known skill dir (companion files).
        is_child_of_skill = any(
            _is_subpath(resolved, sd) for sd in skill_dirs
        )
        if not is_child_of_skill:
            diagnostics.append(e009_skill_dir_missing_entrypoint(d))


def _is_subpath(path: Path, ancestor: Path) -> bool:
    """Return True if *path* is equal to or a descendant of *ancestor*."""
    try:
        path.relative_to(ancestor)
        return True
    except ValueError:
        return False


# ── Subagents ────────────────────────────────────────────────────────────

def parse_cursor_subagents(
    agents_dir: Path,
) -> tuple[list[SubagentSpec], list[Diagnostic]]:
    """Scan *agents_dir* for ``*.md`` files.

    Returns ``(subagents, diagnostics)``.
    """
    subagents: list[SubagentSpec] = []
    diagnostics: list[Diagnostic] = []

    if not agents_dir.is_dir():
        return subagents, diagnostics

    for md_path in sorted(agents_dir.glob("*.md")):
        spec, diags = _parse_single_subagent(md_path)
        diagnostics.extend(diags)
        if spec is not None:
            subagents.append(spec)

    return subagents, diagnostics


def _parse_single_subagent(
    path: Path,
) -> tuple[SubagentSpec | None, list[Diagnostic]]:
    """Parse a single subagent markdown file.  Returns ``(spec_or_None, diagnostics)``."""
    diagnostics: list[Diagnostic] = []

    text = path.read_text(encoding="utf-8")
    try:
        frontmatter, body = split_frontmatter(text)
    except FrontmatterParseError as exc:
        return None, [e002_malformed_frontmatter(path, str(exc))]

    name = frontmatter.pop("name", None)
    description = frontmatter.pop("description", None)
    model = frontmatter.pop("model", None)
    readonly = frontmatter.pop("readonly", None)
    is_background = frontmatter.pop("is_background", None)

    if name is None:
        diagnostics.append(e003_missing_name(path))
    if description is None:
        diagnostics.append(e004_missing_description(path))
    if any(d.severity == "error" for d in diagnostics):
        return None, diagnostics

    stem = path.stem
    if stem != name:
        diagnostics.append(w001_filename_name_mismatch(path, stem, name))

    if readonly is not None:
        diagnostics.append(w003_deferred_field_stored(path, "readonly"))
    if is_background is not None:
        diagnostics.append(w003_deferred_field_stored(path, "is_background"))

    extra = dict(frontmatter)

    spec = SubagentSpec(
        source_tool="cursor",
        source_path=path,
        filename_stem=stem,
        name=name,
        description=description,
        prompt_markdown=body,
        model=model,
        readonly=readonly,
        is_background=is_background,
        extra_frontmatter=extra,
    )
    return spec, diagnostics


# ── Combined entry point ─────────────────────────────────────────────────

def parse_cursor_source(
    repo_root: Path,
    source_dir_name: str = ".cursor",
) -> SyncManifest:
    """Full parse of a Cursor source directory.

    Returns a :class:`SyncManifest` which may contain errors.
    """
    source_dir = repo_root / source_dir_name
    skills_dir = source_dir / "skills"
    agents_dir = source_dir / "agents"

    all_warnings: list[Diagnostic] = []
    all_errors: list[Diagnostic] = []

    skills, skill_diags = parse_cursor_skills(repo_root, skills_dir)
    for d in skill_diags:
        (all_errors if d.severity == "error" else all_warnings).append(d)

    subagents, subagent_diags = parse_cursor_subagents(agents_dir)
    for d in subagent_diags:
        (all_errors if d.severity == "error" else all_warnings).append(d)

    return SyncManifest(
        skills=skills,
        subagents=subagents,
        warnings=all_warnings,
        errors=all_errors,
    )
