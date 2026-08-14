"""Shared Markdown+YAML-frontmatter parsing for skills and subagents.

All tools that store skills/subagents as ``SKILL.md`` or ``*.md`` files with
YAML frontmatter share this parsing logic.  Tool-specific entry points (e.g.
``parse.cursor``, ``parse.claude``) delegate here with the appropriate
``source_tool`` value.
"""

from __future__ import annotations

import re
from pathlib import Path, PurePosixPath

from agent_sync.domain.diagnostics import (
    e002_malformed_frontmatter,
    e003_missing_name,
    e004_missing_description,
    e009_skill_dir_missing_entrypoint,
    w001_filename_name_mismatch,
    w003_deferred_field_stored,
)
from agent_sync.domain.models import Diagnostic, SkillSpec, SubagentSpec, ToolName
from agent_sync.parse.frontmatter import FrontmatterParseError, split_frontmatter
from agent_sync.transform.model_map import normalize_model


# ── Skills ───────────────────────────────────────────────────────────────

def parse_skills_from_md(
    source_tool: ToolName,
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

    skill_entrypoints = discover_skill_entrypoints(skills_dir)
    skill_dirs: set[Path] = {ep.parent.resolve() for ep in skill_entrypoints}

    check_orphan_dirs(skills_dir, skill_dirs, diagnostics)

    for entrypoint in skill_entrypoints:
        skill_dir = entrypoint.parent
        spec, diags = _parse_single_skill(
            source_tool, source_root, skills_dir, skill_dir, entrypoint,
        )
        diagnostics.extend(diags)
        if spec is not None:
            skills.append(spec)

    return skills, diagnostics


def _parse_single_skill(
    source_tool: ToolName,
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
    model = frontmatter.pop("model", None)
    disable_inv = frontmatter.pop("disable-model-invocation", False)

    if name is None:
        diagnostics.append(e003_missing_name(entrypoint))
    if description is None:
        diagnostics.append(e004_missing_description(entrypoint))
    if any(d.severity == "error" for d in diagnostics):
        return None, diagnostics

    extra = dict(frontmatter)

    rel = skill_dir.relative_to(skills_dir)
    relative_skill_dir = PurePosixPath(rel.as_posix())

    copied_assets = collect_asset_paths(skill_dir)

    spec = SkillSpec(
        source_tool=source_tool,
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


# ── Subagents ────────────────────────────────────────────────────────────

def parse_subagents_from_md(
    source_tool: ToolName,
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
        spec, diags = _parse_single_subagent(source_tool, md_path)
        diagnostics.extend(diags)
        if spec is not None:
            subagents.append(spec)

    return subagents, diagnostics


def _parse_single_subagent(
    source_tool: ToolName,
    path: Path,
) -> tuple[SubagentSpec | None, list[Diagnostic]]:
    """Parse a single subagent markdown file."""
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

    reasoning_effort: str | None = None
    if source_tool == "claude":
        reasoning_effort = frontmatter.pop("effort", None)

    if name is None:
        diagnostics.append(e003_missing_name(path))
    if description is None:
        diagnostics.append(e004_missing_description(path))
    if any(d.severity == "error" for d in diagnostics):
        return None, diagnostics

    model_specified_as_alias = False
    ignored_model_params: dict[str, str] = {}
    if isinstance(model, str):
        if source_tool == "cursor":
            # Cursor encodes parameters in the model string:
            # "grok-4.6[effort=high,fast=true]".  Effort is consumed; other
            # params are preserved silently for forward compatibility.
            model, params = _split_cursor_model(model)
            reasoning_effort = params.pop("effort", None)
            ignored_model_params = params
        elif source_tool == "claude" and model == "inherit":
            # "inherit" means "use the session model": same as omitting it.
            model = None
        if model is not None:
            normalized = normalize_model(source_tool, model)
            if normalized is not None:
                # Unknown models keep the raw text so E005 can report it.
                model, model_specified_as_alias = normalized

    stem = path.stem
    if stem != name:
        diagnostics.append(w001_filename_name_mismatch(path, stem, name))

    if readonly is not None:
        diagnostics.append(w003_deferred_field_stored(path, "readonly"))
    if is_background is not None:
        diagnostics.append(w003_deferred_field_stored(path, "is_background"))

    extra = dict(frontmatter)

    spec = SubagentSpec(
        source_tool=source_tool,
        source_path=path,
        filename_stem=stem,
        name=name,
        description=description,
        prompt_markdown=body,
        model=model,
        source_reasoning_effort=reasoning_effort,
        model_specified_as_alias=model_specified_as_alias,
        ignored_model_params=ignored_model_params,
        readonly=readonly,
        is_background=is_background,
        extra_frontmatter=extra,
    )
    return spec, diagnostics


def _split_cursor_model(raw: str) -> tuple[str, dict[str, str]]:
    """Split a Cursor model string into ``(base, params)``.

    Accepts ``base`` or ``base[k1=v1,k2=v2]`` (one bracket group,
    comma-separated ``key=value`` pairs).  Any malformation returns the raw
    string with no params, which then fails model validation verbatim.
    """
    match = re.fullmatch(r"(?P<base>[^\[\]]+)\[(?P<params>[^\[\]]*)\]\s*", raw)
    if match is None:
        return raw, {}
    base = match.group("base").strip()
    if not base:
        return raw, {}
    params: dict[str, str] = {}
    for pair in match.group("params").split(","):
        key, sep, value = pair.partition("=")
        key = key.strip()
        if not sep or not key:
            return raw, {}
        params[key] = value.strip()
    return base, params


# ── Shared helpers ───────────────────────────────────────────────────────

def collect_asset_paths(skill_dir: Path) -> list[PurePosixPath]:
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


def discover_skill_entrypoints(skills_dir: Path) -> list[Path]:
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


def check_orphan_dirs(
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
        is_child_of_skill = any(
            is_subpath(resolved, sd) for sd in skill_dirs
        )
        if not is_child_of_skill:
            diagnostics.append(e009_skill_dir_missing_entrypoint(d))


def is_subpath(path: Path, ancestor: Path) -> bool:
    """Return True if *path* is equal to or a descendant of *ancestor*."""
    try:
        path.relative_to(ancestor)
        return True
    except ValueError:
        return False
