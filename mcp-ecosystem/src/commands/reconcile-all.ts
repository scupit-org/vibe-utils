import type { CommandContext } from "../utils/index.js";
import { logger } from "../utils/index.js";
import { assertRequiredEcosystemEnv } from "../config/index.js";
import { verifyTenant } from "./verify-tenant.js";
import { reconcileClient, type ReconcileClientResult } from "./reconcile-client.js";
import { reconcileServer, type ReconcileServerResult } from "./reconcile-server.js";
import { assertNoManagedClientCredentialsOutsideManagedBlock } from "./env-root-validation.js";

export interface ReconcileAllResult {
  tenantOk: boolean;
  clients: ReconcileClientResult[];
  servers: ReconcileServerResult[];
}

export async function reconcileAll(
  ctx: CommandContext
): Promise<ReconcileAllResult> {
  const { config } = ctx;
  assertNoManagedClientCredentialsOutsideManagedBlock(ctx);

  logger.info("=== Full Ecosystem Reconciliation ===");
  logger.blank();

  // Phase 1: Verify tenant
  const tenantResult = await verifyTenant(ctx);
  if (tenantResult.manualActionRequired) {
    logger.error("Tenant verification failed. Aborting reconciliation.");
    return { tenantOk: false, clients: [], servers: [] };
  }

  logger.blank();
  logger.info("=== Phase 2: Reconcile OAuth Clients ===");
  logger.blank();

  const clientResults: ReconcileClientResult[] = [];
  for (const clientKey of config.clientConfigs.keys()) {
    try {
      const result = await reconcileClient(ctx, clientKey);
      clientResults.push(result);
    } catch (err) {
      logger.error(
        `Failed to reconcile client "${clientKey}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
    logger.blank();
  }

  logger.info("=== Phase 3: Reconcile MCP Servers ===");
  logger.blank();

  if (config.serverConfigs.size > 0) {
    assertRequiredEcosystemEnv(config.ecosystem, {
      context: "reconcile MCP servers",
      requireBaseDomain: true,
    });
  }

  const serverResults: ReconcileServerResult[] = [];
  for (const slug of config.serverConfigs.keys()) {
    try {
      const result = await reconcileServer(ctx, slug);
      serverResults.push(result);
    } catch (err) {
      logger.error(
        `Failed to reconcile server "${slug}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
    logger.blank();
  }

  // Summary
  logger.info("=== Reconciliation Summary ===");
  logger.blank();

  for (const cr of clientResults) {
    logger.info(
      `  Client "${cr.clientKey}": ${cr.action} (${cr.clientId})`
    );
  }
  for (const sr of serverResults) {
    logger.info(
      `  Server "${sr.slug}": API ${sr.action} (${sr.apiIdentifier})`
    );
    for (const gr of sr.grantResults) {
      logger.info(
        `    Grant ${gr.clientKey}: ${gr.action} [${gr.scopes.join(", ")}]`
      );
    }
  }

  logger.blank();
  logger.success("Full reconciliation complete.");

  return { tenantOk: true, clients: clientResults, servers: serverResults };
}
