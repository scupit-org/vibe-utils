"""Tests for agent_sync.parse.cursor."""

from pathlib import PurePosixPath

from agent_sync.parse.cursor import parse_cursor_source


class TestParseBasicSkill:
    def test_fields(self, fixture_repo):
        repo = fixture_repo("basic_skill")
        m = parse_cursor_source(repo)
        assert len(m.skills) == 1
        assert not m.has_errors

        s = m.skills[0]
        assert s.name == "greeting"
        assert s.description == "A basic greeting skill"
        assert "hello" in s.body_markdown.lower()
        assert s.relative_skill_dir == PurePosixPath("greeting")
        assert s.source_tool == "cursor"
        assert s.disable_model_invocation is False
        assert s.model is None


class TestParseSkillWithAssets:
    def test_assets_collected(self, fixture_repo):
        repo = fixture_repo("skill_with_assets")
        m = parse_cursor_source(repo)
        assert len(m.skills) == 1

        s = m.skills[0]
        asset_strs = [str(a) for a in s.copied_asset_paths]
        assert "templates/output.html" in asset_strs
        assert "scripts/helper.py" in asset_strs


class TestParseNestedSkillReference:
    def test_nested_reference_is_asset_not_skill(self, fixture_repo):
        repo = fixture_repo("nested_skill_reference")
        m = parse_cursor_source(repo)

        assert len(m.skills) == 1
        assert not m.has_errors

        s = m.skills[0]
        assert s.relative_skill_dir == PurePosixPath("packages/parent")
        asset_strs = [str(a) for a in s.copied_asset_paths]
        assert "references/example/SKILL.md" in asset_strs
        assert "references/example/helper.txt" in asset_strs


class TestParseSkillDisableInvocation:
    def test_flag_set(self, fixture_repo):
        repo = fixture_repo("skill_disable_invocation")
        m = parse_cursor_source(repo)
        assert m.skills[0].disable_model_invocation is True


class TestParseSkillWithModel:
    def test_model_preserved(self, fixture_repo):
        repo = fixture_repo("skill_with_model")
        m = parse_cursor_source(repo)
        assert m.skills[0].model == "grok-4.6"


class TestParseSubagentModelBrackets:
    def test_effort_extracted_from_bracket(self, fixture_repo):
        repo = fixture_repo("subagent_with_gpt_model")
        m = parse_cursor_source(repo)
        assert not m.has_errors

        a = m.subagents[0]
        assert a.model == "grok-4.6"
        assert a.source_reasoning_effort == "high"
        assert a.ignored_model_params == {}

    def test_extra_params_preserved_silently(self, fixture_repo):
        repo = fixture_repo("cursor_subagent_bracket_params")
        m = parse_cursor_source(repo)
        assert not m.has_errors

        a = m.subagents[0]
        assert a.model == "grok-4.6"
        assert a.source_reasoning_effort == "medium"
        assert a.ignored_model_params == {"fast": "true"}
        # Unrecognized bracket params never surface as warnings.
        assert m.warnings == []

    def test_bare_model_without_brackets(self, fixture_repo):
        repo = fixture_repo("subagent_with_claude_model")
        m = parse_cursor_source(repo)
        assert not m.has_errors

        a = m.subagents[0]
        assert a.model == "composer-2.5"
        assert a.source_reasoning_effort is None

    def test_malformed_bracket_kept_verbatim(self, tmp_path):
        agents_dir = tmp_path / ".cursor" / "agents"
        agents_dir.mkdir(parents=True)
        (agents_dir / "bad.md").write_text(
            "---\n"
            "name: bad\n"
            "description: Malformed bracket syntax\n"
            "model: grok-4.6[effort\n"
            "---\n"
            "Body.\n"
        )
        m = parse_cursor_source(tmp_path)
        assert not m.has_errors  # E005 is a validation-stage concern
        assert m.subagents[0].model == "grok-4.6[effort"
        assert m.subagents[0].source_reasoning_effort is None


class TestParseBasicSubagent:
    def test_fields(self, fixture_repo):
        repo = fixture_repo("basic_subagent")
        m = parse_cursor_source(repo)
        assert len(m.subagents) == 1
        assert not m.has_errors

        a = m.subagents[0]
        assert a.name == "reviewer"
        assert a.filename_stem == "reviewer"
        assert a.description == "Reviews code for quality and correctness"
        assert "code reviewer" in a.prompt_markdown.lower()


class TestParseMissingSource:
    def test_empty_manifest(self, fixture_repo):
        repo = fixture_repo("missing_source")
        m = parse_cursor_source(repo)
        assert len(m.skills) == 0
        assert len(m.subagents) == 0
        # No .cursor dir at all — parse returns empty, not error
        # (E001 is checked by orchestrator)


class TestParseMalformedFrontmatter:
    def test_error(self, fixture_repo):
        repo = fixture_repo("malformed_frontmatter")
        m = parse_cursor_source(repo)
        assert m.has_errors
        codes = [d.code for d in m.errors]
        assert "E002" in codes


class TestParseMissingRequiredFields:
    def test_missing_description(self, fixture_repo):
        repo = fixture_repo("missing_required_fields")
        m = parse_cursor_source(repo)
        assert m.has_errors
        codes = [d.code for d in m.errors]
        assert "E004" in codes


class TestParseSkillDirNoEntrypoint:
    def test_orphan_dir(self, fixture_repo):
        repo = fixture_repo("skill_dir_no_entrypoint")
        m = parse_cursor_source(repo)
        codes = [d.code for d in m.errors]
        assert "E009" in codes


class TestParseFilenameMismatch:
    def test_warning(self, fixture_repo):
        repo = fixture_repo("filename_mismatch")
        m = parse_cursor_source(repo)
        assert not m.has_errors
        codes = [d.code for d in m.warnings]
        assert "W001" in codes
