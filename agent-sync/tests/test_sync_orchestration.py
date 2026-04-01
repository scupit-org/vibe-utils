"""Integration tests for agent_sync.app.sync."""

import shutil
from pathlib import Path

from agent_sync.app.sync import SyncOrchestrator
from agent_sync.parse.frontmatter import split_frontmatter


class TestFullSync:
    def test_basic(self, fixture_repo):
        repo = fixture_repo("basic_skill")
        orch = SyncOrchestrator(repo, source_tool="cursor")
        result = orch.run_sync()

        assert result.success
        assert result.skills_written == 1

        # Claude output
        claude_skill = repo / ".claude" / "skills" / "greeting" / "SKILL.md"
        assert claude_skill.exists()

        # Codex output
        codex_skill = repo / ".agents" / "skills" / "greeting" / "SKILL.md"
        assert codex_skill.exists()

    def test_with_subagent(self, fixture_repo):
        repo = fixture_repo("basic_subagent")
        orch = SyncOrchestrator(repo, source_tool="cursor")
        result = orch.run_sync()

        assert result.success
        assert result.subagents_written == 1

        claude_agent = repo / ".claude" / "agents" / "reviewer.md"
        codex_agent = repo / ".codex" / "agents" / "reviewer.toml"
        assert claude_agent.exists()
        assert codex_agent.exists()

    def test_nested_skill_reference_is_copied_once(self, fixture_repo):
        repo = fixture_repo("nested_skill_reference")
        orch = SyncOrchestrator(repo, source_tool="cursor")
        result = orch.run_sync()

        assert result.success
        assert result.skills_written == 1

        claude_ref = (
            repo / ".claude" / "skills" / "packages" / "parent"
            / "references" / "example" / "SKILL.md"
        )
        codex_ref = (
            repo / ".agents" / "skills" / "packages" / "parent"
            / "references" / "example" / "SKILL.md"
        )
        assert claude_ref.exists()
        assert codex_ref.exists()


class TestDryRun:
    def test_no_files_written(self, fixture_repo):
        repo = fixture_repo("basic_skill")
        orch = SyncOrchestrator(repo, source_tool="cursor", dry_run=True)
        result = orch.run_sync()

        assert result.success
        assert result.dry_run is True
        assert result.skills_written == 1

        # No output directories should exist.
        assert not (repo / ".claude" / "skills").exists()
        assert not (repo / ".agents" / "skills").exists()
        assert not (repo / ".tmp").exists()


class TestEmptyManifestSync:
    def test_empty_source_clears_stale_outputs_without_staging(self, fixture_repo):
        repo = fixture_repo("empty_cursor_source")
        stale_skill = repo / ".claude" / "skills" / "stale" / "SKILL.md"
        stale_agent = repo / ".codex" / "agents" / "stale.toml"
        settings_path = repo / ".claude" / "settings.json"
        config_path = repo / ".codex" / "config.toml"
        stale_skill.parent.mkdir(parents=True)
        stale_agent.parent.mkdir(parents=True)
        stale_skill.write_text("stale skill")
        stale_agent.write_text("stale agent")
        settings_path.write_text("{}")
        config_path.write_text("model = 'gpt-5.4'")

        orch = SyncOrchestrator(repo, source_tool="cursor")
        result = orch.run_sync()

        assert result.success
        assert result.skills_written == 0
        assert result.subagents_written == 0
        assert result.managed_subtrees_cleared == 2
        assert not stale_skill.exists()
        assert not stale_agent.exists()
        assert settings_path.exists()
        assert config_path.exists()
        assert not (repo / ".tmp").exists()
        assert not (repo / ".claude" / "skills").exists()
        assert not (repo / ".agents").exists()
        assert not (repo / ".codex" / "agents").exists()


