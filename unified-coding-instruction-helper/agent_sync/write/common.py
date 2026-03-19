"""Shared writer utilities."""

from __future__ import annotations

import shutil
from pathlib import Path, PurePosixPath
from typing import Any, Literal

import yaml

from agent_sync.parse.frontmatter import FrontmatterParseError, split_frontmatter

PathPartsTuple = tuple[str, ...]

# ── Output path constants ─────────────────────────────────────────────────
# Defined once, shared by writers, validators, and the sync orchestrator.

SKILL_OUTPUT_ROOTS: list[PathPartsTuple] = [
    (".claude", "skills"),
    (".agents", "skills"),
]

SUBAGENT_OUTPUT_TARGETS: list[tuple[PathPartsTuple, str]] = [
    ((".claude", "agents"), ".md"),
    ((".codex", "agents"), ".toml"),
]

MANAGED_SUBTREES: list[PathPartsTuple] = [
    *SKILL_OUTPUT_ROOTS,
    *(parts for parts, _ in SUBAGENT_OUTPUT_TARGETS),
]


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
    disable_model_invocation: bool = False,
) -> str:
    """Render a complete ``SKILL.md`` file."""
    fields: dict[str, Any] = {"name": name, "description": description}
    if disable_model_invocation:
        fields["disable-model-invocation"] = True

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


def copy_skill_assets(
    source_dir: Path,
    dest_dir: Path,
    asset_paths: list[PurePosixPath],
    *,
    target_tool: Literal["claude", "codex"],
) -> list[Path]:
    """Copy manifest-declared skill assets into *dest_dir*."""
    copied: list[Path] = []

    for rel_asset in asset_paths:
        rel = Path(rel_asset)
        src_path = source_dir / rel
        dst_path = dest_dir / rel
        dst_path.parent.mkdir(parents=True, exist_ok=True)

        if src_path.name == "SKILL.md":
            _write_transformed_skill_asset(src_path, dst_path, target_tool)
        else:
            shutil.copy2(src_path, dst_path)
        copied.append(rel)

    return copied


def _write_transformed_skill_asset(
    source_path: Path,
    dest_path: Path,
    target_tool: Literal["claude", "codex"],
) -> None:
    """Transform nested SKILL.md assets when possible, else preserve verbatim."""
    text = source_path.read_text(encoding="utf-8")

    try:
        frontmatter, body = split_frontmatter(text)
    except FrontmatterParseError:
        dest_path.write_text(text, encoding="utf-8")
        return

    name = frontmatter.get("name")
    description = frontmatter.get("description")
    if not isinstance(name, str) or not isinstance(description, str):
        dest_path.write_text(text, encoding="utf-8")
        return

    disable_model_invocation = bool(frontmatter.get("disable-model-invocation", False))
    if target_tool == "claude":
        transformed = generate_skill_md(
            name=name,
            description=description,
            body_markdown=body,
            disable_model_invocation=disable_model_invocation,
        )
    else:
        transformed = generate_skill_md(
            name=name,
            description=description,
            body_markdown=body,
        )

    dest_path.write_text(transformed, encoding="utf-8")
