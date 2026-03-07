# Managed Env And Reconciliation Lifecycle

This document explains how the toolkit thinks about `.env`, `.env.example`, cached Auth0 client data, and MCP server bootstrap. It is meant to give developers and coding agents a durable mental model for the system as it exists today.

---

## The Three Env Files

The system uses three different env surfaces, each with a different purpose:

1. Root `.env`

- Lives at the ecosystem root.
- Holds shared deployment configuration such as `ECOSYSTEM_BASE_DOMAIN` and `AUTH0_TENANT_DOMAIN`.
- Also contains a tool-owned managed block for generated Auth0 client caches like `AUTH0_{KEY}_CLIENT_ID` and `AUTH0_{KEY}_CLIENT_SECRET`.

1. Per-server `.env`

- Lives next to an individual MCP server implementation under `mcps/<slug>/`.
- Exists only for server-local overrides such as `PORT`.
- Must not define shared ecosystem/Auth0 variables or tool-managed client credential keys.

1. `.env.example`

- Lives at the ecosystem root.
- Exists only as setup documentation for humans.
- Contains placeholders only and never live values.

---

## Managed Block Ownership

Both `.env` and `.env.example` use a tool-owned block delimited by:

```text
# <automatically-generated>
# </automatically-generated>
```

The ownership model is:

- Content outside the managed block is user-authored and preserved verbatim.
- Content inside the managed block is tool-authored and may be regenerated wholesale.
- Auto-generated client credential cache keys must live only inside the root `.env` managed block.

If a user places `AUTH0_{KEY}_CLIENT_ID` or `AUTH0_{KEY}_CLIENT_SECRET` outside the managed block in the root `.env`, reconciliation fails with a corrective error. This is intentional: those keys are tool-managed cache entries, not user-authored configuration.

---

## How Env Parsing Works

The env manager uses a two-stage model:

1. `dotenv.parse()` reads the authoritative key/value assignments without mutating `process.env`.
2. A line-by-line scan records where assignments live and whether they are in:
   - `outer_before`
   - `managed`
   - `outer_after`

This design gives the system both:

- robust dotenv-compatible parsing for values
- location-aware preservation and validation for comments, unknown vars, and tool-owned keys

The manager does not try to normalize the whole file. User-authored outer content is preserved exactly.

---

## What `generate-artifacts` Owns

`generate-artifacts` refreshes the managed block in `.env.example`.

It always writes placeholders for the known required keys:

- `ECOSYSTEM_BASE_DOMAIN=example.com`
- `AUTH0_TENANT_DOMAIN=your-tenant.auth0.com`
- `AUTH0_MGMT_CLIENT_ID=__REQUIRED__`
- `AUTH0_MGMT_CLIENT_SECRET=__REQUIRED__`

It never copies live values from:

- the root `.env`
- shell environment variables
- reconciled Auth0 objects

Any user-authored comments or extra example variables outside the managed block are preserved.

---

## How Client Reconciliation Works

`reconcile-client` uses this order of operations:

1. Validate that no tool-managed client credential keys exist outside the root `.env` managed block.
2. Check for a cached `AUTH0_{KEY}_CLIENT_ID` in the managed block.
3. If present, fetch that Auth0 application and validate its ownership metadata before trusting it.
4. If there is no valid cached ID, search Auth0 by metadata.
5. Reuse, patch, or create the Auth0 application based on compatibility and reuse policy.
6. Persist the `client_id` back into the root `.env` managed block.
7. If a confidential client is newly created and Auth0 returns a secret, persist that secret into the managed block with write-once semantics.

The ownership metadata used to validate a cached client ID is:

- `managed_by=@scupit/mcp-ecosystem`
- `ecosystem=<ecosystem_name>`
- `client_key=<client_key>`

This means cached client IDs are treated as a cache, not as unconditional truth.

---

## Cached Client IDs And Why They Are Validated

The root `.env` managed block stores `AUTH0_{KEY}_CLIENT_ID` so future runs do not have to scan Auth0 every time.

That cache is useful, but it can drift. For example:

- a cached ID could point at the wrong Auth0 application
- a cached ID could belong to a different ecosystem
- a cached ID could have been copied incorrectly during manual recovery

Because of that, the toolkit validates cached client IDs before using them in:

- `reconcile-client`
- `grant-client`
- `reconcile-server`

If the cached ID does not point at the expected managed application, the command fails clearly instead of proceeding against the wrong Auth0 object.

---

## Write-Once Secret Semantics

Auth0 only returns a client secret when a confidential application is created.

The toolkit therefore treats generated client secrets as write-once managed data:

- if the managed secret does not exist, it is written
- if the managed secret already exists with the same value, the write is treated as already satisfied
- if the managed secret already exists with a different value, the existing managed value is preserved
- if the same key appears outside the managed block, that is an error before reconciliation proceeds

This keeps the ownership boundary clear and prevents silent overwrites of user-authored outer content.

---

## Bootstrap Boundary In `createMcpServer()`

`createMcpServer()` is the accepted boundary between shared env setup and the running MCP server process.

Before bootstrap:

- user code can still read inherited shell variables from `process.env`
- if user code explicitly copies a secret before calling `createMcpServer()`, the toolkit cannot prevent that

During bootstrap:

- the toolkit loads per-server and root `.env` files
- it removes Auth0 management and per-client credential patterns from `process.env`
- it leaves shared runtime vars such as `ECOSYSTEM_BASE_DOMAIN`, `AUTH0_TENANT_DOMAIN`, `PORT`, and user-defined nonmatching vars available

After bootstrap:

- Auth0 management credentials and tool-managed client credential vars are no longer part of `process.env`
- the server continues with the selected transport (`streamable-http-stateless`, `streamable-http-stateful`, or `stdio`)

This is an intentional, pragmatic boundary rather than an attempt to fully isolate all possible process state.

---

## Current Accepted Constraints

- The current runtime model assumes one ecosystem/server context per Node process.
- Tool-managed client credential keys outside the managed block are treated as user error and hard-fail.
- Placeholder values in env are invalid for real runtime/provisioning use.
- `domain.base_domain` is env-only and must not be configured in JSON.

---

## Known Deferred Edge Case

One known deferred edge case remains:

- if a cached managed `client_id` points to an Auth0 application that has been deleted, the current validation path hard-fails instead of treating the cache as stale and recovering automatically

There is an explicit TODO in `src/commands/validated-client-cache.ts` for that future improvement.
