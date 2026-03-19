"""Split YAML frontmatter from markdown body."""

from __future__ import annotations

from typing import Any

import yaml


class FrontmatterParseError(Exception):
    """Raised when YAML frontmatter is present but malformed."""


def split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Split ``---`` delimited YAML frontmatter from a markdown body.

    Returns ``(frontmatter_dict, body_markdown)``.

    * No ``---`` at start → ``({}, full_text)``
    * ``---`` at start but no closing ``---`` → :class:`FrontmatterParseError`
    * Empty file → ``({}, "")``
    * Frontmatter only (no body after closing ``---``) → ``(parsed, "")``

    Raises :class:`FrontmatterParseError` on malformed YAML.
    """
    if not text:
        return {}, ""

    lines = text.splitlines(keepends=True)

    # First line must be a '---' delimiter to have frontmatter.
    if lines[0].strip() != "---":
        return {}, text

    # Walk lines looking for the closing '---' delimiter.
    yaml_lines: list[str] = []
    close_idx: int | None = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            close_idx = i
            break
        yaml_lines.append(line)

    if close_idx is None:
        raise FrontmatterParseError("Opening '---' found but no closing '---' delimiter")

    yaml_text = "".join(yaml_lines)
    body = "".join(lines[close_idx + 1:])

    try:
        parsed = yaml.safe_load(yaml_text)
    except yaml.YAMLError as exc:
        raise FrontmatterParseError(str(exc)) from exc

    # safe_load returns None for empty YAML content
    if parsed is None:
        parsed = {}

    if not isinstance(parsed, dict):
        raise FrontmatterParseError(
            f"Frontmatter must be a YAML mapping, got {type(parsed).__name__}"
        )

    return parsed, body
