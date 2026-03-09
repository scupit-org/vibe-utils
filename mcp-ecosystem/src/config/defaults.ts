import type { ClientProfileDefinition } from "../types/ecosystem-config.js";

export const ECOSYSTEM_ENV = {
  baseDomain: "ECOSYSTEM_BASE_DOMAIN",
} as const;

export const AUTH0_ENV = {
  tenantDomain: "AUTH0_TENANT_DOMAIN",
  clientId: "AUTH0_MGMT_CLIENT_ID",
  clientSecret: "AUTH0_MGMT_CLIENT_SECRET",
} as const;

export const DEFAULT_ECOSYSTEM_NAME = "mcp-ecosystem";

export const DEFAULT_API_SETTINGS = {
  signing_alg: "RS256",
  token_dialect: "rfc9068_profile_authz",
  user_access_policy: "require_client_grant",
  client_access_policy: "deny_all",
  use_trailing_slash: false,
} as const;

export const DEFAULT_SCOPE_PROFILES: Record<string, string[]> = {
  readonly: ["resources.read", "prompts.read", "tools.read"],
  standard: ["resources.read", "prompts.read", "tools.read", "tools.write"],
};

export const DEFAULT_CLIENT_PROFILES: Record<string, ClientProfileDefinition> =
  {
    native_interactive: {
      application_type: "native",
      access_mode: "user",
      grant_strategy: "authorization_code_pkce",
      use_refresh_tokens: true,
      refresh_token_rotation: true,
    },
    spa_interactive: {
      application_type: "spa",
      access_mode: "user",
      grant_strategy: "authorization_code_pkce",
      use_refresh_tokens: true,
      refresh_token_rotation: true,
    },
    regular_web_interactive: {
      application_type: "regular_web",
      access_mode: "user",
      grant_strategy: "authorization_code",
      token_endpoint_auth_method: "client_secret_post",
      use_refresh_tokens: true,
    },
    service_m2m: {
      application_type: "m2m",
      access_mode: "machine",
      grant_strategy: "client_credentials",
      token_endpoint_auth_method: "client_secret_post",
    },
  };
