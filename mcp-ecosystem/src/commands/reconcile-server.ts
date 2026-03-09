import type { CommandContext } from "../utils/index.js";
import { logger } from "../utils/index.js";
import {
  assertRequiredEcosystemEnv,
  deriveResourceUris,
  resolveClientAccessPolicy,
  resolveScopes,
  resolveGrantTargets,
  resolveUseTrailingSlash,
} from "../config/index.js";
import type { ServerConfig, Auth0Api } from "../types/index.js";
import type {
  Auth0ApiScope,
  Auth0ApiSubjectTypeAuthorization,
} from "../types/auth0-responses.js";
import { reconcileClient } from "./reconcile-client.js";
import { assertNoManagedClientCredentialsOutsideManagedBlock } from "./env-root-validation.js";
import { loadValidatedCachedClientApplication } from "./validated-client-cache.js";

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  "resources.read": "Read MCP resources",
  "prompts.read": "Read MCP prompts",
  "tools.read": "Execute read-only tools",
  "tools.write": "Execute mutating tools",
};

export interface Auth0ApiInstanceResult {
  apiIdentifier: string;
  auth0ApiId: string;
  action: "created" | "updated" | "unchanged" | "dry_run";
  grantResults: GrantResult[];
}

export interface ReconcileServerResult {
  slug: string;
  scopes: string[];
  auth0ApiInstances: Auth0ApiInstanceResult[];
}

export interface GrantResult {
  clientKey: string;
  clientId: string;
  action: "created" | "updated" | "unchanged" | "dry_run";
  scopes: string[];
  subjectType: string;
}

export async function reconcileServer(
  ctx: CommandContext,
  serverSlug: string
): Promise<ReconcileServerResult> {
  const { config } = ctx;
  assertNoManagedClientCredentialsOutsideManagedBlock(ctx);
  const serverConfig = config.serverConfigs.get(serverSlug);
  if (!serverConfig) {
    throw new Error(`Unknown server slug: "${serverSlug}"`);
  }

  const ecosystem = config.ecosystem;
  assertRequiredEcosystemEnv(ecosystem, {
    context: `reconcile server "${serverSlug}"`,
    requireBaseDomain: true,
  });
  const mode = resolveUseTrailingSlash(ecosystem, serverConfig);
  const identifiers = deriveResourceUris(
    ecosystem,
    serverConfig.slug,
    mode
  );
  const allScopes = resolveScopes(ecosystem, serverConfig);

  logger.info(
    `Reconciling server: ${serverConfig.name} (${serverConfig.slug})`
  );
  logger.debug(`  Identifiers: ${identifiers.join(", ")}`);
  logger.debug(`  Scopes: ${allScopes.join(", ")}`);

  // ── Phase 1: Reconcile Auth0 API(s) ──

  const apiResults: Array<{
    auth0ApiId: string;
    action: "created" | "updated" | "unchanged" | "dry_run";
  }> = [];
  for (const identifier of identifiers) {
    const apiResult = await reconcileApi(
      ctx,
      serverConfig,
      identifier,
      allScopes
    );
    apiResults.push(apiResult);
  }

  // ── Phase 2: Reconcile access policy ──

  for (const apiResult of apiResults) {
    if (apiResult.action !== "dry_run") {
      await reconcileAccessPolicy(ctx, apiResult.auth0ApiId, serverConfig);
    }
  }

  // ── Phase 3: Reconcile client grants ──

  const grantTargets = resolveGrantTargets(
    ecosystem,
    serverConfig,
    config.clientConfigs
  );

  const grantResultsByApi: GrantResult[][] = identifiers.map(() => []);

  for (const target of grantTargets) {
    const clientConfig = config.clientConfigs.get(target.clientKey);
    if (!clientConfig) {
      logger.warn(
        `  Skipping grant for unknown client: ${target.clientKey}`
      );
      continue;
    }

    let clientId = (
      await loadValidatedCachedClientApplication(ctx, target.clientKey)
    )?.client_id;

    if (!clientId) {
      logger.info(`  Ensuring client "${target.clientKey}" exists...`);
      const clientResult = await reconcileClient(ctx, target.clientKey);
      clientId = clientResult.clientId;
    }

    if (!clientId || clientId === "__DRY_RUN__") {
      const dryRunGrant: GrantResult = {
        clientKey: target.clientKey,
        clientId: clientId ?? "__DRY_RUN__",
        action: "dry_run",
        scopes: target.scopes,
        subjectType: target.subjectType,
      };
      for (let i = 0; i < identifiers.length; i++) {
        grantResultsByApi[i].push(dryRunGrant);
      }
      continue;
    }

    if (
      target.subjectType === "client" &&
      resolveClientAccessPolicy(ecosystem, serverConfig) === "deny_all"
    ) {
      logger.warn(
        `  Server "${serverSlug}" has effective client access policy deny_all. ` +
          `Skipping M2M grant for "${target.clientKey}". ` +
          `Set access_policy.client or defaults.api.client_access_policy to "require_client_grant" to enable.`
      );
      continue;
    }

    for (let i = 0; i < identifiers.length; i++) {
      const grantResult = await reconcileGrant(
        ctx,
        target.clientKey,
        clientId,
        identifiers[i],
        target.scopes,
        target.subjectType
      );
      grantResultsByApi[i].push(grantResult);
    }
  }

  // ── Phase 4: Clean up stale grants ──

  const anyDryRun = apiResults.some((r) => r.action === "dry_run");
  if (!anyDryRun) {
    for (let i = 0; i < identifiers.length; i++) {
      await cleanupStaleGrants(ctx, identifiers[i], grantResultsByApi[i]);
    }
  }

  logger.blank();
  logger.success(`Server "${serverConfig.name}" reconciliation complete.`);

  return {
    slug: serverConfig.slug,
    scopes: allScopes,
    auth0ApiInstances: identifiers.map((identifier, i) => ({
      apiIdentifier: identifier,
      auth0ApiId: apiResults[i].auth0ApiId,
      action: apiResults[i].action,
      grantResults: grantResultsByApi[i],
    })),
  };
}

