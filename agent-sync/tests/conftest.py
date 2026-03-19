"""Shared test fixtures."""

from __future__ import annotations

import re
import shutil
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"
IGNORED_FIXTURE_NAMES = {".tmp", "__pycache__"}
TMPDIR_NAME_RE = re.compile(r"tmp[a-z0-9_]{6,}$")


def _ignore_fixture_artifacts(_src: str, names: list[str]) -> set[str]:
    """Ignore local temp/staging artifacts accidentally created in fixtures."""
    ignored = {name for name in names if name in IGNORED_FIXTURE_NAMES}
    ignored.update(
        name
        for name in names
        if TMPDIR_NAME_RE.fullmatch(name)
        and Path(_src, name).is_dir()
    )
    return ignored


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
        shutil.copytree(src, dest, ignore=_ignore_fixture_artifacts)
        return dest
    return _copy
