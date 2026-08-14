"""Tests for dropped-field reporting."""

from dataclasses import replace
from pathlib import Path, PurePosixPath

from agent_sync.domain.models import (
    SkillSpec,
    SkillSpecOverride,
    SubagentSpec,
    SubagentSpecOverride,
    SyncManifest,
)
from agent_sync.transform.normalize import collect_dropped_fields


def _skill(override: SkillSpecOverride | None = None) -> SkillSpec:
    base = SkillSpec(
        source_tool="cursor",
        source_root=Path("/repo"),
        source_skill_dir=Path("/repo/.cursor/skills/greeting"),
        relative_skill_dir=PurePosixPath("greeting"),
        entrypoint_path=Path("/repo/.cursor/skills/greeting/SKILL.md"),
        name="greeting",
        description="A greeting skill",
        body_markdown="Say hello.\n",
    )
    if override is None:
        return base
    return replace(base, **override)


def _subagent(override: SubagentSpecOverride | None = None) -> SubagentSpec:
    base = SubagentSpec(
        source_tool="cursor",
        source_path=Path("/repo/.cursor/agents/reviewer.md"),
        filename_stem="reviewer",
        name="reviewer",
        description="Reviews code",
        prompt_markdown="You review code.\n",
    )
    if override is None:
        return base
    return replace(base, **override)


class TestDroppedFieldReporting:
    def test_skill_model_counted_for_both_targets(self):
        manifest = SyncManifest(skills=[_skill({"model": "grok-4.6"})])

        dropped = collect_dropped_fields(manifest, source_tool="cursor")
        summary = {
            (item.target_tool, item.entity_kind, item.field_name): item.count
            for item in dropped
        }

        assert summary[("claude", "skill", "model")] == 1
        assert summary[("codex", "skill", "model")] == 1

    def test_deferred_subagent_fields_counted_for_both_targets(self):
        manifest = SyncManifest(subagents=[_subagent({"readonly": True, "is_background": False})])

        dropped = collect_dropped_fields(manifest, source_tool="cursor")
        summary = {
            (item.target_tool, item.entity_kind, item.field_name): item.count
            for item in dropped
        }

        assert summary[("claude", "subagent", "readonly")] == 1
        assert summary[("codex", "subagent", "readonly")] == 1
        assert summary[("claude", "subagent", "is_background")] == 1
        assert summary[("codex", "subagent", "is_background")] == 1

    def test_empty_manifest_has_no_dropped_fields(self):
        assert collect_dropped_fields(SyncManifest(), source_tool="cursor") == []

    def test_skill_model_dropped_for_all_targets(self):
        """Skill model is intentionally ignored by every target writer."""
        manifest = SyncManifest(skills=[_skill({"source_tool": "claude", "model": "claude-opus-5"})])

        dropped = collect_dropped_fields(manifest, source_tool="claude")
        summary = {
            (item.target_tool, item.entity_kind, item.field_name): item.count
            for item in dropped
        }

        assert summary[("codex", "skill", "model")] == 1
        assert summary[("cursor", "skill", "model")] == 1

    def test_deferred_fields_counted_for_all_targets(self):
        """readonly/is_background are dropped for all active targets."""
        manifest = SyncManifest(subagents=[_subagent({"source_tool": "claude", "readonly": True})])

        dropped = collect_dropped_fields(manifest, source_tool="claude")
        summary = {
            (item.target_tool, item.entity_kind, item.field_name): item.count
            for item in dropped
        }

        assert summary[("cursor", "subagent", "readonly")] == 1
        assert summary[("codex", "subagent", "readonly")] == 1
