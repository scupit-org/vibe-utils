---
name: ready-for-publishing
description: Prepares the web-3d-panel-navigation project for npm publish by handling version bumps, building, testing, and packing. Use when the user wants to get ready for publishing, prepare a release, or run the full pre-publish flow.
---

# Ready for Publishing

Workflow to build, test, and prepare the web-3d-panel-navigation package for publishing.

## Version Check

**If the user has not already specified both whether to bump the version and how (patch/minor/major), ask:**

> Do you want to bump the version? If so, by how much: patch, minor, or major?

- **Patch** (0.2.4 → 0.2.5): Bug fixes, no breaking changes
- **Minor** (0.2.4 → 0.3.0): New features, backward compatible
- **Major** (0.2.4 → 1.0.0): Breaking changes

If the user requests a bump, update:
1. `package.json` — `"version"` field

## Workflow Steps

Run in order from `web-3d-panel-navigation/`:

| Step | Command | Purpose |
|------|---------|---------|
| 1 | `npm install` | Update lockfile |
| 2 | `npm run build` | Compile and bundle |
| 3 | `npm test` | Run test suite |
| 4 | `npm pack` | Create publishable tarball |

## Verification

- Build must succeed with no errors
- All tests must pass
- Pack produces `scupit-web-3d-panel-navigation-<version>.tgz` in project root

**Optional**: After step 2 (build), run `npm run example:build` to verify the example compiles and bundles correctly against the library.
