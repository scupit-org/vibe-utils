"""Tests for shared frontmatter-writing utilities."""

from agent_sync.write.common import generate_skill_md, generate_subagent_md


class TestGenerateSkillMd:
    def test_long_description_stays_on_one_line(self):
        description = (
            "This is a deliberately long description that used to be wrapped by "
            "PyYAML around eighty columns, but should now stay on a single "
            "frontmatter line when SKILL.md is generated."
        )

        content = generate_skill_md(
            name="greeting",
            description=description,
            body_markdown="Body.\n",
            model="claude-4.6-opus-high",
        )

        assert f"description: {description}\n" in content
        assert "description: This is a deliberately long description that used to be wrapped by\n" not in content


class TestGenerateSubagentMd:
    def test_long_description_stays_on_one_line(self):
        description = (
            "This is a deliberately long description that used to be wrapped by "
            "PyYAML around eighty columns, but should now stay on a single "
            "frontmatter line when a markdown subagent file is generated."
        )

        content = generate_subagent_md(
            name="reviewer",
            description=description,
            prompt_markdown="Prompt.\n",
            model="claude-sonnet-4-6",
        )

        assert f"description: {description}\n" in content
        assert "description: This is a deliberately long description that used to be wrapped by\n" not in content
