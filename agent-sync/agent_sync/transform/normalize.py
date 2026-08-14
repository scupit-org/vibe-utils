"""Normalization passes applied to a parsed manifest."""

from __future__ import annotations

from collections import defaultdict

from agent_sync.domain.models import (
    ALL_TOOL_NAMES,
    DroppedFieldCount,
    EntityKind,
    SyncManifest,
    ToolName,
)

def collect_dropped_fields(
    manifest: SyncManifest,
    source_tool: ToolName,
) -> list[DroppedFieldCount]:
    """Aggregate intentionally omitted fields across generated targets.

    Skill ``model`` is parsed for compatibility, but intentionally ignored
    by every writer.  Deferred subagent fields (``readonly``,
    ``is_background``) remain canonical-only in v1 and are reported here
    for all active targets.
    """
    target_tools: list[ToolName] = [tool for tool in ALL_TOOL_NAMES if tool != source_tool]
    counts: dict[tuple[ToolName, EntityKind, str], int] = defaultdict(int)

    for skill in manifest.skills:
        if skill.model is not None:
            for tool in target_tools:
                counts[(tool, "skill", "model")] += 1

    for subagent in manifest.subagents:
        if subagent.readonly is not None:
            for tool in target_tools:
                counts[(tool, "subagent", "readonly")] += 1
        if subagent.is_background is not None:
            for tool in target_tools:
                counts[(tool, "subagent", "is_background")] += 1

    return [
        DroppedFieldCount(
            target_tool=target_tool, entity_kind=entity_kind,
            field_name=field_name, count=count,
        )
        for (target_tool, entity_kind, field_name), count in sorted(counts.items())
    ]
