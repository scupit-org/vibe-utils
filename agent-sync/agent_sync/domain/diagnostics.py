"""Factory functions for all diagnostic codes."""

from __future__ import annotations

from pathlib import Path

from agent_sync.domain.models import Diagnostic


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

def e001_source_root_missing(path: Path) -> Diagnostic:
    return Diagnostic(
        severity="error",
        code="E001",
        message=f"Source directory does not exist: {path}",
        source_path=path,
    )


def e002_malformed_frontmatter(path: Path, detail: str) -> Diagnostic:
    return Diagnostic(
        severity="error",
        code="E002",
        message=f"Malformed YAML frontmatter: {detail}",
        source_path=path,
    )


def e003_missing_name(path: Path) -> Diagnostic:
    return Diagnostic(
        severity="error",
        code="E003",
        message="Missing required field 'name' in frontmatter",
        source_path=path,
    )


def e004_missing_description(path: Path) -> Diagnostic:
    return Diagnostic(
        severity="error",
        code="E004",
        message="Missing required field 'description' in frontmatter",
        source_path=path,
    )


def e005_unknown_model(path: Path, model: str) -> Diagnostic:
    return Diagnostic(
        severity="error",
        code="E005",
        message=f"Unknown model identifier: '{model}'",
        source_path=path,
        context={"model": model},
    )


def e006_duplicate_skill_name(name: str, paths: list[Path]) -> Diagnostic:
    return Diagnostic(
        severity="error",
        code="E006",
        message=f"Duplicate skill name '{name}' found in {len(paths)} locations",
        context={"name": name, "paths": [str(p) for p in paths]},
    )


def e007_duplicate_subagent_name(name: str, paths: list[Path]) -> Diagnostic:
    return Diagnostic(
        severity="error",
        code="E007",
        message=f"Duplicate subagent name '{name}' found in {len(paths)} locations",
        context={"name": name, "paths": [str(p) for p in paths]},
    )


def e008_duplicate_output_path(output_path: str, sources: list[Path]) -> Diagnostic:
    return Diagnostic(
        severity="error",
        code="E008",
        message=f"Duplicate output path '{output_path}' from {len(sources)} sources",
        context={"output_path": output_path, "sources": [str(p) for p in sources]},
    )


def e009_skill_dir_missing_entrypoint(dir_path: Path) -> Diagnostic:
    return Diagnostic(
        severity="error",
        code="E009",
        message="Skill directory contains files but no SKILL.md",
        source_path=dir_path,
    )


def e010_codex_skill_root_conflict(name: str, paths: list[Path]) -> Diagnostic:
    return Diagnostic(
        severity="error",
        code="E010",
        message=(
            "Codex skill name conflict across '.agents/skills' and '.codex/skills': "
            f"'{name}'"
        ),
        context={"name": name, "paths": [str(p) for p in paths]},
    )


def e011_invalid_reasoning_effort(
    path: Path,
    effort: str,
    model: str | None,
    allowed: tuple[str, ...],
) -> Diagnostic:
    target = f"model '{model}'" if model is not None else "a subagent with no model"
    return Diagnostic(
        severity="error",
        code="E011",
        message=(
            f"Invalid reasoning effort '{effort}' for {target}; "
            f"allowed: {', '.join(allowed) if allowed else '(none)'}"
        ),
        source_path=path,
        context={"effort": effort, "model": model, "allowed": list(allowed)},
    )


# ---------------------------------------------------------------------------
# Warnings
# ---------------------------------------------------------------------------

def w001_filename_name_mismatch(path: Path, stem: str, name: str) -> Diagnostic:
    return Diagnostic(
        severity="warning",
        code="W001",
        message=f"Filename stem '{stem}' does not match frontmatter name '{name}'",
        source_path=path,
        context={"filename_stem": stem, "frontmatter_name": name},
    )


def w003_deferred_field_stored(path: Path, field_name: str) -> Diagnostic:
    return Diagnostic(
        severity="warning",
        code="W003",
        message=f"Field '{field_name}' is stored canonically but not emitted in v1",
        source_path=path,
        context={"field": field_name},
    )


def w004_unknown_frontmatter_keys(path: Path, keys: list[str]) -> Diagnostic:
    return Diagnostic(
        severity="warning",
        code="W004",
        message=f"Unknown frontmatter keys not consumed by any writer: {', '.join(keys)}",
        source_path=path,
        context={"keys": keys},
    )


def w005_malformed_nested_skill(path: Path, detail: str) -> Diagnostic:
    return Diagnostic(
        severity="warning",
        code="W005",
        message=f"Nested SKILL.md asset could not be parsed and will be copied verbatim: {detail}",
        source_path=path,
    )


def w006_codex_skill_in_wrong_directory(path: Path, expected_root: Path) -> Diagnostic:
    return Diagnostic(
        severity="warning",
        code="W006",
        message=(
            "Codex skill is under '.codex/skills' instead of '.agents/skills'; "
            f"it will still be processed. Expected root: {expected_root}"
        ),
        source_path=path,
        context={"expected_root": str(expected_root)},
    )


def w007_staging_cleanup_failed(path: Path, detail: str) -> Diagnostic:
    return Diagnostic(
        severity="warning",
        code="W007",
        message=f"Temporary staging directory could not be fully cleaned up: {detail}",
        source_path=path,
    )
