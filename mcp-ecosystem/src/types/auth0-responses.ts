/**
 * Subset of Auth0 Management API response types used by the provisioner.
 * These are not exhaustive -- only fields we read or write.
 */

export interface Auth0Application {
  client_id: string;
  name: string;
  app_type?: string;
  oidc_conformant?: boolean;
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  callbacks?: string[];
  allowed_logout_urls?: string[];
  web_origins?: string[];
  client_metadata?: Record<string, string>;
  refresh_token?: {
    rotation_type?: string;
    expiration_type?: string;
    token_lifetime?: number;
  };
  client_secret?: string;
}

export interface Auth0ApiScope {
  value: string;
  description?: string;
}

export interface Auth0ApiSubjectTypeAuthorization {
  user?: { policy: "allow_all" | "require_client_grant" | "deny_all" };
  client?: { policy: "require_client_grant" | "deny_all" };
}

export interface Auth0Api {
  id: string;
  name: string;
  identifier: string;
  signing_alg?: string;
  token_dialect?: string;
  enforce_policies?: boolean;
  scopes?: Auth0ApiScope[];
  subject_type_authorization?: Auth0ApiSubjectTypeAuthorization;
}

export interface Auth0ClientGrant {
  id: string;
  client_id: string;
  audience: string;
  scope: string[];
  subject_type?: string;
}

export interface Auth0TenantSettings {
  flags?: Record<string, boolean>;
  resource_parameter_profile?: string;
  [key: string]: unknown;
}
