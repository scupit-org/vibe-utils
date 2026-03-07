import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  EcosystemFileSchema,
  ClientDescriptorSchema,
  ClientConfigSchema,
  ServerConfigSchema,
} from "../types/index.js";
import type {
  EcosystemConfig,
  EcosystemFileConfig,
  ClientDescriptor,
  ClientConfig,
  ServerConfig,
} from "../types/index.js";
import {
  ECOSYSTEM_ENV,
  AUTH0_ENV,
  DEFAULT_ECOSYSTEM_NAME,
  DEFAULT_API_SETTINGS,
  DEFAULT_SCOPE_PROFILES,
  DEFAULT_CLIENT_PROFILES,
} from "./defaults.js";
import { getEnvPlaceholder, isPlaceholderEnvValue } from "./env-policy.js";
import type { ClientAccessPolicy, UserAccessPolicy } from "../types/index.js";

export interface LoadedConfig {
  ecosystem: EcosystemConfig;
  clientDescriptors: Map<string, ClientDescriptor>;
  clientConfigs: Map<string, ClientConfig>;
  serverConfigs: Map<string, ServerConfig>;
}

interface RequiredEcosystemEnvOptions {
  context: string;
  requireBaseDomain?: boolean;
  requireTenantDomain?: boolean;
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Reads the slim ecosystem-configuration.json, merges in hardcoded defaults
 * and environment variables, and returns a fully-resolved EcosystemConfig
 * alongside all descriptor, client, and server configs.
 */
export async function loadAllConfig(rootDir: string): Promise<LoadedConfig> {
  const ecosystemPath = join(rootDir, "ecosystem-configuration.json");
  const ecosystemRaw = await readJson(ecosystemPath);
  const fileConfig = EcosystemFileSchema.parse(ecosystemRaw);

  const ecosystem = resolveEcosystemConfig(fileConfig);

  const clientDescriptors = new Map<string, ClientDescriptor>();
  const descriptorsDir = join(rootDir, "client-descriptors");
  if (await directoryExists(descriptorsDir)) {
    const entries = await readdir(descriptorsDir);
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const raw = await readJson(join(descriptorsDir, entry));
      const descriptor = ClientDescriptorSchema.parse(raw);
      if (clientDescriptors.has(descriptor.descriptor_key)) {
        throw new Error(
          `Duplicate client descriptor key: ${descriptor.descriptor_key}`
        );
      }
      clientDescriptors.set(descriptor.descriptor_key, descriptor);
    }
  }

  const clientConfigs = new Map<string, ClientConfig>();
  const clientsDir = join(rootDir, "oauth-clients");
  if (await directoryExists(clientsDir)) {
    const entries = await readdir(clientsDir);
    for (const entry of entries) {
      const clientDir = join(clientsDir, entry);
      if (!(await directoryExists(clientDir))) continue;
      const configPath = join(clientDir, "client-configuration.json");
      if (!(await fileExists(configPath))) continue;
      const raw = await readJson(configPath);
      const clientCfg = ClientConfigSchema.parse(raw);
      if (clientConfigs.has(clientCfg.client_key)) {
        throw new Error(
          `Duplicate client key: ${clientCfg.client_key}`
        );
      }
      clientConfigs.set(clientCfg.client_key, clientCfg);
    }
  }

  const serverConfigs = new Map<string, ServerConfig>();
  const mcpsDir = join(rootDir, "mcps");
  if (await directoryExists(mcpsDir)) {
    const mcpEntries = await readdir(mcpsDir);
    for (const entry of mcpEntries) {
      const entryPath = join(mcpsDir, entry);
      if (!(await directoryExists(entryPath))) continue;
      const mcpConfigPath = join(entryPath, "mcp-configuration.json");
      if (!(await fileExists(mcpConfigPath))) continue;
      const raw = await readJson(mcpConfigPath);
      const serverCfg = ServerConfigSchema.parse(raw);
      if (serverConfigs.has(serverCfg.slug)) {
        throw new Error(`Duplicate server slug: ${serverCfg.slug}`);
      }
      serverConfigs.set(serverCfg.slug, serverCfg);
    }
  }

  validateCrossReferences(ecosystem, clientDescriptors, clientConfigs, serverConfigs);

  return { ecosystem, clientDescriptors, clientConfigs, serverConfigs };
}

