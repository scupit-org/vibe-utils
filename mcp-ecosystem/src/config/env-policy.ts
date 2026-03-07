import { AUTH0_ENV, ECOSYSTEM_ENV } from "./defaults.js";

export const ENV_PLACEHOLDERS: Record<string, string> = {
  [ECOSYSTEM_ENV.baseDomain]: "example.com",
  [AUTH0_ENV.tenantDomain]: "your-tenant.auth0.com",
  [AUTH0_ENV.clientId]: "__REQUIRED__",
  [AUTH0_ENV.clientSecret]: "__REQUIRED__",
};

export function getEnvPlaceholder(key: string): string | undefined {
  return ENV_PLACEHOLDERS[key];
}

export function isPlaceholderEnvValue(key: string, value: string | undefined): boolean {
  if (value === undefined) return false;
  const placeholder = getEnvPlaceholder(key);
  return placeholder !== undefined && value.trim() === placeholder;
}

export function isServerExcludedEnvKey(key: string): boolean {
  return /^AUTH0_.+_CLIENT_(ID|SECRET)$/.test(key);
}

export function isManagedClientCredentialEnvKey(key: string): boolean {
  return (
    isServerExcludedEnvKey(key) &&
    key !== AUTH0_ENV.clientId &&
    key !== AUTH0_ENV.clientSecret
  );
}

export function isProjectEnvDisallowedKey(key: string): boolean {
  return (
    key === ECOSYSTEM_ENV.baseDomain ||
    key === AUTH0_ENV.tenantDomain ||
    isServerExcludedEnvKey(key)
  );
}
