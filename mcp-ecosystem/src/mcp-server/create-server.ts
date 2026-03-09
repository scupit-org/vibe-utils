import { stat } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  loadAllConfig,
  assertRequiredEcosystemEnv,
  ECOSYSTEM_ENV,
  AUTH0_ENV,
  isProjectEnvDisallowedKey,
  isServerExcludedEnvKey,
  deriveHostname,
  deriveCanonicalResourceUri,
  deriveMcpEndpoint,
  deriveProtectedResourceMetadataUrl,
  deriveResourceUris,
  resolveScopes,
  resolveSessionIdleTimeoutSeconds,
  resolveUseTrailingSlash,
} from "../config/index.js";
import { EnvManager } from "../utils/env-manager.js";
import { McpServerContext } from "../mcp-runtime/mcp-server-context.js";
import type {
  McpConfiguration,
  CreateMcpServerOptions,
} from "./mcp-configuration.js";
import type { TransportConfig } from "./transport-config.js";
import { StreamableHttpStatelessMcp } from "./streamable-http-stateless-mcp.js";
import { StreamableHttpStatefulMcp } from "./streamable-http-stateful-mcp.js";
import { StdioMcp } from "./stdio-mcp.js";

export interface RuntimeConfig {
  server: {
    name: string;
    slug: string;
    hostname: string;
    resource_uri: string;
    mcp_endpoint: string;
  };
  auth: {
    issuer: string;
    audience: string | string[];
    jwks_uri: string;
    protected_resource_metadata_url: string;
  };
  scopes: string[];
  session_idle_timeout_seconds: number;
}

async function loadServerConfig(
  mcpDir: string,
  options: { requireTenantDomain: boolean }
): Promise<RuntimeConfig> {
  const rootDir = await findEcosystemRoot(mcpDir);
  const slug = basename(mcpDir);

  await loadEnvFiles(mcpDir, rootDir);

  const { ecosystem, serverConfigs } = await loadAllConfig(rootDir);
  assertRequiredEcosystemEnv(ecosystem, {
    context: options.requireTenantDomain
      ? "run an authenticated MCP server"
      : "run an MCP server",
    requireBaseDomain: true,
    requireTenantDomain: options.requireTenantDomain,
  });
  const server = serverConfigs.get(slug);
  if (!server) {
    throw new Error(
      `No mcp-configuration.json found for slug "${slug}" under ${rootDir}`
    );
  }

  const hostname = deriveHostname(ecosystem, slug);
  const mode = resolveUseTrailingSlash(ecosystem, server);
  const resourceUri = deriveCanonicalResourceUri(ecosystem, slug, mode);
  const mcpEndpoint = deriveMcpEndpoint(ecosystem, slug, mode);
  const metadataUrl = deriveProtectedResourceMetadataUrl(
    ecosystem,
    slug,
    mode
  );
  const scopes = resolveScopes(ecosystem, server);
  const sessionIdleTimeoutSeconds = resolveSessionIdleTimeoutSeconds(
    ecosystem,
    server
  );
  const issuerDomain = ecosystem.auth0.tenant_domain || "__SET_AUTH0_TENANT_DOMAIN__";

  const audiences = deriveResourceUris(ecosystem, slug, mode);
  const audience = audiences.length === 1 ? audiences[0] : audiences;

  return {
    server: {
      name: server.name,
      slug,
      hostname,
      resource_uri: resourceUri,
      mcp_endpoint: mcpEndpoint,
    },
    auth: {
      issuer: `https://${issuerDomain}/`,
      audience,
      jwks_uri: `https://${issuerDomain}/.well-known/jwks.json`,
      protected_resource_metadata_url: metadataUrl,
    },
    scopes,
    session_idle_timeout_seconds: sessionIdleTimeoutSeconds,
  };
}

async function findEcosystemRoot(startDir: string): Promise<string> {
  let dir = startDir;
  const root = dirname(dir) === dir ? dir : undefined;

  while (true) {
    try {
      const s = await stat(join(dir, "ecosystem-configuration.json"));
      if (s.isFile()) return dir;
    } catch { /* not here, keep walking */ }

    const parent = dirname(dir);
    if (parent === dir || parent === root) {
      throw new Error(
        `Could not find ecosystem-configuration.json in any parent of ${startDir}`
      );
    }
    dir = parent;
  }
}

/**
 * Load `.env` files into `process.env` before config resolution.
 *
 * Precedence (highest → lowest):
 *   1. Shell environment (already in process.env, never overwritten)
 *   2. MCP implementation dir `.env` (optional, for per-server overrides like PORT)
 *   3. Ecosystem root dir `.env` (optional, provides ECOSYSTEM_BASE_DOMAIN, AUTH0_*, etc.)
 *   4. Hardcoded defaults in resolveEcosystemConfig
 *
 * `populateProcessEnv()` skips keys that are already set, so loading order
 * determines precedence: most-specific first.
 *
 * Per-server `.env` files may only define server-local overrides (for example
 * `PORT`). Shared ecosystem/Auth0 values must live in the ecosystem root `.env`
 * or the shell environment.
 */