/**
 * Merges the slim file config with hardcoded defaults and env vars
 * to produce a fully-resolved EcosystemConfig.
 *
 * Auth0 tenant domain is read lazily (may not be set yet if the user
 * is only running generate-artifacts). We store whatever is available;
 * the Auth0 client constructor validates when it actually needs them.
 */
function resolveEcosystemConfig(file: EcosystemFileConfig): EcosystemConfig {
  const baseDomain = process.env[ECOSYSTEM_ENV.baseDomain] ?? "";
  const tenantDomain = process.env[AUTH0_ENV.tenantDomain] ?? "";

  const userApi = file.defaults?.api ?? {};
  const userScopeProfiles = file.defaults?.scope_profiles ?? {};
  const userClientProfiles = file.defaults?.client_profiles ?? {};

  return {
    ecosystem_name: file.ecosystem_name ?? DEFAULT_ECOSYSTEM_NAME,
    domain: {
      base_domain: baseDomain,
      server_host_pattern: file.domain.server_host_pattern,
    },
    auth0: {
      tenant_domain: tenantDomain,
      management_audience: tenantDomain
        ? `https://${tenantDomain}/api/v2/`
        : "",
    },
    defaults: {
      api: {
        signing_alg: userApi.signing_alg ?? DEFAULT_API_SETTINGS.signing_alg,
        token_dialect:
          userApi.token_dialect ?? DEFAULT_API_SETTINGS.token_dialect,
        user_access_policy:
          userApi.user_access_policy ??
          DEFAULT_API_SETTINGS.user_access_policy,
        client_access_policy:
          userApi.client_access_policy ??
          DEFAULT_API_SETTINGS.client_access_policy,
      },
      scope_profiles: { ...DEFAULT_SCOPE_PROFILES, ...userScopeProfiles },
      client_profiles: { ...DEFAULT_CLIENT_PROFILES, ...userClientProfiles },
    },
    client_groups: file.client_groups,
  };
}

export function assertRequiredEcosystemEnv(
  ecosystem: EcosystemConfig,
  options: RequiredEcosystemEnvOptions
): void {
  const missing: Array<{ key: string; example: string; reason: string }> = [];

  collectRequiredEnvIssue(
    missing,
    ECOSYSTEM_ENV.baseDomain,
    ecosystem.domain.base_domain,
    options.requireBaseDomain,
    "Used to derive server hostnames, resource URIs, and MCP endpoints.",
    "your-base-domain.com"
  );

  collectRequiredEnvIssue(
    missing,
    AUTH0_ENV.tenantDomain,
    ecosystem.auth0.tenant_domain,
    options.requireTenantDomain,
    "Used to derive the Auth0 issuer, JWKS URI, and management audience.",
    "your-tenant.auth0.com"
  );

  if (missing.length === 0) return;

  const plural = missing.length > 1 ? "variables" : "variable";
  const examples = missing.map((entry) => `    ${entry.key}=${entry.example}`);
  const reasons = missing.map((entry) => `  ${entry.key}: ${entry.reason}`);

  throw new Error(
    `Missing required environment ${plural} to ${options.context}\n\n` +
      `${reasons.join("\n")}\n\n` +
      `  Set them in your ecosystem .env file or shell environment:\n` +
      `${examples.join("\n")}\n\n` +
      `  To bootstrap a root .env template, run:\n` +
      `    mcp-ecosystem generate-artifacts`
  );
}

export function resolveUserAccessPolicy(
  ecosystem: EcosystemConfig,
  server: ServerConfig
): UserAccessPolicy {
  return (server.access_policy?.user ??
    ecosystem.defaults.api.user_access_policy) as UserAccessPolicy;
}

export function resolveClientAccessPolicy(
  ecosystem: EcosystemConfig,
  server: ServerConfig
): ClientAccessPolicy {
  return (server.access_policy?.client ??
    ecosystem.defaults.api.client_access_policy) as ClientAccessPolicy;
}

