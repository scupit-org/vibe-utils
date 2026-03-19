"""Parse Cursor source directories into canonical models."""

from __future__ import annotations

from pathlib import Path

from agent_sync.domain.models import Diagnostic, SkillSpec, SubagentSpec, SyncManifest
from agent_sync.parse.markdown import parse_skills_from_md, parse_subagents_from_md


# ── Skills ───────────────────────────────────────────────────────────────

def parse_cursor_skills(
    source_root: Path,
    skills_dir: Path,
) -> tuple[list[SkillSpec], list[Diagnostic]]:
    """Recursively scan *skills_dir* for ``SKILL.md`` files.

    Returns ``(skills, diagnostics)``.
    """
    return parse_skills_from_md("cursor", source_root, skills_dir)


# ── Subagents ────────────────────────────────────────────────────────────

def parse_cursor_subagents(
    agents_dir: Path,
) -> tuple[list[SubagentSpec], list[Diagnostic]]:
    """Scan *agents_dir* for ``*.md`` files.

    Returns ``(subagents, diagnostics)``.
    """
    return parse_subagents_from_md("cursor", agents_dir)


# ── Combined entry point ─────────────────────────────────────────────────

def parse_cursor_source(repo_root: Path) -> SyncManifest:
    """Full parse of a Cursor source directory.

    Returns a :class:`SyncManifest` which may contain errors.
    """
    source_dir = repo_root / ".cursor"
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
