"""Shared test fixtures."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixture_repo(tmp_path: Path):
    """Factory fixture: copies a named fixture into *tmp_path* and returns the path.

    Usage::

        def test_foo(fixture_repo):
            repo = fixture_repo("basic_skill")
    """
    def _copy(name: str) -> Path:
        src = FIXTURES_DIR / name
        dest = tmp_path / name
        shutil.copytree(src, dest)
        return dest
    return _copy
