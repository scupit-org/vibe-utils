"""Tests for agent_sync.write.codex."""

from dataclasses import replace
from pathlib import Path, PurePosixPath

import tomllib

from agent_sync.domain.models import (
    SkillSpec,
    SkillSpecOverride,
    SubagentSpec,
    SubagentSpecOverride,
)
from agent_sync.parse.frontmatter import split_frontmatter
from agent_sync.write.codex import CodexSkillWriter, CodexSubagentWriter


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
        source_path=Path("/repo/.cursor/agents/analyzer.md"),
        filename_stem="analyzer",
        name="analyzer",
        description="Analyzes data",
        prompt_markdown="You analyze data.\n",
    )
    if override is None:
        return base
    return replace(base, **override)


class TestCodexSkillWriter:
    def test_basic_skill(self, tmp_path):
        src = tmp_path / "src" / "greeting"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill({"source_skill_dir": src})
        writer = CodexSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".agents" / "skills" / "greeting" / "SKILL.md"
        assert out_file.exists()
        fm, body = split_frontmatter(out_file.read_text())
        assert fm["name"] == "greeting"
        assert fm["description"] == "A greeting skill"
        assert "model" not in fm  # Codex skills never get model
        assert "hello" in body.lower()

    def test_skill_model_dropped(self, tmp_path):
        src = tmp_path / "src" / "smart"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill({
            "source_skill_dir": src,
            "relative_skill_dir": PurePosixPath("smart"),
            "model": "claude-4.6-opus-high",
        })
        writer = CodexSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        out_file = tmp_path / "out" / ".agents" / "skills" / "smart" / "SKILL.md"
        fm, _ = split_frontmatter(out_file.read_text())
        assert "model" not in fm

    def test_disable_invocation_generates_yaml(self, tmp_path):
        src = tmp_path / "src" / "restricted"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill({
            "source_skill_dir": src,
            "relative_skill_dir": PurePosixPath("restricted"),
            "disable_model_invocation": True,
        })
        writer = CodexSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        yaml_file = (
            tmp_path / "out" / ".agents" / "skills" / "restricted"
            / "agents" / "openai.yaml"
        )
        assert yaml_file.exists()
        content = yaml_file.read_text()
        assert "allow_implicit_invocation: false" in content

    def test_no_disable_no_yaml(self, tmp_path):
        src = tmp_path / "src" / "open"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")

        skill = _skill({
            "source_skill_dir": src,
            "relative_skill_dir": PurePosixPath("open"),
            "disable_model_invocation": False,
        })
        writer = CodexSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        yaml_file = (
            tmp_path / "out" / ".agents" / "skills" / "open"
            / "agents" / "openai.yaml"
        )
        assert not yaml_file.exists()

    def test_skill_with_assets(self, tmp_path):
        src = tmp_path / "src" / "data"
        (src / "scripts").mkdir(parents=True)
        (src / "SKILL.md").write_text("")
        (src / "scripts" / "run.sh").write_text("echo hi")

        skill = _skill({
            "source_skill_dir": src,
            "relative_skill_dir": PurePosixPath("data"),
            "copied_asset_paths": [PurePosixPath("scripts/run.sh")],
        })
        writer = CodexSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        copied = tmp_path / "out" / ".agents" / "skills" / "data" / "scripts" / "run.sh"
        assert copied.exists()

    def test_uses_manifest_asset_list(self, tmp_path):
        src = tmp_path / "src" / "listed"
        src.mkdir(parents=True)
        (src / "SKILL.md").write_text("")
        (src / "ignored.txt").write_text("ignore me")

        skill = _skill({
            "source_skill_dir": src,
            "relative_skill_dir": PurePosixPath("listed"),
            "copied_asset_paths": [],
        })
        writer = CodexSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        copied = tmp_path / "out" / ".agents" / "skills" / "listed" / "ignored.txt"
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

        skill = _skill({
            "source_skill_dir": src,
            "relative_skill_dir": PurePosixPath("bundle"),
            "copied_asset_paths": [PurePosixPath("references/sample/SKILL.md")],
        })
        writer = CodexSkillWriter(tmp_path / "out")
        writer.write_skill(skill)

        copied = (
            tmp_path / "out" / ".agents" / "skills" / "bundle"
            / "references" / "sample" / "SKILL.md"
        )
        fm, body = split_frontmatter(copied.read_text())
        assert fm["name"] == "reference"
        assert fm["description"] == "Example reference skill"
        assert "disable-model-invocation" not in fm
        assert "model" not in fm
        assert "Reference body." in body


class TestCodexSubagentWriter:
    def test_basic_toml(self, tmp_path):
        sub = _subagent()
        writer = CodexSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".codex" / "agents" / "analyzer.toml"
        assert out_file.exists()
        data = tomllib.loads(out_file.read_text())
        assert data["name"] == "analyzer"
        assert data["description"] == "Analyzes data"
        assert "analyze data" in data["developer_instructions"].lower()

    def test_gpt_model_and_reasoning(self, tmp_path):
        sub = _subagent({"model": "gpt-5.4-high"})
        writer = CodexSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".codex" / "agents" / "analyzer.toml"
        data = tomllib.loads(out_file.read_text())
        assert data["model"] == "gpt-5.4"
        assert data["model_reasoning_effort"] == "high"

    def test_claude_model_omitted(self, tmp_path):
        sub = _subagent({"model": "claude-4.6-sonnet-medium"})
        writer = CodexSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".codex" / "agents" / "analyzer.toml"
        data = tomllib.loads(out_file.read_text())
        assert "model" not in data
        assert "model_reasoning_effort" not in data

    def test_toml_field_order(self, tmp_path):
        sub = _subagent({"model": "gpt-5.4-medium"})
        writer = CodexSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".codex" / "agents" / "analyzer.toml"
        lines = out_file.read_text().strip().split("\n")
        # First non-empty lines should start with: name, description, model,
        # model_reasoning_effort, developer_instructions
        keys = [l.split("=")[0].strip() for l in lines if "=" in l and not l.startswith(" ")]
        expected_prefix = ["name", "description", "model", "model_reasoning_effort",
                           "developer_instructions"]
        assert keys[:5] == expected_prefix

    def test_multiline_instructions(self, tmp_path):
        sub = _subagent({"prompt_markdown": "Line one.\nLine two.\nLine three.\n"})
        writer = CodexSubagentWriter(tmp_path / "out")
        writer.write_subagent(sub)

        out_file = tmp_path / "out" / ".codex" / "agents" / "analyzer.toml"
        data = tomllib.loads(out_file.read_text())
        assert "Line one." in data["developer_instructions"]
        assert "Line two." in data["developer_instructions"]
