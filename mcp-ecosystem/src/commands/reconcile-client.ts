import { join } from "node:path";
import type { CommandContext } from "../utils/index.js";
import { logger, clientIdEnvVar, clientSecretEnvVar } from "../utils/index.js";
import type {
  ClientConfig,
  ClientDescriptor,
  ClientProfile,
  EcosystemConfig,
  Auth0Application,
  ReusePolicy,
} from "../types/index.js";
import { assertNoManagedClientCredentialsOutsideManagedBlock } from "./env-root-validation.js";
import {
  expectedManagedClientMetadata,
  loadValidatedCachedClientApplication,
  MANAGED_BY,
} from "./validated-client-cache.js";

export type ClientSecretStatus =
  | "not_applicable"
  | "dry_run"
  | "written"
  | "matched_existing_managed"
  | "skipped_existing_managed";

export interface ReconcileClientResult {
  clientKey: string;
  clientId: string;
  action: "created" | "reused" | "patched" | "dry_run";
  applicationType: string;
  tokenEndpointAuthMethod: string;
  secretWritten: boolean;
  secretStatus: ClientSecretStatus;
}

interface ResolvedClientSettings {
  appType: string;
  grantTypes: string[];
  tokenEndpointAuthMethod: string;
  callbackUrls: string[];
  logoutUrls: string[];
  webOrigins: string[];
  useRefreshTokens: boolean;
  refreshTokenRotation: boolean;
  accessMode: "user" | "machine";
}

