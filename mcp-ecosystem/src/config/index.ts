export {
  loadAllConfig,
  assertRequiredEcosystemEnv,
  resolveClientAccessPolicy,
  resolveUserAccessPolicy,
  resolveUseTrailingSlash,
  deriveHostname,
  deriveCanonicalResourceUri,
  deriveResourceUris,
  deriveMcpEndpoint,
  deriveProtectedResourceMetadataUrl,
  resolveScopes,
  resolveClientGroupMembers,
  resolveGrantTargets,
} from "./loader.js";

export {
  ENV_PLACEHOLDERS,
  getEnvPlaceholder,
  isPlaceholderEnvValue,
  isManagedClientCredentialEnvKey,
  isProjectEnvDisallowedKey,
  isServerExcludedEnvKey,
} from "./env-policy.js";

export type { LoadedConfig, ResolvedGrantTarget } from "./loader.js";

export {
  ECOSYSTEM_ENV,
  AUTH0_ENV,
  DEFAULT_ECOSYSTEM_NAME,
  DEFAULT_API_SETTINGS,
  DEFAULT_SCOPE_PROFILES,
  DEFAULT_CLIENT_PROFILES,
} from "./defaults.js";
