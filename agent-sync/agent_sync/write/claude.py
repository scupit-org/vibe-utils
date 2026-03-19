"""Claude Code writers (skills and subagents)."""

from __future__ import annotations

from pathlib import Path

from agent_sync.domain.models import SkillSpec, SubagentSpec, SyncManifest
from agent_sync.write.common import (
    copy_skill_assets,
    generate_skill_md,
    generate_subagent_md,
    resolve_model,
)


class ClaudeSkillWriter:
    """Write skills to ``.claude/skills/``."""

    def __init__(self, staging_dir: Path) -> None:
        self.output_root = staging_dir / ".claude" / "skills"

    def write_skill(self, skill: SkillSpec) -> Path:
        out_dir = self.output_root / str(skill.relative_skill_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        # Copy companion assets first.
        copy_skill_assets(
            skill.source_skill_dir,
            out_dir,
            skill.copied_asset_paths,
            source_tool=skill.source_tool,
            target_tool="claude",
        )

        # Skills add capabilities to the session; they do not dictate model
        # selection, so skill model metadata is intentionally ignored.
        content = generate_skill_md(
            name=skill.name,
            description=skill.description,
            body_markdown=skill.body_markdown,
            disable_model_invocation=skill.disable_model_invocation,
        )
        (out_dir / "SKILL.md").write_text(content, encoding="utf-8")
        return out_dir

    def write_all(self, manifest: SyncManifest) -> list[Path]:
        return [self.write_skill(s) for s in manifest.skills]


class ClaudeSubagentWriter:
    """Write subagents to ``.claude/agents/``."""

    def __init__(self, staging_dir: Path) -> None:
        self.output_root = staging_dir / ".claude" / "agents"

    def write_subagent(self, subagent: SubagentSpec) -> Path:
        self.output_root.mkdir(parents=True, exist_ok=True)

        content = generate_subagent_md(
            name=subagent.name,
            description=subagent.description,
            prompt_markdown=subagent.prompt_markdown,
            model=resolve_model(
                subagent.source_tool, subagent.model, "claude",
                subagent.source_reasoning_effort,
            ),
        )
        out_path = self.output_root / f"{subagent.filename_stem}.md"
        out_path.write_text(content, encoding="utf-8")
        return out_path

    def write_all(self, manifest: SyncManifest) -> list[Path]:
        return [self.write_subagent(s) for s in manifest.subagents]
