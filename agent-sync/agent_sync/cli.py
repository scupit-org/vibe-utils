"""CLI entry point for agent-sync."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from agent_sync import __version__
from agent_sync.app.sync import SyncOrchestrator
from agent_sync.domain.models import ALL_TOOL_NAMES, Diagnostic, SyncResult, ToolName


def parse_tool_name(value: str) -> ToolName:
    """Parse a CLI tool name into the canonical ToolName type."""
    if value not in ALL_TOOL_NAMES:
        raise argparse.ArgumentTypeError(
            f"invalid choice: {value!r} (choose from {', '.join(ALL_TOOL_NAMES)})"
        )
    return value


def _add_common_args(sub: argparse.ArgumentParser) -> None:
    """Add arguments shared by all subcommands."""
    sub.add_argument(
        "--repo-root", type=Path, default=Path.cwd(),
        help="Repository root (default: current directory)",
    )
    sub.add_argument(
        "-s", "--source-tool", type=parse_tool_name, required=True,
        help="Source tool whose definitions to read",
    )
    sub.add_argument("--verbose", action="store_true")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="agent-sync",
        description="Sync coding agent definitions between Cursor, Claude Code, and Codex.",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # sync command
    sync_parser = subparsers.add_parser(
        "sync", help="Parse, validate, and regenerate outputs.",
    )
    _add_common_args(sync_parser)
    sync_parser.add_argument("--dry-run", action="store_true")

    # validate command
    validate_parser = subparsers.add_parser(
        "validate", help="Parse and validate without writing.",
    )
    _add_common_args(validate_parser)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    orchestrator = SyncOrchestrator(
        repo_root=args.repo_root,
        source_tool=args.source_tool,
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
    if verbose:
        for message in result.verbose_messages:
            print(f"[verbose] {message}", file=sys.stderr)

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
        if result.managed_subtrees_cleared:
            parts.append(f"{result.managed_subtrees_cleared} managed subtree(s) cleared")
        written = ", ".join(parts) if parts else "nothing"
        warn_count = len(result.warnings)
        warn_str = f" {warn_count} warning(s)." if warn_count else ""
        action = "written" if result.skills_written or result.subagents_written else "changed"
        print(f"Sync complete{mode}: {written} {action}.{warn_str}", file=sys.stderr)
        _print_dropped_fields(result)
    elif command == "validate":
        if result.success:
            warn_count = len(result.warnings)
            warn_str = f" {warn_count} warning(s)." if warn_count else ""
            print(f"Validation passed.{warn_str}", file=sys.stderr)
            _print_dropped_fields(result)
        else:
            print(
                f"Validation failed: {len(result.errors)} error(s).",
                file=sys.stderr,
            )


def _print_diagnostic(diag: Diagnostic) -> None:
    prefix = f"[{diag.code}]"
    path_part = f" {diag.source_path}:" if diag.source_path else ""
    print(f"{prefix}{path_part} {diag.message}", file=sys.stderr)


def _print_dropped_fields(result: SyncResult) -> None:
    if not result.dropped_fields:
        return

    parts = [
        f"{item.target_tool} {item.entity_kind} {item.field_name} ({item.count})"
        for item in result.dropped_fields
    ]
    print(f"Dropped fields: {', '.join(parts)}", file=sys.stderr)
