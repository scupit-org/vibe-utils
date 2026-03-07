import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandContext } from "../utils/index.js";
import { logger } from "../utils/index.js";
import {
  assertRequiredEcosystemEnv,
  deriveCanonicalResourceUri,
  resolveScopes,
} from "../config/index.js";
import type { ServerConfig } from "../types/index.js";

export interface AddScopeResult {
  slug: string;
  scope: string;
  action: "added" | "already_present" | "dry_run";
  finalScopes: string[];
}

export async function addScope(
  ctx: CommandContext,
  serverSlug: string,
  scope: string
): Promise<AddScopeResult> {
  const { config, auth0, dryRun, rootDir } = ctx;
  const serverConfig = config.serverConfigs.get(serverSlug);
  if (!serverConfig) {
    throw new Error(`Unknown server slug: "${serverSlug}"`);
  }

  const currentScopes = resolveScopes(config.ecosystem, serverConfig);

  if (currentScopes.includes(scope)) {
    logger.info(
      `Scope "${scope}" is already present on server "${serverSlug}".`
    );
    return {
      slug: serverSlug,
      scope,
      action: "already_present",
      finalScopes: currentScopes,
    };
  }

  assertRequiredEcosystemEnv(config.ecosystem, {
    context: `derive URLs for server "${serverSlug}"`,
    requireBaseDomain: true,
  });
  const newExtraScopes = [...(serverConfig.extra_scopes ?? []), scope];
  const fullDesiredScopes = [...new Set([...currentScopes, scope])];

  logger.info(
    `Adding scope "${scope}" to server "${serverSlug}".`
  );
  logger.debug(`  Full scope set: ${fullDesiredScopes.join(", ")}`);

  if (dryRun) {
    logger.info("[DRY RUN] Would update local config and Auth0 API scopes.");
    return { slug: serverSlug, scope, action: "dry_run", finalScopes: fullDesiredScopes };
  }

  // Update local config file
  const serverDir = findServerDir(rootDir, serverSlug, serverConfig);
  const configPath = join(serverDir, "mcp-configuration.json");
  const raw = JSON.parse(await readFile(configPath, "utf-8")) as Record<string, unknown>;
  raw["extra_scopes"] = newExtraScopes;
  await writeFile(configPath, JSON.stringify(raw, null, 2) + "\n", "utf-8");
  logger.success(`  Local config updated: ${configPath}`);

  // Update Auth0 API scopes (full replacement)
  const identifier = deriveCanonicalResourceUri(
    config.ecosystem,
    serverConfig.slug
  );
  const existingApi = await auth0.findApiByIdentifier(identifier);
  if (existingApi) {
    const scopePayload = fullDesiredScopes.map((s) => ({
      value: s,
      description: `Scope: ${s}`,
    }));
    await auth0.updateApi(existingApi.id, { scopes: scopePayload });
    logger.success("  Auth0 API scopes updated.");
  } else {
    logger.warn(
      "  Auth0 API not found for this server. Run reconcile-server to create it."
    );
  }

  return { slug: serverSlug, scope, action: "added", finalScopes: fullDesiredScopes };
}

function findServerDir(
  rootDir: string,
  slug: string,
  _server: ServerConfig
): string {
  return join(rootDir, "mcps", slug);
}
