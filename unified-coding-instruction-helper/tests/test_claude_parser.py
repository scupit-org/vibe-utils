"""Tests for agent_sync.parse.claude."""

from pathlib import PurePosixPath

from agent_sync.parse.claude import parse_claude_source


class TestParseBasicClaudeSkill:
    def test_fields(self, fixture_repo):
        repo = fixture_repo("claude_basic_skill")
        m = parse_claude_source(repo)
        assert len(m.skills) == 1
        assert not m.has_errors

        s = m.skills[0]
        assert s.name == "greeting"
        assert s.description == "A basic greeting skill"
        assert "hello" in s.body_markdown.lower()
        assert s.relative_skill_dir == PurePosixPath("greeting")
        assert s.source_tool == "claude"
        assert s.disable_model_invocation is False
        assert s.model is None


class TestParseClaudeSkillDisableInvocation:
    def test_flag_set(self, fixture_repo):
        repo = fixture_repo("claude_skill_disable_invocation")
        m = parse_claude_source(repo)
        assert not m.has_errors
        assert m.skills[0].disable_model_invocation is True


class TestParseClaudeSkillWithAssets:
    def test_assets_collected(self, fixture_repo):
        repo = fixture_repo("claude_skill_with_assets")
        m = parse_claude_source(repo)
        assert len(m.skills) == 1

        s = m.skills[0]
        asset_strs = [str(a) for a in s.copied_asset_paths]
        assert "templates/output.html" in asset_strs


class TestParseClaudeSubagent:
    def test_fields(self, fixture_repo):
        repo = fixture_repo("claude_basic_subagent")
        m = parse_claude_source(repo)
        assert len(m.subagents) == 1
        assert not m.has_errors

        a = m.subagents[0]
        assert a.name == "reviewer"
        assert a.filename_stem == "reviewer"
        assert a.description == "Reviews code for quality and correctness"
        assert a.source_tool == "claude"
        assert a.model is None


class TestParseClaudeSubagentWithModel:
    def test_model_preserved(self, fixture_repo):
        repo = fixture_repo("claude_subagent_with_model")
        m = parse_claude_source(repo)
        assert not m.has_errors
        assert m.subagents[0].model == "claude-opus-4-6"
        assert m.subagents[0].source_tool == "claude"


class TestParseMissingClaudeSource:
    def test_empty_manifest(self, fixture_repo):
        repo = fixture_repo("missing_source")
        m = parse_claude_source(repo)
        assert len(m.skills) == 0
        assert len(m.subagents) == 0
