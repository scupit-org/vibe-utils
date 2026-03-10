import type { Auth0TenantSettings } from "../types/auth0-responses.js";
import type { CommandContext } from "../utils/index.js";
import { logger } from "../utils/index.js";

/**
 * Read the Dynamic Client Registration flag from tenant settings.
 */
export function getDcrEnabled(tenantSettings: Auth0TenantSettings): boolean {
  return tenantSettings.flags?.["enable_dynamic_client_registration"] ?? false;
}

/**
 * Authenticate to Auth0 and fetch tenant settings.
 * Returns tenant settings and domain for use in DCR commands.
 */
export async function authenticateAndFetchTenantSettings(ctx: CommandContext): Promise<{
  tenantSettings: Auth0TenantSettings;
  tenantDomain: string;
}> {
  const { config, auth0 } = ctx;
  const ecosystem = config.ecosystem;

  logger.info("Authenticating to Auth0 Management API...");
  await auth0.authenticate();
  logger.success("Management API authentication successful.");

  logger.info("Fetching tenant settings...");
  const tenantSettings = await auth0.getTenantSettings();

  return {
    tenantSettings,
    tenantDomain: ecosystem.auth0.tenant_domain,
  };
}
