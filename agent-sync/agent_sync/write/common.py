"""Shared writer utilities."""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

import yaml

from agent_sync.domain.models import SubagentSpec, ToolName
from agent_sync.parse.frontmatter import FrontmatterParseError, split_frontmatter
from agent_sync.transform.model_map import (
    clamp_effort,
    find_model,
    resolve_target_model,
    written_model_name,
)
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
    effort: str | None = None,
) -> str:
    """Render a complete subagent ``.md`` file."""
    fields: dict[str, Any] = {"name": name, "description": description}
    if model is not None:
        fields["model"] = model
    if effort is not None:
        fields["effort"] = effort

    frontmatter = generate_yaml_frontmatter(fields)
    return frontmatter + prompt_markdown


# ── Model resolution ─────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class ResolvedSubagentModel:
    """Model/effort pair ready to emit for a target tool."""

    written_model: str | None  # alias or exact ID; None = omit model
    effort: str | None         # clamped for the target model; None = omit


def resolve_subagent_model(
    subagent: SubagentSpec,
    target_tool: ToolName,
) -> ResolvedSubagentModel:
    """Resolve a subagent's model and effort for *target_tool*.

    Tier-maps the source model to the target tool and clamps the source
    effort to what the target model supports.  A model-less subagent passes
    its effort through unchanged; each writer decides whether a model-less
    effort is expressible.  Unknown source models resolve to nothing
    (validation reports them before writers run).
    """
    if subagent.model is None:
        return ResolvedSubagentModel(None, subagent.source_reasoning_effort)

    source_info = find_model(subagent.source_tool, subagent.model)
    if source_info is None:
        return ResolvedSubagentModel(None, None)

    target_info = resolve_target_model(source_info, target_tool)
    return ResolvedSubagentModel(
        written_model=written_model_name(
            target_info, prefer_alias=subagent.model_specified_as_alias,
        ),
        effort=clamp_effort(subagent.source_reasoning_effort, target_info),
    )


# ── Asset copying ────────────────────────────────────────────────────────

def copy_skill_assets(
    source_dir: Path,
    dest_dir: Path,
    asset_paths: list[PurePosixPath],
    *,
    target_tool: ToolName,
) -> None:
    """Copy manifest-declared skill assets into *dest_dir*."""
    for rel_asset in asset_paths:
        src_path = source_dir / rel_asset
        dst_path = dest_dir / rel_asset
        dst_path.parent.mkdir(parents=True, exist_ok=True)

        if src_path.name == "SKILL.md":
            _write_transformed_skill_asset(
                src_path, dst_path, target_tool=target_tool,
            )
        else:
            shutil.copy2(src_path, dst_path)


def _write_transformed_skill_asset(
    source_path: Path,
    dest_path: Path,
    *,
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

    # Skill model metadata is intentionally ignored for every target.
    if target_tool == "codex":
        # Codex also drops disable-model-invocation from SKILL.md.
        transformed = generate_skill_md(
            name=name,
            description=description,
            body_markdown=body,
        )
    else:
        # Cursor and Claude preserve disable-model-invocation.
        transformed = generate_skill_md(
            name=name,
            description=description,
            body_markdown=body,
            disable_model_invocation=disable_model_invocation,
        )

    dest_path.write_text(transformed, encoding="utf-8")
