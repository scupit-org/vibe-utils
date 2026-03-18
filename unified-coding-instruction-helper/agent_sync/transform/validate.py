"""Structural and semantic validation checks for a parsed manifest."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from agent_sync.domain.diagnostics import (
    e005_unknown_model,
    e006_duplicate_skill_name,
    e007_duplicate_subagent_name,
    e008_duplicate_output_path,
    w004_unknown_frontmatter_keys,
)
from agent_sync.domain.models import Diagnostic, SyncManifest
from agent_sync.transform.model_map import is_known_model
from agent_sync.write.common import SKILL_OUTPUT_ROOTS, SUBAGENT_OUTPUT_TARGETS


def validate_manifest(manifest: SyncManifest) -> list[Diagnostic]:
    """Run all cross-entity validation checks.

    Per-file checks (E001-E004, E009, W001, W003) are emitted at parse time.
    This function handles manifest-wide checks.
    """
    diagnostics: list[Diagnostic] = []

    _check_unknown_models(manifest, diagnostics)
    _check_duplicate_skill_names(manifest, diagnostics)
    _check_duplicate_subagent_names(manifest, diagnostics)
    _check_duplicate_output_paths(manifest, diagnostics)
    _check_unknown_frontmatter_keys(manifest, diagnostics)

    return diagnostics


def _check_unknown_models(
    manifest: SyncManifest,
    diagnostics: list[Diagnostic],
) -> None:
    """E005: Unknown model string not in allowed vocabulary."""
    for skill in manifest.skills:
        if skill.model is not None and not is_known_model("cursor", skill.model):
            diagnostics.append(e005_unknown_model(skill.entrypoint_path, skill.model))

    for sub in manifest.subagents:
        if sub.model is not None and not is_known_model("cursor", sub.model):
            diagnostics.append(e005_unknown_model(sub.source_path, sub.model))


def _check_duplicate_skill_names(
    manifest: SyncManifest,
    diagnostics: list[Diagnostic],
) -> None:
    """E006: Duplicate canonical skill names."""
    by_name: dict[str, list[Path]] = defaultdict(list)
    for skill in manifest.skills:
        by_name[skill.name].append(skill.entrypoint_path)

    for name, paths in sorted(by_name.items()):
        if len(paths) > 1:
            diagnostics.append(e006_duplicate_skill_name(name, paths))


def _check_duplicate_subagent_names(
    manifest: SyncManifest,
    diagnostics: list[Diagnostic],
) -> None:
    """E007: Duplicate canonical subagent names."""
    by_name: dict[str, list[Path]] = defaultdict(list)
    for sub in manifest.subagents:
        by_name[sub.name].append(sub.source_path)

    for name, paths in sorted(by_name.items()):
        if len(paths) > 1:
            diagnostics.append(e007_duplicate_subagent_name(name, paths))


def _check_duplicate_output_paths(
    manifest: SyncManifest,
    diagnostics: list[Diagnostic],
) -> None:
    """E008: Duplicate output file paths for any single target."""
    checks: list[tuple[str, list[tuple[str, Path]]]] = []
    for parts in SKILL_OUTPUT_ROOTS:
        root = "/".join(parts)
        checks.append(
            (root, [(str(s.relative_skill_dir), s.entrypoint_path) for s in manifest.skills])
        )
    for parts, ext in SUBAGENT_OUTPUT_TARGETS:
        root = "/".join(parts)
        checks.append(
            (root, [(s.filename_stem + ext, s.source_path) for s in manifest.subagents])
        )

    for target_root, pairs in checks:
        by_output: dict[str, list[Path]] = defaultdict(list)
        for output_rel, source in pairs:
            by_output[output_rel].append(source)

        for output_rel, sources in sorted(by_output.items()):
            if len(sources) > 1:
                full_path = f"{target_root}/{output_rel}"
                diagnostics.append(e008_duplicate_output_path(full_path, sources))


def _check_unknown_frontmatter_keys(
    manifest: SyncManifest,
    diagnostics: list[Diagnostic],
) -> None:
    """W004: Frontmatter keys not consumed by any writer."""
    for skill in manifest.skills:
        if skill.extra_frontmatter:
            diagnostics.append(
                w004_unknown_frontmatter_keys(
                    skill.entrypoint_path, sorted(skill.extra_frontmatter.keys()),
                )
            )
    for sub in manifest.subagents:
        if sub.extra_frontmatter:
            diagnostics.append(
                w004_unknown_frontmatter_keys(
                    sub.source_path, sorted(sub.extra_frontmatter.keys()),
                )
            )
