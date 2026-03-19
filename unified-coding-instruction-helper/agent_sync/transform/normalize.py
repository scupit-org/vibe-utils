"""Normalization passes applied to a parsed manifest."""

from __future__ import annotations

from collections import defaultdict

from agent_sync.domain.models import DroppedFieldCount, SyncManifest


def collect_dropped_fields(manifest: SyncManifest) -> list[DroppedFieldCount]:
    """Aggregate intentionally omitted fields across generated targets.

    Skill ``model`` is parsed for compatibility, but intentionally ignored
    in output because skills represent capabilities added to a session,
    not a model-selection mechanism. Deferred subagent fields remain
    canonical-only in v1 and are reported here.
    """
    counts: dict[tuple[str, str, str], int] = defaultdict(int)

    for skill in manifest.skills:
        if skill.model is not None:
            counts[("claude", "skill", "model")] += 1
            counts[("codex", "skill", "model")] += 1

    for subagent in manifest.subagents:
        if subagent.readonly is not None:
            counts[("claude", "subagent", "readonly")] += 1
            counts[("codex", "subagent", "readonly")] += 1
        if subagent.is_background is not None:
            counts[("claude", "subagent", "is_background")] += 1
            counts[("codex", "subagent", "is_background")] += 1

    return [
        DroppedFieldCount(
            target_tool=target_tool, entity_kind=entity_kind,
            field_name=field_name, count=count,
        )
        for (target_tool, entity_kind, field_name), count in sorted(counts.items())
    ]
