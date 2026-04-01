---
name: agent-sync-build-install
description: Build, test, and install the local `agent-sync` Python CLI from the repository checkout using the project's wheel-first packaging workflow. Use when an agent needs to create fresh `dist/` artifacts, reinstall the newest local wheel, verify the installed CLI, explain why temporary `agent_sync.egg-info/` metadata appears during builds, or update project docs about local packaging and installation for `agent-sync/`.
---

# Agent Sync Build Install

Use this skill only for the `agent-sync/` project in this repository. Operate from that directory unless the user explicitly asks for a different checkout.

## Workflow

1. Confirm the interpreter is Python 3.12 or newer.
2. Build fresh artifacts in `dist/` with `python -m build`.
3. Run the test suite from the source tree before or after reinstalling the wheel, depending on the user's goal.
4. Install from the newest built wheel in `dist/`, not from `pip install .`, when the user wants the installed CLI to match the packaged artifact exactly.
5. Verify the installed command with `agent-sync --help` or `python -m agent_sync --help`.

## Commands

Run these from `agent-sync/`:

```powershell
python -m pip install --upgrade build
python -m build
```

For tests:

```powershell
python -m pip install -e ".[dev]"
python -m pytest -q
```

For wheel installation in Windows PowerShell, always select the newest built wheel instead of hard-coding a version:

```powershell
$wheel = Get-ChildItem .\dist\agent_sync-*.whl | Sort-Object LastWriteTime -Descending | Select-Object -First 1
python -m pip install --user --force-reinstall $wheel.FullName
```

If the user is working inside an activated virtual environment, omit `--user`.

For verification:

```powershell
agent-sync --help
python -m agent_sync --help
```

## Rules

- Keep instructions version-agnostic. Do not hard-code `0.1.0` or any other package version into docs or commands unless the user explicitly asks for the current file name.
- Prefer installing from the built wheel when the task is about packaging correctness or local distribution behavior.
- Explain that `agent_sync.egg-info/` may be regenerated during builds by setuptools. Treat it as generated metadata, not as a sign that the project is distributing deprecated `.egg` artifacts.
- Do not commit generated packaging outputs such as `build/`, `dist/`, or `*.egg-info/`.
- When updating README instructions, keep the wheel-based install path and note when `--force-reinstall` is appropriate.
