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


class TestNestedAssetModels:
    def test_unknown_model_in_nested_skill_md(self, fixture_repo):
        repo = fixture_repo("nested_skill_unknown_model")
        skill = _skill(
            source_skill_dir=repo / ".cursor" / "skills" / "parent",
            relative_skill_dir=PurePosixPath("parent"),
            entrypoint_path=repo / ".cursor" / "skills" / "parent" / "SKILL.md",
            copied_asset_paths=[PurePosixPath("nested/SKILL.md")],
        )
        m = SyncManifest(skills=[skill])
        diags = validate_manifest(m)
        codes = [d.code for d in diags]
        assert "E005" in codes

    def test_known_model_in_nested_skill_md(self, fixture_repo):
        repo = fixture_repo("nested_skill_reference")
        skill = _skill(
            source_skill_dir=repo / ".cursor" / "skills" / "packages" / "parent",
            relative_skill_dir=PurePosixPath("packages/parent"),
            entrypoint_path=repo / ".cursor" / "skills" / "packages" / "parent" / "SKILL.md",
            model="claude-4.6-opus-high",
            copied_asset_paths=[PurePosixPath("references/example/SKILL.md")],
        )
        m = SyncManifest(skills=[skill])
        diags = validate_manifest(m)
        error_codes = [d.code for d in diags if d.severity == "error"]
        assert "E005" not in error_codes

    def test_malformed_nested_skill_emits_warning(self, fixture_repo):
        repo = fixture_repo("nested_skill_malformed")
        skill = _skill(
            source_skill_dir=repo / ".cursor" / "skills" / "parent",
            relative_skill_dir=PurePosixPath("parent"),
            entrypoint_path=repo / ".cursor" / "skills" / "parent" / "SKILL.md",
            copied_asset_paths=[PurePosixPath("nested/SKILL.md")],
        )
        m = SyncManifest(skills=[skill])
        diags = validate_manifest(m)
        codes = [d.code for d in diags]
        assert "W005" in codes


class TestNonCursorSourceTool:
    def test_claude_model_known_with_claude_source(self):
        m = SyncManifest(subagents=[
            _subagent(source_tool="claude", model="claude-opus-4-6"),
        ])
        diags = validate_manifest(m, source_tool="claude")
        error_codes = [d.code for d in diags if d.severity == "error"]
        assert "E005" not in error_codes

    def test_claude_model_unknown_with_cursor_source(self):
        """A Claude model name is invalid when source is Cursor."""
        m = SyncManifest(subagents=[
            _subagent(model="claude-opus-4-6"),
        ])
        diags = validate_manifest(m, source_tool="cursor")
        error_codes = [d.code for d in diags if d.severity == "error"]
        assert "E005" in error_codes

    def test_codex_model_with_reasoning_effort(self):
        m = SyncManifest(subagents=[
            _subagent(
                source_tool="codex", model="gpt-5.4",
                source_reasoning_effort="high",
            ),
        ])
        diags = validate_manifest(m, source_tool="codex")
        error_codes = [d.code for d in diags if d.severity == "error"]
        assert "E005" not in error_codes

    def test_codex_model_without_reasoning_effort_is_unknown(self):
        m = SyncManifest(subagents=[
            _subagent(source_tool="codex", model="gpt-5.4"),
        ])
        diags = validate_manifest(m, source_tool="codex")
        error_codes = [d.code for d in diags if d.severity == "error"]
        assert "E005" in error_codes

    def test_duplicate_output_paths_with_claude_source(self):
        """With claude source, targets include cursor — check for cursor output conflicts."""
        m = SyncManifest(subagents=[
            _subagent("x", stem="same", source_tool="claude"),
            _subagent("y", stem="same", source_tool="claude"),
        ])
        diags = validate_manifest(m, source_tool="claude")
        codes = [d.code for d in diags]
        assert "E008" in codes
