export {
  EcosystemConfigSchema,
  EcosystemFileSchema,
  ClientProfileSchema,
  AccessModeSchema,
  GrantStrategySchema,
  TokenEndpointAuthMethodSchema,
  UserAccessPolicySchema,
  ClientAccessPolicySchema,
  UseTrailingSlashSchema,
} from "./ecosystem-config.js";
export type {
  EcosystemConfig,
  EcosystemFileConfig,
  ClientProfile,
  AccessMode,
  GrantStrategy,
  TokenEndpointAuthMethod,
  UserAccessPolicy,
  ClientAccessPolicy,
  ClientProfileDefinition,
  UseTrailingSlash,
} from "./ecosystem-config.js";

export { ClientDescriptorSchema, ReusePolicySchema } from "./client-descriptor.js";
export type { ClientDescriptor, ReusePolicy } from "./client-descriptor.js";

export { ClientConfigSchema } from "./client-config.js";
export type { ClientConfig } from "./client-config.js";

export { ServerConfigSchema } from "./server-config.js";
export type { ServerConfig } from "./server-config.js";

export type {
  Auth0Application,
  Auth0Api,
  Auth0ApiScope,
  Auth0ApiSubjectTypeAuthorization,
  Auth0ClientGrant,
  Auth0TenantSettings,
} from "./auth0-responses.js";