async function reconcileApi(
  ctx: CommandContext,
  server: ServerConfig,
  identifier: string,
  scopes: string[]
): Promise<{
  auth0ApiId: string;
  action: "created" | "updated" | "unchanged" | "dry_run";
}> {
  const { config, auth0, dryRun } = ctx;
  const ecosystem = config.ecosystem;

  const signingAlg = ecosystem.defaults.api.signing_alg;
  const tokenDialect = ecosystem.defaults.api.token_dialect;

  const scopePayload: Auth0ApiScope[] = scopes.map((s) => ({
    value: s,
    description: SCOPE_DESCRIPTIONS[s] ?? `Scope: ${s}`,
  }));

  logger.info("  Searching for existing Auth0 API by identifier...");
  const existing = await auth0.findApiByIdentifier(identifier);

  if (existing) {
    logger.info(`  Found existing API: ${existing.name} (${existing.id})`);
    return reconcileExistingApi(
      ctx,
      existing,
      server,
      scopePayload,
      signingAlg,
      tokenDialect
    );
  }

  if (server.auth0?.create_api_if_missing === false) {
    throw new Error(
      `No Auth0 API found for identifier "${identifier}" and create_api_if_missing is false.`
    );
  }

  if (dryRun) {
    logger.info("  [DRY RUN] Would create Auth0 API.");
    return { auth0ApiId: "__DRY_RUN__", action: "dry_run" };
  }

  logger.info("  Creating Auth0 API...");
  const newApi = await auth0.createApi({
    name: server.name,
    identifier,
    signing_alg: signingAlg,
    token_dialect: tokenDialect,
    enforce_policies: true,
    scopes: scopePayload,
    subject_type_authorization: buildSubjectTypeAuthorization(server, config.ecosystem.defaults.api),
  });

  logger.success(`  API created: ${newApi.name} (${newApi.id})`);
  return { auth0ApiId: newApi.id, action: "created" };
}

async function reconcileExistingApi(
  ctx: CommandContext,
  existing: Auth0Api,
  _server: ServerConfig,
  desiredScopes: Auth0ApiScope[],
  signingAlg: string,
  tokenDialect: string
): Promise<{
  auth0ApiId: string;
  action: "updated" | "unchanged" | "dry_run";
}> {
  const { auth0, dryRun } = ctx;

  const needsUpdate =
    existing.signing_alg !== signingAlg ||
    existing.token_dialect !== tokenDialect ||
    !scopesMatch(existing.scopes ?? [], desiredScopes);

  if (!needsUpdate) {
    logger.info("  API is up to date.");
    return { auth0ApiId: existing.id, action: "unchanged" };
  }

  if (dryRun) {
    logger.info("  [DRY RUN] Would update Auth0 API.");
    return { auth0ApiId: existing.id, action: "dry_run" };
  }

  logger.info("  Updating Auth0 API...");
  await auth0.updateApi(existing.id, {
    signing_alg: signingAlg,
    token_dialect: tokenDialect,
    enforce_policies: true,
    scopes: desiredScopes,
  });

  logger.success("  API updated.");
  return { auth0ApiId: existing.id, action: "updated" };
}

