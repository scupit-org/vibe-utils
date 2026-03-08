# MCP + Auth0 Ecosystem Guide and Provisioning Contract

This is the baseline reference for implementing your personal MCP ecosystem.

It captures the architecture decisions, the Auth0 and MCP requirements that matter, the configuration model for your repository, and the provisioning contract your script should implement. It is written to be usable by both you and an external coding agent.

The guiding idea is simple:

* every **MCP server** is a protected **resource server**
* every software product that connects to it is an OAuth **client**
* Auth0 is the **authorization server**
* your ecosystem tooling should automate Auth0 configuration and generate the local config artifacts needed to keep MCP creation cheap and repeatable. Auth0’s own docs map an API to the OAuth resource server, while MCP requires protected MCP servers to use OAuth 2.1-style authorization with Protected Resource Metadata discovery. ([Auth0][1])

---

## 1. Executive summary

The correct shape of the system is:

* **one Auth0 tenant**
* **one Auth0 API per MCP server**
* **one or more Auth0 Applications per software client**
* **one client grant per client/API relationship**
* **one canonical subdomain per MCP server**
* **one stable slug per MCP server**
* **static client registration by default**
* **Resource Parameter Compatibility Profile enabled tenant-wide**
* **user access allowed by default through `require_client_grant`**
* **machine-to-machine access denied by default unless explicitly enabled**

This design follows MCP’s current authorization model and fits Auth0’s object model cleanly. MCP requires the MCP server to publish Protected Resource Metadata and use `WWW-Authenticate` challenges; Auth0’s MCP docs require enabling Resource Parameter Compatibility Profile so the RFC 8707 `resource` parameter works correctly; Auth0 recommends static registration for MCP clients in production. ([Model Context Protocol][2])

The reason for this design is separation of concerns:

* the **server** being protected is an Auth0 **API**
* the **software asking for tokens** is an Auth0 **Application**
* the **human** is the user, not the client

That distinction is the single most important mental model in this whole system. Auth0 explicitly defines an API as the OAuth resource server, and Auth0’s MCP overview says Auth0 handles authentication and token issuance while the MCP server validates tokens and enforces authorization. ([Auth0][1])

---

## 2. The core mental model

### 2.1 OAuth roles in this ecosystem

Use this mapping consistently:

* **Authorization server** → your Auth0 tenant
* **Resource server** → an MCP server
* **Client** → software that calls the MCP server
* **User** → you, or another human who authenticates through Auth0

This is not just terminology. It determines which Auth0 objects need to exist and what they represent. Auth0’s docs define APIs as resource servers, and MCP’s authorization spec defines the protected MCP server as the resource server that publishes Protected Resource Metadata and receives bearer tokens. ([Auth0][1])

### 2.2 Why an MCP server is not an Auth0 Application

An MCP server is the thing being protected, so it maps to an **Auth0 API**. The software that connects to the server is the OAuth client, so it maps to an **Auth0 Application**. Auth0’s API docs say an API “maps to the Resource Server.” ([Auth0][1])

This is why you create a new Auth0 API for each new MCP server, but only create a new Auth0 Application when a new software client needs its own OAuth identity.

### 2.3 User-based vs machine-to-machine access

This distinction is about **how the token is obtained**, not whether software is involved.

* **User-based access** means the token represents a logged-in end user. Auth0’s API access policy docs define this as “user access,” where applications access the API on the user’s behalf. Cursor, MCP Inspector, and your own interactive tools all fall into this bucket if they send the user through login first. ([Auth0][3])
* **Machine-to-machine access** means there is no user in the token flow. The software authenticates as itself using Client Credentials. Auth0’s docs say Client Credentials is for machine-to-machine applications such as daemons, backend services, and other non-interactive software. ([Auth0][4])

So if Cursor logs you in and then its agent calls your MCP server with your token, that is still **user-based** access. If a cron worker or background service gets a token with `client_credentials`, that is **machine-to-machine** access. ([Auth0][5])

---

## 3. Decisions already made, and why

### 3.1 One subdomain per MCP server

You chose separate subdomains and separate Auth0 resource identifiers for each MCP server. That is the right default.

MCP allows path-based Protected Resource Metadata discovery both at the root and at path-specific well-known locations, but separate origins give cleaner boundaries, clearer identifiers, and a less ambiguous security model. MCP explicitly supports both root-level and path-level well-known metadata, which is why path-based deployments are valid, but separate subdomains are the cleaner choice for distinct servers. ([Model Context Protocol][2])

**Decision:** each MCP server gets a stable canonical origin like:

* `https://files-mcp.example.com`
* `https://git-mcp.example.com`

### 3.2 One Auth0 API per MCP server

Auth0’s API object is the resource server. Each MCP server should therefore have its own Auth0 API with a URI identifier that matches its canonical resource identity. Auth0’s MCP docs also recommend URI-format identifiers because MCP relies on RFC 8707 `resource`, and RFC 8707 requires an absolute URI. ([Auth0][1])

**Decision:** each MCP server gets its own Auth0 API with:

* `identifier = canonical_resource_uri`
* `name = server_display_name`
* `signing_alg = RS256`
* `token_dialect = rfc9068_profile_authz`

Auth0’s MCP quickstart uses `rfc9068_profile_authz` specifically so the access token includes the `permissions` claim, which is useful for authorization checks. ([Auth0][6])

