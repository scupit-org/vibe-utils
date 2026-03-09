import type { CommandContext } from "../utils/index.js";
import { logger } from "../utils/index.js";
import {
  assertRequiredEcosystemEnv,
  deriveResourceUris,
  resolveClientAccessPolicy,
  resolveScopes,
  resolveUseTrailingSlash,
} from "../config/index.js";
import { reconcileClient } from "./reconcile-client.js";
import { assertNoManagedClientCredentialsOutsideManagedBlock } from "./env-root-validation.js";
import { loadValidatedCachedClientApplication } from "./validated-client-cache.js";

export interface GrantClientResult {
  serverSlug: string;
  clientKey: string;
  clientId: string;
  audience: string;
  action: "created" | "updated" | "unchanged" | "dry_run";
  scopes: string[];
  subjectType: string;
}

export async function grantClient(
  ctx: CommandContext,
  serverSlug: string,
  clientKey: string,
  scopes?: string[]
): Promise<GrantClientResult[]> {
  const { config, auth0, dryRun } = ctx;
  assertNoManagedClientCredentialsOutsideManagedBlock(ctx);

  const serverConfig = config.serverConfigs.get(serverSlug);
  if (!serverConfig) {
    throw new Error(`Unknown server slug: "${serverSlug}"`);
  }

  const clientConfig = config.clientConfigs.get(clientKey);
  if (!clientConfig) {
    throw new Error(`Unknown client key: "${clientKey}"`);
  }

  assertRequiredEcosystemEnv(config.ecosystem, {
    context: `grant access to server "${serverSlug}"`,
    requireBaseDomain: true,
  });
  const mode = resolveUseTrailingSlash(config.ecosystem, serverConfig);
  const audiences = deriveResourceUris(
    config.ecosystem,
    serverConfig.slug,
    mode
  );

  const grantScopes =
    scopes && scopes.length > 0
      ? scopes
      : resolveScopes(config.ecosystem, serverConfig);

  const profileDef =
    config.ecosystem.defaults.client_profiles?.[clientConfig.profile];
  const subjectType =
    profileDef?.access_mode === "machine" ? "client" : "user";

  if (
    subjectType === "client" &&
    resolveClientAccessPolicy(config.ecosystem, serverConfig) === "deny_all"
  ) {
    throw new Error(
      `Server "${serverSlug}" has effective client access policy deny_all.\n\n` +
        `  Machine-to-machine grants are disabled for this server.\n` +
        `  Set access_policy.client or defaults.api.client_access_policy to "require_client_grant"\n` +
        `  before creating a client grant for "${clientKey}".`
    );
  }

  let clientId = (await loadValidatedCachedClientApplication(ctx, clientKey))
    ?.client_id;

  if (!clientId) {
    logger.info(`Ensuring client "${clientKey}" exists...`);
    const result = await reconcileClient(ctx, clientKey);
    clientId = result.clientId;
  }

  if (!clientId || clientId === "__DRY_RUN__") {
    return audiences.map((audience) => ({
      serverSlug,
      clientKey,
      clientId: clientId ?? "__DRY_RUN__",
      audience,
      action: "dry_run" as const,
      scopes: grantScopes,
      subjectType,
    }));
  }

  logger.info(
    `Reconciling grant: ${clientKey} -> ${serverSlug} (${subjectType})`
  );
  logger.debug(`  Audiences: ${audiences.join(", ")}`);
  logger.debug(`  Scopes: ${grantScopes.join(", ")}`);

  const results: GrantClientResult[] = [];

  for (const audience of audiences) {
    const existing = await auth0.findClientGrant(
      clientId,
      audience,
      subjectType
    );

    if (existing) {
      const existingSet = new Set(existing.scope);
      const desiredSet = new Set(grantScopes);
      const equal =
        existingSet.size === desiredSet.size &&
        [...desiredSet].every((s) => existingSet.has(s));

      if (equal) {
        logger.info(`Grant for ${audience} exists and is up to date.`);
        results.push({
          serverSlug,
          clientKey,
          clientId,
          audience,
          action: "unchanged",
          scopes: grantScopes,
          subjectType,
        });
        continue;
      }

      if (dryRun) {
        logger.info(`[DRY RUN] Would update grant for ${audience}.`);
        results.push({
          serverSlug,
          clientKey,
          clientId,
          audience,
          action: "dry_run",
          scopes: grantScopes,
          subjectType,
        });
        continue;
      }

      await auth0.updateClientGrant(existing.id, { scope: grantScopes });
      logger.success(`Grant for ${audience} updated.`);
      results.push({
        serverSlug,
        clientKey,
        clientId,
        audience,
        action: "updated",
        scopes: grantScopes,
        subjectType,
      });
      continue;
    }

    if (dryRun) {
      logger.info(`[DRY RUN] Would create grant for ${audience}.`);
      results.push({
        serverSlug,
        clientKey,
        clientId,
        audience,
        action: "dry_run",
        scopes: grantScopes,
        subjectType,
      });
      continue;
    }

    await auth0.createClientGrant({
      client_id: clientId,
      audience,
      scope: grantScopes,
      subject_type: subjectType,
    });
    logger.success(`Grant for ${audience} created.`);
    results.push({
      serverSlug,
      clientKey,
      clientId,
      audience,
      action: "created",
      scopes: grantScopes,
      subjectType,
    });
  }

  return results;
}
