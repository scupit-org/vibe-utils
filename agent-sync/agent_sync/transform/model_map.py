"""Model registry and tier-based cross-tool resolution.

Each supported model is a :class:`ModelInfo` describing the tool that hosts
it, its capability tier, the reasoning-effort levels it accepts, and any
aliases users may write for it.  No model exists on more than one tool, so
cross-tool translation maps by *tier*: a source model resolves to the target
tool's model at the same tier, walking up a tier whenever the target tool has
no model at that level (e.g. moderate -> Cursor, which has no moderate model,
resolves to the powerful ``grok-4.6``).

Within a (tool, tier) pair, registry order defines target preference:
``claude-opus-5`` precedes ``claude-fable-5`` so inbound powerful-tier
mappings pick Opus over the costlier Fable.

Reasoning effort is a parameter orthogonal to model identity.  The canonical
scale is :data:`EFFORT_SCALE`; each model declares the subset it supports and
:func:`clamp_effort` converts a requested level to the closest supported one.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from agent_sync.domain.models import ToolName

Tier = Literal["small", "moderate", "powerful"]

# Tiers to try, in order, when resolving a source tier on a target tool.
TIER_WALK_UP: dict[Tier, tuple[Tier, ...]] = {
    "powerful": ("powerful",),
    "moderate": ("moderate", "powerful"),
    "small": ("small", "moderate", "powerful"),
}

# Canonical reasoning-effort scale, ordered weakest to strongest.
EFFORT_SCALE: tuple[str, ...] = ("low", "medium", "high", "xhigh", "max")

_FULL_EFFORT: tuple[str, ...] = EFFORT_SCALE
_NO_MAX_EFFORT: tuple[str, ...] = ("low", "medium", "high", "xhigh")


@dataclass(frozen=True, slots=True)
class ModelInfo:
    """A single supported model."""

    tool: ToolName
    model_id: str
    tier: Tier
    # Supported effort levels, a subset of EFFORT_SCALE in canonical order.
    # Empty means the model takes no reasoning-effort parameter.
    effort_levels: tuple[str, ...] = ()
    # Accepted shorthand names; the first entry is the primary alias used
    # when writing alias-preferring output.
    aliases: tuple[str, ...] = ()


# ── Single source of truth ───────────────────────────────────────────────

MODELS: tuple[ModelInfo, ...] = (
    # Cursor
    ModelInfo("cursor", "grok-4.6", "powerful", effort_levels=_NO_MAX_EFFORT),
    ModelInfo("cursor", "composer-2.5", "small"),

    # Claude Code (Opus before Fable: preferred inbound powerful target)
    ModelInfo("claude", "claude-opus-5", "powerful",
              effort_levels=_FULL_EFFORT, aliases=("opus",)),
    ModelInfo("claude", "claude-fable-5", "powerful",
              effort_levels=_FULL_EFFORT, aliases=("fable",)),
    ModelInfo("claude", "claude-sonnet-5", "moderate",
              effort_levels=_FULL_EFFORT, aliases=("sonnet",)),

    # Codex
    ModelInfo("codex", "gpt-5.6-sol", "powerful",
              effort_levels=_FULL_EFFORT, aliases=("gpt-5.6",)),
    ModelInfo("codex", "gpt-5.6-terra", "moderate", effort_levels=_FULL_EFFORT),
    ModelInfo("codex", "gpt-5.6-luna", "small", effort_levels=_FULL_EFFORT),
)


# ── Programmatically built lookups ───────────────────────────────────────

def _build_name_index(
    models: tuple[ModelInfo, ...],
) -> dict[ToolName, dict[str, ModelInfo]]:
    """Index every model ID and alias per tool.

    Raises :class:`ValueError` if any name text (ID or alias) resolves to
    more than one model within the same tool.
    """
    index: dict[ToolName, dict[str, ModelInfo]] = {}
    for info in models:
        per_tool = index.setdefault(info.tool, {})
        for name in (info.model_id, *info.aliases):
            existing = per_tool.get(name)
            if existing is not None:
                raise ValueError(
                    f"Model name '{name}' for tool '{info.tool}' maps to both "
                    f"'{existing.model_id}' and '{info.model_id}'"
                )
            per_tool[name] = info
    return index


_BY_TOOL_NAME: dict[ToolName, dict[str, ModelInfo]] = _build_name_index(MODELS)


# ── Public API ───────────────────────────────────────────────────────────

def find_model(tool: ToolName, name: str) -> ModelInfo | None:
    """Look up a model by exact ID or alias for *tool*."""
    return _BY_TOOL_NAME.get(tool, {}).get(name)


def normalize_model(tool: ToolName, raw: str) -> tuple[str, bool] | None:
    """Resolve *raw* (ID or alias) to ``(model_id, was_alias)``.

    Returns ``None`` when *raw* is not a known model for *tool*.
    """
    info = find_model(tool, raw)
    if info is None:
        return None
    return info.model_id, raw != info.model_id


def is_known_model(tool: ToolName, name: str) -> bool:
    """Return ``True`` if *name* is a registered model ID or alias for *tool*."""
    return find_model(tool, name) is not None


def resolve_target_model(source: ModelInfo, target_tool: ToolName) -> ModelInfo:
    """Resolve *source* to the target tool's model at the same tier.

    Walks up tiers when the target tool has no model at the source tier.
    Every tool has a powerful model, so resolution always succeeds.
    """
    for tier in TIER_WALK_UP[source.tier]:
        for info in MODELS:
            if info.tool == target_tool and info.tier == tier:
                return info
    raise AssertionError(
        f"No model found for tool '{target_tool}' at or above tier '{source.tier}'"
    )


def clamp_effort(effort: str | None, target: ModelInfo | None) -> str | None:
    """Clamp *effort* to the closest level *target* supports.

    Rules: keep the requested level if supported; otherwise use the highest
    supported level below it, falling back to the lowest supported level.
    Returns ``None`` when no effort was requested or the target model takes
    no effort parameter.  A ``None`` target clamps against the full canonical
    scale (a model-less effort passes through unchanged).
    """
    if effort is None:
        return None
    supported = EFFORT_SCALE if target is None else target.effort_levels
    if not supported:
        return None
    if effort in supported:
        return effort
    requested_idx = EFFORT_SCALE.index(effort)
    below = [lvl for lvl in supported if EFFORT_SCALE.index(lvl) < requested_idx]
    return below[-1] if below else supported[0]


def written_model_name(info: ModelInfo, *, prefer_alias: bool) -> str:
    """Return the name to emit for *info*: primary alias or exact ID."""
    if prefer_alias and info.aliases:
        return info.aliases[0]
    return info.model_id
