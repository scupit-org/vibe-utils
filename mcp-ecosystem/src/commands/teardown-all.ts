import type { CommandContext } from "../utils/index.js";
import { logger } from "../utils/index.js";
import { assertRequiredEcosystemEnv } from "../config/index.js";
import { teardownServer, type TeardownServerResult } from "./teardown-server.js";
import { assertNoManagedClientCredentialsOutsideManagedBlock } from "./env-root-validation.js";

export interface TeardownAllResult {
  servers: TeardownServerResult[];
}

export async function teardownAll(ctx: CommandContext): Promise<TeardownAllResult> {
  const { config } = ctx;
  assertNoManagedClientCredentialsOutsideManagedBlock(ctx);

  if (config.serverConfigs.size > 0) {
    assertRequiredEcosystemEnv(config.ecosystem, {
      context: "teardown all servers",
      requireBaseDomain: true,
    });
  }

  logger.info("=== Teardown All Auth0 APIs ===");
  logger.blank();

  const serverResults: TeardownServerResult[] = [];
  for (const slug of config.serverConfigs.keys()) {
    try {
      const result = await teardownServer(ctx, slug);
      serverResults.push(result);
    } catch (err) {
      logger.error(
        `Failed to teardown server "${slug}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
    logger.blank();
  }

  logger.info("=== Teardown Summary ===");
  logger.blank();
  for (const sr of serverResults) {
    const totalDeleted = sr.deleted.length;
    const totalNotFound = sr.notFound.length;
    logger.info(
      `  ${sr.slug}: ${totalDeleted} API(s) ${sr.dryRun ? "would be " : ""}deleted, ${totalNotFound} not found`
    );
  }

  logger.blank();
  logger.success("Teardown complete.");

  return { servers: serverResults };
}
