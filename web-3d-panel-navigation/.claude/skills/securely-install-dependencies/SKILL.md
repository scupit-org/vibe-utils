---
name: securely-install-dependencies
description: This skill should be used whenever the agent encounters an "install script blocked", "ignored builds", `ERR_PNPM_IGNORED_BUILDS`, `bun pm untrusted`, or `deno approve-scripts` situation, or whenever the user asks to install JavaScript dependencies via `npm install`, `pnpm install`, `yarn install`, `bun install`, or `deno install` — even when the install appears to succeed silently, because transitive dependencies may carry install scripts that need explicit audit. Also trigger on phrases like "approve builds", "trust this package", "is this dependency safe", "audit install scripts", "node-gyp blocked", or any mention of supply-chain risk during dependency install. Walks the agent through blocking all install scripts, auditing each blocked package's source via subagents, and selectively running only audited scripts as a one-shot — never as persistent trust.
---

# Securely Install Dependencies

## Why this exists

JavaScript package managers run lifecycle scripts (`preinstall`, `install`, `postinstall`, `node-gyp` builds, etc.) at install time, **before** any application code imports the package. A compromised maintainer, a typo-squatted package, or a malicious transitive dependency can therefore execute arbitrary code on the developer's machine the moment `<manager> install` runs. This is the largest supply-chain attack surface in the JavaScript ecosystem.

This skill's narrow goal:

> Prevent silent install-time code execution and make dependency install scripts explicit, reviewable decisions.

The skill does not attempt to sandbox dependencies forever. It forces every install script — including ones approved in past sessions — to be re-audited at the exact version being installed.

## When to apply this skill

Apply whenever:

- The user runs or asks to run `npm install`, `pnpm install`, `yarn install`, `bun install`, or `deno install`.
- The package manager reports `ERR_PNPM_IGNORED_BUILDS`, "Ignored build scripts", "untrusted dependencies", "Run `pnpm approve-builds`", "Run `bun pm untrusted`", or "approve-scripts".
- The user adds, upgrades, or pins a dependency (`pnpm add`, `npm install <pkg>`, `bun add`, etc.). A new version is a new install script and must be re-audited.
- The user asks whether a package is safe to install.

Apply this skill even when an install seemingly succeeded with no errors. Silent success means either (a) no package in the tree has an install script (rare), or (b) the manager is configured to run scripts automatically — which is exactly what this skill exists to prevent.

## The five-step workflow

### 1. Detect the package manager

Detect by lockfile in the project root:

| Lockfile | Manager |
|---|---|
| `pnpm-lock.yaml` | pnpm |
| `package-lock.json` | npm |
| `yarn.lock` + `.yarnrc.yml` | Yarn Berry (v2+) |
| `bun.lock` or `bun.lockb` | Bun |
| `deno.lock` or `deno.json(c)` | Deno |

If multiple are present, prefer the one named by `packageManager` in `package.json`; otherwise ask the user. After detection, read `references/<manager>.md` for the exact commands. Do not mix conventions across managers.
A table listing the complete set of reference files can be found under *Bundled resources* at the end of this skill document.

### 2. Block all install scripts before installing

Configure the manager so no lifecycle script runs during the upcoming install. Each manager has its own mechanism — see the matching reference file. The general posture is: **default to deny, even for packages approved in earlier sessions**.

### 3. Run install and enumerate blocked packages

Run `<manager> install`. Capture the list of packages whose scripts were blocked. Do not proceed past this step until that list is in hand. If the manager reports zero blocked scripts, the workflow is complete — there is nothing to audit.

### 4. Audit each blocked package

This is the substance of the skill.

