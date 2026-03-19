"""Orchestration: parse → validate → stage → write → replace → summary."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from agent_sync.domain.diagnostics import e001_source_root_missing
from agent_sync.domain.models import Diagnostic, DroppedFieldCount, SyncManifest, SyncResult
from agent_sync.parse.claude import parse_claude_source
from agent_sync.parse.codex import parse_codex_source
from agent_sync.parse.cursor import parse_cursor_source
from agent_sync.transform.normalize import collect_dropped_fields
from agent_sync.transform.validate import validate_manifest
from agent_sync.write.claude import ClaudeSkillWriter, ClaudeSubagentWriter
from agent_sync.write.codex import CodexSkillWriter, CodexSubagentWriter
from agent_sync.write.common import get_managed_subtrees
from agent_sync.write.cursor import CursorSkillWriter, CursorSubagentWriter


class SyncOrchestrator:
    """Drives the full sync or validate pipeline."""

    def __init__(
        self,
        repo_root: Path,
        source_tool: str = "cursor",
        dry_run: bool = False,
        verbose: bool = False,
    ) -> None:
        self.repo_root = repo_root.resolve()
        self.source_tool = source_tool
        self.dry_run = dry_run
        self.verbose = verbose

    # ── Public API ───────────────────────────────────────────────────────

    def run_sync(self) -> SyncResult:
        """Full sync: parse → validate → stage → replace managed subtrees."""
        manifest, all_diags, dropped_fields = self._parse_and_validate()

        errors = [d for d in all_diags if d.severity == "error"]
        warnings = [d for d in all_diags if d.severity == "warning"]

        if errors:
            return SyncResult(
                dropped_fields=dropped_fields,
                errors=errors,
                warnings=warnings,
                dry_run=self.dry_run,
            )

        # Stage into a temp directory on the same filesystem.
        with tempfile.TemporaryDirectory(dir=str(self.repo_root)) as staging_str:
            staging = Path(staging_str)
            skills_written, subagents_written = self._stage_outputs(manifest, staging)

            if self.dry_run:
                return SyncResult(
                    skills_written=skills_written,
                    subagents_written=subagents_written,
                    dropped_fields=dropped_fields,
                    warnings=warnings,
                    dry_run=True,
                )

            self._replace_managed_subtrees(staging)

        return SyncResult(
            skills_written=skills_written,
            subagents_written=subagents_written,
            dropped_fields=dropped_fields,
            warnings=warnings,
            dry_run=False,
        )

    def run_validate(self) -> SyncResult:
        """Parse and validate only — no file writes."""
        _, all_diags, dropped_fields = self._parse_and_validate()

        errors = [d for d in all_diags if d.severity == "error"]
        warnings = [d for d in all_diags if d.severity == "warning"]

        return SyncResult(
            dropped_fields=dropped_fields,
            errors=errors,
            warnings=warnings,
        )

    # ── Internal ─────────────────────────────────────────────────────────

    def _parse_and_validate(
        self,
    ) -> tuple[SyncManifest, list[Diagnostic], list[DroppedFieldCount]]:
        """Run parse + validate + reporting analysis."""
        # Source existence check.
        if not self._source_exists():
            diag = self._source_missing_diagnostic()
            return SyncManifest(), [diag], []

        manifest = self._parse_source()

        # Collect parse-time diagnostics.
        all_diags: list[Diagnostic] = list(manifest.errors) + list(manifest.warnings)

        # Cross-entity validation.
        val_diags = validate_manifest(manifest, source_tool=self.source_tool)
        all_diags.extend(val_diags)

        dropped_fields = collect_dropped_fields(manifest, source_tool=self.source_tool)

        return manifest, all_diags, dropped_fields

    def _source_exists(self) -> bool:
        """Check if the source tool's directories exist."""
        if self.source_tool == "codex":
            agents_dir = self.repo_root / ".agents"
            codex_dir = self.repo_root / ".codex"
            return agents_dir.is_dir() or codex_dir.is_dir()
        source_dir = self.repo_root / f".{self.source_tool}"
        return source_dir.is_dir()

    def _source_missing_diagnostic(self) -> Diagnostic:
        """Return an E001 diagnostic for the missing source directory."""
        if self.source_tool == "codex":
            return e001_source_root_missing(self.repo_root / ".agents")
        return e001_source_root_missing(self.repo_root / f".{self.source_tool}")

    def _parse_source(self) -> SyncManifest:
        """Dispatch to the correct parser based on source tool."""
        if self.source_tool == "cursor":
            return parse_cursor_source(self.repo_root)
        elif self.source_tool == "claude":
            return parse_claude_source(self.repo_root)
        elif self.source_tool == "codex":
            return parse_codex_source(self.repo_root)
        else:
            raise ValueError(f"Unknown source tool: {self.source_tool}")

    def _stage_outputs(
        self, manifest: SyncManifest, staging_dir: Path,
    ) -> tuple[int, int]:
        """Write all outputs into *staging_dir*.  Returns (skills, subagents) counts."""
        target_tools = {"cursor", "claude", "codex"} - {self.source_tool}

        if "claude" in target_tools:
            ClaudeSkillWriter(staging_dir).write_all(manifest)
            ClaudeSubagentWriter(staging_dir).write_all(manifest)

        if "codex" in target_tools:
            CodexSkillWriter(staging_dir).write_all(manifest)
            CodexSubagentWriter(staging_dir).write_all(manifest)

        if "cursor" in target_tools:
            CursorSkillWriter(staging_dir).write_all(manifest)
            CursorSubagentWriter(staging_dir).write_all(manifest)

        return len(manifest.skills), len(manifest.subagents)

    def _replace_managed_subtrees(self, staging_dir: Path) -> None:
        """Wipe each managed subtree in *repo_root*, then move staged output in."""
        subtrees = get_managed_subtrees(exclude_tool=self.source_tool)
        for parts in subtrees:
            target = self.repo_root.joinpath(*parts)
            staged = staging_dir.joinpath(*parts)

            # Wipe existing managed subtree.
            if target.exists():
                shutil.rmtree(target)

            # Move staged output into place (if anything was generated).
            if staged.exists():
                shutil.move(str(staged), str(target))
