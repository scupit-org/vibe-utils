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
2. **Validate** — check for duplicate names, unknown model strings, invalid reasoning-effort levels, missing required fields, and other structural issues.
3. **Translate models** — map the source model to each target tool's model at the same capability tier (see [Supported models](#supported-models)), carrying reasoning effort across as a parameter.
4. **Write** — emit target-format files for every tool except the source, handling format differences like Codex's TOML subagents and `agents/openai.yaml` invocation policy.
5. **Replace** — atomically swap only the managed output directories, leaving tool settings (`CLAUDE.md`, `AGENTS.md`, `settings.json`, `config.toml`, etc.) untouched.

## Supported models

No model is offered by more than one tool anymore, so cross-tool translation maps by **capability tier**: the source model resolves to the target tool's model at the same tier, walking *up* a tier when the target has no model at that level. When mapping into Claude at the powerful tier, `claude-opus-5` is preferred over `claude-fable-5` (Fable is accepted as input but never auto-selected, due to cost).

| Tier | Cursor | Claude Code | Codex |
|---|---|---|---|
| Powerful | `grok-4.6` | `claude-opus-5` (alias `opus`), `claude-fable-5` (alias `fable`) | `gpt-5.6-sol` (alias `gpt-5.6`) |
| Moderate | — (walks up to `grok-4.6`) | `claude-sonnet-5` (alias `sonnet`) | `gpt-5.6-terra` |
| Small | `composer-2.5` | — (walks up to `claude-sonnet-5`) | `gpt-5.6-luna` |

Any other model string (including retired IDs like `gpt-5.4` or `claude-opus-4-6`, and `haiku`, which has no Claude 5 equivalent) is an unrecognized-model error. Fast variants (`claude-opus-5-fast`, `gpt-5.6-sol-fast`, Cursor's `fast` param) are not yet supported.

**Aliases** are accepted on input and normalized. Whether the source wrote an alias or an exact ID is preserved as a preference: an aliased source (e.g. Codex `gpt-5.6`) writes each target's primary alias when one exists (Claude gets `opus`), and the exact ID otherwise. Claude's `model: inherit` is treated the same as omitting the model.

### Reasoning effort

Effort is a parameter on every provider rather than part of the model ID:

| Tool | Syntax | Supported levels |
|---|---|---|
| Cursor | bracket param on the model string: `grok-4.6[effort=high]` | `low`–`xhigh` on `grok-4.6`; none on `composer-2.5` |
| Claude Code | `effort` frontmatter key | `low`, `medium`, `high`, `xhigh`, `max` |
| Codex | `model_reasoning_effort` TOML key | `low`, `medium`, `high`, `xhigh`, `max` |

If the source specifies an effort, every generated target specifies the same effort, clamped to the closest level its model supports (e.g. Claude `max` becomes `xhigh` on `grok-4.6`; `composer-2.5` takes none, so it's omitted). If the source specifies no effort, no target does either. An effort the source model doesn't support is a validation error.

Cursor bracket params are comma-separated (`grok-4.6[effort=high,fast=true]`); params other than `effort` are tolerated on parse but silently ignored and never carried into generated output.

## Format differences handled

| Concept | Cursor | Claude Code | Codex |
|---|---|---|---|
| Skill definition | `.cursor/skills/**/SKILL.md` (YAML frontmatter + Markdown) | `.claude/skills/**/SKILL.md` (YAML frontmatter + Markdown) | `.agents/skills/**/SKILL.md` (YAML frontmatter + Markdown) |
| Skill invocation policy | `disable-model-invocation` in frontmatter | `disable-model-invocation` in frontmatter | `agents/openai.yaml` sidecar with `policy.allow_implicit_invocation` |
| Subagent definition | `.cursor/agents/*.md` (YAML frontmatter + Markdown) | `.claude/agents/*.md` (YAML frontmatter + Markdown) | `.codex/agents/*.toml` (TOML with `developer_instructions`) |
| Model field (subagents) | Model ID with bracket params (`grok-4.6[effort=high]`) | Model ID or alias + `effort` key | Model ID or alias + `model_reasoning_effort` |
| Model field (skills) | *(no model field)* | Parsed but ignored | *(no model field)* |

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
- Unrecognized model string (subagents)
- Reasoning effort the source model doesn't support
- Duplicate skill or subagent names
- Duplicate output file paths
- Skill directory with files but no `SKILL.md`

Warnings (reported, generation continues):

- Subagent filename doesn't match its frontmatter `name`
- Skill model metadata is parsed but ignored for every target
- `readonly` or `is_background` fields stored but not yet emitted
- Unknown frontmatter keys not consumed by any writer

## Running tests

```bash
pytest
```
