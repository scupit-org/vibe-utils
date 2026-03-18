"""Model translation dictionaries and resolver.

Maps Cursor model identifiers to Claude and Codex equivalents.
"""

from __future__ import annotations

from dataclasses import dataclass

from agent_sync.domain.models import ModelResolution


@dataclass(frozen=True, slots=True)
class CodexModelMapping:
    """Codex target model + optional reasoning effort."""

    model: str | None
    reasoning_effort: str | None


# ── Known Cursor model identifiers ──────────────────────────────────────

KNOWN_CURSOR_MODELS: frozenset[str] = frozenset({
    "composer-1.5",
    "claude-4.6-sonnet-medium",
    "claude-4.6-sonnet-medium-thinking",
    "claude-4.6-opus-high",
    "claude-4.6-opus-max",
    "claude-4.6-opus-high-thinking",
    "claude-4.6-opus-max-thinking",
    "claude-4.5-haiku",
    "claude-4.5-haiku-thinking",
    "gpt-5.4-low",
    "gpt-5.4-medium",
    "gpt-5.4-high",
    "gpt-5.4-xhigh",
})


# ── Cursor → Claude ─────────────────────────────────────────────────────

CURSOR_TO_CLAUDE: dict[str, str | None] = {
    "composer-1.5": None,
    # Sonnet family
    "claude-4.6-sonnet-medium": "claude-sonnet-4-6",
    "claude-4.6-sonnet-medium-thinking": "claude-sonnet-4-6",
    # Opus family
    "claude-4.6-opus-high": "claude-opus-4-6",
    "claude-4.6-opus-max": "claude-opus-4-6",
    "claude-4.6-opus-high-thinking": "claude-opus-4-6",
    "claude-4.6-opus-max-thinking": "claude-opus-4-6",
    # Haiku family
    "claude-4.5-haiku": "claude-haiku-4-5",
    "claude-4.5-haiku-thinking": "claude-haiku-4-5",
    # GPT family → not mappable to Claude
    "gpt-5.4-low": None,
    "gpt-5.4-medium": None,
    "gpt-5.4-high": None,
    "gpt-5.4-xhigh": None,
}


# ── Cursor → Codex ──────────────────────────────────────────────────────

_INHERIT = CodexModelMapping(None, None)

CURSOR_TO_CODEX: dict[str, CodexModelMapping] = {
    "composer-1.5": _INHERIT,
    # Claude family → not mappable to Codex
    "claude-4.6-sonnet-medium": _INHERIT,
    "claude-4.6-sonnet-medium-thinking": _INHERIT,
    "claude-4.6-opus-high": _INHERIT,
    "claude-4.6-opus-max": _INHERIT,
    "claude-4.6-opus-high-thinking": _INHERIT,
    "claude-4.6-opus-max-thinking": _INHERIT,
    "claude-4.5-haiku": _INHERIT,
    "claude-4.5-haiku-thinking": _INHERIT,
    # GPT family
    "gpt-5.4-low": CodexModelMapping("gpt-5.4", "low"),
    "gpt-5.4-medium": CodexModelMapping("gpt-5.4", "medium"),
    "gpt-5.4-high": CodexModelMapping("gpt-5.4", "high"),
    "gpt-5.4-xhigh": CodexModelMapping("gpt-5.4", "xhigh"),
}


# ── Resolver ─────────────────────────────────────────────────────────────

def resolve_model(raw_cursor_model: str | None) -> ModelResolution:
    """Resolve a Cursor model string to Claude and Codex targets.

    Returns a :class:`ModelResolution` with ``resolution_kind``:

    * ``"inherit"`` — input is ``None`` (model not specified)
    * ``"explicit"`` — at least one target gets a concrete value
    * ``"unsupported-family"`` — known model but maps to ``None`` for both targets
    * ``"unknown-model"`` — not in :data:`KNOWN_CURSOR_MODELS`
    """
    if raw_cursor_model is None:
        return ModelResolution(
            raw_cursor_model=None,
            claude_model=None,
            codex_model=None,
            codex_reasoning_effort=None,
            resolution_kind="inherit",
        )

    if raw_cursor_model not in KNOWN_CURSOR_MODELS:
        return ModelResolution(
            raw_cursor_model=raw_cursor_model,
            claude_model=None,
            codex_model=None,
            codex_reasoning_effort=None,
            resolution_kind="unknown-model",
        )

    claude_model = CURSOR_TO_CLAUDE[raw_cursor_model]
    codex_mapping = CURSOR_TO_CODEX[raw_cursor_model]

    has_any_target = (claude_model is not None
                      or codex_mapping.model is not None)

    return ModelResolution(
        raw_cursor_model=raw_cursor_model,
        claude_model=claude_model,
        codex_model=codex_mapping.model,
        codex_reasoning_effort=codex_mapping.reasoning_effort,
        resolution_kind="explicit" if has_any_target else "unsupported-family",
    )
