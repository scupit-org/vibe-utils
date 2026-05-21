# npm workflow

Apply this reference when the project's lockfile is `package-lock.json` and there is no Yarn/pnpm/Bun/Deno lockfile.

## Discovery weakness up front

npm does not currently provide a first-party command equivalent to `pnpm ignored-builds` or `bun pm untrusted`. This skill works around the gap by relying on:

1. The `.npmrc` setting `ignore-scripts=true` to prevent silent execution.
2. Targeted enumeration via `npm ls --json` and `package.json` inspection to discover which packages declare install scripts.
3. `npm rebuild <pkg>` as the one-shot execution path.

The workflow is functional but less ergonomic than pnpm's or Bun's. If the user has flexibility, recommend switching managers — npm is the weakest fit for this security model.

## 1. Block all install scripts

Add to `.npmrc` in the project root (create the file if it does not exist):

```ini
ignore-scripts=true
```

Alternatively, pass `--ignore-scripts` to every install command. The `.npmrc` approach is preferred because it is persistent, committed, and visible to all developers.

If the user has set `ignore-scripts=true` in their global `~/.npmrc`, that is fine, but still set it in the project to make the intent explicit to teammates.

## 2. Install

```sh
npm install
```

With `ignore-scripts=true` active, npm does not run any `preinstall`, `install`, or `postinstall` script from any package in the tree, including the root project. The install completes silently.

If a transitive dependency's install script was *required* for a runtime feature (e.g. placing a native binary), the missing binary will surface as an error the first time the application imports the package. That is the trigger for the audit step.

## 3. Enumerate packages with install scripts

npm does not list these for you. Run:

```sh
npm ls --all --parseable 2>/dev/null | while read -r path; do
  if [ -f "$path/package.json" ]; then
    if grep -qE '"(preinstall|install|postinstall)":' "$path/package.json"; then
      basename "$path"
    fi
  fi
done | sort -u
```

…or, more pragmatically with PowerShell on Windows:

```powershell
Get-ChildItem -Path .\node_modules -Recurse -Filter package.json -Depth 4 |
  Where-Object { Select-String -Path $_.FullName -Pattern '"(preinstall|install|postinstall)"' -Quiet } |
  ForEach-Object { (Get-Content $_.FullName | ConvertFrom-Json).name }
```

Record the resulting list along with each package's locked version (from `package-lock.json` — the `version` field of the matching entry).

## 4. Audit handoff

For each enumerated package:

1. Ask the user to clone the package's source repo at the locked version tag. Wait for confirmation.
2. Spawn one audit subagent per repo in parallel using `references/audit-prompt-template.md`, with placeholders filled in.

Same rules as the other managers: never skip the audit, never trust prior-session approvals, never bulk-approve without per-package verdicts.

## 5. Run audited scripts (one-shot)

For each package with a **SAFE** or **SAFE-WITH-CAVEATS** verdict:

```sh
npm rebuild <pkg> [<pkg> ...]
```

`npm rebuild` runs the package's install/build lifecycle scripts even when `ignore-scripts=true` is set globally — the flag affects `npm install`, not the explicit `rebuild` command. This is the cleanest one-shot execution path npm provides.

Verify each package produced the expected artifact (e.g. a native `.node` file in `node_modules/<pkg>/build/Release/`).

## 6. No revert step needed

Unlike Bun and Yarn Berry, npm has no per-package "approved" record that needs to be reverted. The `.npmrc`'s `ignore-scripts=true` remains active and continues to block install scripts on every future `npm install`. `npm rebuild` is purely imperative and does not persist anywhere.

This makes npm's revert step a no-op, which is the one ergonomic advantage of npm's model: there is nothing to forget.

## Common pitfalls

- **Letting `ignore-scripts=true` linger globally only.** Global `~/.npmrc` settings are invisible to teammates and to CI. Always set it in the project's `.npmrc` so the policy is explicit and committed.
- **Confusing `npm rebuild` with `npm install`.** `npm install` re-resolves the dependency tree and writes to `package-lock.json`. `npm rebuild` does not — it only re-runs lifecycle scripts on already-installed packages. Use rebuild for the one-shot.
- **Missing transitive scripts.** The discovery shell snippet above scans `node_modules` after a successful install. If a package's install script *failed silently when blocked* (which is the point) and the package depends on its binary at runtime, the consumer code will throw — at which point trace back to the missing rebuild and audit that package.
- **Auditing the npm tarball instead of the git tag.** The npm tarball is what is being audited; treating it as the source of truth defeats the purpose. Always have the user clone the git repo and `git checkout v<version>`.
