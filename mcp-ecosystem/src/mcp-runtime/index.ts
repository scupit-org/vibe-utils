export {
  buildProtectedResourceMetadata,
  protectedResourceMetadataHandler,
} from "./protected-resource-metadata.js";
export type {
  ProtectedResourceMetadata,
  ProtectedResourceMetadataOptions,
} from "./protected-resource-metadata.js";

export {
  TokenValidator,
  InsufficientScopeError,
} from "./token-validator.js";
export type {
  TokenValidatorOptions,
  ValidatedToken,
} from "./token-validator.js";

export {
  buildWwwAuthenticateChallenge,
  send401Challenge,
} from "./www-authenticate.js";
export type { ChallengeOptions } from "./www-authenticate.js";

export {
  createAuthMiddleware,
  requireScopes,
} from "./auth-middleware.js";
export type { AuthMiddlewareOptions } from "./auth-middleware.js";
