"""Tests for agent_sync.transform.model_map."""

from agent_sync.transform.model_map import (
    CURSOR_TO_CLAUDE,
    CURSOR_TO_CODEX,
    KNOWN_CURSOR_MODELS,
    resolve_model,
)


class TestResolveModel:
    def test_none_inherits(self):
        r = resolve_model(None)
        assert r.resolution_kind == "inherit"
        assert r.claude_model is None
        assert r.codex_model is None
        assert r.codex_reasoning_effort is None

    def test_composer_unsupported(self):
        r = resolve_model("composer-1.5")
        assert r.resolution_kind == "unsupported-family"
        assert r.claude_model is None
        assert r.codex_model is None

    def test_claude_sonnet_to_claude(self):
        r = resolve_model("claude-4.6-sonnet-medium")
        assert r.claude_model == "claude-sonnet-4-6"
        assert r.codex_model is None
        assert r.resolution_kind == "explicit"

    def test_claude_sonnet_thinking_to_claude(self):
        r = resolve_model("claude-4.6-sonnet-medium-thinking")
        assert r.claude_model == "claude-sonnet-4-6"

    def test_claude_opus_to_claude(self):
        for model in ["claude-4.6-opus-high", "claude-4.6-opus-max",
                       "claude-4.6-opus-high-thinking", "claude-4.6-opus-max-thinking"]:
            r = resolve_model(model)
            assert r.claude_model == "claude-opus-4-6", f"Failed for {model}"

    def test_claude_haiku_to_claude(self):
        for model in ["claude-4.5-haiku", "claude-4.5-haiku-thinking"]:
            r = resolve_model(model)
            assert r.claude_model == "claude-haiku-4-5", f"Failed for {model}"

    def test_gpt_to_codex(self):
        cases = [
            ("gpt-5.4-low", "gpt-5.4", "low"),
            ("gpt-5.4-medium", "gpt-5.4", "medium"),
            ("gpt-5.4-high", "gpt-5.4", "high"),
            ("gpt-5.4-xhigh", "gpt-5.4", "xhigh"),
        ]
        for cursor_model, expected_model, expected_effort in cases:
            r = resolve_model(cursor_model)
            assert r.codex_model == expected_model, f"Failed for {cursor_model}"
            assert r.codex_reasoning_effort == expected_effort
            assert r.claude_model is None
            assert r.resolution_kind == "explicit"

    def test_gpt_to_claude_none(self):
        r = resolve_model("gpt-5.4-high")
        assert r.claude_model is None

    def test_claude_to_codex_none(self):
        r = resolve_model("claude-4.6-opus-high")
        assert r.codex_model is None
        assert r.codex_reasoning_effort is None

    def test_unknown_model(self):
        r = resolve_model("llama-3-70b")
        assert r.resolution_kind == "unknown-model"
        assert r.claude_model is None
        assert r.codex_model is None

    def test_all_known_models_in_both_dicts(self):
        for model in KNOWN_CURSOR_MODELS:
            assert model in CURSOR_TO_CLAUDE, f"{model} missing from CURSOR_TO_CLAUDE"
            assert model in CURSOR_TO_CODEX, f"{model} missing from CURSOR_TO_CODEX"

    def test_dict_sizes_match_known_set(self):
        assert len(CURSOR_TO_CLAUDE) == len(KNOWN_CURSOR_MODELS)
        assert len(CURSOR_TO_CODEX) == len(KNOWN_CURSOR_MODELS)
