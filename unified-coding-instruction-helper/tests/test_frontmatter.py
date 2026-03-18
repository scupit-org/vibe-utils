"""Tests for agent_sync.parse.frontmatter."""

import pytest

from agent_sync.parse.frontmatter import FrontmatterParseError, split_frontmatter


class TestSplitFrontmatter:
    def test_simple(self):
        text = "---\nname: hello\n---\nBody text."
        fm, body = split_frontmatter(text)
        assert fm == {"name": "hello"}
        assert body == "Body text."

    def test_no_frontmatter(self):
        text = "Just plain markdown."
        fm, body = split_frontmatter(text)
        assert fm == {}
        assert body == "Just plain markdown."

    def test_empty_file(self):
        fm, body = split_frontmatter("")
        assert fm == {}
        assert body == ""

    def test_frontmatter_only(self):
        text = "---\nname: test\n---\n"
        fm, body = split_frontmatter(text)
        assert fm == {"name": "test"}
        assert body == ""

    def test_malformed_yaml(self):
        text = "---\nname: [broken\n---\nBody."
        with pytest.raises(FrontmatterParseError):
            split_frontmatter(text)

    def test_no_closing_delimiter(self):
        text = "---\nname: test\nno closing"
        with pytest.raises(FrontmatterParseError, match="no closing"):
            split_frontmatter(text)

    def test_multiline_yaml_value(self):
        text = "---\nname: test\ndesc: |\n  line one\n  line two\n---\nBody."
        fm, body = split_frontmatter(text)
        assert fm["name"] == "test"
        assert "line one" in fm["desc"]
        assert body == "Body."

    def test_multiple_fields(self):
        text = "---\nname: foo\ndescription: bar\nmodel: baz\n---\nContent."
        fm, body = split_frontmatter(text)
        assert fm == {"name": "foo", "description": "bar", "model": "baz"}
        assert body == "Content."

    def test_empty_frontmatter(self):
        text = "---\n---\nBody only."
        fm, body = split_frontmatter(text)
        assert fm == {}
        assert body == "Body only."

    def test_non_dict_frontmatter(self):
        text = "---\n- item1\n- item2\n---\nBody."
        with pytest.raises(FrontmatterParseError, match="mapping"):
            split_frontmatter(text)

    def test_boolean_value(self):
        text = "---\nname: test\ndisable-model-invocation: true\n---\nBody."
        fm, body = split_frontmatter(text)
        assert fm["disable-model-invocation"] is True
