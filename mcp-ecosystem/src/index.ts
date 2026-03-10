// Public API: types
export type {
  EcosystemConfig,
  ClientProfile,
  AccessMode,
  GrantStrategy,
  TokenEndpointAuthMethod,
  UserAccessPolicy,
  ClientAccessPolicy,
  ClientProfileDefinition,
  ClientDescriptor,
  ReusePolicy,
  ClientConfig,
  ServerConfig,
  Auth0Application,
  Auth0Api,
  Auth0ClientGrant,
  Auth0TenantSettings,
} from "./types/index.js";

// Public API: config loading, derivation, and defaults
export {
  loadAllConfig,
  deriveHostname,
  deriveCanonicalResourceUri,
  deriveMcpEndpoint,
  deriveProtectedResourceMetadataUrl,
  resolveScopes,
  resolveGrantTargets,
  AUTH0_ENV,
  DEFAULT_API_SETTINGS,
  DEFAULT_SCOPE_PROFILES,
  DEFAULT_CLIENT_PROFILES,
} from "./config/index.js";
export type { LoadedConfig, ResolvedGrantTarget } from "./config/index.js";

// Public API: Auth0 management client
export { Auth0ManagementClient, Auth0ApiError } from "./auth0/index.js";
export type { Auth0ManagementClientOptions } from "./auth0/index.js";

// Public API: MCP runtime helpers
export {
  buildProtectedResourceMetadata,
  protectedResourceMetadataHandler,
  TokenValidator,
  InsufficientScopeError,
  extractScopes,
  buildWwwAuthenticateChallenge,
  send401Challenge,
  createAuthMiddleware,
  requireScopes,
} from "./mcp-runtime/index.js";
export type {
  ProtectedResourceMetadata,
  ProtectedResourceMetadataOptions,
  TokenValidatorOptions,
  ValidatedToken,
  ChallengeOptions,
  AuthMiddlewareOptions,
} from "./mcp-runtime/index.js";

// Public API: MCP server types and origin validation helpers
export type {
  RuntimeConfig,
  ConfigureMcpServer,
  OriginValidator,
} from "./mcp-server/index.js";
export { denyAllOrigins, allowLocalOrigins, allowOrigins } from "./mcp-server/index.js";