export async function reconcileClient(
  ctx: CommandContext,
  clientKey: string
): Promise<ReconcileClientResult> {
  const { config, auth0, envManager, dryRun } = ctx;
  assertNoManagedClientCredentialsOutsideManagedBlock(ctx);

  const clientConfig = config.clientConfigs.get(clientKey);
  if (!clientConfig) {
    throw new Error(`Unknown client key: "${clientKey}"`);
  }

  const descriptor = clientConfig.descriptor
    ? config.clientDescriptors.get(clientConfig.descriptor)
    : undefined;

  const settings = resolveSettings(config.ecosystem, clientConfig, descriptor);

  logger.info(`Reconciling client: ${clientConfig.display_name} (${clientKey})`);
  logger.debug(`  Profile: ${clientConfig.profile}`);
  logger.debug(`  App type: ${settings.appType}`);
  logger.debug(`  Auth method: ${settings.tokenEndpointAuthMethod}`);

  const idEnvKey = clientIdEnvVar(clientKey);
  const expectedMetadata = expectedManagedClientMetadata(
    config.ecosystem,
    clientConfig
  );
  const existing = await loadValidatedCachedClientApplication(ctx, clientKey);

  if (existing) {
    logger.info(`  Using existing client_id from ${idEnvKey}: ${existing.client_id}`);
    const reuse = checkCompatibility(existing, settings);
    if (!reuse.compatible) {
      logger.warn(
        `  Existing application is NOT fully compatible: ${reuse.reason}`
      );
      const policy = resolveReusePolicy(clientConfig, descriptor);
      if (policy === "patch_if_safe") {
        if (dryRun) {
          logger.info("  [DRY RUN] Would patch existing application.");
          return {
            clientKey,
            clientId: existing.client_id,
            action: "dry_run",
            applicationType: settings.appType,
            tokenEndpointAuthMethod: settings.tokenEndpointAuthMethod,
            secretWritten: false,
            secretStatus: "not_applicable",
          };
        }

        logger.info("  Attempting safe patch...");
        await patchApplication(auth0, existing, settings, config.ecosystem, clientConfig);
        logger.success("  Application patched.");
        assertManagedClientEnvWrite(
          envManager.set(idEnvKey, existing.client_id, {
            rejectOuterCollision: true,
          }),
          ctx.rootDir
        );
        return {
          clientKey,
          clientId: existing.client_id,
          action: "patched",
          applicationType: settings.appType,
          tokenEndpointAuthMethod: settings.tokenEndpointAuthMethod,
          secretWritten: false,
          secretStatus: "not_applicable",
        };
      }
      logger.warn("  Reusing as-is (policy does not allow patching).");
    }
    assertManagedClientEnvWrite(
      envManager.set(idEnvKey, existing.client_id, {
        rejectOuterCollision: true,
      }),
      ctx.rootDir
    );
    return {
      clientKey,
      clientId: existing.client_id,
      action: "reused",
      applicationType: settings.appType,
      tokenEndpointAuthMethod: settings.tokenEndpointAuthMethod,
      secretWritten: false,
      secretStatus: "not_applicable",
    };
  }

  logger.info("  Searching for existing Auth0 application by metadata...");
  const existingApp = await auth0.findApplicationByMetadataEntries(
    expectedMetadata
  );

  if (existingApp) {
    logger.info(
      `  Found existing application: ${existingApp.name} (${existingApp.client_id})`
    );
    const reuse = checkCompatibility(existingApp, settings);
    if (reuse.compatible) {
      logger.success("  Application is compatible. Reusing.");
      assertManagedClientEnvWrite(
        envManager.set(idEnvKey, existingApp.client_id, {
          rejectOuterCollision: true,
        }),
        ctx.rootDir
      );
      return {
        clientKey,
        clientId: existingApp.client_id,
        action: "reused",
        applicationType: settings.appType,
        tokenEndpointAuthMethod: settings.tokenEndpointAuthMethod,
        secretWritten: false,
        secretStatus: "not_applicable",
      };
    }

    logger.warn(`  Existing application is not compatible: ${reuse.reason}`);
    const policy = resolveReusePolicy(clientConfig, descriptor);
    if (policy === "patch_if_safe") {
      if (dryRun) {
        logger.info("  [DRY RUN] Would patch existing application.");
        return {
          clientKey,
          clientId: existingApp.client_id,
          action: "dry_run",
          applicationType: settings.appType,
          tokenEndpointAuthMethod: settings.tokenEndpointAuthMethod,
          secretWritten: false,
          secretStatus: "not_applicable",
        };
      }
      logger.info("  Patching existing application...");
      await patchApplication(auth0, existingApp, settings, config.ecosystem, clientConfig);
      logger.success("  Application patched.");
      assertManagedClientEnvWrite(
        envManager.set(idEnvKey, existingApp.client_id, {
          rejectOuterCollision: true,
        }),
        ctx.rootDir
      );
      return {
        clientKey,
        clientId: existingApp.client_id,
        action: "patched",
        applicationType: settings.appType,
        tokenEndpointAuthMethod: settings.tokenEndpointAuthMethod,
        secretWritten: false,
        secretStatus: "not_applicable",
      };
    }

    if (policy === "share_if_exact_match") {
      logger.warn(
        "  Exact match required but not met. Creating a new application."
      );
    }
  } else {
    logger.info("  No existing application found.");
  }

  if (!clientConfig.auth0.create_if_missing) {
    throw new Error(
      `No compatible Auth0 Application found for "${clientKey}" and create_if_missing is false.`
    );
  }

  if (dryRun) {
    logger.info("  [DRY RUN] Would create a new Auth0 Application.");
    return {
      clientKey,
      clientId: "__DRY_RUN__",
      action: "dry_run",
      applicationType: settings.appType,
      tokenEndpointAuthMethod: settings.tokenEndpointAuthMethod,
      secretWritten: false,
      secretStatus: isConfidential(settings) ? "dry_run" : "not_applicable",
    };
  }

  logger.info("  Creating new Auth0 Application...");
  const newApp = await auth0.createApplication({
    name: clientConfig.display_name,
    app_type: settings.appType,
    oidc_conformant: true,
    token_endpoint_auth_method: settings.tokenEndpointAuthMethod,
    grant_types: settings.grantTypes,
    callbacks: settings.callbackUrls.length > 0 ? settings.callbackUrls : undefined,
    allowed_logout_urls:
      settings.logoutUrls.length > 0 ? settings.logoutUrls : undefined,
    web_origins:
      settings.webOrigins.length > 0 ? settings.webOrigins : undefined,
    client_metadata: {
      ecosystem: config.ecosystem.ecosystem_name,
      client_key: clientKey,
      descriptor: clientConfig.descriptor ?? "",
      profile: clientConfig.profile,
      managed_by: MANAGED_BY,
    },
    ...(settings.useRefreshTokens && {
      refresh_token: {
        rotation_type: settings.refreshTokenRotation
          ? "rotating"
          : "non-rotating",
        expiration_type: "expiring",
      },
    }),
  });

  logger.success(
    `  Application created: ${newApp.name} (${newApp.client_id})`
  );

  assertManagedClientEnvWrite(
    envManager.set(idEnvKey, newApp.client_id, {
      rejectOuterCollision: true,
    }),
    ctx.rootDir
  );

  let secretWritten = false;
  let secretStatus: ClientSecretStatus = "not_applicable";
  if (isConfidential(settings) && newApp.client_secret) {
    const secretEnvKey = clientSecretEnvVar(clientKey);
    const secretWriteResult = envManager.set(secretEnvKey, newApp.client_secret, {
      writeOnce: true,
      rejectOuterCollision: true,
    });

    switch (secretWriteResult.status) {
      case "created":
      case "updated":
        secretWritten = true;
        secretStatus = "written";
        logger.success(`  Client secret captured in ${secretEnvKey}.`);
        break;
      case "matched_existing_managed":
        secretStatus = "matched_existing_managed";
        logger.info(`  Client secret already present in managed ${secretEnvKey}.`);
        break;
      case "skipped_existing_managed":
        secretStatus = "skipped_existing_managed";
        logger.warn(
          `  Client secret already exists in managed ${secretEnvKey}. ` +
            `Preserving the existing write-once value.`
        );
        break;
      case "rejected_outer_collision":
        throw new Error(
          buildUnexpectedOuterCollisionError(
            secretEnvKey,
            ctx.rootDir,
            secretWriteResult.outerAssignments?.map((assignment) => assignment.rawLine) ?? []
          )
        );
    }
  }

  return {
    clientKey,
    clientId: newApp.client_id,
    action: "created",
    applicationType: settings.appType,
    tokenEndpointAuthMethod: settings.tokenEndpointAuthMethod,
    secretWritten,
    secretStatus,
  };
}

