"""Tests for agent_sync.cli."""

import subprocess
import sys
from pathlib import Path

import pytest

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
        result = _run_cli("sync", "--repo-root", str(repo))
        assert result.returncode == 0
        assert "Sync complete" in result.stderr

    def test_sync_errors(self, fixture_repo):
        repo = fixture_repo("missing_source")
        result = _run_cli("sync", "--repo-root", str(repo))
        assert result.returncode == 1
        assert "[E001]" in result.stderr

    def test_sync_dry_run(self, fixture_repo):
        repo = fixture_repo("basic_skill")
        result = _run_cli("sync", "--repo-root", str(repo), "--dry-run")
        assert result.returncode == 0
        assert "dry run" in result.stderr.lower()


class TestCliValidate:
    def test_validate_success(self, fixture_repo):
        repo = fixture_repo("basic_skill")
        result = _run_cli("validate", "--repo-root", str(repo))
        assert result.returncode == 0
        assert "passed" in result.stderr.lower()

    def test_validate_errors(self, fixture_repo):
        repo = fixture_repo("malformed_frontmatter")
        result = _run_cli("validate", "--repo-root", str(repo))
        assert result.returncode == 1


class TestCliHelp:
    def test_help(self):
        result = _run_cli("--help")
        assert result.returncode == 0
        assert "sync" in result.stdout
        assert "validate" in result.stdout
