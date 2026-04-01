"""Shared writer utilities."""

from __future__ import annotations

import shutil
from pathlib import Path, PurePosixPath
from typing import Any

import yaml

from agent_sync.domain.models import ToolName
from agent_sync.parse.frontmatter import FrontmatterParseError, split_frontmatter
from agent_sync.transform.model_map import ModelEntry, get_target_model
PathPartsTuple = tuple[str, ...]
_FRONTMATTER_WIDTH = 2_147_483_647

# ── Per-tool output path mappings ────────────────────────────────────────

ALL_SKILL_OUTPUT_ROOTS: dict[ToolName, PathPartsTuple] = {
    "cursor": (".cursor", "skills"),
    "claude": (".claude", "skills"),
    "codex": (".agents", "skills"),
}

ALL_SUBAGENT_OUTPUT_TARGETS: dict[ToolName, tuple[PathPartsTuple, str]] = {
    "cursor": ((".cursor", "agents"), ".md"),
    "claude": ((".claude", "agents"), ".md"),
    "codex": ((".codex", "agents"), ".toml"),
}


def get_skill_output_roots(*, exclude_tool: ToolName) -> list[PathPartsTuple]:
    """Return skill output roots for all target tools except *exclude_tool*."""
    return [v for k, v in ALL_SKILL_OUTPUT_ROOTS.items() if k != exclude_tool]


def get_subagent_output_targets(
    *, exclude_tool: ToolName,
) -> list[tuple[PathPartsTuple, str]]:
    """Return subagent output targets for all target tools except *exclude_tool*."""
    return [v for k, v in ALL_SUBAGENT_OUTPUT_TARGETS.items() if k != exclude_tool]


def get_managed_subtrees(*, exclude_tool: ToolName) -> list[PathPartsTuple]:
    """Return managed subtrees for all target tools except *exclude_tool*."""
    roots = get_skill_output_roots(exclude_tool=exclude_tool)
    sub_targets = get_subagent_output_targets(exclude_tool=exclude_tool)
    return [*roots, *(parts for parts, _ in sub_targets)]



# ── Markdown generation ──────────────────────────────────────────────────

def generate_yaml_frontmatter(fields: dict[str, Any]) -> str:
    """Render a YAML frontmatter block (``---\\n...\\n---\\n``).

    *fields* is insertion-ordered; that order is preserved in the output.
    """
    # PyYAML's dump with default_flow_style=False and sort_keys=False
    # preserves insertion order of the dict.  Override the default emitter
    # width so long plain scalars like descriptions stay on one physical line.
    yaml_text = yaml.dump(
        fields,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=_FRONTMATTER_WIDTH,
    )
    return f"---\n{yaml_text}---\n"


def generate_skill_md(
    name: str,
    description: str,
    body_markdown: str,
    *,
    disable_model_invocation: bool = False,
    model: str | None = None,
) -> str:
    """Render a complete ``SKILL.md`` file."""
    fields: dict[str, Any] = {"name": name, "description": description}
    if model is not None:
        fields["model"] = model
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


# ── Model resolution ─────────────────────────────────────────────────────

def resolve_model(
    source_tool: ToolName,
    source_model: str | None,
    target_tool: ToolName,
    reasoning_effort: str | None = None,
) -> str | None:
    """Resolve a source model string to a target tool's model name, or ``None``."""
    if source_model is None:
        return None
    entry: ModelEntry | None = get_target_model(
        source_tool, source_model, target_tool, reasoning_effort,
    )
    return entry.model_name if entry else None


# ── Asset copying ────────────────────────────────────────────────────────

def copy_skill_assets(
    source_dir: Path,
    dest_dir: Path,
    asset_paths: list[PurePosixPath],
    *,
    source_tool: ToolName,
    target_tool: ToolName,
) -> None:
    """Copy manifest-declared skill assets into *dest_dir*."""
    for rel_asset in asset_paths:
        src_path = source_dir / rel_asset
        dst_path = dest_dir / rel_asset
        dst_path.parent.mkdir(parents=True, exist_ok=True)

        if src_path.name == "SKILL.md":
            _write_transformed_skill_asset(
                src_path, dst_path, source_tool=source_tool, target_tool=target_tool,
            )
        else:
            shutil.copy2(src_path, dst_path)


def _write_transformed_skill_asset(
    source_path: Path,
    dest_path: Path,
    *,
    source_tool: ToolName,
    target_tool: ToolName,
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
    source_model = frontmatter.get("model")

    if target_tool == "cursor":
        # Cursor preserves both model and disable-model-invocation.
        # Resolve the source model to a Cursor model name.
        resolved_model: str | None = None
        if isinstance(source_model, str):
            entry = get_target_model(source_tool, source_model, "cursor")
            resolved_model = entry.model_name if entry else None
        transformed = generate_skill_md(
            name=name,
            description=description,
            body_markdown=body,
            disable_model_invocation=disable_model_invocation,
            model=resolved_model,
        )
    elif target_tool == "claude":
        # Claude supports disable-model-invocation but drops model.
        transformed = generate_skill_md(
            name=name,
            description=description,
            body_markdown=body,
            disable_model_invocation=disable_model_invocation,
        )
    else:
        # Codex drops both model and disable-model-invocation from SKILL.md.
        transformed = generate_skill_md(
            name=name,
            description=description,
            body_markdown=body,
        )

    dest_path.write_text(transformed, encoding="utf-8")
