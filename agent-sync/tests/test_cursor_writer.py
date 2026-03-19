"""Tests for agent_sync.write.cursor."""

from pathlib import Path, PurePosixPath

from agent_sync.domain.models import SkillSpec, SubagentSpec
from agent_sync.parse.frontmatter import split_frontmatter
from agent_sync.write.cursor import CursorSkillWriter, CursorSubagentWriter


def _skill(**kwargs) -> SkillSpec:
    defaults = dict(
        source_tool="claude",
        source_root=Path("/repo"),
        source_skill_dir=Path("/repo/.claude/skills/greeting"),
        relative_skill_dir=PurePosixPath("greeting"),
        entrypoint_path=Path("/repo/.claude/skills/greeting/SKILL.md"),
        name="greeting",
        description="A greeting skill",
        body_markdown="Say hello.\n",
    )
    defaults.update(kwargs)
    return SkillSpec(**defaults)


def _subagent(**kwargs) -> SubagentSpec:
    defaults = dict(
        source_tool="claude",
        source_path=Path("/repo/.claude/agents/reviewer.md"),
        filename_stem="reviewer",
        name="reviewer",
        description="Reviews code",
        prompt_markdown="You review code.\n",
    )
    defaults.update(kwargs)
    return SubagentSpec(**defaults)


class TestCursorSkillWriter:
    def test_basic_skill(self, tmp_path):
        src = tmp_path / "src" / "greeting"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill(source_skill_dir=src)
        writer = CursorSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".cursor" / "skills" / "greeting" / "SKILL.md"
        assert out_file.exists()
        fm, body = split_frontmatter(out_file.read_text())
        assert fm["name"] == "greeting"
        assert fm["description"] == "A greeting skill"
        assert "hello" in body.lower()

    def test_skill_model_preserved_from_claude(self, tmp_path):
        """Model from Claude source resolves to a Cursor model name."""
        src = tmp_path / "src" / "smart"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill(
            source_tool="claude",
            source_skill_dir=src,
            relative_skill_dir=PurePosixPath("smart"),
            model="claude-opus-4-6",
        )
        writer = CursorSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".cursor" / "skills" / "smart" / "SKILL.md"
        fm, _ = split_frontmatter(out_file.read_text())
        # Should resolve to the priority Cursor model name.
        assert fm["model"] == "claude-4.6-opus-high-thinking"

    def test_skill_no_model_omits_field(self, tmp_path):
        src = tmp_path / "src" / "basic"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill(source_skill_dir=src, relative_skill_dir=PurePosixPath("basic"))
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

        skill = _skill(
            source_tool="claude",
            source_skill_dir=src,
            relative_skill_dir=PurePosixPath("unknown"),
            model="some-future-model",
        )
        writer = CursorSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".cursor" / "skills" / "unknown" / "SKILL.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert "model" not in fm

    def test_skill_disable_invocation(self, tmp_path):
        src = tmp_path / "src" / "restricted"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill(
            source_skill_dir=src,
            relative_skill_dir=PurePosixPath("restricted"),
            disable_model_invocation=True,
        )
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

        skill = _skill(
            source_skill_dir=src,
            relative_skill_dir=PurePosixPath("data"),
            copied_asset_paths=[PurePosixPath("templates/out.html")],
        )
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
            "model: claude-opus-4-6\n"
            "---\n"
            "Reference body.\n"
        )

        skill = _skill(
            source_tool="claude",
            source_skill_dir=src,
            relative_skill_dir=PurePosixPath("bundle"),
            copied_asset_paths=[PurePosixPath("references/sample/SKILL.md")],
        )
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
        # Claude model should be resolved to the priority Cursor model name.
        assert fm["model"] == "claude-4.6-opus-high-thinking"
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
        sub = _subagent(source_tool="claude", model="claude-sonnet-4-6")
        writer = CursorSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".cursor" / "agents" / "reviewer.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert fm["model"] == "claude-4.6-sonnet-medium-thinking"

    def test_subagent_codex_model_with_reasoning(self, tmp_path):
        sub = _subagent(
            source_tool="codex",
            model="gpt-5.4",
            source_reasoning_effort="high",
        )
        writer = CursorSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".cursor" / "agents" / "reviewer.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert fm["model"] == "gpt-5.4-high"

    def test_subagent_no_model_omits_field(self, tmp_path):
        sub = _subagent()
        writer = CursorSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".cursor" / "agents" / "reviewer.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert "model" not in fm
