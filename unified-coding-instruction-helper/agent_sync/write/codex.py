"""Codex writers (skills and subagents)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import tomli_w

from agent_sync.domain.models import SkillSpec, SubagentSpec, SyncManifest
from agent_sync.transform.model_map import resolve_model
from agent_sync.write.common import copy_asset_tree, generate_yaml_frontmatter


class CodexSkillWriter:
    """Write skills to ``.agents/skills/``."""

    def __init__(self, staging_dir: Path) -> None:
        self.output_root = staging_dir / ".agents" / "skills"

    def write_skill(self, skill: SkillSpec) -> Path:
        out_dir = self.output_root / str(skill.relative_skill_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        # Copy companion assets first.
        copy_asset_tree(skill.source_skill_dir, out_dir, exclude_filenames={"SKILL.md"})

        # Generate SKILL.md — Codex: name, description, body only.  No model.
        fields: dict[str, Any] = {
            "name": skill.name,
            "description": skill.description,
        }
        frontmatter = generate_yaml_frontmatter(fields)
        content = frontmatter + skill.body_markdown
        (out_dir / "SKILL.md").write_text(content, encoding="utf-8")

        # Invocation policy via agents/openai.yaml.
        if skill.disable_model_invocation:
            policy_dir = out_dir / "agents"
            policy_dir.mkdir(parents=True, exist_ok=True)
            policy_content = "policy:\n  allow_implicit_invocation: false\n"
            (policy_dir / "openai.yaml").write_text(policy_content, encoding="utf-8")

        return out_dir

    def write_all(self, manifest: SyncManifest) -> list[Path]:
        return [self.write_skill(s) for s in manifest.skills]


class CodexSubagentWriter:
    """Write subagents to ``.codex/agents/``."""

    def __init__(self, staging_dir: Path) -> None:
        self.output_root = staging_dir / ".codex" / "agents"

    def write_subagent(self, subagent: SubagentSpec) -> Path:
        resolution = resolve_model(subagent.model)
        self.output_root.mkdir(parents=True, exist_ok=True)

        # Build TOML fields in specified order.
        data: dict[str, Any] = {
            "name": subagent.name,
            "description": subagent.description,
        }
        if resolution.codex_model is not None:
            data["model"] = resolution.codex_model
        if resolution.codex_reasoning_effort is not None:
            data["model_reasoning_effort"] = resolution.codex_reasoning_effort
        data["developer_instructions"] = subagent.prompt_markdown

        content = tomli_w.dumps(data)
        out_path = self.output_root / f"{subagent.filename_stem}.toml"
        out_path.write_text(content, encoding="utf-8")
        return out_path

    def write_all(self, manifest: SyncManifest) -> list[Path]:
        return [self.write_subagent(s) for s in manifest.subagents]
