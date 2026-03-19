"""Canonical data models for agent-sync."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any, Literal

ToolName = Literal["cursor", "claude", "codex"]
EntityKind = Literal["skill", "subagent"]
ALL_TOOL_NAMES: tuple[ToolName, ...] = ("cursor", "claude", "codex")


@dataclass(frozen=True, slots=True)
class Diagnostic:
    """A structured diagnostic message (error or warning)."""

    severity: Literal["error", "warning"]
    code: str
    message: str
    source_path: Path | None = None
    context: dict[str, Any] | None = None


@dataclass(slots=True)
class SkillSpec:
    """Canonical representation of a skill parsed from source."""

    source_tool: ToolName
    source_root: Path
    source_skill_dir: Path
    relative_skill_dir: PurePosixPath
    entrypoint_path: Path
    name: str
    description: str
    body_markdown: str
    disable_model_invocation: bool = False
    model: str | None = None
    extra_frontmatter: dict[str, Any] = field(default_factory=dict)
    reserved_extra_metadata: dict[str, Any] = field(default_factory=dict)
    copied_asset_paths: list[PurePosixPath] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class SubagentSpec:
    """Canonical representation of a subagent parsed from source."""

    source_tool: ToolName
    source_path: Path
    filename_stem: str
    name: str
    description: str
    prompt_markdown: str
    model: str | None = None
    source_reasoning_effort: str | None = None
    readonly: bool | None = None
    is_background: bool | None = None
    extra_frontmatter: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SyncManifest:
    """Aggregate result of parsing a source directory."""

    skills: list[SkillSpec] = field(default_factory=list)
    subagents: list[SubagentSpec] = field(default_factory=list)
    warnings: list[Diagnostic] = field(default_factory=list)
    errors: list[Diagnostic] = field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        return len(self.errors) > 0


@dataclass(frozen=True, slots=True)
class DroppedFieldCount:
    """Aggregate count of an intentionally omitted field in target output."""

    target_tool: ToolName
    entity_kind: EntityKind
    field_name: str
    count: int


@dataclass(slots=True)
class SyncResult:
    """Result of a sync or validate operation, used for CLI output."""

    skills_written: int = 0
    subagents_written: int = 0
    dropped_fields: list[DroppedFieldCount] = field(default_factory=list)
    warnings: list[Diagnostic] = field(default_factory=list)
    errors: list[Diagnostic] = field(default_factory=list)
    verbose_messages: list[str] = field(default_factory=list)
    dry_run: bool = False

    @property
    def success(self) -> bool:
        return len(self.errors) == 0
