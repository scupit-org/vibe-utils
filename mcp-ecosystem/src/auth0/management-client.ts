import type {
  Auth0Application,
  Auth0Api,
  Auth0ApiScope,
  Auth0ApiSubjectTypeAuthorization,
  Auth0ClientGrant,
  Auth0TenantSettings,
} from "../types/index.js";
import { logger } from "../utils/index.js";

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export interface Auth0ManagementClientOptions {
  tenantDomain: string;
  managementAudience: string;
  clientId: string;
  clientSecret: string;
}

export class Auth0ManagementClient {
  private readonly baseUrl: string;
  private readonly tokenUrl: string;
  private readonly audience: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(options: Auth0ManagementClientOptions) {
    this.baseUrl = `https://${options.tenantDomain}/api/v2`;
    this.tokenUrl = `https://${options.tenantDomain}/oauth/token`;
    this.audience = options.managementAudience;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
  }

  async authenticate(): Promise<void> {
    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        audience: this.audience,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to obtain Management API token (${response.status}): ${body}`
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in?: number;
    };
    this.accessToken = data.access_token;
    const expiresInMs = (data.expires_in ?? 86400) * 1000;
    this.tokenExpiresAt = Date.now() + expiresInMs - 60_000;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      await this.authenticate();
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    let attempt = 0;

    while (true) {
      await this.ensureAuthenticated();

      const url = `${this.baseUrl}${path}`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      };

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.status === 429) {
        if (attempt >= MAX_RETRIES) {
          const responseBody = await response.text();
          throw new Auth0ApiError(method, path, response.status, responseBody);
        }

        // Respect Retry-After if Auth0 provides it; otherwise exponential backoff.
        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfterMs = retryAfterHeader
          ? parseFloat(retryAfterHeader) * 1_000
          : Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);

        attempt++;
        logger.warn(
          `Rate limit hit on ${method} ${path}. Retrying in ${Math.round(retryAfterMs / 1000)}s (attempt ${attempt}/${MAX_RETRIES})...`
        );
        await sleep(retryAfterMs);
        continue;
      }

      if (!response.ok) {
        const responseBody = await response.text();
        throw new Auth0ApiError(method, path, response.status, responseBody);
      }

      if (response.status === 204) return undefined as T;

      return response.json() as Promise<T>;
    }
  }

  // ── Tenant Settings ──

  async getTenantSettings(): Promise<Auth0TenantSettings> {
    return this.request<Auth0TenantSettings>("GET", "/tenants/settings");
  }

  async patchTenantSettings(
    patch: Partial<Auth0TenantSettings>
  ): Promise<Auth0TenantSettings> {
    return this.request<Auth0TenantSettings>(
      "PATCH",
      "/tenants/settings",
      patch
    );
  }

  // ── Applications (Clients) ──

  async listApplications(params?: {
    page?: number;
    per_page?: number;
    include_totals?: boolean;
  }): Promise<Auth0Application[]> {
    const query = new URLSearchParams();
    if (params?.page !== undefined) query.set("page", String(params.page));
    if (params?.per_page !== undefined)
      query.set("per_page", String(params.per_page));
    if (params?.include_totals !== undefined)
      query.set("include_totals", String(params.include_totals));
    const qs = query.toString();
    return this.request<Auth0Application[]>(
      "GET",
      `/clients${qs ? `?${qs}` : ""}`
    );
  }

  async getApplication(clientId: string): Promise<Auth0Application> {
    return this.request<Auth0Application>("GET", `/clients/${clientId}`);
  }

  async findApplicationByMetadata(
    metadataKey: string,
    metadataValue: string
  ): Promise<Auth0Application | null> {
    return this.findApplicationByMetadataEntries({
      [metadataKey]: metadataValue,
    });
  }

  async findApplicationByMetadataEntries(
    metadataEntries: Record<string, string>
  ): Promise<Auth0Application | null> {
    let page = 0;
    const perPage = 100;
    while (true) {
      const apps = await this.listApplications({ page, per_page: perPage });
      for (const app of apps) {
        if (
          Object.entries(metadataEntries).every(
            ([key, value]) => app.client_metadata?.[key] === value
          )
        ) {
          return app;
        }
      }
      if (apps.length < perPage) break;
      page++;
    }
    return null;
  }

  async createApplication(
    payload: Partial<Auth0Application> & { name: string; app_type: string }
  ): Promise<Auth0Application> {
    return this.request<Auth0Application>("POST", "/clients", payload);
  }

  async updateApplication(
    clientId: string,
    payload: Partial<Auth0Application>
  ): Promise<Auth0Application> {
    return this.request<Auth0Application>(
      "PATCH",
      `/clients/${clientId}`,
      payload
    );
  }

  // ── Resource Servers (APIs) ──

  async listApis(params?: {
    page?: number;
    per_page?: number;
  }): Promise<Auth0Api[]> {
    const query = new URLSearchParams();
    if (params?.page !== undefined) query.set("page", String(params.page));
    if (params?.per_page !== undefined)
      query.set("per_page", String(params.per_page));
    const qs = query.toString();
    return this.request<Auth0Api[]>(
      "GET",
      `/resource-servers${qs ? `?${qs}` : ""}`
    );
  }

  async findApiByIdentifier(identifier: string): Promise<Auth0Api | null> {
    let page = 0;
    const perPage = 100;
    while (true) {
      const apis = await this.listApis({ page, per_page: perPage });
      for (const api of apis) {
        if (api.identifier === identifier) return api;
      }
      if (apis.length < perPage) break;
      page++;
    }
    return null;
  }

  async getApi(apiId: string): Promise<Auth0Api> {
    return this.request<Auth0Api>("GET", `/resource-servers/${apiId}`);
  }

  async createApi(payload: {
    name: string;
    identifier: string;
    signing_alg?: string;
    token_dialect?: string;
    enforce_policies?: boolean;
    scopes?: Auth0ApiScope[];
    subject_type_authorization?: Auth0ApiSubjectTypeAuthorization;
  }): Promise<Auth0Api> {
    return this.request<Auth0Api>("POST", "/resource-servers", payload);
  }

  async updateApi(
    apiId: string,
    payload: Partial<{
      name: string;
      signing_alg: string;
      token_dialect: string;
      enforce_policies: boolean;
      scopes: Auth0ApiScope[];
      subject_type_authorization: Auth0ApiSubjectTypeAuthorization;
    }>
  ): Promise<Auth0Api> {
    return this.request<Auth0Api>(
      "PATCH",
      `/resource-servers/${apiId}`,
      payload
    );
  }

  // ── Client Grants ──

  async listClientGrants(params?: {
    audience?: string;
    client_id?: string;
    page?: number;
    per_page?: number;
  }): Promise<Auth0ClientGrant[]> {
    const query = new URLSearchParams();
    if (params?.audience) query.set("audience", params.audience);
    if (params?.client_id) query.set("client_id", params.client_id);
    if (params?.page !== undefined) query.set("page", String(params.page));
    if (params?.per_page !== undefined)
      query.set("per_page", String(params.per_page));
    const qs = query.toString();
    return this.request<Auth0ClientGrant[]>(
      "GET",
      `/client-grants${qs ? `?${qs}` : ""}`
    );
  }

  async findClientGrant(
    clientId: string,
    audience: string,
    subjectType?: string
  ): Promise<Auth0ClientGrant | null> {
    const grants = await this.listClientGrants({
      client_id: clientId,
      audience,
    });
    for (const grant of grants) {
      if (subjectType && grant.subject_type !== subjectType) continue;
      return grant;
    }
    return null;
  }

  async createClientGrant(payload: {
    client_id: string;
    audience: string;
    scope: string[];
    subject_type?: string;
  }): Promise<Auth0ClientGrant> {
    return this.request<Auth0ClientGrant>("POST", "/client-grants", payload);
  }

  async updateClientGrant(
    grantId: string,
    payload: { scope: string[] }
  ): Promise<Auth0ClientGrant> {
    return this.request<Auth0ClientGrant>(
      "PATCH",
      `/client-grants/${grantId}`,
      payload
    );
  }

  async deleteClientGrant(grantId: string): Promise<void> {
    await this.request<void>("DELETE", `/client-grants/${grantId}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Auth0ApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly path: string,
    public readonly statusCode: number,
    public readonly responseBody: string
  ) {
    super(
      `Auth0 API error: ${method} ${path} returned ${statusCode}: ${responseBody}`
    );
    this.name = "Auth0ApiError";
  }
}