class TestErrorsAbort:
    def test_no_source_dir(self, fixture_repo):
        repo = fixture_repo("missing_source")
        orch = SyncOrchestrator(repo, source_tool="cursor")
        result = orch.run_sync()

        assert not result.success
        codes = [d.code for d in result.errors]
        assert "E001" in codes

    def test_malformed_frontmatter_aborts(self, fixture_repo):
        repo = fixture_repo("malformed_frontmatter")
        orch = SyncOrchestrator(repo, source_tool="cursor")
        result = orch.run_sync()

        assert not result.success
        # No output written.
        assert not (repo / ".claude" / "skills").exists()

    def test_unknown_model_in_nested_asset_aborts(self, fixture_repo):
        repo = fixture_repo("nested_skill_unknown_model")
        orch = SyncOrchestrator(repo, source_tool="cursor")
        result = orch.run_sync()

        assert not result.success
        codes = [d.code for d in result.errors]
        assert "E005" in codes


class TestStagingSafety:
    def test_preserves_unmanaged_files(self, fixture_repo):
        repo = fixture_repo("staging_safety")
        settings_path = repo / ".claude" / "settings.json"
        config_path = repo / ".codex" / "config.toml"

        # Verify they exist before sync.
        assert settings_path.exists()
        assert config_path.exists()

        orch = SyncOrchestrator(repo, source_tool="cursor")
        result = orch.run_sync()
        assert result.success

        # Unmanaged files must survive.
        assert settings_path.exists()
        assert config_path.exists()

    def test_wipes_old_outputs(self, fixture_repo):
        repo = fixture_repo("basic_skill")

        # Create a stale file in a managed subtree.
        stale_dir = repo / ".claude" / "skills" / "old_skill"
        stale_dir.mkdir(parents=True)
        stale_file = stale_dir / "SKILL.md"
        stale_file.write_text("stale")

        orch = SyncOrchestrator(repo, source_tool="cursor")
        result = orch.run_sync()
        assert result.success

        # Stale file should be gone.
        assert not stale_file.exists()
        # But the new skill should exist.
        assert (repo / ".claude" / "skills" / "greeting" / "SKILL.md").exists()

    def test_successful_sync_prunes_repo_staging_parent(self, fixture_repo):
        repo = fixture_repo("basic_skill")
        orch = SyncOrchestrator(repo, source_tool="cursor")
        result = orch.run_sync()

        assert result.success
        assert not (repo / ".tmp").exists()

    def test_cleanup_failure_emits_warning(self, fixture_repo, monkeypatch):
        repo = fixture_repo("basic_skill")
        orch = SyncOrchestrator(repo, source_tool="cursor", dry_run=True)
        real_rmtree = shutil.rmtree
        staging_dir = repo.parent / "manual-staging"
        staging_dir.mkdir()

        def flaky_rmtree(path, *args, **kwargs):
            target = Path(path)
            if target == staging_dir:
                raise OSError("cleanup failed")
            return real_rmtree(path, *args, **kwargs)

        monkeypatch.setattr(orch, "_create_staging_dir", lambda: staging_dir)
        monkeypatch.setattr("agent_sync.app.sync.shutil.rmtree", flaky_rmtree)

        result = orch.run_sync()

        assert result.success
        codes = [d.code for d in result.warnings]
        assert "W007" in codes


class TestValidateCommand:
    def test_validate_success(self, fixture_repo):
        repo = fixture_repo("basic_skill")
        orch = SyncOrchestrator(repo, source_tool="cursor")
        result = orch.run_validate()
        assert result.success

    def test_validate_errors(self, fixture_repo):
        repo = fixture_repo("malformed_frontmatter")
        orch = SyncOrchestrator(repo, source_tool="cursor")
        result = orch.run_validate()
        assert not result.success


class TestDroppedFieldSummary:
    def test_validate_collects_dropped_fields(self, fixture_repo):
        repo = fixture_repo("reporting_summary")
        orch = SyncOrchestrator(repo, source_tool="cursor")
        result = orch.run_validate()

        assert result.success

        summary = {
            (item.target_tool, item.entity_kind, item.field_name): item.count
            for item in result.dropped_fields
        }
        assert summary[("claude", "skill", "model")] == 1
        assert summary[("codex", "skill", "model")] == 1
        assert summary[("claude", "subagent", "readonly")] == 1
        assert summary[("codex", "subagent", "readonly")] == 1
        assert summary[("claude", "subagent", "is_background")] == 1
        assert summary[("codex", "subagent", "is_background")] == 1


