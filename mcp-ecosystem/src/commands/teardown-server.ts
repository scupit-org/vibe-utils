import type { CommandContext } from "../utils/index.js";
import { logger } from "../utils/index.js";
import {
  assertRequiredEcosystemEnv,
  deriveResourceUris,
  resolveUseTrailingSlash,
} from "../config/index.js";
import { assertNoManagedClientCredentialsOutsideManagedBlock } from "./env-root-validation.js";

export interface TeardownServerResult {
  slug: string;
  deleted: Array<{ identifier: string; auth0ApiId: string }>;
  notFound: string[];
  dryRun: boolean;
}

export async function teardownServer(
  ctx: CommandContext,
  serverSlug: string
): Promise<TeardownServerResult> {
  const { config, auth0, dryRun } = ctx;
  assertNoManagedClientCredentialsOutsideManagedBlock(ctx);

  const serverConfig = config.serverConfigs.get(serverSlug);
  if (!serverConfig) {
    throw new Error(`Unknown server slug: "${serverSlug}"`);
  }

  const ecosystem = config.ecosystem;
  assertRequiredEcosystemEnv(ecosystem, {
    context: `teardown server "${serverSlug}"`,
    requireBaseDomain: true,
  });

  const mode = resolveUseTrailingSlash(ecosystem, serverConfig);
  const identifiers = deriveResourceUris(
    ecosystem,
    serverConfig.slug,
    mode
  );

  logger.info(
    `Tearing down Auth0 APIs for server: ${serverConfig.name} (${serverConfig.slug})`
  );
  logger.debug(`  Identifiers: ${identifiers.join(", ")}`);

  const deleted: Array<{ identifier: string; auth0ApiId: string }> = [];
  const notFound: string[] = [];

  for (const identifier of identifiers) {
    const api = await auth0.findApiByIdentifier(identifier);
    if (!api) {
      logger.info(`  No Auth0 API found for identifier: ${identifier}`);
      notFound.push(identifier);
      continue;
    }

    if (dryRun) {
      logger.info(
        `  [DRY RUN] Would delete Auth0 API: ${api.name} (${api.id}) [${identifier}]`
      );
      deleted.push({ identifier, auth0ApiId: api.id });
      continue;
    }

    logger.info(`  Deleting Auth0 API: ${api.name} (${api.id}) [${identifier}]`);
    await auth0.deleteApi(api.id);
    logger.success(`  API deleted.`);
    deleted.push({ identifier, auth0ApiId: api.id });
  }

  logger.blank();
  logger.success(
    `Teardown complete: ${deleted.length} API(s) ${dryRun ? "would be " : ""}deleted, ${notFound.length} not found.`
  );

  return {
    slug: serverConfig.slug,
    deleted,
    notFound,
    dryRun,
  };
}
