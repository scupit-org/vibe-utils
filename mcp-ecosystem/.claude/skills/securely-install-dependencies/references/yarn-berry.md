# Yarn Berry workflow (Yarn v2+)

Apply this reference when the project's lockfile is `yarn.lock` **and** a `.yarnrc.yml` is present (classic Yarn v1 uses different conventions and is largely out of scope — recommend the user migrate to Berry or another manager).

Verify with `yarn --version` (Berry reports `3.x`, `4.x`, etc.).

## 1. Block all install scripts

In `.yarnrc.yml`:

```yaml
enableScripts: false
```

This disables lifecycle script execution for every package in the tree, including ones already trusted via `dependenciesMeta`. Add and commit this setting before running install for the first time on a fresh checkout.

If the project uses Yarn's Plug'n'Play install mode (no `node_modules`), the same setting applies — scripts are blocked regardless of install strategy.

## 2. Install

```sh
yarn install
```

When a package would have run an install script, Yarn emits a `YN0004` warning (or similar) of the form:

```
➤ YN0004: │ <pkg>@npm:<version> lists build scripts, but its build has been explicitly disabled through configuration.
```

These warnings are the discovery signal. Yarn does not provide a separate `ignored-builds` command, so the warnings in install output are the primary inventory.

## 3. Enumerate blocked packages

Scrape the install output for `YN0004` lines:

```sh
yarn install 2>&1 | grep YN0004 | sed -E 's/.*│ ([^ ]+)@npm:([^ ]+) .*/\1@\2/' | sort -u
```

…or run install with verbose JSON and parse:

```sh
yarn install --json | jq -r 'select(.name == "YN0004") | .data'
```

Record each package and its locked version. Cross-check the version against `yarn.lock` — every entry has an explicit `version:` field.

## 4. Audit handoff

For each enumerated package:

1. Ask the user to clone the source repo at the locked version tag, then wait.
2. Spawn one audit subagent per repo in parallel using `references/audit-prompt-template.md`.

Same rules — clone the repo, audit the git tag, do not trust the tarball.

## 5. Approve (one-shot) and revert

Yarn Berry's persistent-trust mechanism is the `dependenciesMeta` field in `package.json`:

```json
{
  "dependenciesMeta": {
    "esbuild": {
      "built": true
    }
  }
}
```

Setting `built: true` for a package allows Yarn to run its build scripts even with `enableScripts: false` globally. **This setting persists**, which is exactly what this skill's one-shot model wants to avoid. Use the auto-revert pattern below.

### 5a. Add the `dependenciesMeta` entries for audited-safe packages

For each package with a SAFE or SAFE-WITH-CAVEATS verdict, add an entry to `package.json`:

```json
{
  "dependenciesMeta": {
    "esbuild": { "built": true },
    "@parcel/watcher": { "built": true }
  }
}
```

Use the Edit tool to merge into the existing `dependenciesMeta` block, or create the block if it does not exist. Only add entries for packages whose audits returned safe verdicts.

### 5b. Run the scripts

```sh
yarn rebuild <pkg> [<pkg> ...]
```

This executes the build lifecycle for each named package. Confirm each one reports successful completion.

### 5c. Remove the `dependenciesMeta` entries

This is the critical revert. After the rebuild succeeds, edit `package.json` and:

- For entries that *only* contained `"built": true`, delete the whole entry.
- For entries that contained other fields (e.g. `optional: false`, `unplugged: true`), delete only the `built` field, leaving the rest.

The end state for each previously-audited package should be either no entry in `dependenciesMeta`, or an entry without a `built` field.

### 5d. Verify

```sh
yarn install
```

Expected output: the same `YN0004` warnings should reappear for any package that has install scripts. This confirms the revert was clean — Yarn is once again blocking scripts for the just-audited packages.

If the warnings do **not** reappear, a stray `built: true` was left somewhere; re-check `package.json`.

## Yarn PnP note

Under Plug'n'Play (zero `node_modules`), the same `enableScripts` and `dependenciesMeta` mechanisms apply. The audit handoff is unchanged — the source of truth is still the package's git repo, not Yarn's zip-mounted virtual filesystem.

A few packages use a runtime fallback that copies binaries from the PnP zip cache into `node_modules/.cache/<pkg>/` the first time the API is called. That runtime behavior is *not* an install-time concern; it is in scope only if the audit subagent flags it.

## Common pitfalls

- **Leaving `built: true` in a committed `package.json`.** This is the Yarn equivalent of pnpm's "forgot to flip back" — it permanently allows scripts for the named package on every future install, including future versions with potentially compromised scripts. The revert step is mandatory.
- **Using Yarn v1 conventions.** Yarn Classic (v1) has different config syntax (`.yarnrc`, not `.yarnrc.yml`) and a much weaker scripts model. If the project is Yarn Classic, recommend migrating to Berry, npm, or pnpm before applying this skill.
- **Workspaces.** In a Yarn workspaces monorepo, `dependenciesMeta` in the root `package.json` applies tree-wide. Edit the root, not the workspace package, when adding/removing `built: true` entries.
- **Relying on `yarn install --immutable` in CI without auditing.** CI installs with the lockfile pinned are still subject to install scripts unless `enableScripts: false` is committed. The block-step is the developer's responsibility, not CI's.
