"""Normalization passes applied to a parsed manifest."""

from __future__ import annotations

from agent_sync.domain.diagnostics import w002_skill_model_dropped_codex
from agent_sync.domain.models import Diagnostic, SyncManifest
from agent_sync.transform.model_map import lookup


def normalize_manifest(manifest: SyncManifest) -> list[Diagnostic]:
    """Surface warnings that require cross-target knowledge.

    Writers call :func:`lookup` directly when they need the mapping.
    This step exists to emit warnings like W002 (skill model dropped
    for a particular target).
    """
    warnings: list[Diagnostic] = []

    for skill in manifest.skills:
        if skill.model is None:
            continue
        row = lookup("cursor", skill.model, None)
        # W002: skill model will be dropped for Codex skill output.
        if row is None or row.codex is None:
            warnings.append(
                w002_skill_model_dropped_codex(skill.entrypoint_path, skill.model)
            )

    return warnings
