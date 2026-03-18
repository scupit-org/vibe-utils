"""CLI entry point for agent-sync."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from agent_sync.app.sync import SyncOrchestrator
from agent_sync.domain.models import Diagnostic, SyncResult


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="agent-sync",
        description="Sync Cursor project definitions to Claude Code and Codex formats.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # sync command
    sync_parser = subparsers.add_parser(
        "sync", help="Parse, validate, and regenerate outputs.",
    )
    sync_parser.add_argument(
        "--repo-root", type=Path, default=Path.cwd(),
        help="Repository root (default: current directory)",
    )
    sync_parser.add_argument(
        "--source-dir", type=str, default=".cursor",
        help="Source directory name (default: .cursor)",
    )
    sync_parser.add_argument("--verbose", action="store_true")
    sync_parser.add_argument("--dry-run", action="store_true")

    # validate command
    validate_parser = subparsers.add_parser(
        "validate", help="Parse and validate without writing.",
    )
    validate_parser.add_argument(
        "--repo-root", type=Path, default=Path.cwd(),
        help="Repository root (default: current directory)",
    )
    validate_parser.add_argument(
        "--source-dir", type=str, default=".cursor",
        help="Source directory name (default: .cursor)",
    )
    validate_parser.add_argument("--verbose", action="store_true")

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    orchestrator = SyncOrchestrator(
        repo_root=args.repo_root,
        source_dir_name=args.source_dir,
        dry_run=getattr(args, "dry_run", False),
        verbose=args.verbose,
    )

    if args.command == "sync":
        result = orchestrator.run_sync()
    else:
        result = orchestrator.run_validate()

    _print_result(result, args.command, args.verbose)
    sys.exit(0 if result.success else 1)


def _print_result(result: SyncResult, command: str, verbose: bool) -> None:
    """Print diagnostics and summary to stderr."""
    for diag in result.errors:
        _print_diagnostic(diag)
    for diag in result.warnings:
        _print_diagnostic(diag)

    if command == "sync" and result.success:
        mode = " (dry run)" if result.dry_run else ""
        parts = []
        if result.skills_written:
            parts.append(f"{result.skills_written} skill(s)")
        if result.subagents_written:
            parts.append(f"{result.subagents_written} subagent(s)")
        written = ", ".join(parts) if parts else "nothing"
        warn_count = len(result.warnings)
        warn_str = f" {warn_count} warning(s)." if warn_count else ""
        print(f"Sync complete{mode}: {written} written.{warn_str}", file=sys.stderr)
    elif command == "validate":
        if result.success:
            warn_count = len(result.warnings)
            warn_str = f" {warn_count} warning(s)." if warn_count else ""
            print(f"Validation passed.{warn_str}", file=sys.stderr)
        else:
            print(
                f"Validation failed: {len(result.errors)} error(s).",
                file=sys.stderr,
            )


def _print_diagnostic(diag: Diagnostic) -> None:
    prefix = f"[{diag.code}]"
    path_part = f" {diag.source_path}:" if diag.source_path else ""
    print(f"{prefix}{path_part} {diag.message}", file=sys.stderr)
