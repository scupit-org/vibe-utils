"""Tests for agent_sync.transform.model_map."""

from agent_sync.transform.model_map import (
    MODEL_ROWS,
    is_known_model,
    lookup,
)


class TestLookupByCursor:
    def test_composer_no_cross_tool(self):
        for model in ("composer-1.5", "composer-2"):
            row = lookup("cursor", model, None)
            assert row is not None
            assert row.claude is None
            assert row.codex is None

    def test_claude_sonnet_to_claude(self):
        row = lookup("cursor", "claude-4.6-sonnet-medium", None)
        assert row is not None
        assert row.claude is not None
        assert row.claude.model_name == "claude-sonnet-4-6"
        assert row.codex is None

    def test_claude_sonnet_thinking_to_claude(self):
        row = lookup("cursor", "claude-4.6-sonnet-medium-thinking", None)
        assert row is not None
        assert row.claude is not None
        assert row.claude.model_name == "claude-sonnet-4-6"

    def test_claude_opus_to_claude(self):
        for model in ["claude-4.6-opus-high", "claude-4.6-opus-max",
                       "claude-4.6-opus-high-thinking", "claude-4.6-opus-max-thinking"]:
            row = lookup("cursor", model, None)
            assert row is not None, f"Missing row for {model}"
            assert row.claude is not None, f"Missing Claude entry for {model}"
            assert row.claude.model_name == "claude-opus-4-6", f"Failed for {model}"

    def test_claude_haiku_to_claude(self):
        for model in ["claude-4.5-haiku", "claude-4.5-haiku-thinking"]:
            row = lookup("cursor", model, None)
            assert row is not None
            assert row.claude is not None, f"Missing Claude entry for {model}"
            assert row.claude.model_name == "claude-haiku-4-5", f"Failed for {model}"

    def test_gpt_to_codex(self):
        cases = [
            ("gpt-5.4-low", "gpt-5.4", "low"),
            ("gpt-5.4-medium", "gpt-5.4", "medium"),
            ("gpt-5.4-high", "gpt-5.4", "high"),
            ("gpt-5.4-xhigh", "gpt-5.4", "xhigh"),
        ]
        for cursor_model, expected_model, expected_effort in cases:
            row = lookup("cursor", cursor_model, None)
            assert row is not None, f"Missing row for {cursor_model}"
            assert row.codex is not None
            assert row.codex.model_name == expected_model
            assert row.codex.reasoning_effort == expected_effort
            assert row.claude is None

    def test_gpt_to_claude_none(self):
        row = lookup("cursor", "gpt-5.4-high", None)
        assert row is not None
        assert row.claude is None

    def test_claude_to_codex_none(self):
        row = lookup("cursor", "claude-4.6-opus-high", None)
        assert row is not None
        assert row.codex is None

    def test_unknown_model(self):
        assert lookup("cursor", "llama-3-70b", None) is None


class TestLookupByClaude:
    def test_lookup_by_claude(self):
        row = lookup("claude", "claude-opus-4-6", None)
        assert row is not None
        assert row.cursor is not None
        assert row.cursor.model_name == "claude-4.6-opus-high-thinking"


class TestLookupByCodex:
    def test_lookup_by_codex_with_reasoning(self):
        row = lookup("codex", "gpt-5.4", "high")
        assert row is not None
        assert row.cursor is not None
        assert row.cursor.model_name == "gpt-5.4-high"

    def test_lookup_by_codex_wrong_effort(self):
        assert lookup("codex", "gpt-5.4", "ultra") is None

    def test_lookup_by_codex_missing_effort(self):
        # "gpt-5.4" without the right effort won't match any specific row.
        assert lookup("codex", "gpt-5.4", None) is None


class TestIsKnownModel:
    def test_known_cursor_model(self):
        assert is_known_model("cursor", "claude-4.6-opus-high") is True

    def test_unknown_cursor_model(self):
        assert is_known_model("cursor", "llama-3-70b") is False

    def test_known_codex_model_with_effort(self):
        assert is_known_model("codex", "gpt-5.4", "high") is True

    def test_known_codex_model_without_effort(self):
        assert is_known_model("codex", "gpt-5.4") is False


class TestRegistry:
    def test_all_rows_have_cursor_id(self):
        for row in MODEL_ROWS:
            assert row.cursor is not None, f"Row missing cursor entry: {row}"

    def test_every_row_resolves_via_lookup(self):
        for row in MODEL_ROWS:
            assert row.cursor is not None
            result = lookup("cursor", row.cursor.model_name, None)
            assert result is not None, f"{row.cursor.model_name} not found in registry"
