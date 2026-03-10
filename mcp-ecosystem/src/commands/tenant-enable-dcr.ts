import type { CommandContext } from "../utils/index.js";
import { logger } from "../utils/index.js";
import {
  authenticateAndFetchTenantSettings,
  getDcrEnabled,
} from "./tenant-dcr-helpers.js";

export type TenantEnableDcrAction =
  | "enabled"
  | "already_enabled"
  | "dry_run";

export interface TenantEnableDcrResult {
  tenantDomain: string;
  dcrEnabled: true;
  action: TenantEnableDcrAction;
}

/**
 * Enable Dynamic Client Registration on the Auth0 tenant.
 * Uses PATCH /tenants/settings with flags.enable_dynamic_client_registration = true.
 * Requires the M2M app to have update:tenant_settings scope.
 */
export async function tenantEnableDcr(
  ctx: CommandContext
): Promise<TenantEnableDcrResult> {
  const { auth0, dryRun } = ctx;

  logger.info(`Enabling DCR for tenant: ${ctx.config.ecosystem.auth0.tenant_domain}`);
  logger.blank();

  const { tenantSettings, tenantDomain } =
    await authenticateAndFetchTenantSettings(ctx);

  const dcrEnabled = getDcrEnabled(tenantSettings);

  if (dcrEnabled) {
    logger.info("Dynamic Client Registration is already enabled.");
    return {
      tenantDomain,
      dcrEnabled: true,
      action: "already_enabled",
    };
  }

  if (dryRun) {
    logger.info("[DRY RUN] Would enable Dynamic Client Registration.");
    return {
      tenantDomain,
      dcrEnabled: true,
      action: "dry_run",
    };
  }

  logger.info("Enabling Dynamic Client Registration...");
  await auth0.patchDcrEnabled(true);
  logger.success("Dynamic Client Registration has been enabled.");

  return {
    tenantDomain,
    dcrEnabled: true,
    action: "enabled",
  };
}
