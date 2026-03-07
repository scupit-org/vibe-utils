import { join } from "node:path";
import type { CommandContext } from "../utils/index.js";
import { clientIdEnvVar } from "../utils/index.js";
import type {
  Auth0Application,
  ClientConfig,
  EcosystemConfig,
} from "../types/index.js";

export const MANAGED_BY = "@scupit/mcp-ecosystem";

export async function loadValidatedCachedClientApplication(
  ctx: CommandContext,
  clientKey: string
): Promise<Auth0Application | undefined> {
  const clientConfig = ctx.config.clientConfigs.get(clientKey);
  if (!clientConfig) {
    throw new Error(`Unknown client key: "${clientKey}"`);
  }

  const idEnvKey = clientIdEnvVar(clientKey);
  const existingClientId = ctx.envManager.get(idEnvKey);
  if (!existingClientId) {
    return undefined;
  }

  // TODO: If this cached client_id points to an Auth0 application that has been
  // deleted, we currently hard-fail here instead of treating the cache as stale
  // and falling back to metadata lookup / recreation. We're leaving that as-is
  // for now because it reflects user-managed drift in the cached state, but we
  // should make this path self-heal in a future pass.
  const existing = await ctx.auth0.getApplication(existingClientId);
  assertExpectedManagedClient(
    existing,
    expectedManagedClientMetadata(ctx.config.ecosystem, clientConfig),
    ctx.rootDir,
    idEnvKey
  );

  return existing;
}

export function expectedManagedClientMetadata(
  ecosystem: EcosystemConfig,
  clientConfig: ClientConfig
): Record<string, string> {
  return {
    managed_by: MANAGED_BY,
    ecosystem: ecosystem.ecosystem_name,
    client_key: clientConfig.client_key,
  };
}

export function assertExpectedManagedClient(
  application: Auth0Application,
  expectedMetadata: Record<string, string>,
  rootDir: string,
  envKey: string
): void {
  const mismatches = Object.entries(expectedMetadata).filter(
    ([key, value]) => application.client_metadata?.[key] !== value
  );

  if (mismatches.length === 0) {
    return;
  }

  const envPath = join(rootDir, ".env");
  const expected = Object.entries(expectedMetadata).map(
    ([key, value]) => `    ${key}=${value}`
  );
  const actual = Object.keys(expectedMetadata).map((key) => {
    const value = application.client_metadata?.[key];
    return `    ${key}=${value && value.length > 0 ? value : "<missing>"}`;
  });

  throw new Error(
    `Cached client ID mismatch in ${envPath}\n\n` +
      `  ${envKey} points to Auth0 application "${application.name}" (${application.client_id}),\n` +
      `  but its ownership metadata does not match this managed client.\n\n` +
      `  Expected metadata:\n` +
      `${expected.join("\n")}\n\n` +
      `  Found metadata:\n` +
      `${actual.join("\n")}\n\n` +
      `  Remove ${envKey} from the managed block and re-run reconcile-client.`
  );
}