async function loadEnvFiles(mcpDir: string, rootDir: string): Promise<void> {
  const rootEnvPath = join(rootDir, ".env");
  scrubServerProcessEnv();

  if (mcpDir !== rootDir) {
    const mcpEnv = await EnvManager.load(mcpDir);
    const mcpEnvPath = join(mcpDir, ".env");
    assertNoRootOnlyVarsInProjectEnv(mcpEnv, mcpEnvPath, rootEnvPath);
    mcpEnv.populateProcessEnv((key) => !isProjectEnvDisallowedKey(key));
  }

  const rootEnv = await EnvManager.load(rootDir);
  rootEnv.populateProcessEnv((key) => !isServerExcludedEnvKey(key));
}

function scrubServerProcessEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (isServerExcludedEnvKey(key)) {
      delete process.env[key];
    }
  }
}

// TODO: This type-level guard only rejects promise-returning setup callbacks
// when the callback's return type is inferred directly at the createMcpServer()
// callsite. If a callback is pre-typed as ConfigureMcpServer, TypeScript will
// widen its return type to void and an async implementation can still slip
// through. Tighten this in the near future if we need stricter enforcement.
type RejectPromiseReturningSetup<
  TSetup extends (server: McpServer, context: McpServerContext) => unknown,
> = ReturnType<TSetup> extends PromiseLike<unknown> ? never : TSetup;

/**
 * Create an MCP server configured with the given transport.
 *
 * Derives the {@link RuntimeConfig} automatically from the ecosystem and
 * server configuration files. Pass `import.meta.url` from the calling module
 * so the factory can locate the `mcp-configuration.json` for this server.
 *
 * Usage:
 * ```ts
 * const mcp = await createMcpServer(
 *   import.meta.url,
 *   { transport: streamableHttpStatelessTransport({ port: 3001, auth: { enabled: false } }) },
 *   (server, context) => {
 *     server.registerTool("my-tool", { ... }, async (args) => { ... });
 *   },
 * );
 *
 * await mcp.begin();
 * ```
 */
export async function createMcpServer<
  TSetup extends (server: McpServer, context: McpServerContext) => unknown,
>(
  importMetaUrl: string,
  options: CreateMcpServerOptions,
  setup: RejectPromiseReturningSetup<TSetup>,
): Promise<McpConfiguration> {
  const mcpDir = dirname(fileURLToPath(importMetaUrl));
  const transport = options.transport;
  if (!transport) {
    throw new Error(
      "Transport is required. Pass a transport config (e.g. stdioTransport({}), streamableHttpStatelessTransport({ port: 3000 })) or use resolveTransportSelection() for multi-transport selection."
    );
  }
  const requireTenantDomain =
    transport.type !== "stdio" &&
    ("auth" in transport ? transport.auth?.enabled !== false : false);
  const config = await loadServerConfig(mcpDir, { requireTenantDomain });

  const isAuthEnabled =
    transport.type !== "stdio" &&
    ("auth" in transport ? transport.auth?.enabled !== false : true);
  const context = new McpServerContext(isAuthEnabled);

  const createConfiguredServer = (): McpServer => {
    const server = new McpServer({
      name: config.server.name,
      version: options.version ?? "0.1.0",
    });
    // Setup is intentionally synchronous today. Promise-returning setup
    // callbacks are rejected at the type level; if we ever support async
    // setup, we must explicitly await it here before connecting the server
    // to its transport.
    setup(server, context);
    return server;
  };

  switch (transport.type) {
    case "streamable_http_stateless":
      return new StreamableHttpStatelessMcp(createConfiguredServer, config, transport);
    case "streamable_http_stateful":
      return new StreamableHttpStatefulMcp(createConfiguredServer, config, transport);
    case "stdio":
      return new StdioMcp(createConfiguredServer, config);
    default: {
      const _exhaustive: never = transport;
      throw new Error(`Unknown transport type: ${(_exhaustive as TransportConfig).type}`);
    }
  }
}

function assertNoRootOnlyVarsInProjectEnv(
  env: EnvManager,
  projectEnvPath: string,
  rootEnvPath: string
): void {
  const disallowedEntries = [...env.entries()].filter(([key]) =>
    isProjectEnvDisallowedKey(key)
  );

  if (disallowedEntries.length === 0) return;

  const entries = disallowedEntries.map(
    ([key, value]) => `    ${formatAssignmentForDisplay(key, value)}`
  );
  const reasons = disallowedEntries.map(([key]) => {
    if (key === ECOSYSTEM_ENV.baseDomain) {
      return `  ${key}: shared ecosystem setting; it must be defined once at the ecosystem root.`;
    }
    if (key === AUTH0_ENV.tenantDomain) {
      return `  ${key}: shared Auth0 tenant setting; it must be defined once at the ecosystem root.`;
    }
    return `  ${key}: sensitive or shared Auth0 credential; it belongs in the ecosystem root .env, not a per-server .env.`;
  });

  throw new Error(
    `Invalid variables in per-server .env at ${projectEnvPath}\n\n` +
      `  These variables belong in the ecosystem root .env at:\n` +
      `    ${rootEnvPath}\n\n` +
      `${reasons.join("\n")}\n\n` +
      `  Move these assignments to the root .env and remove them from the per-server file:\n` +
      `${entries.join("\n")}\n\n` +
      `  Per-server .env files should only contain server-local overrides such as:\n` +
      `    PORT=3001`
  );
}

function formatAssignmentForDisplay(key: string, value: string): string {
  return key.includes("_SECRET") ? `${key}=********` : `${key}=${value}`;
}
