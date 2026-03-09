# OAuth Troubleshooting

This document helps diagnose OAuth failures when connecting MCP clients (e.g. Cursor) to your Auth0-protected MCP servers.

---

## OAuth callback received without code

**Symptom:** The client reports "OAuth callback received without code parameter" or the Auth0 login page never appears.

**Cause:** Auth0 rejected the authorization request before the user completed login. The most common reason is a **resource/identifier mismatch**.

### Resource and API identifier must match exactly

Auth0 compares the OAuth `resource` parameter (sent by the client) to the Auth0 API identifier as an exact string. Any difference causes Auth0 to return `access_denied`, so no authorization code is issued and the callback arrives without a code.

### Trailing slash mismatch

A frequent mismatch is the trailing slash:

- **Client sends:** `resource=https://live-monitor-mcp.example.com/` (with slash)
- **Auth0 API identifier:** `https://live-monitor-mcp.example.com` (no slash)
- **Result:** Auth0 rejects the request.

**Fix:** The default `use_trailing_slash: "both"` creates two Auth0 APIs (with and without slash) and the server accepts tokens for either. For a single API, set `"auth0": { "use_trailing_slash": "always" }` or `"never"` in your server's `mcp-configuration.json`. Run `reconcile-server` or `reconcile-all` to create or update the Auth0 API(s). See [Ecosystem Defaults: API Settings](./02-ecosystem-defaults.md#api-settings).

If you change `use_trailing_slash` for an existing server, Auth0 may create new APIs (old ones become orphaned). Remove orphaned APIs manually in the Auth0 Dashboard if desired.

---

## OAuth completes but client keeps re-requesting auth

**Symptom:** OAuth succeeds (tokens saved), but after the client reconnects (e.g. after a reload), it triggers another OAuth flow instead of using the stored token.

**Possible causes:**

1. **Client not sending the token** — The client stores the token but does not attach it to the next `/mcp` request (e.g. due to a resource/URL identity mismatch when looking up the token).
2. **Server rejecting the token** — The server receives `Authorization: Bearer ...` but returns 401 (e.g. audience, issuer, or scope mismatch).
3. **Token identity mismatch** — The client stores the token under one combination of server URL, resource, issuer, or scopes, but reconnects with a slightly different combination and treats the saved token as non-matching.

### What to check

- **Server logs:** Add temporary auth logging to see whether the next `/mcp` request includes an `Authorization: Bearer` header and whether the server accepts or rejects it.
- **Token claims:** Decode the access token (e.g. [jwt.io](https://jwt.io)) and compare `iss`, `aud`, and `scope` with what your server expects. The expected issuer is `https://{AUTH0_TENANT_DOMAIN}/`; the expected audience is the resource URI (same as the Auth0 API identifier for that server).
- **Trailing slash consistency:** Ensure the resource URI used for token storage matches the one used when reconnecting. A mismatch (e.g. `https://.../` vs `https://...`) can cause the client to treat the token as invalid.

### Redeploy after config changes

If you changed `use_trailing_slash` or other auth-related config, redeploy the MCP server so the running process uses the new values. A stale deployment can cause mismatches between what Auth0 issues and what the server validates.

---

## Where to look in Auth0

- **Auth0 Dashboard → APIs** — Check the API identifier. It must exactly match the `resource` value the client sends (including or excluding the trailing slash).
- **Auth0 Dashboard → Applications** — Verify the client has the correct callback URLs and that client grants exist for the API.
- **Auth0 logs** — Check the tenant logs for `access_denied` or other authorization errors.

---

## Config flow for `use_trailing_slash`

`use_trailing_slash` flows from:

1. Ecosystem default: `defaults.api.use_trailing_slash` (default `"both"`)
2. Per-server override: `auth0.use_trailing_slash` in `mcp-configuration.json` — one of `"never"`, `"always"`, or `"both"`
3. `resolveUseTrailingSlash(ecosystem, server)` — server override wins over ecosystem default
4. `deriveResourceUris()` — returns `[base]` for `"never"`, `[base/]` for `"always"`, `[base, base/]` for `"both"`
5. Auth0 API identifier(s), MCP endpoint, metadata URL, and token audience(s) use the derived value(s). With `"both"`, the server accepts tokens for either audience.

See [Ecosystem Defaults](./02-ecosystem-defaults.md) for full details.

---

## M2M grant skipped during reconciliation

**Symptom:** When running `reconcile-server` or `reconcile-all`, you see a warning like:

```
Server "files" has effective client access policy deny_all. Skipping M2M grant for "sync-worker".
```

**Cause:** The server has `access_policy.client: "deny_all"` (or inherits it from `defaults.api.client_access_policy`). Machine-to-machine (M2M) clients such as `sync-worker` use the client credentials grant. When client access is `deny_all`, the provisioner intentionally skips creating M2M grants for that server.

**Why:** This is expected behavior. `deny_all` blocks machine-to-machine access by design. If you declared `sync-worker` in `grants.client_overrides` or in a client group like `automation-default`, the CLI still skips the grant because the server's policy forbids M2M access.

**Fix:** If you want the M2M client to have a grant for this server, set `access_policy.client: "require_client_grant"` in the server's `mcp-configuration.json` (or `defaults.api.client_access_policy` in `ecosystem-configuration.json` for all servers). Then run `reconcile-server` or `reconcile-all` again.
