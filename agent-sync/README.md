# agent-sync

> **NOTE: This is vibe coded software!** I wanted a way to test skills
> and subagents across my personal projects while trying out a few popular
> AI coding tools. **Use at your own discretion!**
>
> Also, this README is AI-generated, albeit human-reviewed. I'll do a human
> pass through it if I find this project useful enough to be worth it.

A Python CLI tool that keeps coding agent definitions synchronized across **Cursor**, **Claude Code**, and **Codex**.

Each of these AI coding tools uses its own file format and directory layout for the same two concepts:

- **Skills** — reusable instruction bundles (a `SKILL.md` file plus optional companion assets in a directory).
- **Subagents** — custom agent definitions with a system prompt, model preference, and metadata.

`agent-sync` lets you author these definitions once in whichever tool you prefer, then generate equivalent definitions for the other two. Pick a source tool, and the CLI produces correctly formatted output for every other target.

## How it works

```
Source (any one tool)          Canonical model           Targets (all other tools)
─────────────────────    ──►   ───────────────    ──►    ─────────────────────────
.cursor/skills/**                SkillSpec               .claude/skills/**
.cursor/agents/*.md              SubagentSpec             .agents/skills/**
                                                         .claude/agents/*.md
.claude/skills/**                                        .cursor/agents/*.md
.claude/agents/*.md                                      .codex/agents/*.toml
                                                         … etc.
.agents/skills/**
.codex/agents/*.toml
```

1. **Parse** — read the source tool's definitions into tool-agnostic canonical objects (`SkillSpec`, `SubagentSpec`).
2. **Validate** — check for duplicate names, unknown model strings, missing required fields, and other structural issues.
3. **Translate models** — resolve model names across tools via a unified mapping registry (e.g. Cursor's `claude-4.6-sonnet-medium` becomes Claude's `claude-sonnet-4-6`; unsupported cross-family models inherit by omission).
4. **Write** — emit target-format files for every tool except the source, handling format differences like Codex's TOML subagents and `agents/openai.yaml` invocation policy.
5. **Replace** — atomically swap only the managed output directories, leaving tool settings (`CLAUDE.md`, `AGENTS.md`, `settings.json`, `config.toml`, etc.) untouched.

## Format differences handled

| Concept | Cursor | Claude Code | Codex |
|---|---|---|---|
| Skill definition | `.cursor/skills/**/SKILL.md` (YAML frontmatter + Markdown) | `.claude/skills/**/SKILL.md` (YAML frontmatter + Markdown) | `.agents/skills/**/SKILL.md` (YAML frontmatter + Markdown) |
| Skill invocation policy | `disable-model-invocation` in frontmatter | `disable-model-invocation` in frontmatter | `agents/openai.yaml` sidecar with `policy.allow_implicit_invocation` |
| Subagent definition | `.cursor/agents/*.md` (YAML frontmatter + Markdown) | `.claude/agents/*.md` (YAML frontmatter + Markdown) | `.codex/agents/*.toml` (TOML with `developer_instructions`) |
| Model field (subagents) | Cursor model names | Claude model aliases | Codex model name + `model_reasoning_effort` |
| Model field (skills) | Stored in frontmatter | Not emitted (inherited) | Not emitted (inherited) |

## Build, test, and install

Requires **Python 3.12+**.

### Build the package

```bash
python -m pip install --upgrade build
python -m build
```

This produces modern Python distributions in `dist/`:

- a **wheel** (`.whl`) for installation
- an **sdist** (`.tar.gz`) for source distribution

Setuptools may also regenerate a local `agent_sync.egg-info/` directory while building. That metadata is a normal build artifact and should not be committed.

### Test the project

If you need to run the test suite from a local checkout, install the dev extras first:

```bash
python -m pip install -e ".[dev]"
python -m pytest -q
```

### Install the built package

Install or reinstall from the wheel produced by the current build instead of installing directly from the source tree. This keeps the installed CLI aligned with the exact artifact in `dist/`.

If you are installing into a virtual environment, omit `--user`.

Windows PowerShell:

```powershell
$wheel = Get-ChildItem .\dist\agent_sync-*.whl | Sort-Object LastWriteTime -Descending | Select-Object -First 1
python -m pip install --user --force-reinstall $wheel.FullName
```

Linux / macOS:

```bash
python -m pip install --user --force-reinstall dist/agent_sync-*.whl
```

If your shell does not expand `dist/agent_sync-*.whl`, replace it with the exact wheel filename shown in `dist/`.

### Verify the installed CLI

```bash
agent-sync --help
```

### Development install

If you want an editable local development environment instead of installing the built wheel:

```bash
python -m venv .venv
```

Activate it:

```bash
# Linux / macOS
source .venv/bin/activate

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
```

Then install the project:

```bash
python -m pip install -e .
```

## Usage

### `sync` — generate target definitions

```bash
agent-sync sync --source-tool cursor --repo-root /path/to/repo
```

This reads Cursor's skill and subagent definitions, validates them, and writes equivalent Claude Code and Codex definitions.

| Flag | Default | Description |
|---|---|---|
| `-s`, `--source-tool` | *(required)* | Source tool to read from: `cursor`, `claude`, or `codex` |
| `--repo-root` | `.` (current directory) | Path to the repository root |
| `--dry-run` | off | Validate and report what would be written without modifying files |
| `--verbose` | off | Show detailed output |

### `validate` — check definitions without writing

```bash
agent-sync validate -s cursor
```

Parses and validates the source definitions. Exits with code 1 if there are errors. Useful for CI or pre-commit checks.

### Quick start

From the root of your repo:

```bash
agent-sync sync -s cursor
```

### Examples

Sync from Cursor:

```bash
agent-sync sync -s cursor
```

or from other tools:

```bash
# or Claude Code
agent-sync sync -s claude
# or Codex
agent-sync sync -s codex
```

Preview what would be generated without writing anything:

```bash
agent-sync sync -s codex --dry-run
```

## What gets written (and what doesn't)

The tool **only** manages these output directories:

- `.cursor/skills/` and `.cursor/agents/` (when Cursor is a target)
- `.claude/skills/` and `.claude/agents/` (when Claude is a target)
- `.agents/skills/` and `.codex/agents/` (when Codex is a target)

It **never** touches:

- `CLAUDE.md`, `AGENTS.md`
- `.claude/settings.json`, `.claude/settings.local.json`
- `.codex/config.toml`
- Any files outside the managed subtrees

## Validation

Errors (block generation):

- Missing source directory
- Malformed YAML frontmatter
- Missing required `name` or `description` fields
- Unrecognized model string
- Duplicate skill or subagent names
- Duplicate output file paths
- Skill directory with files but no `SKILL.md`

Warnings (reported, generation continues):

- Subagent filename doesn't match its frontmatter `name`
- Skill model will be dropped for a target that doesn't support per-skill models
- `readonly` or `is_background` fields stored but not yet emitted
- Unknown frontmatter keys not consumed by any writer

## Running tests

```bash
pytest
```
