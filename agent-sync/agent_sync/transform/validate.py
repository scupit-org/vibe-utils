"""Structural and semantic validation checks for a parsed manifest."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from agent_sync.domain.diagnostics import (
    e005_unknown_model,
    e006_duplicate_skill_name,
    e007_duplicate_subagent_name,
    e008_duplicate_output_path,
    e010_codex_skill_root_conflict,
    w004_unknown_frontmatter_keys,
    w005_malformed_nested_skill,
)
from agent_sync.domain.models import Diagnostic, SyncManifest, ToolName
from agent_sync.parse.frontmatter import FrontmatterParseError, split_frontmatter
from agent_sync.transform.model_map import is_known_model
from agent_sync.write.common import get_skill_output_roots, get_subagent_output_targets


def validate_manifest(
    manifest: SyncManifest,
    source_tool: ToolName,
) -> list[Diagnostic]:
    """Run all cross-entity validation checks.

    Per-file checks (E001-E004, E009, W001, W003) are emitted at parse time.
    This function handles manifest-wide checks.
    """
    diagnostics: list[Diagnostic] = []

    _check_unknown_models(manifest, diagnostics, source_tool)
    _check_nested_asset_models(manifest, diagnostics, source_tool)
    _check_duplicate_skill_names(manifest, diagnostics)
    _check_duplicate_subagent_names(manifest, diagnostics)
    _check_duplicate_output_paths(manifest, diagnostics, source_tool)
    _check_unknown_frontmatter_keys(manifest, diagnostics)

    return diagnostics


def _check_unknown_models(
    manifest: SyncManifest,
    diagnostics: list[Diagnostic],
    source_tool: ToolName,
) -> None:
    """E005: Unknown model string not in allowed vocabulary."""
    for skill in manifest.skills:
        if skill.model is not None and not is_known_model(source_tool, skill.model):
            diagnostics.append(e005_unknown_model(skill.entrypoint_path, skill.model))

    for sub in manifest.subagents:
        if sub.model is not None and not is_known_model(
            source_tool, sub.model, sub.source_reasoning_effort,
        ):
            diagnostics.append(e005_unknown_model(sub.source_path, sub.model))


def _check_nested_asset_models(
    manifest: SyncManifest,
    diagnostics: list[Diagnostic],
    source_tool: ToolName,
) -> None:
    """E005/W005: Validate nested SKILL.md companion assets."""
    for skill in manifest.skills:
        for rel_asset in skill.copied_asset_paths:
            if rel_asset.name != "SKILL.md":
                continue
            asset_path = skill.source_skill_dir / rel_asset
            if not asset_path.is_file():
                continue
            try:
                text = asset_path.read_text(encoding="utf-8")
            except OSError as exc:
                diagnostics.append(w005_malformed_nested_skill(asset_path, str(exc)))
                continue
            try:
                fm, _ = split_frontmatter(text)
            except FrontmatterParseError as exc:
                diagnostics.append(w005_malformed_nested_skill(asset_path, str(exc)))
                continue
            model = fm.get("model")
            if isinstance(model, str) and not is_known_model(source_tool, model):
                diagnostics.append(e005_unknown_model(asset_path, model))


def _check_duplicate_skill_names(
    manifest: SyncManifest,
    diagnostics: list[Diagnostic],
) -> None:
    """E006/E010: Duplicate canonical skill names and Codex cross-root conflicts."""
    by_name: dict[str, list[Path]] = defaultdict(list)
    root_kinds_by_name: dict[str, set[str]] = defaultdict(set)
    for skill in manifest.skills:
        by_name[skill.name].append(skill.entrypoint_path)
        root_kind = skill.reserved_extra_metadata.get("codex_skill_root_kind")
        if isinstance(root_kind, str):
            root_kinds_by_name[skill.name].add(root_kind)

    for name, paths in sorted(by_name.items()):
        root_kinds = root_kinds_by_name.get(name, set())
        if root_kinds == {"canonical", "misplaced"}:
            diagnostics.append(e010_codex_skill_root_conflict(name, paths))
        if len(paths) == 2 and root_kinds == {"canonical", "misplaced"}:
            continue
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
    source_tool: ToolName,
) -> None:
    """E008: Duplicate output file paths for any single target."""
    skill_roots = get_skill_output_roots(exclude_tool=source_tool)
    subagent_targets = get_subagent_output_targets(exclude_tool=source_tool)

    checks: list[tuple[str, list[tuple[str, Path]]]] = []
    for parts in skill_roots:
        root = "/".join(parts)
        checks.append(
            (root, [(str(s.relative_skill_dir), s.entrypoint_path) for s in manifest.skills])
        )
    for parts, ext in subagent_targets:
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
