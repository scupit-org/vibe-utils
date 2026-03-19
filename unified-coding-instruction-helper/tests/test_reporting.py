"""Tests for dropped-field reporting."""

from pathlib import Path, PurePosixPath

from agent_sync.domain.models import SkillSpec, SubagentSpec, SyncManifest
from agent_sync.transform.normalize import collect_dropped_fields


def _skill(**kwargs) -> SkillSpec:
    defaults = dict(
        source_tool="cursor",
        source_root=Path("/repo"),
        source_skill_dir=Path("/repo/.cursor/skills/greeting"),
        relative_skill_dir=PurePosixPath("greeting"),
        entrypoint_path=Path("/repo/.cursor/skills/greeting/SKILL.md"),
        name="greeting",
        description="A greeting skill",
        body_markdown="Say hello.\n",
    )
    defaults.update(kwargs)
    return SkillSpec(**defaults)


def _subagent(**kwargs) -> SubagentSpec:
    defaults = dict(
        source_tool="cursor",
        source_path=Path("/repo/.cursor/agents/reviewer.md"),
        filename_stem="reviewer",
        name="reviewer",
        description="Reviews code",
        prompt_markdown="You review code.\n",
    )
    defaults.update(kwargs)
    return SubagentSpec(**defaults)


class TestDroppedFieldReporting:
    def test_skill_model_counted_for_both_targets(self):
        manifest = SyncManifest(skills=[_skill(model="claude-4.6-opus-high")])

        dropped = collect_dropped_fields(manifest)
        summary = {
            (item.target_tool, item.entity_kind, item.field_name): item.count
            for item in dropped
        }

        assert summary[("claude", "skill", "model")] == 1
        assert summary[("codex", "skill", "model")] == 1

    def test_deferred_subagent_fields_counted_for_both_targets(self):
        manifest = SyncManifest(subagents=[_subagent(readonly=True, is_background=False)])

        dropped = collect_dropped_fields(manifest)
        summary = {
            (item.target_tool, item.entity_kind, item.field_name): item.count
            for item in dropped
        }

        assert summary[("claude", "subagent", "readonly")] == 1
        assert summary[("codex", "subagent", "readonly")] == 1
        assert summary[("claude", "subagent", "is_background")] == 1
        assert summary[("codex", "subagent", "is_background")] == 1

    def test_empty_manifest_has_no_dropped_fields(self):
        assert collect_dropped_fields(SyncManifest()) == []