### 3.3 Static client registration by default

Auth0’s MCP docs say MCP clients can be registered statically or dynamically, but for most scenarios, especially production, Auth0 strongly recommends **static registration** for security and control. ([Auth0][7])

**Decision:** your ecosystem defaults to static client registration. DCR is not part of the baseline system.

### 3.4 Resource Parameter Compatibility Profile is required

MCP requires the `resource` parameter. Auth0’s MCP docs say you must enable Resource Parameter Compatibility Profile so Auth0 uses `resource` to define token audience. When disabled, Auth0 only uses `audience`; when enabled, Auth0 uses `resource` if present. If both are present, `audience` still wins. ([Auth0][8])

**Decision:** the script must check for this tenant-wide setting and either fix it or print exact manual instructions.

### 3.5 Machine-to-machine access defaults off

Auth0’s API access policy docs show a recommended least-privilege setup where:

* user policy = `require_client_grant`
* client policy = `deny_all`

That means user-based access requires explicit client grants, while M2M access is blocked unless you intentionally enable it. ([Auth0][3])

**Decision:** every new MCP API defaults to:

* `user.policy = require_client_grant`
* `client.policy = deny_all`

### 3.6 Slug is stable and not derived from folder name

This is a design decision, not an Auth0 requirement, but it is the right one.

The slug is part of the server’s public identity. It influences:

* hostname
* Auth0 API identifier
* local config
* potentially client configuration and bookmarks

Folders are code-organization details and should not silently change an externally visible identity.

**Decision:** every MCP server declares a stable slug explicitly in `mcp-configuration.json`.

---

## 4. What kinds of Auth0 Applications your ecosystem must support

Auth0 has four application types:

* Regular Web Application
* Single Page Application
* Native Application
* Machine-to-Machine Application ([Auth0][9])

You do **not** need infinite configuration permutations. You need a small set of reusable **client profiles**, but potentially many concrete **application instances** over time.

### 4.1 Native interactive client

Use this for desktop tools, local editors, and some CLIs that sign the user in interactively.

Public applications are created with `token_endpoint_auth_method = none`, and by default support `authorization_code`, `refresh_token`, and for native apps also `device_code`. Public applications cannot use `client_credentials`. ([Auth0][10])

Use this profile for:

* Cursor-like desktop integrations
* local MCP workbenches
* native helper tools

### 4.2 SPA interactive client

Use this for browser-only frontends.

SPAs are public applications and use user-based interactive flows. They need callback URLs, logout URLs, and often web origins. Auth0’s application settings doc explicitly describes Allowed Callback URLs, Allowed Logout URLs, and Allowed Web Origins, and warns against unsafe wildcards and localhost in production. ([Auth0][11])

### 4.3 Regular web interactive client

Use this for backend web apps that own the OAuth exchange.

Auth0’s Authorization Code Flow doc says the standard Authorization Code Flow is only for confidential applications such as regular web apps, because the application’s authentication method is included in the token exchange and must be kept secure. Confidential applications can authenticate with `client_secret_post`, `client_secret_basic`, or `private_key_jwt`. ([Auth0][12])

### 4.4 Machine-to-machine client

Use this only for unattended automation and programmatic callers with no user session.

Auth0’s M2M docs define these as non-interactive apps such as CLIs, daemons, IoT devices, or backend services. M2M apps are linked to an API and its scopes. ([Auth0][4])

### 4.5 Optional advanced case: the MCP server itself as a client

Most of the time, the MCP server is only an API. But if it later needs to call another Auth0-protected API on the user’s behalf using Auth0 Custom Token Exchange, then the MCP server also needs its own **Auth0 Application** because it becomes a client in that exchange. Auth0’s “Call Your API on a User’s Behalf” MCP quickstart explicitly creates both an API for the MCP server and an Application for the MCP server in the token-exchange scenario. ([Auth0][13])

**Decision:** the baseline system does **not** require an Auth0 Application for each MCP server, but the guide supports this as an optional advanced extension.

---

## 5. When to create a new Auth0 Application

Create a new Auth0 Application whenever a **distinct software client** needs its own OAuth identity.

That is usually required when any of these differ:

* application type
* callback URLs
* logout URLs
* allowed web origins
* grant types
* credential mode
* trust boundary
* desired client grants/scopes

These settings all live on the Auth0 Application object. Auth0’s application settings doc covers callback URLs, logout URLs, web origins, grant types, and refresh token rotation in the application settings surface. ([Auth0][11])

Two clients may share one Auth0 Application only if they truly can share the same type and configuration. In practice, that is often true for your own first-party tooling, but less often true across unrelated third-party products.

Also note that Auth0 limits active refresh tokens to **200 per user per application**, which is another reason not to collapse too many distinct tools into a single app identity. ([Auth0][14])

---

## 6. Repository layout

Recommended layout:

```text
mcp-ecosystem/
  .env
  ecosystem-configuration.json
  client-descriptors/
    cursor-like.json
    inspector-local.json
    web-console.json
    sync-worker.json
  oauth-clients/
    cursor-primary/
      client-configuration.json
    inspector-local/
      client-configuration.json
    sync-worker/
      client-configuration.json
  mcps/
    files/
      mcp-configuration.json
    git/
      mcp-configuration.json
    calendar/
      mcp-configuration.json
```

