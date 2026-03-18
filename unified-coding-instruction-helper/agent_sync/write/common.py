"""Shared writer utilities."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import yaml


def generate_yaml_frontmatter(fields: dict[str, Any]) -> str:
    """Render a YAML frontmatter block (``---\\n...\\n---\\n``).

    *fields* is insertion-ordered; that order is preserved in the output.
    """
    # PyYAML's dump with default_flow_style=False and sort_keys=False
    # preserves insertion order of the dict.
    yaml_text = yaml.dump(
        fields,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
    )
    return f"---\n{yaml_text}---\n"


def generate_skill_md(
    name: str,
    description: str,
    body_markdown: str,
    *,
    model: str | None = None,
    disable_model_invocation: bool = False,
) -> str:
    """Render a complete ``SKILL.md`` file."""
    fields: dict[str, Any] = {"name": name, "description": description}
    if disable_model_invocation:
        fields["disable-model-invocation"] = True
    if model is not None:
        fields["model"] = model

    frontmatter = generate_yaml_frontmatter(fields)
    return frontmatter + body_markdown


def generate_subagent_md(
    name: str,
    description: str,
    prompt_markdown: str,
    *,
    model: str | None = None,
) -> str:
    """Render a complete subagent ``.md`` file."""
    fields: dict[str, Any] = {"name": name, "description": description}
    if model is not None:
        fields["model"] = model

    frontmatter = generate_yaml_frontmatter(fields)
    return frontmatter + prompt_markdown


def copy_asset_tree(
    source_dir: Path,
    dest_dir: Path,
    exclude_filenames: set[str],
) -> list[Path]:
    """Recursively copy files from *source_dir* to *dest_dir*.

    Skips files whose name (not path) is in *exclude_filenames*.
    Returns a list of copied files relative to *dest_dir*.
    """
    copied: list[Path] = []

    for src_path in sorted(source_dir.rglob("*")):
        if not src_path.is_file():
            continue
        if src_path.name in exclude_filenames:
            continue

        rel = src_path.relative_to(source_dir)
        dst_path = dest_dir / rel
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, dst_path)
        copied.append(rel)

    return copied
