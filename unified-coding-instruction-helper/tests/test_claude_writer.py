"""Tests for agent_sync.write.claude."""

from pathlib import Path, PurePosixPath

from agent_sync.domain.models import SkillSpec, SubagentSpec
from agent_sync.parse.frontmatter import split_frontmatter
from agent_sync.write.claude import ClaudeSkillWriter, ClaudeSubagentWriter


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


class TestClaudeSkillWriter:
    def test_basic_skill(self, tmp_path):
        # Create a source skill dir with SKILL.md
        src = tmp_path / "src" / "greeting"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("---\nname: greeting\n---\nold\n")

        skill = _skill(source_skill_dir=src)
        writer = ClaudeSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".claude" / "skills" / "greeting" / "SKILL.md"
        assert out_file.exists()
        fm, body = split_frontmatter(out_file.read_text())
        assert fm["name"] == "greeting"
        assert fm["description"] == "A greeting skill"
        assert "hello" in body.lower()

    def test_skill_with_model(self, tmp_path):
        src = tmp_path / "src" / "smart"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill(
            source_skill_dir=src,
            relative_skill_dir=PurePosixPath("smart"),
            model="claude-4.6-opus-high",
        )
        writer = ClaudeSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".claude" / "skills" / "smart" / "SKILL.md"
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
        writer = ClaudeSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".claude" / "skills" / "restricted" / "SKILL.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert fm["disable-model-invocation"] is True

    def test_skill_no_model_omits_field(self, tmp_path):
        src = tmp_path / "src" / "basic"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill(source_skill_dir=src, relative_skill_dir=PurePosixPath("basic"))
        writer = ClaudeSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".claude" / "skills" / "basic" / "SKILL.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert "model" not in fm

    def test_gpt_model_maps_to_none(self, tmp_path):
        src = tmp_path / "src" / "gpt"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill(
            source_skill_dir=src,
            relative_skill_dir=PurePosixPath("gpt"),
            model="gpt-5.4-high",
        )
        writer = ClaudeSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".claude" / "skills" / "gpt" / "SKILL.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert "model" not in fm

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
        writer = ClaudeSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        copied = tmp_path / "out" / ".claude" / "skills" / "data" / "templates" / "out.html"
        assert copied.exists()
        assert copied.read_text() == "<html></html>"

    def test_uses_manifest_asset_list(self, tmp_path):
        src = tmp_path / "src" / "listed"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")
        (src / "ignored.txt").write_text("ignore me")

        skill = _skill(
            source_skill_dir=src,
            relative_skill_dir=PurePosixPath("listed"),
            copied_asset_paths=[],
        )
        writer = ClaudeSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        copied = tmp_path / "out" / ".claude" / "skills" / "listed" / "ignored.txt"
        assert not copied.exists()

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
            "model: claude-4.6-opus-high\n"
            "---\n"
            "Reference body.\n"
        )

        skill = _skill(
            source_skill_dir=src,
            relative_skill_dir=PurePosixPath("bundle"),
            copied_asset_paths=[PurePosixPath("references/sample/SKILL.md")],
        )
        writer = ClaudeSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        copied = (
            tmp_path / "out" / ".claude" / "skills" / "bundle"
            / "references" / "sample" / "SKILL.md"
        )
        fm, body = split_frontmatter(copied.read_text())
        assert fm["name"] == "reference"
        assert fm["description"] == "Example reference skill"
        assert fm["disable-model-invocation"] is True
        assert "model" not in fm
        assert "Reference body." in body


class TestClaudeSubagentWriter:
    def test_basic_subagent(self, tmp_path):
        sub = _subagent()
        writer = ClaudeSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".claude" / "agents" / "reviewer.md"
        assert out_file.exists()
        fm, body = split_frontmatter(out_file.read_text())
        assert fm["name"] == "reviewer"
        assert fm["description"] == "Reviews code"
        assert "review code" in body.lower()

    def test_subagent_with_model(self, tmp_path):
        sub = _subagent(model="claude-4.6-sonnet-medium")
        writer = ClaudeSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".claude" / "agents" / "reviewer.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert fm["model"] == "claude-sonnet-4-6"

    def test_subagent_no_model_omits_field(self, tmp_path):
        sub = _subagent()
        writer = ClaudeSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".claude" / "agents" / "reviewer.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert "model" not in fm
