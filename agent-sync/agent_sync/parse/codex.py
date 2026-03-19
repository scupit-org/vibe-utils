"""Parse Codex source directories into canonical models."""

from __future__ import annotations

import tomllib
from pathlib import Path, PurePosixPath

import yaml

from agent_sync.domain.diagnostics import (
    e002_malformed_frontmatter,
    e003_missing_name,
    e004_missing_description,
    w001_filename_name_mismatch,
    w003_deferred_field_stored,
    w006_codex_skill_in_wrong_directory,
)
from agent_sync.domain.models import Diagnostic, SkillSpec, SubagentSpec, SyncManifest
from agent_sync.parse.markdown import parse_skills_from_md


# ── Skills ───────────────────────────────────────────────────────────────

CODEX_SKILL_DIR_CANDIDATES: tuple[tuple[str, ...], ...] = (
    (".agents", "skills"),
    (".codex", "skills"),
)
CODEX_CANONICAL_SKILLS_DIR = (".agents", "skills")
CODEX_MISPLACED_SKILLS_DIR = (".codex", "skills")


def get_codex_skill_dirs(repo_root: Path) -> list[Path]:
    """Return existing Codex skill directories in preferred lookup order."""
    dirs: list[Path] = []
    for parts in CODEX_SKILL_DIR_CANDIDATES:
        candidate = repo_root.joinpath(*parts)
        if candidate.is_dir():
            dirs.append(candidate)
    return dirs


def parse_codex_skills(
    source_root: Path,
    skills_dirs: list[Path],
) -> tuple[list[SkillSpec], list[Diagnostic]]:
    """Parse Codex skills from supported Codex skill roots.

    Uses shared Markdown parsing, then checks each skill directory for an
    ``agents/openai.yaml`` sidecar to determine ``disable_model_invocation``.
    """
    skills: list[SkillSpec] = []
    diagnostics: list[Diagnostic] = []
    canonical_root = source_root.joinpath(*CODEX_CANONICAL_SKILLS_DIR)
    misplaced_root = source_root.joinpath(*CODEX_MISPLACED_SKILLS_DIR)

    for skills_dir in skills_dirs:
        parsed_skills, parsed_diags = parse_skills_from_md(
            "codex", source_root, skills_dir,
        )
        skills.extend(parsed_skills)
        diagnostics.extend(parsed_diags)

        for skill in parsed_skills:
            skill.reserved_extra_metadata["codex_skill_root_kind"] = (
                "canonical"
                if skills_dir.resolve() == canonical_root.resolve()
                else "misplaced"
            )
            if skills_dir.resolve() == misplaced_root.resolve():
                diagnostics.append(
                    w006_codex_skill_in_wrong_directory(
                        skill.entrypoint_path, canonical_root,
                    )
                )

    # Codex stores invocation policy in agents/openai.yaml, not in SKILL.md
    # frontmatter.  Override the parsed value with the sidecar, and strip
    # the sidecar from copied_asset_paths since it is Codex-specific metadata.
    sidecar_rel = PurePosixPath("agents/openai.yaml")
    for skill in skills:
        skill.disable_model_invocation = _read_disable_invocation_sidecar(
            skill.source_skill_dir,
        )
        skill.copied_asset_paths = [
            p for p in skill.copied_asset_paths if p != sidecar_rel
        ]

    return skills, diagnostics


def _read_disable_invocation_sidecar(skill_dir: Path) -> bool:
    """Check for ``agents/openai.yaml`` and return True if implicit invocation is disabled."""
    sidecar = skill_dir / "agents" / "openai.yaml"
    if not sidecar.is_file():
        return False

    try:
        data = yaml.safe_load(sidecar.read_text(encoding="utf-8"))
    except yaml.YAMLError:
        return False

    if not isinstance(data, dict):
        return False

    policy = data.get("policy")
    if not isinstance(policy, dict):
        return False

    return policy.get("allow_implicit_invocation") is False


# ── Subagents ────────────────────────────────────────────────────────────

def parse_codex_subagents(
    agents_dir: Path,
) -> tuple[list[SubagentSpec], list[Diagnostic]]:
    """Scan *agents_dir* for ``*.toml`` files."""
    subagents: list[SubagentSpec] = []
    diagnostics: list[Diagnostic] = []

    if not agents_dir.is_dir():
        return subagents, diagnostics

    for toml_path in sorted(agents_dir.glob("*.toml")):
        spec, diags = _parse_single_codex_subagent(toml_path)
        diagnostics.extend(diags)
        if spec is not None:
            subagents.append(spec)

    return subagents, diagnostics


def _parse_single_codex_subagent(
    path: Path,
) -> tuple[SubagentSpec | None, list[Diagnostic]]:
    """Parse a single Codex subagent TOML file."""
    diagnostics: list[Diagnostic] = []

    text = path.read_text(encoding="utf-8")
    try:
        data = tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        return None, [e002_malformed_frontmatter(path, f"Invalid TOML: {exc}")]

    name = data.get("name")
    description = data.get("description")

    if name is None:
        diagnostics.append(e003_missing_name(path))
    if description is None:
        diagnostics.append(e004_missing_description(path))
    if any(d.severity == "error" for d in diagnostics):
        return None, diagnostics

    model = data.get("model")
    reasoning_effort = data.get("model_reasoning_effort")
    prompt = data.get("developer_instructions", "")
    readonly = data.get("readonly")
    is_background = data.get("is_background")

    assert isinstance(name, str), "name must be a string"
    assert isinstance(description, str), "description must be a string"

    stem = path.stem
    if stem != name:
        diagnostics.append(w001_filename_name_mismatch(path, stem, name))

    if readonly is not None:
        diagnostics.append(w003_deferred_field_stored(path, "readonly"))
    if is_background is not None:
        diagnostics.append(w003_deferred_field_stored(path, "is_background"))

    # Collect extra keys not consumed by the canonical model.
    known_keys = {
        "name", "description", "model", "model_reasoning_effort",
        "developer_instructions", "readonly", "is_background",
    }
    extra = {k: v for k, v in data.items() if k not in known_keys}

    spec = SubagentSpec(
        source_tool="codex",
        source_path=path,
        filename_stem=stem,
        name=name,
        description=description,
        prompt_markdown=prompt,
        model=model,
        source_reasoning_effort=reasoning_effort,
        readonly=readonly,
        is_background=is_background,
        extra_frontmatter=extra,
    )
    return spec, diagnostics


# ── Combined entry point ─────────────────────────────────────────────────

def parse_codex_source(repo_root: Path) -> SyncManifest:
    """Full parse of Codex source directories.

    Codex skills live under ``.agents/skills/`` and subagents under
    ``.codex/agents/``.  There is no single source directory.

    Returns a :class:`SyncManifest` which may contain errors.
    """
    skills_dirs = get_codex_skill_dirs(repo_root)
    agents_dir = repo_root / ".codex" / "agents"

    all_warnings: list[Diagnostic] = []
    all_errors: list[Diagnostic] = []

    skills, skill_diags = parse_codex_skills(repo_root, skills_dirs)
    for d in skill_diags:
        (all_errors if d.severity == "error" else all_warnings).append(d)

    subagents, subagent_diags = parse_codex_subagents(agents_dir)
    for d in subagent_diags:
        (all_errors if d.severity == "error" else all_warnings).append(d)

    return SyncManifest(
        skills=skills,
        subagents=subagents,
        warnings=all_warnings,
        errors=all_errors,
    )
