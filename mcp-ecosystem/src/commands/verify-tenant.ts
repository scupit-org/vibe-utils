import type { CommandContext } from "../utils/index.js";
import { logger } from "../utils/index.js";

export interface VerifyTenantResult {
  tenantDomain: string;
  managementAudience: string;
  resourceParameterCompatibility: boolean;
  manualActionRequired: boolean;
  message: string;
}

export async function verifyTenant(
  ctx: CommandContext
): Promise<VerifyTenantResult> {
  const { config, auth0, dryRun } = ctx;
  const ecosystem = config.ecosystem;

  logger.info(`Verifying tenant: ${ecosystem.auth0.tenant_domain}`);
  logger.blank();

  logger.info("Authenticating to Auth0 Management API...");
  await auth0.authenticate();
  logger.success("Management API authentication successful.");

  logger.info("Fetching tenant settings...");
  const tenantSettings = await auth0.getTenantSettings();

  const rpcp = tenantSettings.resource_parameter_profile === "compatibility";

  if (rpcp) {
    logger.success("Resource Parameter Compatibility Profile is ENABLED.");
  } else {
    logger.warn("Resource Parameter Compatibility Profile is DISABLED.");
    logger.blank();

    if (!dryRun) {
      logger.info(
        "Attempting to enable Resource Parameter Compatibility Profile..."
      );
      try {
        await auth0.patchTenantSettings({
          resource_parameter_profile: "compatibility",
        });
        logger.success(
          "Resource Parameter Compatibility Profile has been ENABLED."
        );
        return {
          tenantDomain: ecosystem.auth0.tenant_domain,
          managementAudience: ecosystem.auth0.management_audience,
          resourceParameterCompatibility: true,
          manualActionRequired: false,
          message:
            "Resource Parameter Compatibility Profile was disabled and has been enabled programmatically.",
        };
      } catch (err) {
        logger.warn("Could not enable the setting programmatically.");
        logger.debug(
          `Error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    logger.blank();
    logger.error("MANUAL ACTION REQUIRED:");
    logger.error(
      "  1. Go to the Auth0 Dashboard"
    );
    logger.error(
      "  2. Navigate to: Settings > Advanced > Settings"
    );
    logger.error(
      "  3. Find 'Resource Parameter Compatibility Profile'"
    );
    logger.error("  4. Enable it");
    logger.error(
      "  5. Re-run this command to verify"
    );
    logger.blank();

    return {
      tenantDomain: ecosystem.auth0.tenant_domain,
      managementAudience: ecosystem.auth0.management_audience,
      resourceParameterCompatibility: false,
      manualActionRequired: true,
      message:
        "Resource Parameter Compatibility Profile is disabled. Enable it via Dashboard > Settings > Advanced > Settings.",
    };
  }

  const dcr = tenantSettings.flags?.["enable_dynamic_client_registration"] ?? false;
  if (dcr) {
    logger.warn(
      "Dynamic Client Registration is enabled. The baseline system uses static registration. " +
        "Disable DCR via: Auth0 Dashboard > Settings > Advanced > Dynamic Client Registration, " +
        "or run: npx mcp-ecosystem tenant disable-dcr --dir <path>"
    );
  } else {
    logger.info("Dynamic Client Registration is disabled (expected for baseline).");
  }

  logger.blank();
  logger.success("Tenant verification complete.");

  return {
    tenantDomain: ecosystem.auth0.tenant_domain,
    managementAudience: ecosystem.auth0.management_audience,
    resourceParameterCompatibility: true,
    manualActionRequired: false,
    message: "Tenant prerequisites are satisfied.",
  };
}