### Why this layout

* `.env` holds shared secrets and secret references.
* `ecosystem-configuration.json` holds shared defaults and naming rules.
* `client-descriptors/` describes **how a class of client behaves**.
* `oauth-clients/` describes actual **Auth0 Application instances**.
* `mcps/` contains one subfolder per MCP server, each with its own stable `mcp-configuration.json`.

This separation matters because one client descriptor may produce multiple concrete Auth0 Application instances over time.

---

## 7. Data model

## 7.1 Top-level ecosystem configuration

This file holds tenant-wide settings, defaults, and derivation rules.

Example:

```json
{
  "schema_version": 1,
  "ecosystem_name": "personal-mcp",
  "domain": {
    "base_domain": "example.com",
    "server_host_pattern": "{slug}-mcp.{base_domain}"
  },
  "auth0": {
    "tenant_domain": "your-tenant.auth0.com",
    "management_audience": "https://your-tenant.auth0.com/api/v2/",
    "management_client_id_env": "AUTH0_MGMT_CLIENT_ID",
    "management_client_secret_env": "AUTH0_MGMT_CLIENT_SECRET",
    "verify_tenant_prerequisites": true
  },
  "defaults": {
    "api": {
      "signing_alg": "RS256",
      "token_dialect": "rfc9068_profile_authz",
      "user_access_policy": "require_client_grant",
      "client_access_policy": "deny_all"
    },
    "scope_profiles": {
      "readonly": [
        "resources.read",
        "prompts.read",
        "tools.read"
      ],
      "standard": [
        "resources.read",
        "prompts.read",
        "tools.read",
        "tools.write"
      ]
    },
    "client_profiles": {
      "native_interactive": {
        "application_type": "native",
        "access_mode": "user",
        "grant_strategy": "authorization_code_pkce",
        "use_refresh_tokens": true,
        "refresh_token_rotation": true
      },
      "spa_interactive": {
        "application_type": "spa",
        "access_mode": "user",
        "grant_strategy": "authorization_code_pkce",
        "use_refresh_tokens": true,
        "refresh_token_rotation": true
      },
      "regular_web_interactive": {
        "application_type": "regular_web",
        "access_mode": "user",
        "grant_strategy": "authorization_code",
        "token_endpoint_auth_method": "client_secret_post",
        "use_refresh_tokens": true
      },
      "service_m2m": {
        "application_type": "m2m",
        "access_mode": "machine",
        "grant_strategy": "client_credentials",
        "token_endpoint_auth_method": "client_secret_post"
      }
    }
  },
  "client_groups": {
    "interactive-default": [
      "cursor-primary",
      "inspector-local"
    ],
    "automation-default": [
      "sync-worker"
    ]
  }
}
```

### Required fields

* `schema_version`
* `ecosystem_name`
* `domain.base_domain`
* `domain.server_host_pattern`
* `auth0.tenant_domain`
* `auth0.management_audience`
* management credential env var names

### Rationale

This file exists so the provisioner can behave deterministically. It centralizes the values that every server and client instance would otherwise repeat.

---

## 7.2 Client descriptor

A client descriptor defines how a kind of software integrates with Auth0. It is not necessarily a 1:1 match for an Auth0 Application.

Example:

```json
{
  "descriptor_key": "cursor-like",
  "display_name": "Cursor-like Native Client",
  "profile": "native_interactive",
  "access_mode": "user",
  "supports_pkce": true,
  "supports_device_flow": false,
  "requires_refresh_tokens": true,
  "requires_refresh_token_rotation": true,
  "callback_urls": [
    "http://127.0.0.1:45123/callback"
  ],
  "logout_urls": [],
  "web_origins": [],
  "reuse_policy": "share_if_exact_match"
}
```

### Required fields

* `descriptor_key`
* `display_name`
* `profile`
* `access_mode`

### Optional fields

* `callback_urls`
* `logout_urls`
* `web_origins`
* `supports_device_flow`
* token behavior flags
* reuse policy

### Rationale

This gives the agent a machine-readable way to reason about a client before deciding whether an existing Auth0 Application can be reused.

---

## 7.3 Concrete OAuth client configuration

This file represents one actual Auth0 Application instance.

Example:

```json
{
  "client_key": "cursor-primary",
  "display_name": "Cursor Primary",
  "descriptor": "cursor-like",
  "profile": "native_interactive",
  "auth0": {
    "create_if_missing": true
  },
  "application_settings": {
    "callback_urls": [
      "http://127.0.0.1:45123/callback"
    ],
    "logout_urls": [],
    "web_origins": [],
    "token_endpoint_auth_method": "none"
  },
  "token_settings": {
    "use_refresh_tokens": true,
    "refresh_token_rotation": true
  }
}
```

For an M2M client:

```json
{
  "client_key": "sync-worker",
  "display_name": "Sync Worker",
  "descriptor": "service-worker",
  "profile": "service_m2m",
  "auth0": {
    "create_if_missing": true
  },
  "application_settings": {
    "token_endpoint_auth_method": "client_secret_post"
  },
  "token_settings": {
    "use_refresh_tokens": false
  }
}
```

### Required fields