class TestClaudeSourceSync:
    def test_generates_cursor_and_codex(self, fixture_repo):
        repo = fixture_repo("claude_source_sync")
        orch = SyncOrchestrator(repo, source_tool="claude")
        result = orch.run_sync()

        assert result.success
        assert result.skills_written == 1
        assert result.subagents_written == 1

        # Cursor output.
        cursor_skill = repo / ".cursor" / "skills" / "greeting" / "SKILL.md"
        assert cursor_skill.exists()
        cursor_agent = repo / ".cursor" / "agents" / "reviewer.md"
        assert cursor_agent.exists()

        # Codex output.
        codex_skill = repo / ".agents" / "skills" / "greeting" / "SKILL.md"
        assert codex_skill.exists()
        codex_agent = repo / ".codex" / "agents" / "reviewer.toml"
        assert codex_agent.exists()

        # Claude source dirs should NOT be touched.
        assert (repo / ".claude" / "skills" / "greeting" / "SKILL.md").exists()
        assert (repo / ".claude" / "agents" / "reviewer.md").exists()

    def test_model_resolved_in_cursor_output(self, fixture_repo):
        repo = fixture_repo("claude_source_sync")
        orch = SyncOrchestrator(repo, source_tool="claude")
        orch.run_sync()

        cursor_agent = repo / ".cursor" / "agents" / "reviewer.md"
        fm, _ = split_frontmatter(cursor_agent.read_text())
        # claude-opus-4-6 should resolve to the priority Cursor model name.
        assert fm["model"] == "claude-4.6-opus-high-thinking"


class TestCodexSourceSync:
    def test_generates_cursor_and_claude(self, fixture_repo):
        repo = fixture_repo("codex_source_sync")
        orch = SyncOrchestrator(repo, source_tool="codex")
        result = orch.run_sync()

        assert result.success
        assert result.skills_written == 1
        assert result.subagents_written == 1

        # Cursor output.
        cursor_skill = repo / ".cursor" / "skills" / "greeting" / "SKILL.md"
        assert cursor_skill.exists()
        cursor_agent = repo / ".cursor" / "agents" / "analyzer.md"
        assert cursor_agent.exists()

        # Claude output.
        claude_skill = repo / ".claude" / "skills" / "greeting" / "SKILL.md"
        assert claude_skill.exists()
        claude_agent = repo / ".claude" / "agents" / "analyzer.md"
        assert claude_agent.exists()

    def test_model_resolved_in_cursor_output(self, fixture_repo):
        repo = fixture_repo("codex_source_sync")
        orch = SyncOrchestrator(repo, source_tool="codex")
        orch.run_sync()

        cursor_agent = repo / ".cursor" / "agents" / "analyzer.md"
        fm, _ = split_frontmatter(cursor_agent.read_text())
        assert fm["model"] == "gpt-5.4-high"

    def test_codex_source_missing_dirs(self, fixture_repo):
        repo = fixture_repo("missing_source")
        orch = SyncOrchestrator(repo, source_tool="codex")
        result = orch.run_sync()
        assert not result.success
        codes = [d.code for d in result.errors]
        assert "E001" in codes

    def test_generates_from_dotcodex_skills(self, fixture_repo):
        repo = fixture_repo("codex_source_sync_dotcodex")
        orch = SyncOrchestrator(repo, source_tool="codex")
        result = orch.run_sync()

        assert result.success
        assert result.skills_written == 1
        assert result.subagents_written == 1
        codes = [d.code for d in result.warnings]
        assert "W006" in codes
        assert (repo / ".cursor" / "skills" / "greeting" / "SKILL.md").exists()
        assert (repo / ".claude" / "skills" / "greeting" / "SKILL.md").exists()

    def test_conflicting_skill_roots_abort(self, fixture_repo):
        repo = fixture_repo("codex_conflicting_skill_roots")
        orch = SyncOrchestrator(repo, source_tool="codex")
        result = orch.run_sync()

        assert not result.success
        codes = [d.code for d in result.errors]
        assert "E010" in codes
