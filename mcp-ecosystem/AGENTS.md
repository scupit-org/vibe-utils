# Agent Guidelines

Instructions for AI agents working on this codebase.

## Imports

**All imports must be done at the top of the file.** Do not use inline or dynamic imports (e.g. `await import(...)` or `require()` inside functions, conditionals, or switch branches). Use static top-level `import` statements only.

## Example Ecosystem Validation

The `example-ecosystem/` references the toplevel package via `"@scupit/mcp-ecosystem": "file:.."`. To properly test and ensure the example project has no type errors after changes to the library:

1. **Build** the toplevel project: `npm run build` (in `mcp-ecosystem/`)
2. **Pack** the package: `npm pack` (in `mcp-ecosystem/`)
3. **Install** in the example: `npm install` (in `example-ecosystem/`)
4. **Typecheck** the example: `npx tsc --noEmit` (in `example-ecosystem/`)
