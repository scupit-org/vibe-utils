import { Auth0ManagementClient } from "../auth0/index.js";
import type { LoadedConfig } from "../config/index.js";
import { AUTH0_ENV, isPlaceholderEnvValue } from "../config/index.js";
import type { EcosystemConfig } from "../types/index.js";
import type { EnvManager } from "./env-manager.js";

export interface CommandContext {
  rootDir: string;
  config: LoadedConfig;
  auth0: Auth0ManagementClient;
  envManager: EnvManager;
  dryRun: boolean;
}

/**
 * Lazily creates the Auth0 Management client so commands that don't
 * need Auth0 (like generate-artifacts) work without credentials.
 */
export function createLazyAuth0Context(
  ecosystem: EcosystemConfig
): { get auth0(): Auth0ManagementClient } {
  let client: Auth0ManagementClient | null = null;

  return {
    get auth0(): Auth0ManagementClient {
      if (!client) {
        client = createAuth0Client(ecosystem);
      }
      return client;
    },
  };
}

export function createAuth0Client(
  ecosystem: EcosystemConfig
): Auth0ManagementClient {
  const tenantDomain = ecosystem.auth0.tenant_domain;
  const clientId = process.env[AUTH0_ENV.clientId];
  const clientSecret = process.env[AUTH0_ENV.clientSecret];

  if (!tenantDomain || isPlaceholderEnvValue(AUTH0_ENV.tenantDomain, tenantDomain)) {
    throw new Error(
      `Missing or placeholder environment variable: ${AUTH0_ENV.tenantDomain}\n\n` +
        `  This is your Auth0 tenant domain (e.g., "my-tenant.us.auth0.com").\n` +
        `  It identifies which Auth0 tenant this ecosystem provisions against.\n\n` +
        `  Set it in your ecosystem's .env file:\n` +
        `    ${AUTH0_ENV.tenantDomain}=your-tenant.auth0.com\n\n` +
        `  Or export it in your shell:\n` +
        `    export ${AUTH0_ENV.tenantDomain}=your-tenant.auth0.com\n\n` +
        `  You can find your tenant domain in the Auth0 Dashboard under\n` +
        `  Settings > General > Domain.`
    );
  }

  if (!clientId || isPlaceholderEnvValue(AUTH0_ENV.clientId, clientId)) {
    throw new Error(
      `Missing or placeholder environment variable: ${AUTH0_ENV.clientId}\n\n` +
        `  This is the Client ID of a Machine-to-Machine application\n` +
        `  authorized against the Auth0 Management API.\n\n` +
        `  Set it in your ecosystem's .env file:\n` +
        `    ${AUTH0_ENV.clientId}=your-m2m-client-id\n\n` +
        `  To create one:\n` +
        `    1. Go to the Auth0 Dashboard > Applications > Applications\n` +
        `    2. Create a new Machine-to-Machine application\n` +
        `    3. Authorize it against the "Auth0 Management API"\n` +
        `    4. Grant it scopes: read:clients, create:clients, update:clients,\n` +
        `       read:resource_servers, create:resource_servers, update:resource_servers,\n` +
        `       delete:resource_servers, read:client_grants, create:client_grants,\n` +
        `       update:client_grants, delete:client_grants, read:tenant_settings,\n` +
        `       update:tenant_settings\n` +
        `    5. Copy the Client ID into your .env file`
    );
  }

  if (!clientSecret || isPlaceholderEnvValue(AUTH0_ENV.clientSecret, clientSecret)) {
    throw new Error(
      `Missing or placeholder environment variable: ${AUTH0_ENV.clientSecret}\n\n` +
        `  This is the Client Secret of the same Machine-to-Machine application\n` +
        `  whose Client ID is set in ${AUTH0_ENV.clientId}.\n\n` +
        `  Set it in your ecosystem's .env file:\n` +
        `    ${AUTH0_ENV.clientSecret}=your-m2m-client-secret\n\n` +
        `  You can find it in the Auth0 Dashboard under\n` +
        `  Applications > Applications > [your M2M app] > Settings > Client Secret.`
    );
  }

  return new Auth0ManagementClient({
    tenantDomain,
    managementAudience: ecosystem.auth0.management_audience,
    clientId,
    clientSecret,
  });
}
