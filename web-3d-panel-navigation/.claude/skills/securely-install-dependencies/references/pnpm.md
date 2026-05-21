# pnpm workflow

Apply this reference when the project's lockfile is `pnpm-lock.yaml` (web-3d-panel-navigation's case).

## Version note

pnpm 11 replaced several older settings (`onlyBuiltDependencies`, `neverBuiltDependencies`, `ignoredBuiltDependencies`, `ignoreDepScripts`, `onlyBuiltDependenciesFile`) with a single `allowBuilds:` map in `pnpm-workspace.yaml`. This reference uses the pnpm 11 schema throughout. Verify the user's pnpm version with `pnpm --version`; if it is below 11, fall back to the pre-11 settings documented in pnpm's migration guide before continuing.

## 1. Block all install scripts

Open `pnpm-workspace.yaml` in the project root. The `allowBuilds:` block is a map of package matchers to booleans:

```yaml
allowBuilds:
  esbuild: false
  '@parcel/watcher': false
  core-js: false
```

Set **every** entry's value to `false` before running install. If the file does not yet have an `allowBuilds:` block, that is fine — pnpm will auto-populate it with placeholder entries the first time it encounters a blocked install script in step 3. If `allowBuilds:` exists but is empty, leave it as `{}` and continue.

### Flipping all entries at once

For a command-line developer with `sd` (the rust `sed` replacement) on PATH:

```sh
sd ': true' ': false' pnpm-workspace.yaml
```

For an agent or for users without `sd`:

Use the Edit tool with `replace_all: true`:

- `old_string: ": true"`
- `new_string: ": false"`

Both produce identical results.

### About `strictDepBuilds`

pnpm 11 defaults `strictDepBuilds` to `true`, which makes blocked builds an **error** rather than a warning. Leave this as-is. If the user has set it to `false`, recommend flipping it back to `true` for this workflow — silent warnings are exactly what this skill exists to prevent.

## 2. Install

```sh
pnpm install
```

If any package in the tree has an install script that is not approved in `allowBuilds:`, pnpm reports:

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: <pkg>@<version>, <pkg>@<version>, ...
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

This is the desired outcome. Do not run `pnpm approve-builds` interactively — the next step uses a more auditable path.

## 3. Enumerate blocked packages

```sh
pnpm ignored-builds
```

This prints the same package list, one per line, and is the source of truth for the audit batch. If the output is empty, the workflow is complete.

For each package in the output, record the exact version from `pnpm-lock.yaml` (grep for the package name). The lockfile pins one version per package, so the audit target is unambiguous.

Example:

```sh
pnpm ignored-builds
# esbuild
# @parcel/watcher
```

```
$ grep "esbuild@" pnpm-lock.yaml | head -1
  esbuild@0.28.0:
$ grep "@parcel/watcher@" pnpm-lock.yaml | grep -v watcher- | head -1
  '@parcel/watcher@2.5.6':
```

## 4. Audit handoff

For each enumerated package:

1. Ask the user to clone the package's source repo at the locked version tag, into a path of their choice. Quote the exact `git checkout v<version>` command. Wait for the user to confirm.
2. Once the clones exist, spawn one audit subagent per repository in parallel using the briefing in `references/audit-prompt-template.md`. Fill in placeholders from the lockfile-pinned version and the cloned path.

Do not skip the clone-and-audit step even for packages you have audited in a prior session. The version in `pnpm-lock.yaml` may differ from what was audited before.

## 5. Approve (one-shot) and revert

For each package with a **SAFE** or **SAFE-WITH-CAVEATS** verdict:

### 5a. Flip its `allowBuilds:` entry to `true`

For a single package, use the Edit tool with a targeted change. For a batch, flip everything with:

```sh
sd ': false' ': true' pnpm-workspace.yaml
```

…or with the Edit tool, `old_string: ": false"`, `new_string: ": true"`, `replace_all: true`. Only do the batch flip after **every** package in the current batch has a safe verdict; if any one is SUSPICIOUS or UNSAFE, do not flip anything.

### 5b. Run the install scripts

```sh
pnpm install
```

This runs the now-allowed install scripts in place. As an alternative — useful when `node_modules` is already extracted and `pnpm install` reports "Already up to date" — use:

```sh
pnpm rebuild <pkg> [<pkg> ...]
```

…to force the lifecycle scripts to execute. Both produce the same end state.

Confirm success: each approved package should print its install/postinstall command followed by `Done`.

### 5c. Flip back to `false`

```sh
sd ': true' ': false' pnpm-workspace.yaml
```

…or the Edit-tool equivalent. This is the critical final step — without it, the next time the user upgrades or someone clones the repo and runs `pnpm install`, an upgraded version's possibly-malicious install script would run silently.

### 5d. Verify

```sh
pnpm install
```

Expected output:

```
Already up to date

Done in <Xs> using pnpm v<version>
```

No `ERR_PNPM_IGNORED_BUILDS`, no warnings. The repo is now back in its default-deny posture with the audited binaries in place.

## What about `.modules.yaml` state?

After step 5b, `node_modules/.modules.yaml` contains an `ignoredBuilds` record reflecting which scripts pnpm thinks have been approved. This file is not committed to git and is regenerated by pnpm as needed. The `allowBuilds:` config in `pnpm-workspace.yaml` is the source of truth this skill cares about. Do not edit `.modules.yaml` by hand.

## Common pitfalls

- **Approving via `pnpm approve-builds` instead of the config flip.** The command-line approval persists in `.modules.yaml` only, leaves no git history, and does not survive a `pnpm install --frozen-lockfile` in CI. The config-flip approach used here is recorded in `pnpm-workspace.yaml`'s history (during the in-flight commit) and reverted before the change lands, which is the auditable pattern.
- **Forgetting to flip back.** If the commit lands with `allowBuilds: { <pkg>: true }`, every future install — including future upgrades of `<pkg>` to malicious versions — runs that package's scripts without audit. The "flip back" step is non-negotiable.
- **Auditing only direct dependencies.** Most blocked packages come from transitive deps. Use `pnpm why <pkg>` to find the parent and decide whether the dependency chain is one you want to keep.
- **Skipping the audit because "it's just `esbuild`, everyone uses it".** Popularity is not safety. Even widely-used packages have had compromised releases. Audit every blocked script every time.