function validateCrossReferences(
  ecosystem: EcosystemConfig,
  descriptors: Map<string, ClientDescriptor>,
  clients: Map<string, ClientConfig>,
  servers: Map<string, ServerConfig>
): void {
  for (const [key, client] of clients) {
    if (client.descriptor && !descriptors.has(client.descriptor)) {
      throw new Error(
        `Client "${key}" references unknown descriptor "${client.descriptor}"`
      );
    }
  }

  const resourceUris = new Set<string>();
  for (const [slug, server] of servers) {
    const uri = deriveCanonicalResourceUri(ecosystem, server.slug);
    if (resourceUris.has(uri)) {
      throw new Error(
        `Duplicate derived resource URI for server "${slug}": ${uri}`
      );
    }
    resourceUris.add(uri);

    if (server.scope_profile && !ecosystem.defaults.scope_profiles[server.scope_profile]) {
      throw new Error(
        `Server "${slug}" references unknown scope profile "${server.scope_profile}"`
      );
    }

    if (server.grants?.client_groups) {
      for (const group of server.grants.client_groups) {
        if (!ecosystem.client_groups?.[group]) {
          throw new Error(
            `Server "${slug}" references unknown client group "${group}"`
          );
        }
      }
    }

    if (server.grants?.client_overrides) {
      for (const clientKey of Object.keys(server.grants.client_overrides)) {
        if (!clients.has(clientKey)) {
          throw new Error(
            `Server "${slug}" has a grant override for unknown client "${clientKey}"`
          );
        }
      }
    }
  }
}

export function deriveHostname(
  ecosystem: EcosystemConfig,
  slug: string
): string {
  return ecosystem.domain.server_host_pattern
    .replace("{slug}", slug)
    .replace("{base_domain}", ecosystem.domain.base_domain);
}

export function deriveCanonicalResourceUri(
  ecosystem: EcosystemConfig,
  slug: string
): string {
  return `https://${deriveHostname(ecosystem, slug)}`;
}

export function deriveMcpEndpoint(
  ecosystem: EcosystemConfig,
  slug: string
): string {
  return `${deriveCanonicalResourceUri(ecosystem, slug)}/mcp`;
}

export function deriveProtectedResourceMetadataUrl(
  ecosystem: EcosystemConfig,
  slug: string
): string {
  return `${deriveCanonicalResourceUri(ecosystem, slug)}/.well-known/oauth-protected-resource`;
}

export function resolveScopes(
  ecosystem: EcosystemConfig,
  server: ServerConfig
): string[] {
  const profileScopes = server.scope_profile
    ? (ecosystem.defaults.scope_profiles[server.scope_profile] ?? [])
    : [];
  const extraScopes = server.extra_scopes ?? [];
  return [...new Set([...profileScopes, ...extraScopes])];
}

export function resolveClientGroupMembers(
  ecosystem: EcosystemConfig,
  groupName: string
): string[] {
  return ecosystem.client_groups?.[groupName] ?? [];
}

export interface ResolvedGrantTarget {
  clientKey: string;
  scopes: string[];
  subjectType: "user" | "client";
}

export function resolveGrantTargets(
  ecosystem: EcosystemConfig,
  server: ServerConfig,
  clientConfigs: Map<string, ClientConfig>
): ResolvedGrantTarget[] {
  const allScopes = resolveScopes(ecosystem, server);
  const targets = new Map<string, ResolvedGrantTarget>();

  if (server.grants?.client_groups) {
    for (const group of server.grants.client_groups) {
      const members = resolveClientGroupMembers(ecosystem, group);
      for (const clientKey of members) {
        const client = clientConfigs.get(clientKey);
        if (!client) continue;
        const profile = resolveClientProfile(ecosystem, client);
        targets.set(clientKey, {
          clientKey,
          scopes: [...allScopes],
          subjectType: profile?.access_mode === "machine" ? "client" : "user",
        });
      }
    }
  }

  if (server.grants?.client_overrides) {
    for (const [clientKey, scopes] of Object.entries(
      server.grants.client_overrides
    )) {
      const client = clientConfigs.get(clientKey);
      if (!client) continue;
      const profile = resolveClientProfile(ecosystem, client);
      targets.set(clientKey, {
        clientKey,
        scopes,
        subjectType: profile?.access_mode === "machine" ? "client" : "user",
      });
    }
  }

  return [...targets.values()];
}

function resolveClientProfile(
  ecosystem: EcosystemConfig,
  client: ClientConfig
) {
  return ecosystem.defaults.client_profiles?.[client.profile];
}

function collectRequiredEnvIssue(
  issues: Array<{ key: string; example: string; reason: string }>,
  key: string,
  value: string,
  required: boolean | undefined,
  missingReason: string,
  example: string
): void {
  if (!required) return;

  if (!value.trim()) {
    issues.push({
      key,
      example,
      reason: missingReason,
    });
    return;
  }

  if (isPlaceholderEnvValue(key, value)) {
    issues.push({
      key,
      example,
      reason:
        `Still set to the template placeholder "${getEnvPlaceholder(key)}". ` +
        "Replace it with your real deployment value before continuing.",
    });
  }
}
