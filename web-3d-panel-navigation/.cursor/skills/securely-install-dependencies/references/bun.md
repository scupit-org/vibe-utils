# Bun workflow

Apply this reference when the project's lockfile is `bun.lock` (text) or `bun.lockb` (binary).

Verify with `bun --version`.

## 1. Block all install scripts

In `bunfig.toml` at the project root (create the file if it does not exist):

```toml
[install]
ignoreScripts = true
```

This disables lifecycle script execution for every package on every install.

Bun also ships a default trusted-packages list — popular packages like `esbuild` and `sharp` may be pre-trusted in some Bun versions and would otherwise run scripts silently. The `ignoreScripts = true` setting overrides that list and is required for this workflow.

## 2. Install

```sh
bun install
```

With `ignoreScripts = true`, Bun records each blocked script's package into an internal "untrusted" list rather than running it. The install command completes silently.

## 3. Enumerate blocked packages

```sh
bun pm untrusted
```

Bun's strongest feature for this workflow. Output looks like:

```
./node_modules/esbuild @0.28.0
 » [postinstall]: node install.js

./node_modules/@parcel/watcher @2.5.6
 » [install]: node scripts/build-from-source.js
```

Each entry includes the package, version, and the exact lifecycle command that was blocked. Record these — they are the audit batch.

## 4. Audit handoff

For each package listed by `bun pm untrusted`:

1. Ask the user to clone the source repo at the version tag, then wait.
2. Spawn one audit subagent per repo in parallel using `references/audit-prompt-template.md`. Copy the exact `[lifecycle]: <command>` from `bun pm untrusted` into the prompt's "lifecycle scripts" section — Bun gives you the entry point directly.

Same rules as everywhere else.

## 5. Approve (one-shot) and revert — the Bun auto-revert pattern

Bun's `bun pm trust <pkg>` does two things in one step:

1. Runs the package's lifecycle scripts.
2. Adds the package name to `trustedDependencies` in `package.json`, persisting the trust for future installs.

The second part contradicts this skill's one-shot model. To match the other managers' behavior, **revert the `trustedDependencies` addition after the script runs**. This is the auto-revert pattern.

### 5a. Snapshot `trustedDependencies` before approving

Read the current state of `package.json`'s `trustedDependencies` array (it may not exist, may be empty, or may already contain entries from prior work). Save the original value mentally or in a scratch note.

If the user has packages in `trustedDependencies` from before this skill was applied, ask whether they want those preserved or also flushed. Default to preserving — those represent prior decisions the user already made.

### 5b. Trust and run

For each package with a SAFE or SAFE-WITH-CAVEATS verdict:

```sh
bun pm trust <pkg>
```

Bun will:
- Add `<pkg>` to `trustedDependencies` in `package.json`.
- Run the lifecycle script.

For a batch, run the command once per package, or use `bun pm trust --all` only if every package currently listed as untrusted has a safe verdict.

### 5c. Revert `trustedDependencies` to its pre-step-5b state

Use the Edit tool to remove from `package.json`'s `trustedDependencies` array exactly the entries Bun just added. The original pre-existing entries (from step 5a) stay.

If the original state had no `trustedDependencies` field at all and Bun created it during step 5b, delete the entire field.

### 5d. Verify

```sh
bun install
bun pm untrusted
```

Expected: `bun pm untrusted` should once again list the packages that have install scripts, confirming the revert was clean. If it lists nothing, either no audited package has install scripts (check `package.json`'s `trustedDependencies` is genuinely empty for those packages) or the revert is incomplete.

## Bun's default trusted list

Bun ships with a built-in list of packages it considers "trusted by default" (the list varies by Bun version — check with `bun pm default-trusted` if available, otherwise consult Bun's docs). These packages would run scripts silently even with a clean `trustedDependencies` field, as long as `ignoreScripts = true` is not set.

This is why **step 1's `ignoreScripts = true` is non-negotiable for this skill**: it overrides Bun's default trust assumptions and forces every package — popular or not — through the audit pipeline.

For strict-mode users, consider also setting `ignoreScripts = true` in `~/.bunfig.toml` to make it the system-wide default.

## Common pitfalls

- **Skipping the revert step.** Without it, every future `bun install` re-runs the trusted package's lifecycle scripts at whatever version is installed — including future malicious versions. The revert is the entire reason this workflow differs from Bun's documented happy path.
- **Trusting Bun's default trusted list.** That list is a convenience for general users, not a security guarantee. Even popular packages have had compromised releases. Set `ignoreScripts = true` regardless.
- **Confusing `bun pm trust` with `bun pm untrusted`.** `trust` adds; `untrusted` lists.
- **Using `bun pm trust --all` reflexively.** Only safe when every single entry in the untrusted list has been individually audited and returned a safe verdict. The skill's one-by-one cadence is by design.
