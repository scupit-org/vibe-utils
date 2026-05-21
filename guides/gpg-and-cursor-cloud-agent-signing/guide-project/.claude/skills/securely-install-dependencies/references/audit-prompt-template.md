# Audit subagent prompt template

This is the briefing to hand to a `general-purpose` subagent when auditing a single dependency's install/build scripts. Fill in the placeholders, paste the whole thing into the `Agent` tool's `prompt` field, and use a short three-to-five-word `description` like *"Audit `<pkg>` install script"*.

One subagent per repository is the default. Two or three tiny related packages from the same author at the same version (e.g. a family of `@scope/foo-*-arch` prebuilt-binary sub-packages, all wrapping the same binary placement logic) may be bundled into a single subagent for efficiency. Substantial packages always get their own subagent so context stays focused.

Run audit subagents **in parallel** when independent — send a single message containing one `Agent` call per package.

## Template

```
You are auditing the install script of `{package-name}` v{version} to decide whether it is safe to allow the package manager to run it in a downstream project. The user installed (directly or transitively) `{package-name}@{version-range}` and the package manager blocked the install script — we want to know whether unblocking is safe, or whether anything is malicious or suspicious.

The repo is at: `{cloned-path}`
It has already been checked out to tag `{tag}` (matching the version in the lockfile).

The `package.json` declares these install-time lifecycle scripts:
    {list of preinstall / install / postinstall / prepare entries copied from package.json}

So when a downstream project installs this package, the following script(s) execute in the user's environment:
    {file paths the scripts run, e.g. `scripts/build-from-source.js`, `install.js`}

Your job:

1. Read `{cloned-path}/{primary-script-file}` in full. Read any local files it requires/imports.
2. Read `{cloned-path}/package.json` and understand the relationship between this package, its `optionalDependencies` (typically per-platform prebuilt binary sub-packages), and the install script.
3. If a `binding.gyp` is present, read it to confirm what would be compiled — but do not deep-audit the C/C++ unless the way it is invoked looks off.
4. Skim the other files in any `scripts/` directory and list anything that could be invoked at install time. Cross-check against the `files` array in `package.json` to see what is actually shipped to npm.
5. Determine the script's actual runtime behavior on a downstream user's machine:
   - When does it trigger? When does it skip (e.g. when a prebuilt is already present)?
   - Does it spawn child processes? Which ones, with what arguments?
   - Does it make network calls? To what endpoints, with what integrity checks (hash verification, signature, TLS pinning)?
   - Does it write outside its own package directory in `node_modules/`?
   - Does it use `eval`, `new Function`, dynamic `require` of remote content, base64-encoded payloads, or any obfuscation?
   - Does it read environment variables, and if so, does it transmit them anywhere?
6. Cross-check whether the script's behavior matches the package's publicly documented model (e.g. prebuilt platform binaries delivered as separate `@scope/<pkg>-<platform>` packages, with a fallback download for environments where `optionalDependencies` did not resolve).

Deliverable: a concise written audit. Do NOT modify any files.

Answer the question:

**"Is it 100% safe to run this install script / install `{package-name}@{version}` in its entirety? If not, why?"**

In your answer:

- Summarize what the script does in plain English.
- List any network endpoints it may contact (with full URLs/templates) and the conditions under which it does so.
- List any child processes spawned and their argv.
- List any filesystem operations outside the package's own directory.
- Call out any code patterns a security reviewer would normally flag: dynamic `eval`, obfuscation, hidden execution, postinstall side effects beyond expected binary placement or native compilation, telemetry, env-var exfiltration.
- Give a clear verdict on one of these levels, with a one-paragraph justification:
  - **SAFE** — benign and well-engineered, no security concern.
  - **SAFE-WITH-CAVEATS** — benign but with operational caveats only (e.g. requires a working C++ toolchain locally). Explicitly say the caveats are operational, not security.
  - **SUSPICIOUS** — at least one pattern a reviewer would flag and that the docs do not explain.
  - **UNSAFE** — explicit malicious behavior.

Keep the report under ~500 words. Be specific with file paths and line numbers.
```

## Filling in the placeholders

Before pasting, replace:

- `{package-name}` — the npm package name, e.g. `esbuild` or `@parcel/watcher`.
- `{version}` — the exact version from the lockfile, e.g. `0.28.0`.
- `{version-range}` — the user-facing range from `package.json`, e.g. `^0.28.0`. If transitive, write "transitively via `<parent-package>`".
- `{cloned-path}` — the absolute path the user cloned the repo to.
- `{tag}` — the git tag matching the version (usually `v{version}`; verify with `git tag --list 'v{version}*'`).
- `{list of preinstall / install / postinstall / prepare entries}` — copy verbatim from `package.json`'s `scripts` section, including the field name (e.g. `postinstall: node install.js`).
- `{primary-script-file}` — the entry-point file referenced by the lifecycle script (e.g. `install.js`, `scripts/build-from-source.js`). If the lifecycle script is the bundled output of TypeScript source elsewhere in the repo (esbuild is an example: `npm/esbuild/install.js` is built from `lib/npm/node-install.ts`), include the source file too.

## After the audit returns

Each subagent returns a single message summarizing intent, not necessarily proof of what it did. Spot-check the verdict by:

1. Reading the file paths the subagent cites at the lines it cites.
2. Confirming the conclusion is consistent with what is actually in those files.
3. If the verdict is **SAFE** but the audit feels thin (e.g. fewer than three file reads on a substantial package), spawn a second subagent with a more pointed prompt or extend the original.

If **any** subagent in a batch returns SUSPICIOUS or UNSAFE, do not flip the manager's config to allow any package in that batch. Report findings to the user and recommend mitigation.