function resolveSettings(
  ecosystem: EcosystemConfig,
  client: ClientConfig,
  descriptor?: ClientDescriptor
): ResolvedClientSettings {
  const profileDef = ecosystem.defaults.client_profiles?.[client.profile];

  const appType = mapProfileToAppType(client.profile);
  const grantTypes = resolveGrantTypes(client.profile, descriptor);
  const tokenEndpointAuthMethod =
    client.application_settings?.token_endpoint_auth_method ??
    profileDef?.token_endpoint_auth_method ??
    (isPublicProfile(client.profile) ? "none" : "client_secret_post");

  const callbackUrls =
    client.application_settings?.callback_urls ??
    descriptor?.callback_urls ??
    [];
  const logoutUrls =
    client.application_settings?.logout_urls ??
    descriptor?.logout_urls ??
    [];
  const webOrigins =
    client.application_settings?.web_origins ??
    descriptor?.web_origins ??
    [];

  const useRefreshTokens =
    client.token_settings?.use_refresh_tokens ??
    descriptor?.requires_refresh_tokens ??
    profileDef?.use_refresh_tokens ??
    false;

  const refreshTokenRotation =
    client.token_settings?.refresh_token_rotation ??
    descriptor?.requires_refresh_token_rotation ??
    profileDef?.refresh_token_rotation ??
    false;

  const accessMode = profileDef?.access_mode ?? descriptor?.access_mode ?? "user";

  return {
    appType,
    grantTypes,
    tokenEndpointAuthMethod,
    callbackUrls,
    logoutUrls,
    webOrigins,
    useRefreshTokens,
    refreshTokenRotation,
    accessMode,
  };
}

function mapProfileToAppType(profile: ClientProfile): string {
  const map: Record<ClientProfile, string> = {
    native_interactive: "native",
    spa_interactive: "spa",
    regular_web_interactive: "regular_web",
    service_m2m: "non_interactive",
  };
  return map[profile];
}

function resolveGrantTypes(
  profile: ClientProfile,
  descriptor?: ClientDescriptor
): string[] {
  const grants: string[] = [];

  switch (profile) {
    case "native_interactive":
      grants.push("authorization_code", "refresh_token");
      if (descriptor?.supports_device_flow) grants.push("urn:ietf:params:oauth:grant-type:device_code");
      break;
    case "spa_interactive":
      grants.push("authorization_code", "refresh_token");
      break;
    case "regular_web_interactive":
      grants.push("authorization_code", "refresh_token");
      break;
    case "service_m2m":
      grants.push("client_credentials");
      break;
  }

  return grants;
}

function isPublicProfile(profile: ClientProfile): boolean {
  return profile === "native_interactive" || profile === "spa_interactive";
}

function isConfidential(settings: ResolvedClientSettings): boolean {
  return settings.tokenEndpointAuthMethod !== "none";
}

interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
}

