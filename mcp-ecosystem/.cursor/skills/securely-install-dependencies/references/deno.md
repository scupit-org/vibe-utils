# Deno workflow

Apply this reference when the project has `deno.lock` or `deno.json(c)` and the dependencies of interest are npm packages (via `npm:` specifiers or `node_modules` mode).

Verify with `deno --version`.

## Deno is the easiest case

Deno does **not** run npm lifecycle scripts by default. The "block" step is essentially free — it is Deno's baseline behavior. Where the other managers default to "run scripts; opt out for safety", Deno defaults to "skip scripts; opt in per package". This is the model the entire skill is trying to emulate elsewhere.

There is also no persistent allowlist to revert — the `--allow-scripts` flag is per-invocation, not persistent state.

## 1. Block all install scripts

Nothing to do. Deno blocks npm lifecycle scripts by default.

If the project has explicitly set permissions in `deno.json` that would broaden script execution, leave them as-is for now and apply the workflow; revisit only if a specific package needs them.

## 2. Install

```sh
deno install
```

Or for an npm-flavored project with `node_modules` enabled:

```sh
deno install --node-modules-dir
```

The install completes without running any npm package's `preinstall`/`install`/`postinstall` script.

## 3. Enumerate pending scripts

```sh
deno approve-scripts
```

Deno will print the npm lifecycle scripts in the dependency tree that are pending approval. The output identifies each by `npm:<pkg>@<version>` and the lifecycle stage.

Treat each printed entry as one audit target.

## 4. Audit handoff

For each `npm:<pkg>@<version>` entry:

1. Ask the user to clone the package's source repo at the matching version tag, then wait for confirmation.
2. Spawn one audit subagent per repo in parallel using `references/audit-prompt-template.md`.

Same rules as the rest of the skill. Audit the git tag, not the npm tarball.

## 5. Run audited scripts (per-invocation, no revert needed)

For each package with a SAFE or SAFE-WITH-CAVEATS verdict:

```sh
deno install --allow-scripts=npm:<pkg>
```

…or for a batch of audited-safe packages:

```sh
deno install --allow-scripts=npm:esbuild,npm:@parcel/watcher
```

`--allow-scripts` accepts a comma-separated list of `npm:<pkg>` specifiers. Deno runs only the listed packages' scripts and skips everything else.

The flag is **per-invocation only**. It does not write to `deno.json`, `deno.lock`, or any other persistent file. A subsequent bare `deno install` will once again block all scripts.

## 6. No revert step

Because the flag is per-invocation, there is nothing to clean up. The default-deny posture is automatically restored on the next install.

This is Deno's biggest ergonomic advantage for this workflow and the reason the user-facing guidance recommends Deno as the strongest fit for capability-style permission models.

## Permissions vs scripts — keep them straight

Deno's broader runtime permission system (`--allow-read`, `--allow-net`, `--allow-env`, etc.) is unrelated to `--allow-scripts`. The latter governs npm package install-script execution at install time; the former governs runtime API access. Audited install scripts that pass `--allow-scripts` still need runtime permissions to do anything once the package's main code runs.

For this skill, focus narrowly on `--allow-scripts`. Runtime permissions are a separate (also-worthwhile) review.

## Common pitfalls

- **Permanently aliasing `deno install --allow-scripts=...` in a shell config.** That negates the one-shot model. Always run the bare `deno install` for normal work and only add `--allow-scripts=npm:<pkg>` after a fresh audit of `<pkg>` at its current version.
- **Treating `--allow-scripts=npm:<pkg>` as a green light for a whole package family.** The flag scopes to the named package only. If `<pkg>` has a transitive dependency with its own install script, that one must be audited and approved separately.
- **Mixing Deno and npm in the same project without using `npm:` specifiers.** If a package is imported via a non-`npm:` specifier, `--allow-scripts=npm:<name>` will not target it. Verify the specifier in the source before approving.
- **Auditing the npm tarball that Deno fetched, instead of the git repo.** Same rule as everywhere else: the git tag is the source of truth.
