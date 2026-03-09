import { z } from "zod";

export const ClientProfileSchema = z.enum([
  "native_interactive",
  "spa_interactive",
  "regular_web_interactive",
  "service_m2m",
]);

export type ClientProfile = z.infer<typeof ClientProfileSchema>;

export const AccessModeSchema = z.enum(["user", "machine"]);
export type AccessMode = z.infer<typeof AccessModeSchema>;

export const GrantStrategySchema = z.enum([
  "authorization_code_pkce",
  "authorization_code",
  "client_credentials",
]);
export type GrantStrategy = z.infer<typeof GrantStrategySchema>;

export const TokenEndpointAuthMethodSchema = z.enum([
  "none",
  "client_secret_post",
  "client_secret_basic",
  "private_key_jwt",
]);
export type TokenEndpointAuthMethod = z.infer<
  typeof TokenEndpointAuthMethodSchema
>;

export const UserAccessPolicySchema = z.enum([
  "require_client_grant",
  "allow_all",
]);
export type UserAccessPolicy = z.infer<typeof UserAccessPolicySchema>;

export const ClientAccessPolicySchema = z.enum([
  "deny_all",
  "require_client_grant",
]);
export type ClientAccessPolicy = z.infer<typeof ClientAccessPolicySchema>;

const ClientProfileDefinitionSchema = z.object({
  application_type: z.enum(["native", "spa", "regular_web", "m2m"]),
  access_mode: AccessModeSchema,
  grant_strategy: GrantStrategySchema,
  token_endpoint_auth_method: TokenEndpointAuthMethodSchema.optional(),
  use_refresh_tokens: z.boolean().optional(),
  refresh_token_rotation: z.boolean().optional(),
});

export type ClientProfileDefinition = z.infer<
  typeof ClientProfileDefinitionSchema
>;

/**
 * Schema for the ecosystem-configuration.json file the user writes.
 * Most fields are optional; the loader merges in hardcoded defaults.
 */
export const EcosystemFileSchema = z.object({
  ecosystem_name: z.string().min(1).optional(),
  domain: z
    .object({
      base_domain: z.string().min(1).optional(),
      server_host_pattern: z.string().min(1),
    })
    .superRefine((domain, ctx) => {
      if (domain.base_domain !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["base_domain"],
          message:
            "domain.base_domain is no longer supported. Set ECOSYSTEM_BASE_DOMAIN in the ecosystem root .env file or shell environment instead.",
        });
      }
    }),
  defaults: z
    .object({
      api: z
        .object({
          signing_alg: z.string().optional(),
          token_dialect: z.string().optional(),
          user_access_policy: UserAccessPolicySchema.optional(),
          client_access_policy: ClientAccessPolicySchema.optional(),
          use_trailing_slash: z.boolean().optional(),
        })
        .optional(),
      scope_profiles: z.record(z.string(), z.array(z.string())).optional(),
      client_profiles: z
        .record(ClientProfileSchema, ClientProfileDefinitionSchema)
        .optional(),
    })
    .optional(),
  client_groups: z.record(z.string(), z.array(z.string())).optional(),
});

export type EcosystemFileConfig = z.infer<typeof EcosystemFileSchema>;

/**
 * Fully resolved ecosystem config used throughout the codebase.
 * Produced by the loader after merging file config + env vars + defaults.
 */
export interface EcosystemConfig {
  ecosystem_name: string;
  domain: {
    base_domain: string;
    server_host_pattern: string;
  };
  auth0: {
    tenant_domain: string;
    management_audience: string;
  };
  defaults: {
    api: {
      signing_alg: string;
      token_dialect: string;
      user_access_policy: string;
      client_access_policy: string;
      use_trailing_slash: boolean;
    };
    scope_profiles: Record<string, string[]>;
    client_profiles: Record<string, ClientProfileDefinition>;
  };
  client_groups?: Record<string, string[]>;
}

// Keep old name exported for backward compat in types/index.ts
export const EcosystemConfigSchema = EcosystemFileSchema;
