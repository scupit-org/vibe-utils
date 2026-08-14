"""Tests for agent_sync.write.cursor."""

from dataclasses import replace
from pathlib import Path, PurePosixPath

from agent_sync.domain.models import (
    SkillSpec,
    SkillSpecOverride,
    SubagentSpec,
    SubagentSpecOverride,
)
from agent_sync.parse.frontmatter import split_frontmatter
from agent_sync.write.cursor import CursorSkillWriter, CursorSubagentWriter


def _skill(override: SkillSpecOverride | None = None) -> SkillSpec:
    base = SkillSpec(
        source_tool="claude",
        source_root=Path("/repo"),
        source_skill_dir=Path("/repo/.claude/skills/greeting"),
        relative_skill_dir=PurePosixPath("greeting"),
        entrypoint_path=Path("/repo/.claude/skills/greeting/SKILL.md"),
        name="greeting",
        description="A greeting skill",
        body_markdown="Say hello.\n",
    )
    if override is None:
        return base
    return replace(base, **override)


def _subagent(override: SubagentSpecOverride | None = None) -> SubagentSpec:
    base = SubagentSpec(
        source_tool="claude",
        source_path=Path("/repo/.claude/agents/reviewer.md"),
        filename_stem="reviewer",
        name="reviewer",
        description="Reviews code",
        prompt_markdown="You review code.\n",
    )
    if override is None:
        return base
    return replace(base, **override)


class TestCursorSkillWriter:
    def test_basic_skill(self, tmp_path):
        src = tmp_path / "src" / "greeting"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill({"source_skill_dir": src})
        writer = CursorSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".cursor" / "skills" / "greeting" / "SKILL.md"
        assert out_file.exists()
        fm, body = split_frontmatter(out_file.read_text())
        assert fm["name"] == "greeting"
        assert fm["description"] == "A greeting skill"
        assert "hello" in body.lower()

    def test_skill_model_is_ignored(self, tmp_path):
        """Skill model metadata is intentionally ignored for every target."""
        src = tmp_path / "src" / "smart"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill({
            "source_tool": "claude",
            "source_skill_dir": src,
            "relative_skill_dir": PurePosixPath("smart"),
            "model": "claude-opus-5",
        })
        writer = CursorSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".cursor" / "skills" / "smart" / "SKILL.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert "model" not in fm

    def test_skill_no_model_omits_field(self, tmp_path):
        src = tmp_path / "src" / "basic"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill({"source_skill_dir": src, "relative_skill_dir": PurePosixPath("basic")})
        writer = CursorSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".cursor" / "skills" / "basic" / "SKILL.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert "model" not in fm

    def test_skill_unknown_model_omits_field(self, tmp_path):
        """When the source model has no Cursor mapping, model is omitted."""
        src = tmp_path / "src" / "unknown"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill({
            "source_tool": "claude",
            "source_skill_dir": src,
            "relative_skill_dir": PurePosixPath("unknown"),
            "model": "some-future-model",
        })
        writer = CursorSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".cursor" / "skills" / "unknown" / "SKILL.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert "model" not in fm

    def test_skill_disable_invocation(self, tmp_path):
        src = tmp_path / "src" / "restricted"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill({
            "source_skill_dir": src,
            "relative_skill_dir": PurePosixPath("restricted"),
            "disable_model_invocation": True,
        })
        writer = CursorSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".cursor" / "skills" / "restricted" / "SKILL.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert fm["disable-model-invocation"] is True

    def test_skill_with_assets(self, tmp_path):
        src = tmp_path / "src" / "data"
        (src / "templates").mkdir(parents=True)
        (src / "SKILL.md").write_text("")
        (src / "templates" / "out.html").write_text("<html></html>")

        skill = _skill({
            "source_skill_dir": src,
            "relative_skill_dir": PurePosixPath("data"),
            "copied_asset_paths": [PurePosixPath("templates/out.html")],
        })
        writer = CursorSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        copied = tmp_path / "out" / ".cursor" / "skills" / "data" / "templates" / "out.html"
        assert copied.exists()
        assert copied.read_text() == "<html></html>"


    def test_transforms_nested_skill_asset(self, tmp_path):
        src = tmp_path / "src" / "bundle"
        nested = src / "references" / "sample"
        nested.mkdir(parents=True)
        (src / "SKILL.md").write_text("")
        (nested / "SKILL.md").write_text(
            "---\n"
            "name: reference\n"
            "description: Example reference skill\n"
            "disable-model-invocation: true\n"
            "model: claude-opus-5\n"
            "---\n"
            "Reference body.\n"
        )

        skill = _skill({
            "source_tool": "claude",
            "source_skill_dir": src,
            "relative_skill_dir": PurePosixPath("bundle"),
            "copied_asset_paths": [PurePosixPath("references/sample/SKILL.md")],
        })
        writer = CursorSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        copied = (
            tmp_path / "out" / ".cursor" / "skills" / "bundle"
            / "references" / "sample" / "SKILL.md"
        )
        fm, body = split_frontmatter(copied.read_text())
        assert fm["name"] == "reference"
        assert fm["description"] == "Example reference skill"
        assert fm["disable-model-invocation"] is True
        # Skill model metadata is intentionally ignored for every target.
        assert "model" not in fm
        assert "Reference body." in body


class TestCursorSubagentWriter:
    def test_basic_subagent(self, tmp_path):
        sub = _subagent()
        writer = CursorSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".cursor" / "agents" / "reviewer.md"
        assert out_file.exists()
        fm, body = split_frontmatter(out_file.read_text())
        assert fm["name"] == "reviewer"
        assert fm["description"] == "Reviews code"
        assert "review code" in body.lower()

    def test_subagent_with_claude_model(self, tmp_path):
        # Moderate tier: Cursor has no moderate model, walks up to grok-4.6.
        sub = _subagent({"source_tool": "claude", "model": "claude-sonnet-5"})
        writer = CursorSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".cursor" / "agents" / "reviewer.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert fm["model"] == "grok-4.6"

    def test_subagent_codex_model_with_reasoning(self, tmp_path):
        sub = _subagent({
            "source_tool": "codex",
            "model": "gpt-5.6-sol",
            "source_reasoning_effort": "high",
        })
        writer = CursorSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".cursor" / "agents" / "reviewer.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert fm["model"] == "grok-4.6[effort=high]"

    def test_effort_max_clamps_to_xhigh(self, tmp_path):
        sub = _subagent({
            "source_tool": "claude",
            "model": "claude-opus-5",
            "source_reasoning_effort": "max",
        })
        writer = CursorSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".cursor" / "agents" / "reviewer.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert fm["model"] == "grok-4.6[effort=xhigh]"

    def test_small_tier_maps_to_composer_and_drops_effort(self, tmp_path):
        # composer-2.5 takes no effort parameter: effort is omitted entirely.
        sub = _subagent({
            "source_tool": "codex",
            "model": "gpt-5.6-luna",
            "source_reasoning_effort": "medium",
        })
        writer = CursorSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".cursor" / "agents" / "reviewer.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert fm["model"] == "composer-2.5"

    def test_model_less_effort_is_dropped(self, tmp_path):
        # Effort is only expressible as a model bracket param in Cursor.
        sub = _subagent({"source_tool": "claude", "source_reasoning_effort": "high"})
        writer = CursorSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".cursor" / "agents" / "reviewer.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert "model" not in fm
        assert "effort" not in fm

    def test_subagent_no_model_omits_field(self, tmp_path):
        sub = _subagent()
        writer = CursorSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".cursor" / "agents" / "reviewer.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert "model" not in fm
