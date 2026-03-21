"""Tests for agent_sync.cli."""

import subprocess
import sys
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _run_cli(*args: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "agent_sync", *args],
        capture_output=True,
        text=True,
        cwd=cwd,
    )


class TestCliSync:
    def test_sync_success(self, fixture_repo):
        repo = fixture_repo("basic_skill")
        result = _run_cli("sync", "--repo-root", str(repo), "--source-tool", "cursor")
        assert result.returncode == 0
        assert "Sync complete" in result.stderr

    def test_sync_errors(self, fixture_repo):
        repo = fixture_repo("missing_source")
        result = _run_cli("sync", "--repo-root", str(repo), "--source-tool", "cursor")
        assert result.returncode == 1
        assert "[E001]" in result.stderr

    def test_sync_dry_run(self, fixture_repo):
        repo = fixture_repo("basic_skill")
        result = _run_cli(
            "sync", "--repo-root", str(repo), "--source-tool", "cursor", "--dry-run",
        )
        assert result.returncode == 0
        assert "dry run" in result.stderr.lower()

    def test_sync_verbose_reports_manifest_details(self, fixture_repo):
        repo = fixture_repo("codex_source_sync_dotcodex")
        result = _run_cli(
            "sync", "--repo-root", str(repo), "--source-tool", "codex", "--verbose",
            "--dry-run",
        )
        assert result.returncode == 0
        assert "[verbose] codex source lookup:" in result.stderr
        assert "[verbose] parsed manifest: 1 skill(s), 1 subagent(s)" in result.stderr


class TestCliValidate:
    def test_validate_success(self, fixture_repo):
        repo = fixture_repo("basic_skill")
        result = _run_cli(
            "validate", "--repo-root", str(repo), "--source-tool", "cursor",
        )
        assert result.returncode == 0
        assert "passed" in result.stderr.lower()

    def test_validate_errors(self, fixture_repo):
        repo = fixture_repo("malformed_frontmatter")
        result = _run_cli(
            "validate", "--repo-root", str(repo), "--source-tool", "cursor",
        )
        assert result.returncode == 1

    def test_validate_prints_dropped_fields(self, fixture_repo):
        repo = fixture_repo("reporting_summary")
        result = _run_cli(
            "validate", "--repo-root", str(repo), "--source-tool", "cursor",
        )
        assert result.returncode == 0
        assert "Dropped fields:" in result.stderr
        assert "claude skill model (1)" in result.stderr
        assert "codex subagent readonly (1)" in result.stderr


class TestCliSourceTool:
    def test_sync_claude_source(self, fixture_repo):
        repo = fixture_repo("claude_source_sync")
        result = _run_cli(
            "sync", "--repo-root", str(repo), "--source-tool", "claude",
        )
        assert result.returncode == 0
        assert "Sync complete" in result.stderr

    def test_sync_codex_source(self, fixture_repo):
        repo = fixture_repo("codex_source_sync")
        result = _run_cli(
            "sync", "--repo-root", str(repo), "--source-tool", "codex",
        )
        assert result.returncode == 0
        assert "Sync complete" in result.stderr

    def test_validate_claude_source(self, fixture_repo):
        repo = fixture_repo("claude_source_sync")
        result = _run_cli(
            "validate", "--repo-root", str(repo), "--source-tool", "claude",
        )
        assert result.returncode == 0
        assert "passed" in result.stderr.lower()

    def test_validate_codex_source(self, fixture_repo):
        repo = fixture_repo("codex_source_sync")
        result = _run_cli(
            "validate", "--repo-root", str(repo), "--source-tool", "codex",
        )
        assert result.returncode == 0
        assert "passed" in result.stderr.lower()

    def test_validate_codex_source_from_dotcodex_skills(self, fixture_repo):
        repo = fixture_repo("codex_source_sync_dotcodex")
        result = _run_cli(
            "validate", "--repo-root", str(repo), "--source-tool", "codex",
        )
        assert result.returncode == 0
        assert "passed" in result.stderr.lower()
        assert "[W006]" in result.stderr

    def test_validate_codex_conflicting_skill_roots(self, fixture_repo):
        repo = fixture_repo("codex_conflicting_skill_roots")
        result = _run_cli(
            "validate", "--repo-root", str(repo), "--source-tool", "codex",
        )
        assert result.returncode == 1
        assert "[E010]" in result.stderr

    def test_validate_codex_missing_source_points_to_agents_skills(self, fixture_repo):
        repo = fixture_repo("missing_source")
        result = _run_cli(
            "validate", "--repo-root", str(repo), "--source-tool", "codex",
        )
        assert result.returncode == 1
        assert ".agents\\skills" in result.stderr


class TestCliHelp:
    def test_help(self):
        result = _run_cli("--help")
        assert result.returncode == 0
        assert "sync" in result.stdout
        assert "validate" in result.stdout

    def test_source_tool_required(self):
        result = _run_cli("sync", "--repo-root", "repo")
        assert result.returncode != 0
        assert "--source-tool" in result.stderr
