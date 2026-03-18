"""Orchestration: parse → validate → stage → write → replace → summary."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from agent_sync.domain.diagnostics import e001_source_root_missing
from agent_sync.domain.models import Diagnostic, SyncManifest, SyncResult
from agent_sync.parse.cursor import parse_cursor_source
from agent_sync.transform.normalize import normalize_manifest
from agent_sync.transform.validate import validate_manifest
from agent_sync.write.claude import ClaudeSkillWriter, ClaudeSubagentWriter
from agent_sync.write.codex import CodexSkillWriter, CodexSubagentWriter


# Managed subtrees — these are wiped and regenerated on each sync.
MANAGED_SUBTREES: list[tuple[str, ...]] = [
    (".claude", "skills"),
    (".claude", "agents"),
    (".agents", "skills"),
    (".codex", "agents"),
]


class SyncOrchestrator:
    """Drives the full sync or validate pipeline."""

    def __init__(
        self,
        repo_root: Path,
        source_dir_name: str = ".cursor",
        dry_run: bool = False,
        verbose: bool = False,
    ) -> None:
        self.repo_root = repo_root.resolve()
        self.source_dir_name = source_dir_name
        self.dry_run = dry_run
        self.verbose = verbose

    # ── Public API ───────────────────────────────────────────────────────

    def run_sync(self) -> SyncResult:
        """Full sync: parse → validate → stage → replace managed subtrees."""
        manifest, all_diags = self._parse_and_validate()

        errors = [d for d in all_diags if d.severity == "error"]
        warnings = [d for d in all_diags if d.severity == "warning"]

        if errors:
            return SyncResult(
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
                    warnings=warnings,
                    dry_run=True,
                )

            self._replace_managed_subtrees(staging)

        return SyncResult(
            skills_written=skills_written,
            subagents_written=subagents_written,
            warnings=warnings,
            dry_run=False,
        )

    def run_validate(self) -> SyncResult:
        """Parse and validate only — no file writes."""
        _, all_diags = self._parse_and_validate()

        errors = [d for d in all_diags if d.severity == "error"]
        warnings = [d for d in all_diags if d.severity == "warning"]

        return SyncResult(errors=errors, warnings=warnings)

    # ── Internal ─────────────────────────────────────────────────────────

    def _parse_and_validate(self) -> tuple[SyncManifest, list[Diagnostic]]:
        """Run parse + normalize + validate, return manifest + all diagnostics."""
        source_dir = self.repo_root / self.source_dir_name
        if not source_dir.is_dir():
            diag = e001_source_root_missing(source_dir)
            return SyncManifest(), [diag]

        manifest = parse_cursor_source(self.repo_root, self.source_dir_name)

        # Collect parse-time diagnostics.
        all_diags: list[Diagnostic] = list(manifest.errors) + list(manifest.warnings)

        # Normalization (generates W002 warnings).
        norm_warnings = normalize_manifest(manifest)
        all_diags.extend(norm_warnings)

        # Cross-entity validation.
        val_diags = validate_manifest(manifest)
        all_diags.extend(val_diags)

        return manifest, all_diags

    def _stage_outputs(
        self, manifest: SyncManifest, staging_dir: Path,
    ) -> tuple[int, int]:
        """Write all outputs into *staging_dir*.  Returns (skills, subagents) counts."""
        claude_skills = ClaudeSkillWriter(staging_dir)
        claude_agents = ClaudeSubagentWriter(staging_dir)
        codex_skills = CodexSkillWriter(staging_dir)
        codex_agents = CodexSubagentWriter(staging_dir)

        claude_skills.write_all(manifest)
        claude_agents.write_all(manifest)
        codex_skills.write_all(manifest)
        codex_agents.write_all(manifest)

        return len(manifest.skills), len(manifest.subagents)

    def _replace_managed_subtrees(self, staging_dir: Path) -> None:
        """Wipe each managed subtree in *repo_root*, then move staged output in."""
        for parts in MANAGED_SUBTREES:
            target = self.repo_root.joinpath(*parts)
            staged = staging_dir.joinpath(*parts)

            # Wipe existing managed subtree.
            if target.exists():
                shutil.rmtree(target)

            # Move staged output into place (if anything was generated).
            if staged.exists():
                shutil.move(str(staged), str(target))