function scopesMatch(
  existing: Auth0ApiScope[],
  desired: Auth0ApiScope[]
): boolean {
  const existingValues = new Set(existing.map((s) => s.value));
  const desiredValues = new Set(desired.map((s) => s.value));
  if (existingValues.size !== desiredValues.size) return false;
  for (const v of desiredValues) {
    if (!existingValues.has(v)) return false;
  }
  return true;
}

async function reconcileAccessPolicy(
  ctx: CommandContext,
  apiId: string,
  server: ServerConfig
): Promise<void> {
  const { auth0, dryRun, config } = ctx;
  const subject_type_authorization = buildSubjectTypeAuthorization(
    server,
    config.ecosystem.defaults.api
  );

  logger.info(
    `  Access policy: user=${subject_type_authorization.user?.policy}, client=${subject_type_authorization.client?.policy}`
  );

  if (dryRun) {
    logger.info("  [DRY RUN] Would update access policy.");
    return;
  }

  await auth0.updateApi(apiId, { subject_type_authorization });
  logger.success("  Access policy updated.");
}

function buildSubjectTypeAuthorization(
  server: ServerConfig,
  apiDefaults: {
    user_access_policy: string;
    client_access_policy: string;
  }
): Auth0ApiSubjectTypeAuthorization {
  const userPolicy = (server.access_policy?.user ??
    apiDefaults.user_access_policy) as "allow_all" | "require_client_grant" | "deny_all";
  const clientPolicy = (server.access_policy?.client ??
    apiDefaults.client_access_policy) as "require_client_grant" | "deny_all";

  return {
    user: { policy: userPolicy },
    client: { policy: clientPolicy },
  };
}

async function reconcileGrant(
  ctx: CommandContext,
  clientKey: string,
  clientId: string,
  audience: string,
  scopes: string[],
  subjectType: string
): Promise<GrantResult> {
  const { auth0, dryRun } = ctx;

  logger.info(
    `  Reconciling grant: ${clientKey} -> ${audience} (${subjectType})`
  );
  logger.debug(`    Scopes: ${scopes.join(", ")}`);

  const existingGrant = await auth0.findClientGrant(
    clientId,
    audience,
    subjectType
  );

  if (existingGrant) {
    const existingScopes = new Set(existingGrant.scope);
    const desiredScopes = new Set(scopes);
    const scopesEqual =
      existingScopes.size === desiredScopes.size &&
      [...desiredScopes].every((s) => existingScopes.has(s));

    if (scopesEqual) {
      logger.info(`    Grant exists and is up to date.`);
      return {
        clientKey,
        clientId,
        action: "unchanged",
        scopes,
        subjectType,
      };
    }

    if (dryRun) {
      logger.info(`    [DRY RUN] Would update grant scopes.`);
      return { clientKey, clientId, action: "dry_run", scopes, subjectType };
    }

    logger.info(`    Updating grant scopes...`);
    await auth0.updateClientGrant(existingGrant.id, { scope: scopes });
    logger.success(`    Grant updated.`);
    return { clientKey, clientId, action: "updated", scopes, subjectType };
  }

  if (dryRun) {
    logger.info(`    [DRY RUN] Would create grant.`);
    return { clientKey, clientId, action: "dry_run", scopes, subjectType };
  }

  logger.info(`    Creating grant...`);
  await auth0.createClientGrant({
    client_id: clientId,
    audience,
    scope: scopes,
    subject_type: subjectType,
  });
  logger.success(`    Grant created.`);

  return { clientKey, clientId, action: "created", scopes, subjectType };
}

async function cleanupStaleGrants(
  ctx: CommandContext,
  audience: string,
  reconciledGrants: GrantResult[]
): Promise<void> {
  const { auth0, dryRun } = ctx;

  const existingGrants = await auth0.listClientGrants({ audience });

  const reconciledKeys = new Set(
    reconciledGrants
      .filter((g) => g.action !== "dry_run")
      .map((g) => `${g.clientId}:${g.subjectType}`)
  );

  for (const grant of existingGrants) {
    const key = `${grant.client_id}:${grant.subject_type ?? "user"}`;
    if (reconciledKeys.has(key)) continue;

    if (dryRun) {
      logger.info(
        `  [DRY RUN] Would remove stale grant: ${grant.client_id} (${grant.subject_type ?? "user"})`
      );
      continue;
    }

    logger.info(
      `  Removing stale grant: ${grant.client_id} (${grant.subject_type ?? "user"})`
    );
    await auth0.deleteClientGrant(grant.id);
    logger.success(`  Stale grant removed.`);
  }
}