* `client_key`
* `display_name`
* `profile`
* `auth0.create_if_missing`

### Optional fields

* `descriptor`
* callback/logout/origin lists
* credential settings
* token settings

### Rationale

This file is the stable local record of the concrete Auth0 Application you actually use.

---

## 7.4 Per-server MCP configuration

This file represents one MCP server and the Auth0 API that protects it.

Example:

```json
{
  "name": "Files MCP",
  "slug": "files",
  "scope_profile": "standard",
  "extra_scopes": [
    "files.index",
    "files.delete"
  ],
  "auth0": {
    "create_api_if_missing": true,
    "existing_api_id": null
  },
  "grants": {
    "client_groups": [
      "interactive-default"
    ],
    "client_overrides": {
      "sync-worker": [
        "tools.read",
        "files.index"
      ]
    }
  },
  "access_policy": {
    "user": "require_client_grant",
    "client": "deny_all"
  }
}
```

### Required fields

* `name`
* `slug`

### Optional fields

* `scope_profile`
* `extra_scopes`
* `auth0.existing_api_id`
* `grants.client_groups`
* `grants.client_overrides`
* `access_policy` overrides

### Validation rules

* `slug` must be stable and explicitly supplied
* `slug` should be DNS-safe, lowercase, and hyphenated
* `slug` must not be derived from folder name
* `extra_scopes` must be unique
* if `access_policy.client != deny_all`, document why

### Rationale

This keeps only the non-derived facts in the server folder and leaves all shared policy in the top-level ecosystem config.

---

## 7.5 `.env` and secret handling

Use `.env` only for secrets or secret references.

Example `.env.example`:

```dotenv
AUTH0_MGMT_CLIENT_ID=__REQUIRED__
AUTH0_MGMT_CLIENT_SECRET=__REQUIRED__
AUTH0_TENANT_DOMAIN=your-tenant.auth0.com

AUTH0_CURSOR_PRIMARY_CLIENT_ID=__GENERATED_OR_EXISTING__
AUTH0_CURSOR_PRIMARY_CLIENT_SECRET=__ONLY_IF_CONFIDENTIAL__

AUTH0_SYNC_WORKER_CLIENT_ID=__GENERATED_OR_EXISTING__
AUTH0_SYNC_WORKER_CLIENT_SECRET=__GENERATED__
```

### Rules

* never store real secrets in JSON config files
* JSON files may reference env var names
* the script may generate placeholders, but should not commit live secrets

---

## 8. Derived values

The script should derive these values consistently.

From `ecosystem-configuration.json` + server `slug`:

* `hostname = server_host_pattern.format(slug, base_domain)`
* `canonical_resource_uri = https://{hostname}`
* `mcp_endpoint = https://{hostname}/mcp` or your configured route
* `protected_resource_metadata_url = https://{hostname}/.well-known/oauth-protected-resource`
* `auth0_api_identifier = canonical_resource_uri`

From `scope_profile + extra_scopes`:

* full scope set for the API
* default allowed scopes for grants
* default server-side scope enforcement map

From client profile + descriptor + overrides:

* Auth0 application type
* grant types
* token endpoint auth method
* callback/logout/origin settings
* whether refresh tokens should be enabled

### Rationale

Derivation keeps config small and prevents drift. The system should have a single canonical representation of each identity and build everything else from it.

---

## 9. Tenant-wide prerequisites

The script must have a dedicated **tenant verification phase** before it tries to provision servers or clients.

### 9.1 Required check: Resource Parameter Compatibility Profile

Auth0’s MCP docs say MCP uses the RFC 8707 `resource` parameter and that you must enable Resource Parameter Compatibility Profile so Auth0 uses `resource` to define the token audience. Auth0’s tenant settings docs list Resource Parameter Compatibility Profile as an Early Access tenant setting. ([Auth0][8])

**Contract:**

* check whether the tenant has this enabled
* if the Management API allows mutation in your tenant, prompt for consent and update it
* otherwise print exact instructions:

  * Dashboard → Settings → Advanced → Settings → Resource Parameter Compatibility Profile → enable

### 9.2 Optional check: Dynamic Client Registration

Your baseline system uses static client registration, so DCR should stay off unless you explicitly enable it later. Auth0 documents DCR as a tenant-level feature flag. ([Auth0][7])

**Contract:**

* do not enable DCR by default
* if the script supports it later, gate it behind an explicit flag

### 9.3 Management API access token requirements

To call the Auth0 Management API, you need a Management API access token with audience `https://{yourDomain}/api/v2/`, and each endpoint requires the appropriate scopes. Auth0’s Management API token docs state both points. ([Auth0][15])

**Contract:**

* obtain a Management API access token before any provisioning operation
* fail fast if required scopes are missing
* report missing scopes in a human-readable way

---

## 10. Supported client profiles

These are the only client profiles the baseline system should support. More can be added later, but the baseline should stay opinionated.

## 10.1 `native_interactive`

Use for:

* desktop editors
* native local tools
* local workbenches

Defaults:

* Auth0 application type: native
* access mode: user
* grant strategy: Authorization Code + PKCE
* token endpoint auth method: `none`
* refresh tokens: on
* rotation: on
* device flow: optional

Rationale:

* native apps are public clients
* native apps can also use `device_code`
* public apps cannot use `client_credentials` ([Auth0][10])

