# Coding Agent Config Sync

## Create and activate venv

This project uses [`pyproject.toml`](D:\Personal_Projects\Coding\projects\general\vibe-utils\unified-coding-instruction-helper\pyproject.toml) as the source of truth for dependencies.

The virtual environment is still needed because `pyproject.toml` declares what to install, while `.venv` is the isolated environment where those packages get installed.

Use the built-in Python `venv` module from the project root:

Create the virtual environment:

```powershell
python -m venv .venv
```

Activate it in PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

## Install dependencies

Install the project and its main dependencies from `pyproject.toml`:

```powershell
python -m pip install -e .
```

Install the project plus dev dependencies from `pyproject.toml`:

```powershell
python -m pip install -e ".[dev]"
```

Use `".[dev]"` when you want the test tooling as well.

## Notes

- `pyproject.toml` already defines this project's dependencies, so a separate `requirements.txt` is not required for normal development.
- `python -m pip install -e .` reads the local project metadata and installs the dependencies declared under `[project].dependencies`.
- `python -m pip install -e ".[dev]"` also installs the optional `dev` extra declared under `[project.optional-dependencies]`.
