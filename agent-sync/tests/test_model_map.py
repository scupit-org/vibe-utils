"""Tests for agent_sync.transform.model_map."""

import pytest

from agent_sync.transform.model_map import (
    EFFORT_SCALE,
    MODELS,
    ModelInfo,
    _build_name_index,
    clamp_effort,
    find_model,
    is_known_model,
    normalize_model,
    resolve_target_model,
    written_model_name,
)


class TestFindModel:
    def test_exact_ids(self):
        cases = [
            ("cursor", "grok-4.6"),
            ("cursor", "composer-2.5"),
            ("claude", "claude-opus-5"),
            ("claude", "claude-fable-5"),
            ("claude", "claude-sonnet-5"),
            ("codex", "gpt-5.6-sol"),
            ("codex", "gpt-5.6-terra"),
            ("codex", "gpt-5.6-luna"),
        ]
        for tool, model_id in cases:
            info = find_model(tool, model_id)
            assert info is not None, f"Missing {tool}/{model_id}"
            assert info.model_id == model_id

    def test_aliases(self):
        cases = [
            ("claude", "opus", "claude-opus-5"),
            ("claude", "fable", "claude-fable-5"),
            ("claude", "sonnet", "claude-sonnet-5"),
            ("codex", "gpt-5.6", "gpt-5.6-sol"),
        ]
        for tool, alias, expected_id in cases:
            info = find_model(tool, alias)
            assert info is not None, f"Missing alias {tool}/{alias}"
            assert info.model_id == expected_id

    def test_alias_is_tool_scoped(self):
        assert find_model("cursor", "opus") is None
        assert find_model("claude", "gpt-5.6") is None

    def test_old_ids_unknown(self):
        old = [
            ("cursor", "claude-4.6-opus-high-thinking"),
            ("cursor", "gpt-5.4-high"),
            ("cursor", "composer-2"),
            ("cursor", "composer-1.5"),
            ("cursor", "grok-4.5"),
            ("claude", "claude-sonnet-4-6"),
            ("claude", "claude-haiku-4-5"),
            ("claude", "haiku"),
            ("codex", "gpt-5.4"),
        ]
        for tool, model_id in old:
            assert find_model(tool, model_id) is None, f"{tool}/{model_id} should be unknown"


class TestNormalizeModel:
    def test_exact_id_not_alias(self):
        assert normalize_model("claude", "claude-opus-5") == ("claude-opus-5", False)

    def test_alias_normalizes(self):
        assert normalize_model("claude", "opus") == ("claude-opus-5", True)
        assert normalize_model("codex", "gpt-5.6") == ("gpt-5.6-sol", True)

    def test_unknown_returns_none(self):
        assert normalize_model("cursor", "llama-3-70b") is None


class TestIsKnownModel:
    def test_known(self):
        assert is_known_model("cursor", "grok-4.6") is True
        assert is_known_model("codex", "gpt-5.6-sol") is True
        assert is_known_model("claude", "sonnet") is True

    def test_unknown(self):
        assert is_known_model("cursor", "llama-3-70b") is False
        assert is_known_model("codex", "gpt-5.4") is False


class TestResolveTargetModel:
    def _resolve(self, source_tool, source_name, target_tool):
        source = find_model(source_tool, source_name)
        assert source is not None
        return resolve_target_model(source, target_tool).model_id

    def test_powerful_tier(self):
        for tool, name in [("claude", "claude-fable-5"), ("claude", "claude-opus-5"),
                           ("codex", "gpt-5.6-sol"), ("cursor", "grok-4.6")]:
            assert self._resolve(tool, name, "cursor") == "grok-4.6"
            assert self._resolve(tool, name, "claude") == "claude-opus-5"
            assert self._resolve(tool, name, "codex") == "gpt-5.6-sol"

    def test_opus_preferred_over_fable(self):
        assert self._resolve("cursor", "grok-4.6", "claude") == "claude-opus-5"
        assert self._resolve("codex", "gpt-5.6-sol", "claude") == "claude-opus-5"

    def test_moderate_tier(self):
        for tool, name in [("claude", "claude-sonnet-5"), ("codex", "gpt-5.6-terra")]:
            # Cursor has no moderate model: walks up to powerful.
            assert self._resolve(tool, name, "cursor") == "grok-4.6"
            assert self._resolve(tool, name, "claude") == "claude-sonnet-5"
            assert self._resolve(tool, name, "codex") == "gpt-5.6-terra"

    def test_small_tier(self):
        for tool, name in [("codex", "gpt-5.6-luna"), ("cursor", "composer-2.5")]:
            assert self._resolve(tool, name, "cursor") == "composer-2.5"
            # Claude has no small model: walks up to moderate.
            assert self._resolve(tool, name, "claude") == "claude-sonnet-5"
            assert self._resolve(tool, name, "codex") == "gpt-5.6-luna"


class TestClampEffort:
    def test_none_effort(self):
        assert clamp_effort(None, find_model("cursor", "grok-4.6")) is None

    def test_supported_level_kept(self):
        grok = find_model("cursor", "grok-4.6")
        assert clamp_effort("high", grok) == "high"

    def test_max_decays_to_xhigh_on_grok(self):
        grok = find_model("cursor", "grok-4.6")
        assert clamp_effort("max", grok) == "xhigh"

    def test_no_effort_support_returns_none(self):
        composer = find_model("cursor", "composer-2.5")
        assert clamp_effort("high", composer) is None

    def test_model_less_passthrough(self):
        for level in EFFORT_SCALE:
            assert clamp_effort(level, None) == level

    def test_below_lowest_clamps_up(self):
        limited = ModelInfo("cursor", "test-model", "small", effort_levels=("high", "xhigh"))
        assert clamp_effort("low", limited) == "high"


class TestWrittenModelName:
    def test_prefers_primary_alias(self):
        opus = find_model("claude", "claude-opus-5")
        assert written_model_name(opus, prefer_alias=True) == "opus"

    def test_exact_id_when_not_preferring(self):
        opus = find_model("claude", "claude-opus-5")
        assert written_model_name(opus, prefer_alias=False) == "claude-opus-5"

    def test_exact_id_when_no_aliases(self):
        terra = find_model("codex", "gpt-5.6-terra")
        assert written_model_name(terra, prefer_alias=True) == "gpt-5.6-terra"


class TestRegistry:
    def test_every_tool_has_powerful_model(self):
        for tool in ("cursor", "claude", "codex"):
            assert any(m.tool == tool and m.tier == "powerful" for m in MODELS), (
                f"Tool '{tool}' has no powerful-tier model; tier walk-up would fail"
            )

    def test_effort_levels_are_ordered_subsets_of_scale(self):
        for info in MODELS:
            indices = [EFFORT_SCALE.index(lvl) for lvl in info.effort_levels]
            assert indices == sorted(indices), f"{info.model_id} effort levels unordered"

    def test_duplicate_name_raises(self):
        conflicting = (
            ModelInfo("claude", "model-a", "powerful", aliases=("shared",)),
            ModelInfo("claude", "model-b", "moderate", aliases=("shared",)),
        )
        with pytest.raises(ValueError, match="shared"):
            _build_name_index(conflicting)

    def test_duplicate_across_tools_allowed(self):
        no_conflict = (
            ModelInfo("claude", "model-a", "powerful", aliases=("shared",)),
            ModelInfo("codex", "model-b", "moderate", aliases=("shared",)),
        )
        index = _build_name_index(no_conflict)
        assert index["claude"]["shared"].model_id == "model-a"
        assert index["codex"]["shared"].model_id == "model-b"
