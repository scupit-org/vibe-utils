import type { CommandContext } from "../utils/index.js";
import { logger } from "../utils/index.js";
import {
  authenticateAndFetchTenantSettings,
  getDcrEnabled,
} from "./tenant-dcr-helpers.js";

export type TenantDisableDcrAction =
  | "disabled"
  | "already_disabled"
  | "dry_run";

export interface TenantDisableDcrResult {
  tenantDomain: string;
  dcrEnabled: false;
  action: TenantDisableDcrAction;
}

/**
 * Disable Dynamic Client Registration on the Auth0 tenant.
 * Uses PATCH /tenants/settings with flags.enable_dynamic_client_registration = false.
 * Requires the M2M app to have update:tenant_settings scope.
 */
export async function tenantDisableDcr(
  ctx: CommandContext
): Promise<TenantDisableDcrResult> {
  const { auth0, dryRun } = ctx;

  logger.info(`Disabling DCR for tenant: ${ctx.config.ecosystem.auth0.tenant_domain}`);
  logger.blank();

  const { tenantSettings, tenantDomain } =
    await authenticateAndFetchTenantSettings(ctx);

  const dcrEnabled = getDcrEnabled(tenantSettings);

  if (!dcrEnabled) {
    logger.info("Dynamic Client Registration is already disabled.");
    return {
      tenantDomain,
      dcrEnabled: false,
      action: "already_disabled",
    };
  }

  if (dryRun) {
    logger.info("[DRY RUN] Would disable Dynamic Client Registration.");
    return {
      tenantDomain,
      dcrEnabled: false,
      action: "dry_run",
    };
  }

  logger.info("Disabling Dynamic Client Registration...");
  await auth0.patchDcrEnabled(false);
  logger.success("Dynamic Client Registration has been disabled.");

  return {
    tenantDomain,
    dcrEnabled: false,
    action: "disabled",
  };
}
