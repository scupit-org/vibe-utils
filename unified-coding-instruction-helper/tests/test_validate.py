"""Tests for agent_sync.transform.validate."""

from pathlib import Path, PurePosixPath

from agent_sync.domain.models import SkillSpec, SubagentSpec, SyncManifest
from agent_sync.transform.validate import validate_manifest


def _skill(name: str = "s", **kwargs) -> SkillSpec:
    defaults = dict(
        source_tool="cursor",
        source_root=Path("/repo"),
        source_skill_dir=Path(f"/repo/.cursor/skills/{name}"),
        relative_skill_dir=PurePosixPath(name),
        entrypoint_path=Path(f"/repo/.cursor/skills/{name}/SKILL.md"),
        name=name,
        description="desc",
        body_markdown="body",
    )
    defaults.update(kwargs)
    return SkillSpec(**defaults)


def _subagent(name: str = "a", stem: str | None = None, **kwargs) -> SubagentSpec:
    if stem is None:
        stem = name
    defaults = dict(
        source_tool="cursor",
        source_path=Path(f"/repo/.cursor/agents/{stem}.md"),
        filename_stem=stem,
        name=name,
        description="desc",
        prompt_markdown="body",
    )
    defaults.update(kwargs)
    return SubagentSpec(**defaults)


class TestUnknownModel:
    def test_skill_unknown_model(self):
        m = SyncManifest(skills=[_skill(model="llama-3-70b")])
        diags = validate_manifest(m)
        codes = [d.code for d in diags]
        assert "E005" in codes

    def test_subagent_unknown_model(self):
        m = SyncManifest(subagents=[_subagent(model="llama-3-70b")])
        diags = validate_manifest(m)
        codes = [d.code for d in diags]
        assert "E005" in codes

    def test_known_model_no_error(self):
        m = SyncManifest(skills=[_skill(model="claude-4.6-opus-high")])
        diags = validate_manifest(m)
        error_codes = [d.code for d in diags if d.severity == "error"]
        assert "E005" not in error_codes


class TestDuplicateSkillNames:
    def test_error(self):
        m = SyncManifest(skills=[
            _skill("greeting", source_skill_dir=Path("/repo/.cursor/skills/foo"),
                   relative_skill_dir=PurePosixPath("foo"),
                   entrypoint_path=Path("/repo/.cursor/skills/foo/SKILL.md")),
            _skill("greeting", source_skill_dir=Path("/repo/.cursor/skills/bar"),
                   relative_skill_dir=PurePosixPath("bar"),
                   entrypoint_path=Path("/repo/.cursor/skills/bar/SKILL.md")),
        ])
        diags = validate_manifest(m)
        codes = [d.code for d in diags]
        assert "E006" in codes

    def test_unique_names_no_error(self):
        m = SyncManifest(skills=[_skill("a"), _skill("b")])
        diags = validate_manifest(m)
        assert "E006" not in [d.code for d in diags]


class TestDuplicateSubagentNames:
    def test_error(self):
        m = SyncManifest(subagents=[
            _subagent("helper", stem="a"),
            _subagent("helper", stem="b"),
        ])
        diags = validate_manifest(m)
        codes = [d.code for d in diags]
        assert "E007" in codes


class TestDuplicateOutputPaths:
    def test_same_filename_stem(self):
        m = SyncManifest(subagents=[
            _subagent("x", stem="same"),
            _subagent("y", stem="same"),
        ])
        diags = validate_manifest(m)
        codes = [d.code for d in diags]
        assert "E008" in codes


class TestUnknownFrontmatterKeys:
    def test_warning(self):
        m = SyncManifest(skills=[_skill(extra_frontmatter={"custom_key": "val"})])
        diags = validate_manifest(m)
        codes = [d.code for d in diags]
        assert "W004" in codes

    def test_no_warning_when_empty(self):
        m = SyncManifest(skills=[_skill()])
        diags = validate_manifest(m)
        assert "W004" not in [d.code for d in diags]


class TestCleanManifest:
    def test_no_diagnostics(self):
        m = SyncManifest(
            skills=[_skill("a"), _skill("b")],
            subagents=[_subagent("x"), _subagent("y")],
        )
        diags = validate_manifest(m)
        errors = [d for d in diags if d.severity == "error"]
        assert len(errors) == 0
