"""Integration tests for agent_sync.app.sync."""

from pathlib import Path

from agent_sync.app.sync import SyncOrchestrator


class TestFullSync:
    def test_basic(self, fixture_repo):
        repo = fixture_repo("basic_skill")
        orch = SyncOrchestrator(repo)
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
        orch = SyncOrchestrator(repo)
        result = orch.run_sync()

        assert result.success
        assert result.subagents_written == 1

        claude_agent = repo / ".claude" / "agents" / "reviewer.md"
        codex_agent = repo / ".codex" / "agents" / "reviewer.toml"
        assert claude_agent.exists()
        assert codex_agent.exists()


class TestDryRun:
    def test_no_files_written(self, fixture_repo):
        repo = fixture_repo("basic_skill")
        orch = SyncOrchestrator(repo, dry_run=True)
        result = orch.run_sync()

        assert result.success
        assert result.dry_run is True
        assert result.skills_written == 1

        # No output directories should exist.
        assert not (repo / ".claude" / "skills").exists()
        assert not (repo / ".agents" / "skills").exists()


class TestErrorsAbort:
    def test_no_source_dir(self, fixture_repo):
        repo = fixture_repo("missing_source")
        orch = SyncOrchestrator(repo)
        result = orch.run_sync()

        assert not result.success
        codes = [d.code for d in result.errors]
        assert "E001" in codes

    def test_malformed_frontmatter_aborts(self, fixture_repo):
        repo = fixture_repo("malformed_frontmatter")
        orch = SyncOrchestrator(repo)
        result = orch.run_sync()

        assert not result.success
        # No output written.
        assert not (repo / ".claude" / "skills").exists()


class TestStagingSafety:
    def test_preserves_unmanaged_files(self, fixture_repo):
        repo = fixture_repo("staging_safety")
        settings_path = repo / ".claude" / "settings.json"
        config_path = repo / ".codex" / "config.toml"

        # Verify they exist before sync.
        assert settings_path.exists()
        assert config_path.exists()

        orch = SyncOrchestrator(repo)
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

        orch = SyncOrchestrator(repo)
        result = orch.run_sync()
        assert result.success

        # Stale file should be gone.
        assert not stale_file.exists()
        # But the new skill should exist.
        assert (repo / ".claude" / "skills" / "greeting" / "SKILL.md").exists()


class TestValidateCommand:
    def test_validate_success(self, fixture_repo):
        repo = fixture_repo("basic_skill")
        orch = SyncOrchestrator(repo)
        result = orch.run_validate()
        assert result.success

    def test_validate_errors(self, fixture_repo):
        repo = fixture_repo("malformed_frontmatter")
        orch = SyncOrchestrator(repo)
        result = orch.run_validate()
        assert not result.success
