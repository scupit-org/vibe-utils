"""Normalization passes applied to a parsed manifest."""

from __future__ import annotations

from agent_sync.domain.diagnostics import w002_skill_model_dropped_codex
from agent_sync.domain.models import Diagnostic, SyncManifest
from agent_sync.transform.model_map import resolve_model


def normalize_manifest(manifest: SyncManifest) -> list[Diagnostic]:
    """Resolve models for all entities and return additional warnings.

    Writers call :func:`resolve_model` directly when they need the
    mapping (it is a pure function).  This step exists to surface
    warnings that require cross-target knowledge (e.g., a skill model
    that will be silently dropped for one target).
    """
    warnings: list[Diagnostic] = []

    for skill in manifest.skills:
        resolution = resolve_model(skill.model)

        # W002: skill model will be dropped for Codex skill output.
        if skill.model is not None and resolution.codex_model is None:
            warnings.append(
                w002_skill_model_dropped_codex(skill.entrypoint_path, skill.model)
            )

    return warnings
