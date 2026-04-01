"""Orchestration: parse → validate → stage → write → replace → summary."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from agent_sync.domain.diagnostics import e001_source_root_missing, w007_staging_cleanup_failed
from agent_sync.domain.models import (
    ALL_TOOL_NAMES,
    Diagnostic,
    DroppedFieldCount,
    SyncManifest,
    SyncResult,
    ToolName,
)
from agent_sync.parse.claude import parse_claude_source
from agent_sync.parse.codex import parse_codex_source, get_codex_skill_dirs
from agent_sync.parse.cursor import parse_cursor_source
from agent_sync.transform.normalize import collect_dropped_fields
from agent_sync.transform.validate import validate_manifest
from agent_sync.write.claude import ClaudeSkillWriter, ClaudeSubagentWriter
from agent_sync.write.codex import CodexSkillWriter, CodexSubagentWriter
from agent_sync.write.common import get_managed_subtrees
from agent_sync.write.cursor import CursorSkillWriter, CursorSubagentWriter


class SyncOrchestrator:
    """Drives the full sync or validate pipeline."""
    source_tool: ToolName

    def __init__(
        self,
        repo_root: Path,
        source_tool: ToolName,
        dry_run: bool = False,
        verbose: bool = False,
    ) -> None:
        self.repo_root = repo_root.resolve()
        self.source_tool = source_tool
        self.dry_run = dry_run
        self.verbose = verbose
        self._verbose_messages: list[str] = []

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
                verbose_messages=list(self._verbose_messages),
                dry_run=self.dry_run,
            )

        if self._is_empty_manifest(manifest):
            managed_subtrees_cleared = 0
            if self.dry_run:
                self._log("manifest empty during dry run; skipping staging and replacement")
            else:
                self._log("manifest empty; clearing managed target subtrees without staging")
                managed_subtrees_cleared = self._clear_managed_subtrees()
            return SyncResult(
                managed_subtrees_cleared=managed_subtrees_cleared,
                dropped_fields=dropped_fields,
                warnings=warnings,
                verbose_messages=list(self._verbose_messages),
                dry_run=self.dry_run,
            )

        staging = self._create_staging_dir()
        skills_written = 0
        subagents_written = 0
        try:
            skills_written, subagents_written = self._stage_outputs(manifest, staging)

            if not self.dry_run:
                self._replace_managed_subtrees(staging)
        finally:
            cleanup_warning = self._cleanup_staging_dir(staging)
            if cleanup_warning is not None:
                warnings.append(cleanup_warning)

        return SyncResult(
            skills_written=skills_written,
            subagents_written=subagents_written,
            dropped_fields=dropped_fields,
            warnings=warnings,
            verbose_messages=list(self._verbose_messages),
            dry_run=self.dry_run,
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
            verbose_messages=list(self._verbose_messages),
        )

    # ── Internal ─────────────────────────────────────────────────────────

    def _parse_and_validate(
        self,
    ) -> tuple[SyncManifest, list[Diagnostic], list[DroppedFieldCount]]:
        """Run parse + validate + reporting analysis."""
        self._verbose_messages = []
        self._log(f"repo root: {self.repo_root}")
        self._log(f"source tool: {self.source_tool}")

        # Source existence check.
        if not self._source_exists():
            diag = self._source_missing_diagnostic()
            self._log(f"source missing: {diag.source_path}")
            return SyncManifest(), [diag], []

        manifest = self._parse_source()
        self._log(
            "parsed manifest: "
            f"{len(manifest.skills)} skill(s), {len(manifest.subagents)} subagent(s)",
        )

        # Collect parse-time diagnostics.
        all_diags: list[Diagnostic] = list(manifest.errors) + list(manifest.warnings)
        if manifest.errors:
            self._log(f"parse diagnostics: {len(manifest.errors)} error(s)")
        if manifest.warnings:
            self._log(f"parse diagnostics: {len(manifest.warnings)} warning(s)")

        # Cross-entity validation.
        val_diags = validate_manifest(manifest, source_tool=self.source_tool)
        all_diags.extend(val_diags)
        if val_diags:
            error_count = sum(1 for d in val_diags if d.severity == "error")
            warning_count = sum(1 for d in val_diags if d.severity == "warning")
            self._log(
                "validation diagnostics: "
                f"{error_count} error(s), {warning_count} warning(s)",
            )

        dropped_fields = collect_dropped_fields(manifest, source_tool=self.source_tool)
        if dropped_fields:
            rendered = ", ".join(
                f"{item.target_tool}:{item.entity_kind}:{item.field_name}={item.count}"
                for item in dropped_fields
            )
            self._log(f"dropped fields summary: {rendered}")

        return manifest, all_diags, dropped_fields

    def _is_empty_manifest(self, manifest: SyncManifest) -> bool:
        """Return True when there is nothing to generate for any target tool."""
        return not manifest.skills and not manifest.subagents

    def _source_exists(self) -> bool:
        """Check if the source tool's directories exist."""
        if self.source_tool == "codex":
            codex_dir = self.repo_root / ".codex"
            skill_dirs = get_codex_skill_dirs(self.repo_root)
            agents_dir = codex_dir / "agents"
            self._log(
                "codex source lookup: "
                f"skills={[str(path) for path in skill_dirs]}, "
                f"agents={agents_dir} (exists={agents_dir.is_dir()})",
            )
            return bool(skill_dirs) or agents_dir.is_dir()
        source_dir = self.repo_root / f".{self.source_tool}"
        self._log(f"source lookup: {source_dir} (exists={source_dir.is_dir()})")
        return source_dir.is_dir()

    def _source_missing_diagnostic(self) -> Diagnostic:
        """Return an E001 diagnostic for the missing source directory."""
        if self.source_tool == "codex":
            return e001_source_root_missing(self.repo_root / ".agents" / "skills")
        return e001_source_root_missing(self.repo_root / f".{self.source_tool}")

    def _parse_source(self) -> SyncManifest:
        """Dispatch to the correct parser based on source tool."""
        if self.source_tool == "cursor":
            self._log("parsing cursor source")
            return parse_cursor_source(self.repo_root)
        elif self.source_tool == "claude":
            self._log("parsing claude source")
            return parse_claude_source(self.repo_root)
        elif self.source_tool == "codex":
            self._log("parsing codex source")
            return parse_codex_source(self.repo_root)
        else:
            raise ValueError(f"Unknown source tool: {self.source_tool}")

    def _stage_outputs(
        self, manifest: SyncManifest, staging_dir: Path,
    ) -> tuple[int, int]:
        """Write all outputs into *staging_dir*.  Returns (skills, subagents) counts."""
        target_tools: list[ToolName] = [
            tool for tool in ALL_TOOL_NAMES if tool != self.source_tool
        ]
        self._log(f"staging outputs for targets: {', '.join(target_tools)}")

        if "claude" in target_tools:
            ClaudeSkillWriter(staging_dir).write_all(manifest)
            ClaudeSubagentWriter(staging_dir).write_all(manifest)

        if "codex" in target_tools:
            CodexSkillWriter(staging_dir).write_all(manifest)
            CodexSubagentWriter(staging_dir).write_all(manifest)

        if "cursor" in target_tools:
            CursorSkillWriter(staging_dir).write_all(manifest)
            CursorSubagentWriter(staging_dir).write_all(manifest)

        self._log(
            "staged outputs: "
            f"{len(manifest.skills)} skill(s), {len(manifest.subagents)} subagent(s)",
        )
        return len(manifest.skills), len(manifest.subagents)

    def _create_staging_dir(self) -> Path:
        """Create a staging directory for sync output generation."""
        if self.dry_run:
            staging = Path(tempfile.mkdtemp())
            self._log(f"created dry-run staging dir: {staging}")
            return staging

        # Use a repo-local scratch directory for real syncs so staged moves stay
        # on the same filesystem and tool writers can create hidden roots.
        staging_parent = self.repo_root / ".tmp"
        staging_parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(dir=str(staging_parent)))
        self._log(f"created staging dir: {staging}")
        return staging

    def _cleanup_staging_dir(self, staging_dir: Path) -> Diagnostic | None:
        """Remove the staging directory and warn if cleanup fails."""
        try:
            shutil.rmtree(staging_dir)
        except OSError as exc:
            self._log(f"staging cleanup failed for {staging_dir}: {exc}")
            return w007_staging_cleanup_failed(staging_dir, str(exc))

        cleanup_warning = self._cleanup_staging_parent(staging_dir)
        if cleanup_warning is not None:
            return cleanup_warning
        return None

    def _cleanup_staging_parent(self, staging_dir: Path) -> Diagnostic | None:
        """Prune the repo-local staging parent when it is empty."""
        staging_parent = self.repo_root / ".tmp"
        if staging_dir.parent != staging_parent:
            return None
        if not staging_parent.exists():
            return None

        try:
            staging_parent.rmdir()
        except OSError as exc:
            try:
                parent_is_empty = not any(staging_parent.iterdir())
            except OSError:
                parent_is_empty = True

            if not parent_is_empty:
                self._log(f"staging parent retained at {staging_parent}")
                return None
            self._log(f"staging parent cleanup failed for {staging_parent}: {exc}")
            return w007_staging_cleanup_failed(staging_parent, str(exc))

        self._log(f"removed empty staging parent: {staging_parent}")
        return None

    def _clear_managed_subtrees(self) -> int:
        """Remove managed target subtrees without using staging."""
        subtrees = get_managed_subtrees(exclude_tool=self.source_tool)
        cleared_count = 0
        for parts in subtrees:
            target = self.repo_root.joinpath(*parts)
            self._log(f"clear subtree: target={target} exists={target.exists()}")
            if target.exists():
                shutil.rmtree(target)
                cleared_count += 1
        return cleared_count

    def _replace_managed_subtrees(self, staging_dir: Path) -> None:
        """Wipe each managed subtree in *repo_root*, then move staged output in."""
        subtrees = get_managed_subtrees(exclude_tool=self.source_tool)
        for parts in subtrees:
            target = self.repo_root.joinpath(*parts)
            staged = staging_dir.joinpath(*parts)
            self._log(f"replace subtree: target={target} staged_exists={staged.exists()}")

            # Wipe existing managed subtree.
            if target.exists():
                shutil.rmtree(target)

            # Move staged output into place (if anything was generated).
            if staged.exists():
                shutil.move(str(staged), str(target))

    def _log(self, message: str) -> None:
        """Record a verbose log line for CLI emission."""
        if self.verbose:
            self._verbose_messages.append(message)