function checkCompatibility(
  existing: Auth0Application,
  desired: ResolvedClientSettings
): CompatibilityResult {
  if (existing.app_type !== desired.appType) {
    return {
      compatible: false,
      reason: `App type mismatch: existing="${existing.app_type}", desired="${desired.appType}"`,
    };
  }

  if (
    existing.token_endpoint_auth_method !== desired.tokenEndpointAuthMethod
  ) {
    return {
      compatible: false,
      reason: `Token endpoint auth method mismatch: existing="${existing.token_endpoint_auth_method}", desired="${desired.tokenEndpointAuthMethod}"`,
    };
  }

  for (const url of desired.callbackUrls) {
    if (!existing.callbacks?.includes(url)) {
      return {
        compatible: false,
        reason: `Missing callback URL: ${url}`,
      };
    }
  }

  for (const url of desired.logoutUrls) {
    if (!existing.allowed_logout_urls?.includes(url)) {
      return {
        compatible: false,
        reason: `Missing logout URL: ${url}`,
      };
    }
  }

  for (const url of desired.webOrigins) {
    if (!existing.web_origins?.includes(url)) {
      return {
        compatible: false,
        reason: `Missing web origin: ${url}`,
      };
    }
  }

  return { compatible: true };
}

function resolveReusePolicy(
  client: ClientConfig,
  descriptor?: ClientDescriptor
): ReusePolicy {
  if (descriptor?.reuse_policy) return descriptor.reuse_policy;
  if (client.profile === "service_m2m") return "never_share";
  return "share_if_exact_match";
}

async function patchApplication(
  auth0: { updateApplication: (id: string, payload: Partial<Auth0Application>) => Promise<Auth0Application> },
  existing: Auth0Application,
  settings: ResolvedClientSettings,
  ecosystem: EcosystemConfig,
  clientConfig: ClientConfig
): Promise<void> {
  const patch: Partial<Auth0Application> = {};

  const mergedCallbacks = mergeArrays(
    existing.callbacks ?? [],
    settings.callbackUrls
  );
  if (mergedCallbacks.length > (existing.callbacks?.length ?? 0)) {
    patch.callbacks = mergedCallbacks;
  }

  const mergedLogout = mergeArrays(
    existing.allowed_logout_urls ?? [],
    settings.logoutUrls
  );
  if (mergedLogout.length > (existing.allowed_logout_urls?.length ?? 0)) {
    patch.allowed_logout_urls = mergedLogout;
  }

  const mergedOrigins = mergeArrays(
    existing.web_origins ?? [],
    settings.webOrigins
  );
  if (mergedOrigins.length > (existing.web_origins?.length ?? 0)) {
    patch.web_origins = mergedOrigins;
  }

  patch.client_metadata = {
    ...existing.client_metadata,
    ecosystem: ecosystem.ecosystem_name,
    client_key: clientConfig.client_key,
    descriptor: clientConfig.descriptor ?? "",
    profile: clientConfig.profile,
    managed_by: MANAGED_BY,
  };

  if (Object.keys(patch).length > 0) {
    await auth0.updateApplication(existing.client_id, patch);
  }
}

function mergeArrays(existing: string[], desired: string[]): string[] {
  const set = new Set(existing);
  for (const item of desired) set.add(item);
  return [...set];
}

function assertManagedClientEnvWrite(
  result: { status: string; outerAssignments?: { rawLine: string }[]; key: string },
  rootDir: string
): void {
  if (result.status !== "rejected_outer_collision") {
    return;
  }

  throw new Error(
    buildUnexpectedOuterCollisionError(
      result.key,
      rootDir,
      result.outerAssignments?.map((assignment) => assignment.rawLine) ?? []
    )
  );
}

function buildUnexpectedOuterCollisionError(
  envKey: string,
  rootDir: string,
  rawAssignments: string[]
): string {
  const envPath = join(rootDir, ".env");
  const entries =
    rawAssignments.length > 0
      ? rawAssignments.map((line) => `    ${maskSecretAssignment(line)}`)
      : [`    ${maskSecretAssignment(`${envKey}=<user-authored-value>` )}`];

  return (
    `Invalid tool-managed client credential in ${envPath}\n\n` +
    `  ${envKey} exists outside the managed block, so the CLI refused to write a managed value.\n\n` +
    `  Remove the outer assignment and re-run reconciliation:\n` +
    `${entries.join("\n")}`
  );
}

function maskSecretAssignment(line: string): string {
  const eqIdx = line.indexOf("=");
  if (eqIdx === -1) return line;
  const key = line.slice(0, eqIdx).trim();
  return key.includes("_SECRET") ? `${key}=********` : line;
}

