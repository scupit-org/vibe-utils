---
name: ready-for-publishing
description: Prepares the mcp-ecosystem project for npm publish by handling version bumps, building, testing, updating lockfiles, and packing. Use when the user wants to get ready for publishing, prepare a release, or run the full pre-publish flow.
---

# Ready for Publishing

Workflow to build, test, and prepare the mcp-ecosystem package for publishing.

## Version Check

**If the user has not already specified both whether to bump the version and how (patch/minor/major), ask:**

> Do you want to bump the version? If so, by how much: patch, minor, or major?

- **Patch** (0.2.4 → 0.2.5): Bug fixes, no breaking changes
- **Minor** (0.2.4 → 0.3.0): New features, backward compatible
- **Major** (0.2.4 → 1.0.0): Breaking changes

If the user requests a bump, update both:
1. `package.json` — `"version"` field
2. `src/cli.ts` — `.version("...")` argument (must match package.json per AGENTS.md)

## Workflow Steps

Run in order from `mcp-ecosystem/`:

| Step | Command | Purpose |
|------|---------|---------|
| 1 | `npm install` | Update main project lockfile |
| 2 | `cd example-ecosystem && npm install` | Update example-ecosystem lockfile |
| 3 | `cd .. && npm run build` | Compile TypeScript |
| 4 | `npm test` | Run test suite |
| 5 | `npm run typecheck` | Verify types |
| 6 | `npm pack` | Create publishable tarball |

## Verification

- Build must succeed with no errors
- All tests must pass
- Typecheck must pass
- Pack produces `scupit-mcp-ecosystem-<version>.tgz` in project root

**Optional**: After step 3 (build), run `npx tsc --noEmit` in `example-ecosystem/` to verify the example has no type errors against the library.

`prepublishOnly` runs `npm run build` automatically when `npm publish` is executed.