## 10.2 `spa_interactive`

Use for:

* browser UIs
* pure frontend clients

Defaults:

* Auth0 application type: SPA
* access mode: user
* grant strategy: Authorization Code + PKCE
* token endpoint auth method: `none`
* refresh tokens: on
* rotation: on

Rationale:

* SPAs are public apps
* they require callback URLs, logout URLs, and often web origins
* Auth0’s settings docs explicitly cover those application URI settings and refresh token rotation. ([Auth0][11])

## 10.3 `regular_web_interactive`

Use for:

* server-rendered web apps
* backends that own the token exchange

Defaults:

* Auth0 application type: regular web
* access mode: user
* grant strategy: Authorization Code
* token endpoint auth method: `client_secret_post`
* refresh tokens: on

Rationale:

* Authorization Code Flow is for confidential applications
* confidential apps can authenticate with client secret methods or `private_key_jwt` ([Auth0][12])

## 10.4 `service_m2m`

Use for:

* cron jobs
* backend workers
* unattended sync services
* programmatic callers with no user

Defaults:

* Auth0 application type: M2M
* access mode: machine
* grant strategy: Client Credentials
* token endpoint auth method: `client_secret_post`
* refresh tokens: off

Rationale:

* Client Credentials is the machine-to-machine flow
* M2M apps are linked to APIs and scopes
* public applications cannot use `client_credentials` ([Auth0][4])

---

## 11. Application reuse algorithm

The script should support **create-or-reuse** rather than always creating new applications.

An existing Auth0 Application is reusable only if all of the following are true:

1. same client profile
2. same access mode (`user` or `machine`)
3. same effective application type
4. same token endpoint auth method
5. all required callback URLs are already present
6. all required logout URLs are already present
7. all required web origins are already present
8. required token behavior is compatible
9. reuse is allowed by local policy

This follows Auth0’s application model because callback URLs, logout URLs, web origins, grant types, and token behavior all belong to the application itself. ([Auth0][11])

### Reuse policy recommendations

* `share_if_exact_match`: reuse only when everything matches
* `patch_if_safe`: reuse if the script can safely add missing URLs/settings
* `never_share`: always create a dedicated app

Default policy:

* first-party internal tools: `patch_if_safe`
* third-party software: `share_if_exact_match`
* M2M automation: `never_share`

---

## 12. Per-server Auth0 API contract

For each MCP server, the script must reconcile one Auth0 API.

### 12.1 Create/update shape

Recommended API payload shape:

```json
{
  "name": "Files MCP",
  "identifier": "https://files-mcp.example.com",
  "signing_alg": "RS256",
  "token_dialect": "rfc9068_profile_authz",
  "enforce_policies": true,
  "scopes": [
    { "value": "resources.read", "description": "Read MCP resources" },
    { "value": "prompts.read", "description": "Read MCP prompts" },
    { "value": "tools.read", "description": "Execute read-only tools" },
    { "value": "tools.write", "description": "Execute mutating tools" },
    { "value": "files.index", "description": "Index file content" },
    { "value": "files.delete", "description": "Delete files" }
  ]
}
```

Auth0’s MCP quickstart uses URI identifiers, `RS256`, and `rfc9068_profile_authz`. ([Auth0][6])

### 12.2 Access policy

Immediately reconcile API access policy to:

```json
{
  "subject_type_authorization": {
    "user": { "policy": "require_client_grant" },
    "client": { "policy": "deny_all" }
  }
}
```

Auth0’s API access policy docs show exactly this pattern and explain that `require_client_grant` restricts user-based access to explicitly granted applications while `deny_all` blocks machine-to-machine access. ([Auth0][3])

### 12.3 Scope reconciliation rule

When updating API scopes via Management API, you must send the **full desired scope set**. Auth0’s docs warn that omitted scopes are removed. ([Auth0][16])

**Contract:**

* never append scopes blindly
* always compute full desired scope set and replace/reconcile atomically

---

## 13. Client grant contract

Client grants link Auth0 Applications to Auth0 APIs and define what scopes the application may request.

Auth0’s client grants docs say you create them with `POST /client-grants`, update them with `PATCH /client-grants/{id}`, and query them by `client_id`, `audience`, or `subject_type`. ([Auth0][17])

### 13.1 Baseline rule

Every client/API relationship must be represented by a client grant if the API uses `require_client_grant`.

### 13.2 Subject type

Use:

* `subject_type = "user"` for interactive/user-based clients
* `subject_type = "client"` for M2M clients

Auth0 distinguishes user access and client access as separate policy surfaces. ([Auth0][3])

### 13.3 Grant scopes

Grant only the scopes that client should be able to request.

Example:

* Cursor: `resources.read`, `prompts.read`, `tools.read`, `tools.write`
* sync worker: only `tools.read`, `files.index`

### 13.4 Default policy

Per-server config should usually grant:

* `interactive-default` client group to the baseline server scope profile
* no M2M grants unless explicitly requested

---

## 14. MCP runtime contract

This is what the MCP server itself must implement, regardless of how Auth0 is configured.

### 14.1 Protected Resource Metadata

Every MCP server must publish OAuth 2.0 Protected Resource Metadata and include at least one `authorization_servers` entry. MCP requires this. ([Model Context Protocol][2])

