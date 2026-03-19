"""Unified model mapping registry and resolver.

Each known model variant is a :class:`CrossToolModelRow` carrying the
:class:`ModelEntry` for every tool.  Lookup dictionaries are built
programmatically from the registry so adding a new parser later only
requires adding rows — not a cross-product of new dicts.
"""

from __future__ import annotations

from dataclasses import dataclass

from agent_sync.domain.models import ALL_TOOL_NAMES, ToolName


@dataclass(frozen=True, slots=True)
class ModelEntry:
    """A model identifier for a single tool."""

    model_name: str
    reasoning_effort: str | None = None
    takes_priority_for_overlaps: bool = False


@dataclass(frozen=True, slots=True)
class CrossToolModelRow:
    """Maps a single model variant across all supported tools."""

    cursor: ModelEntry | None = None
    claude: ModelEntry | None = None
    codex: ModelEntry | None = None

    def get(self, tool: ToolName) -> ModelEntry | None:
        return getattr(self, tool)


# ── Single source of truth ───────────────────────────────────────────────

MODEL_ROWS: list[CrossToolModelRow] = [
    # Composer (Cursor-only, no cross-tool mapping)
    CrossToolModelRow(
        cursor=ModelEntry("composer-1.5"),
    ),

    # Claude Sonnet family
    CrossToolModelRow(
        cursor=ModelEntry("claude-4.6-sonnet-medium"),
        claude=ModelEntry("claude-sonnet-4-6"),
    ),
    CrossToolModelRow(
        cursor=ModelEntry("claude-4.6-sonnet-medium-thinking",
                          takes_priority_for_overlaps=True),
        claude=ModelEntry("claude-sonnet-4-6"),
    ),

    # Claude Opus family
    CrossToolModelRow(
        cursor=ModelEntry("claude-4.6-opus-high"),
        claude=ModelEntry("claude-opus-4-6"),
    ),
    CrossToolModelRow(
        cursor=ModelEntry("claude-4.6-opus-max"),
        claude=ModelEntry("claude-opus-4-6"),
    ),
    CrossToolModelRow(
        cursor=ModelEntry("claude-4.6-opus-high-thinking",
                          takes_priority_for_overlaps=True),
        claude=ModelEntry("claude-opus-4-6"),
    ),
    CrossToolModelRow(
        cursor=ModelEntry("claude-4.6-opus-max-thinking"),
        claude=ModelEntry("claude-opus-4-6"),
    ),

    # Claude Haiku family
    CrossToolModelRow(
        cursor=ModelEntry("claude-4.5-haiku"),
        claude=ModelEntry("claude-haiku-4-5"),
    ),
    CrossToolModelRow(
        cursor=ModelEntry("claude-4.5-haiku-thinking",
                          takes_priority_for_overlaps=True),
        claude=ModelEntry("claude-haiku-4-5"),
    ),

    # GPT family
    CrossToolModelRow(
        cursor=ModelEntry("gpt-5.4-low"),
        codex=ModelEntry("gpt-5.4", reasoning_effort="low"),
    ),
    CrossToolModelRow(
        cursor=ModelEntry("gpt-5.4-medium"),
        codex=ModelEntry("gpt-5.4", reasoning_effort="medium"),
    ),
    CrossToolModelRow(
        cursor=ModelEntry("gpt-5.4-high"),
        codex=ModelEntry("gpt-5.4", reasoning_effort="high"),
    ),
    CrossToolModelRow(
        cursor=ModelEntry("gpt-5.4-xhigh"),
        codex=ModelEntry("gpt-5.4", reasoning_effort="xhigh"),
    ),
]


# ── Programmatically built lookups ───────────────────────────────────────

def _make_key(model_name: str, reasoning_effort: str | None) -> str:
    """Build a lookup key from model name and reasoning effort."""
    return f"{model_name}::{reasoning_effort or 'unknown'}"


def _row_has_priority(row: CrossToolModelRow) -> bool:
    """Return True if any entry in *row* has ``takes_priority_for_overlaps``."""
    for tool in ALL_TOOL_NAMES:
        entry = row.get(tool)
        if entry is not None and entry.takes_priority_for_overlaps:
            return True
    return False


def _build_lookup(tool: ToolName) -> dict[str, CrossToolModelRow]:
    """Build a ``{key: row}`` dict for *tool*.

    When multiple rows produce the same key for a given *tool* (many-to-one
    mappings), the row with ``takes_priority_for_overlaps=True`` on any of
    its entries wins.  Otherwise the first row encountered is kept.
    """
    result: dict[str, CrossToolModelRow] = {}
    for row in MODEL_ROWS:
        entry = row.get(tool)
        if entry is None:
            continue
        key = _make_key(entry.model_name, entry.reasoning_effort)
        if key not in result or _row_has_priority(row):
            result[key] = row
    return result


_BY_TOOL: dict[ToolName, dict[str, CrossToolModelRow]] = {
    tool: _build_lookup(tool) for tool in ALL_TOOL_NAMES
}

def lookup(
    tool: ToolName,
    model_name: str,
    reasoning_effort: str | None,
) -> CrossToolModelRow | None:
    """Look up a model by *tool*, *model_name*, and *reasoning_effort*.

    Returns the :class:`CrossToolModelRow` or ``None`` if not found.
    """
    return _BY_TOOL[tool].get(_make_key(model_name, reasoning_effort))


def is_known_model(
    tool: ToolName,
    model_name: str,
    reasoning_effort: str | None = None,
) -> bool:
    """Return ``True`` if *model_name* is registered for *tool*."""
    return lookup(tool, model_name, reasoning_effort) is not None


def get_target_model(
    source_tool: ToolName,
    source_model: str,
    target_tool: ToolName,
    reasoning_effort: str | None = None,
) -> ModelEntry | None:
    """Look up *source_model* from *source_tool* and return the entry for *target_tool*."""
    row = lookup(source_tool, source_model, reasoning_effort)
    if row is None:
        return None
    return row.get(target_tool)
