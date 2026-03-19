"""Tests for agent_sync.parse.codex."""

from pathlib import PurePosixPath

from agent_sync.parse.codex import parse_codex_source


class TestParseBasicCodexSkill:
    def test_fields(self, fixture_repo):
        repo = fixture_repo("codex_basic_skill")
        m = parse_codex_source(repo)
        assert len(m.skills) == 1
        assert not m.has_errors

        s = m.skills[0]
        assert s.name == "greeting"
        assert s.description == "A basic greeting skill"
        assert "hello" in s.body_markdown.lower()
        assert s.relative_skill_dir == PurePosixPath("greeting")
        assert s.source_tool == "codex"
        assert s.disable_model_invocation is False
        assert s.model is None


class TestParseCodexSkillDisableInvocation:
    def test_sidecar_sets_flag(self, fixture_repo):
        repo = fixture_repo("codex_skill_disable_invocation")
        m = parse_codex_source(repo)
        assert not m.has_errors
        assert m.skills[0].disable_model_invocation is True

    def test_sidecar_excluded_from_assets(self, fixture_repo):
        """agents/openai.yaml is Codex metadata, not a companion asset."""
        repo = fixture_repo("codex_skill_disable_invocation")
        m = parse_codex_source(repo)
        asset_strs = [str(a) for a in m.skills[0].copied_asset_paths]
        assert "agents/openai.yaml" not in asset_strs


class TestParseCodexSkillWithAssets:
    def test_assets_collected(self, fixture_repo):
        repo = fixture_repo("codex_skill_with_assets")
        m = parse_codex_source(repo)
        assert len(m.skills) == 1

        s = m.skills[0]
        asset_strs = [str(a) for a in s.copied_asset_paths]
        assert "scripts/helper.py" in asset_strs


class TestParseCodexSubagent:
    def test_fields(self, fixture_repo):
        repo = fixture_repo("codex_basic_subagent")
        m = parse_codex_source(repo)
        assert len(m.subagents) == 1
        assert not m.has_errors

        a = m.subagents[0]
        assert a.name == "analyzer"
        assert a.filename_stem == "analyzer"
        assert a.description == "Analyzes data"
        assert "analyze data" in a.prompt_markdown.lower()
        assert a.source_tool == "codex"
        assert a.model is None
        assert a.source_reasoning_effort is None


class TestParseCodexSubagentWithModel:
    def test_model_and_reasoning(self, fixture_repo):
        repo = fixture_repo("codex_subagent_with_model")
        m = parse_codex_source(repo)
        assert not m.has_errors

        a = m.subagents[0]
        assert a.model == "gpt-5.4"
        assert a.source_reasoning_effort == "high"
        assert a.source_tool == "codex"


class TestParseCodexMalformedToml:
    def test_error(self, fixture_repo):
        repo = fixture_repo("codex_malformed_toml")
        m = parse_codex_source(repo)
        assert m.has_errors
        codes = [d.code for d in m.errors]
        assert "E002" in codes


class TestParseCodexMissingFields:
    def test_missing_name_and_description(self, fixture_repo):
        repo = fixture_repo("codex_missing_fields")
        m = parse_codex_source(repo)
        assert m.has_errors
        codes = [d.code for d in m.errors]
        assert "E003" in codes
        assert "E004" in codes


class TestParseMissingCodexSource:
    def test_empty_manifest(self, fixture_repo):
        repo = fixture_repo("missing_source")
        m = parse_codex_source(repo)
        assert len(m.skills) == 0
        assert len(m.subagents) == 0


class TestParseCodexSkillsFromDotCodex:
    def test_fields(self, fixture_repo):
        repo = fixture_repo("codex_source_sync_dotcodex")
        m = parse_codex_source(repo)

        assert not m.has_errors
        assert len(m.skills) == 1
        assert len(m.subagents) == 1
        assert m.skills[0].source_skill_dir == repo / ".codex" / "skills" / "greeting"
        codes = [d.code for d in m.warnings]
        assert "W006" in codes


class TestParseCodexMixedSkillRoots:
    def test_merges_roots_and_warns_for_misplaced_skills(self, fixture_repo):
        repo = fixture_repo("codex_mixed_skill_roots")
        m = parse_codex_source(repo)

        assert not m.has_errors
        assert len(m.skills) == 2
        assert {skill.name for skill in m.skills} == {"canonical", "misplaced"}
        codes = [d.code for d in m.warnings]
        assert codes.count("W006") == 1


class TestParseCodexConflictingSkillRoots:
    def test_conflicting_names_defer_to_validation(self, fixture_repo):
        repo = fixture_repo("codex_conflicting_skill_roots")
        m = parse_codex_source(repo)

        assert not m.has_errors
        codes = [d.code for d in m.warnings]
        assert "W006" in codes