Recommended document:

```json
{
  "resource": "https://files-mcp.example.com",
  "authorization_servers": [
    "https://your-tenant.auth0.com/"
  ]
}
```

### 14.2 Discovery location

The server must support at least one of:

* `WWW-Authenticate` with `resource_metadata`
* a well-known protected resource metadata URL

MCP clients must support both. MCP also permits the well-known document either at the root or path-specific location. ([Model Context Protocol][2])

### 14.3 401 challenge behavior

On missing/invalid/insufficient token, return `401 Unauthorized` and include:

* `resource_metadata="..."`
* `scope="..."` when applicable

MCP says servers should include `scope` to indicate what is required. ([Model Context Protocol][2])

Example:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://files-mcp.example.com/.well-known/oauth-protected-resource", scope="tools.read"
```

### 14.4 Token validation

The MCP server must validate:

* signature using Auth0 JWKS
* issuer
* expiration / nbf
* audience/resource
* scopes or permissions

Auth0’s MCP overview states that the MCP server validates the token and enforces authorization decisions; Auth0’s MCP quickstarts say the server should validate issuer, audience, and RS256. ([Auth0][18])

### 14.5 Resource identity rule

The token must be intended for the server’s canonical resource URI. Auth0’s Resource Parameter Compatibility Profile guide says `resource` defines the token audience when enabled, and recommends URI-format API identifiers to align with RFC 8707 and MCP. ([Auth0][8])

---

## 15. Auth0 Management API operations the script should use

Your provisioning tool should use the Management API directly.

Auth0’s docs make clear that:

* applications can be created via `POST /api/v2/clients`
* APIs can be created/updated via `POST`/`PATCH /resource-servers`
* client grants can be created/updated via `POST`/`PATCH /client-grants`
* Management API requires a dedicated Management API access token with the right audience and scopes. ([Auth0][19])

### 15.1 Operations to support

At minimum, implement wrappers for:

* list/find applications
* create application
* update application
* list/find APIs
* create API
* update API
* list/find client grants
* create client grant
* update client grant
* delete client grant if no longer desired
* read tenant settings
* patch tenant settings when supported and approved

### 15.2 Management token contract

The provisioner must:

* acquire a Management API token
* verify it has enough scopes for the operations it plans to perform
* stop with a clear error if not

Auth0’s docs say each Management API endpoint requires its own scopes and points users to the Management API Explorer for exact scope requirements. ([Auth0][15])

---

## 16. Provisioning workflow

This is the concrete contract the script should implement.

## Phase 0: load configuration

Load:

* `.env`
* `ecosystem-configuration.json`
* all client descriptor files
* all concrete client config files
* the target MCP server’s `mcp-configuration.json`

Validate:

* schema version
* required fields
* slug format
* no duplicate client keys
* no duplicate slugs
* no duplicate resource URIs

## Phase 1: verify tenant prerequisites

1. authenticate to Management API
2. inspect tenant settings
3. verify Resource Parameter Compatibility Profile
4. if missing:

   * attempt programmatic update if supported and user consented
   * otherwise print exact manual dashboard instructions and stop
5. optionally verify DCR is disabled unless explicitly enabled

Rationale:

* tenant-wide checks should happen once, early, before object creation

## Phase 2: reconcile OAuth clients

For each referenced client:

1. resolve the client descriptor
2. search existing Auth0 applications
3. apply reuse algorithm
4. if compatible app exists:

   * patch it if allowed and safe
   * otherwise reuse as-is
5. if no compatible app exists:

   * create a new Auth0 Application of the required type
6. persist `client_id` to the `.env` managed block via `EnvManager.set()`
7. for confidential clients, persist `client_secret` to `.env` via `EnvManager.set()` with write-once semantics

Use Auth0’s application type and grant type rules when deciding defaults. Public apps use `token_endpoint_auth_method = none`; public apps cannot use `client_credentials`; native apps may also use `device_code`; confidential apps can use secret- or key-based auth. ([Auth0][10])

## Phase 3: reconcile MCP API

For the target server:

1. derive hostname and canonical resource URI from slug
2. search existing Auth0 APIs by identifier
3. if found, reconcile
4. if missing, create
5. reconcile scopes as the full desired scope set
6. reconcile API access policy:

   * `user = require_client_grant`
   * `client = deny_all` unless explicitly enabled

Auth0’s API access policy docs and MCP quickstart support this shape. ([Auth0][3])

## Phase 4: reconcile client grants

1. expand server `client_groups`
2. merge any `client_overrides`
3. compute desired grants
4. for each desired grant:

   * find existing grant by `client_id + audience + subject_type`
   * create or patch as needed
5. optionally remove stale grants that are no longer declared

Auth0’s client grants API is the right primitive for this. ([Auth0][17])

## Phase 5: generate local config artifacts

Generate or update:

* `mcp-configuration.json`
* client config file(s)
* `.env.example` placeholders
* any runtime config file your MCP server needs

The script should never silently overwrite human-edited custom fields unless it is operating in an explicit `--apply` or reconciliation mode.

---

## 17. Idempotency rules

The provisioner must be idempotent.

### Rule 1

Running the same command twice should not create duplicate Auth0 objects.

### Rule 2

Search by canonical key first:

* applications by `client_key` metadata or known name
* APIs by identifier
* grants by `client_id + audience + subject_type`

### Rule 3

Treat local config as the desired state, not just a one-time scaffold.

### Rule 4

On scope updates, compute the full desired scope set before calling the Management API, because Auth0 removes omitted scopes. ([Auth0][16])

### Rule 5

Do not mutate tenant-wide settings without explicit consent.

---

## 18. Naming and metadata conventions

Use metadata on Auth0 objects so the script can reliably rediscover them later.

Recommended `client_metadata` on Auth0 Applications:

* `ecosystem = personal-mcp`
* `client_key = cursor-primary`
* `descriptor = cursor-like`
* `profile = native_interactive`
* `managed_by = mcp-ecosystem-script`

Recommended metadata conventions for APIs:

* use `identifier` as the canonical resource URI
* use `name` as the display name
* optionally include management metadata if supported

This is a design choice, but it makes reconciliation easier and more robust.

---

## 19. Scope model

Use a small baseline scope vocabulary that works for all MCP servers.

Recommended baseline:

* `resources.read`
* `prompts.read`
* `tools.read`
* `tools.write`

Then add server-specific scopes as needed:

* `files.index`
* `files.delete`
* `git.commit`
* `calendar.read_private`

### Rationale

A standard baseline gets new MCPs running quickly. Extra scopes can be added later, and your script should include a helper command to reconcile scope changes into Auth0. This fits Auth0’s model where API scopes are defined on the API/resource server and issued to applications through grants. ([Auth0][17])

---

## 20. Exact guidance for an AI coding agent

This section is meant to be executable as policy.

### 20.1 Required facts before creating or reusing a client app

For **native interactive**:

* callback URL(s)
* whether logout URLs are needed
* whether refresh tokens are needed
* whether device flow is needed

For **SPA interactive**:

* callback URL(s)
* logout URL(s)
* web origins
* whether refresh token rotation is needed

For **regular web interactive**:

* callback URL(s)
* logout URL(s)
* token endpoint auth method
* whether refresh tokens are needed

For **service M2M**:

* whether unattended access is really intended
* secret storage location
* which MCP APIs/scopes it should access

If these facts are unknown, the agent should ask for them or use a descriptor file rather than guessing.

### 20.2 Create-or-reuse workflow for an agent

Given:

* MCP server facts
* target client facts or descriptor
* ecosystem config

the agent should do this:

1. load top-level ecosystem config
2. verify tenant prerequisites
3. load target client descriptor
4. search for compatible Auth0 Application
5. if compatible and reusable, reuse it
6. otherwise create a new Auth0 Application
7. derive canonical server URI from server slug
8. search for or create the Auth0 API for the MCP server
9. reconcile scopes
10. reconcile API access policy
11. reconcile client grants
12. write/update local config files
13. write `.env.example` placeholders for any secrets
14. print a summary of:

* API created/reused
* Application created/reused
* grants created/updated
* any manual steps remaining

### 20.3 Output artifacts the agent should write

For a new MCP server, the agent should be able to write:

* `mcps/<server>/mcp-configuration.json`
* `oauth-clients/<client>/client-configuration.json` if a new client instance is needed
* `.env.example` entries
* optionally a generated runtime config block for the MCP server

### 20.4 Secret placeholders

The agent must never invent live secrets. It should emit placeholders like:

```dotenv
AUTH0_CURSOR_PRIMARY_CLIENT_ID=__FILL_OR_GENERATED__
AUTH0_CURSOR_PRIMARY_CLIENT_SECRET=__FILL_IF_CONFIDENTIAL__
AUTH0_FILES_MCP_AUDIENCE=https://files-mcp.example.com
AUTH0_TENANT_DOMAIN=your-tenant.auth0.com
```

---

## 21. Concrete provisioning contract

This is the contract the implementation should target.

## 21.1 Command surface

Recommended commands:

* `verify-tenant`
* `reconcile-client <client-key>`
* `reconcile-server <server-slug>`
* `reconcile-all`
* `add-scope <server-slug> <scope>`
* `grant-client <server-slug> <client-key> [scopes...]`

## 21.2 `verify-tenant`

Must:

* authenticate to Management API
* check Resource Parameter Compatibility Profile
* optionally check DCR flag
* report status and remediation

Success output:

* tenant domain
* management audience
* resource compatibility profile status
* whether manual action is required

## 21.3 `reconcile-client`

Inputs:

* client config
* descriptor
* ecosystem defaults

Must:

* resolve profile
* search existing applications
* reuse or create
* patch URLs/settings if policy allows
* return:

  * `client_id`
  * application type
  * token endpoint auth method
  * whether secret placeholder is required

## 21.4 `reconcile-server`

Inputs:

* server config
* ecosystem defaults
* resolved client instances

Must:

* derive canonical URI
* reconcile Auth0 API
* reconcile scopes
* reconcile access policy
* reconcile client grants
* return:

  * API identifier
  * Auth0 API ID
  * granted clients
  * granted scopes

## 21.5 `add-scope`

Must:

* load current local desired scope set
* merge the new scope
* compute full desired set
* update the Auth0 API with the full scope list
* optionally patch grants if the new scope should be granted to specific clients

This command exists because Auth0’s Management API replaces the scope list and removes omitted scopes. ([Auth0][16])

---

## 22. Recommended implementation defaults

These are the defaults the coding agent should assume unless config overrides them.

### APIs

* `signing_alg = RS256`
* `token_dialect = rfc9068_profile_authz`
* `user.policy = require_client_grant`
* `client.policy = deny_all`

### Interactive clients

* PKCE when public
* refresh tokens enabled only when the client actually needs them
* rotation enabled when refresh tokens are enabled on public/browser-like clients

### M2M clients

* off by default
* only create when explicitly requested
* only grant the minimum scopes required

### URLs

* do not use wildcards by default
* do not use localhost in production config
* for native apps, prefer claimed HTTPS callback URIs over custom URI schemes when possible

Auth0’s application settings docs explicitly warn about wildcards, localhost in production, and custom URI schemes for native apps. ([Auth0][11])

---

## 23. Things the implementation should not do

* do not derive server slug from folder name
* do not create a new tenant for each server
* do not use one Auth0 Application for everything by fiat
* do not enable M2M access on every API
* do not blindly append scopes without recomputing the full set
* do not expose DCR by default
* do not write live secrets into JSON files
* do not accept any JWT that merely looks valid without checking issuer and audience/resource

---

## 24. Future extension points

### 24.1 Upstream API calls on behalf of users

If an MCP server later needs to call your own Auth0-protected APIs on behalf of the user, Auth0’s MCP quickstart uses **Custom Token Exchange** and requires an Application for the MCP server itself. This is outside the baseline contract but should be treated as a supported future extension. ([Auth0][13])

### 24.2 Dynamic Client Registration

MCP allows DCR, and Auth0 supports DCR behind a tenant-level feature, but your baseline intentionally avoids it because static registration is the better fit for a personal ecosystem and is Auth0’s recommended choice for production MCP client registration. ([Auth0][7])

### 24.3 Multiple environments

If you later need dev/staging/prod separation, keep the same data model and add environment layering rather than redesigning the object model. Auth0’s tenant model and application settings are environment-friendly, but for now the baseline assumes one tenant and one personal ecosystem. ([Auth0][11])

---

## 25. The one-page intuition

Use this mental shortcut:

* **New MCP server?** Create a new **Auth0 API**.
* **New software client?** Create or reuse an **Auth0 Application**.
* **Want that client to access that server?** Create a **client grant**.
* **Want the server to be MCP-compliant?** Publish Protected Resource Metadata and return proper `WWW-Authenticate` challenges.
* **Want Auth0 to work with MCP?** Enable Resource Parameter Compatibility Profile and use URI resource identifiers.
* **Want the system to stay sane?** Keep slugs stable, derive everything else, and make the script reconcile state instead of just scaffolding once. ([Model Context Protocol][2])

This is the contract to implement against.

[1]: https://auth0.com/docs/get-started/apis "APIs"
[2]: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization "Authorization - Model Context Protocol"
[3]: https://auth0.com/docs/get-started/apis/api-access-policies-for-applications "API Access Policies for Applications"
[4]: https://auth0.com/docs/get-started/auth0-overview/create-applications/machine-to-machine-apps?utm_source=chatgpt.com "Register Machine-to-Machine Applications - Auth0 Docs"
[5]: https://auth0.com/docs/get-started/apis/api-access-policies-for-applications?utm_source=chatgpt.com "API Access Policies for Applications"
[6]: https://auth0.com/ai/docs/mcp/get-started/authorization-for-your-mcp-server?utm_source=chatgpt.com "Authorization for MCP Server - Auth for MCP Quickstart"
[7]: https://auth0.com/ai/docs/mcp/guides/registering-your-mcp-client-application "Register MCP Client Application - Auth for MCP"
[8]: https://auth0.com/ai/docs/mcp/guides/resource-param-compatibility-profile?utm_source=chatgpt.com "Resource Parameter Compatibility Profile - Auth for MCP"
[9]: https://auth0.com/docs/get-started/applications?utm_source=chatgpt.com "Applications in Auth0 - Auth0 Docs"
[10]: https://auth0.com/docs/get-started/applications/application-grant-types "Application Grant Types"
[11]: https://auth0.com/docs/get-started/applications/application-settings "Application Settings"
[12]: https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow "Authorization Code Flow"
[13]: https://auth0.com/ai/docs/mcp/get-started/call-your-apis-on-users-behalf?utm_source=chatgpt.com "Call Your API on User's Behalf - Auth for MCP Quickstart"
[14]: https://auth0.com/docs/secure/tokens/refresh-tokens "Refresh Tokens"
[15]: https://auth0.com/docs/secure/tokens/access-tokens/management-api-access-tokens?utm_source=chatgpt.com "Management API Access Tokens - Auth0 Docs"
[16]: https://auth0.com/docs/get-started/apis/add-api-permissions?utm_source=chatgpt.com "Add API Permissions - Auth0 Docs"
[17]: https://auth0.com/docs/get-started/applications/application-access-to-apis-client-grants "Application Access to APIs: Client Grants"
[18]: https://auth0.com/ai/docs/mcp/intro/overview "Secure MCP with Auth0"
[19]: https://auth0.com/docs/authenticate/single-sign-on/api-endpoints-for-single-sign-on?utm_source=chatgpt.com "API Endpoints for Single Sign-On"