1. **Identify each blocked package's locked version** by grepping the lockfile.
2. **Ask the user to clone each package's source repository** at the exact tag or commit matching that version, then wait for confirmation before continuing. Do not try to fetch source from the npm tarball or untrusted mirrors — the tarball is what is being audited and cannot serve as the source of truth. The git tag is the source of truth.
3. **Spawn one audit subagent per repository** using the briefing in `references/audit-prompt-template.md`. Several tiny related packages may share one subagent; one substantial package always gets its own. Run subagents in parallel when independent.
4. **Collect verdicts.** Each subagent returns one of:
   - **SAFE** — the script does what is expected (e.g. locate a prebuilt platform binary, hash-verify it, place it). No network beyond well-known registries; no `eval`; no dynamic remote `require`; no telemetry; no environment-variable collection.
   - **SAFE-WITH-CAVEATS** — benign behavior with operational caveats (e.g. needs a working C++ toolchain on the user's machine). Not a security concern.
   - **SUSPICIOUS** — patterns a reviewer would normally flag: obfuscation, dynamic remote `require`, unexplained network calls, telemetry, env-var collection, or scripts that touch filesystem locations outside the package's own directory without justification.
   - **UNSAFE** — explicit malicious behavior.

### 5. Act on the verdicts

For each **SAFE** or **SAFE-WITH-CAVEATS** package:

1. Temporarily flip the manager's config to allow that package's scripts.
2. Run the manager's one-shot rebuild command so the install/build script executes.
3. **Revert the config to the blocked state.** No persistent trust — future upgrades must re-trigger this workflow.

For **SUSPICIOUS** or **UNSAFE** packages: do not run the script. Report the findings to the user. Recommend either removing the dependency, pinning to a known-good prior version, or running the package permanently with scripts ignored if it remains functional without its install hook.

Never invent a verdict to unblock work. If even one package in a batch is suspicious, halt the entire approval cycle and report.

## Per-tool quick reference

| Manager | Block | Discover | One-shot run | Revert | Details |
|---|---|---|---|---|---|
| pnpm | every `allowBuilds:` entry `false` in `pnpm-workspace.yaml` | `pnpm ignored-builds` | flip entry to `true` + `pnpm rebuild <pkg>` | flip entry back to `false` | `references/pnpm.md` |
| npm | `ignore-scripts=true` in `.npmrc` (or `--ignore-scripts`) | inspect lockfile / npm output | `npm rebuild <pkg>` | nothing — `.npmrc` already blocks | `references/npm.md` |
| Yarn Berry | `enableScripts: false` in `.yarnrc.yml` | inspect `YN0004` warnings | set `dependenciesMeta.<pkg>.built: true`, `yarn rebuild <pkg>`, **remove the entry** | delete `dependenciesMeta` entry | `references/yarn-berry.md` |
| Bun | `[install] ignoreScripts = true` in `bunfig.toml` | `bun pm untrusted` | `bun pm trust <pkg>`, **remove from `trustedDependencies`** | edit `package.json` | `references/bun.md` |
| Deno | default behavior — Deno blocks npm scripts | `deno approve-scripts` | `deno install --allow-scripts=npm:<pkg>` | nothing — the flag is per-invocation | `references/deno.md` |

## Nuances worth knowing

- **Bun and Yarn Berry persist trust by default.** Both `bun pm trust` and Yarn's `dependenciesMeta.<pkg>.built: true` write into `package.json` and stay there across upgrades. This skill's one-shot model requires removing those entries after the rebuild so future versions re-trigger the audit. The Bun and Yarn reference files describe the auto-revert pattern.

- **pnpm's `approve-builds` command writes to `node_modules/.modules.yaml`**, which is not committed to git. The cleaner approach — and the one this skill uses — is to flip `allowBuilds:` in `pnpm-workspace.yaml` (which is committed) for the rebuild, then flip it back. This keeps the audit decision in project history.

- **Transitive dependencies are where the risk lives.** Most blocked scripts come from packages the user never directly added — for example, `@parcel/watcher` typically arrives via Eleventy or a build tool. The audit must trace ownership (`pnpm why <pkg>`, `npm ls <pkg>`, `yarn why <pkg>`) before judging whether keeping the dependency is worth its install-script risk.

- **Prebuilt native binaries are the common-and-fine case.** Most install scripts for packages like `esbuild`, `sharp`, `@parcel/watcher`, or `better-sqlite3` exist to locate a prebuilt platform binary that was published as a separate `optionalDependency` for the user's OS/arch. The audit should confirm that is what is happening; if so, the verdict is typically SAFE.

- **Re-audit on every version bump.** A previously-audited version being safe does not mean the next version is safe — supply-chain compromises typically arrive as a single malicious release. The workflow's "revert to blocked" final step exists for exactly this reason.

- **`sd` versus the Edit tool.** Some refs suggest one-line `sd` flips (e.g. `sd ': true' ': false' pnpm-workspace.yaml`) for command-line developers; agents without `sd` on PATH should use the Edit tool with `replace_all: true` against the same `: true` → `: false` substring. Both produce identical results.

## Bundled resources

- **`references/pnpm.md`** — pnpm workflow (the project's primary manager).
- **`references/npm.md`** — npm workflow.
- **`references/yarn-berry.md`** — Yarn v2+ workflow, including the `dependenciesMeta` auto-revert.
- **`references/bun.md`** — Bun workflow, including the `trustedDependencies` auto-revert.
- **`references/deno.md`** — Deno workflow.
- **`references/audit-prompt-template.md`** — Reusable subagent briefing for source audits. Use verbatim with placeholders filled in.
