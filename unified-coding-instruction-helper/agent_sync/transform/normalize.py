"""Normalization passes applied to a parsed manifest."""

from __future__ import annotations

from collections import defaultdict

from agent_sync.domain.models import DroppedFieldCount, SyncManifest

ALL_TOOLS = ("cursor", "claude", "codex")

# Skill model is intentionally preserved by the Cursor writer but dropped by
# Claude and Codex writers.
_TOOLS_THAT_DROP_SKILL_MODEL = {"claude", "codex"}


def collect_dropped_fields(
    manifest: SyncManifest,
    source_tool: str = "cursor",
) -> list[DroppedFieldCount]:
    """Aggregate intentionally omitted fields across generated targets.

    Skill ``model`` is parsed for compatibility, but intentionally ignored
    by Claude and Codex writers (Cursor preserves it).  Deferred subagent
    fields (``readonly``, ``is_background``) remain canonical-only in v1
    and are reported here for all active targets.
    """
    target_tools = [t for t in ALL_TOOLS if t != source_tool]
    counts: dict[tuple[str, str, str], int] = defaultdict(int)

    for skill in manifest.skills:
        if skill.model is not None:
            for tool in target_tools:
                if tool in _TOOLS_THAT_DROP_SKILL_MODEL:
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
