import * as jose from "jose";

export interface TokenValidatorOptions {
  issuer: string;
  audience: string;
  jwksUri?: string;
}

export interface ValidatedToken {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  scope?: string;
  permissions?: string[];
  [key: string]: unknown;
}

export class TokenValidator {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly jwks: ReturnType<typeof jose.createRemoteJWKSet>;

  constructor(options: TokenValidatorOptions) {
    this.issuer = options.issuer;
    this.audience = options.audience;
    const jwksUrl =
      options.jwksUri ?? `${this.issuer}.well-known/jwks.json`;
    this.jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
  }

  async validate(token: string): Promise<ValidatedToken> {
    const { payload } = await jose.jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ["RS256"],
    });

    return payload as unknown as ValidatedToken;
  }

  /**
   * Validate the token and check that it contains at least one of the required scopes.
   */
  async validateWithScopes(
    token: string,
    requiredScopes: string[]
  ): Promise<ValidatedToken> {
    const payload = await this.validate(token);

    const tokenScopes = extractScopes(payload);
    const hasScope = requiredScopes.some((s) => tokenScopes.has(s));

    if (!hasScope) {
      throw new InsufficientScopeError(requiredScopes, tokenScopes);
    }

    return payload;
  }
}

function extractScopes(payload: ValidatedToken): Set<string> {
  const scopes = new Set<string>();

  if (typeof payload.scope === "string") {
    for (const s of payload.scope.split(" ")) {
      if (s) scopes.add(s);
    }
  }

  if (Array.isArray(payload.permissions)) {
    for (const p of payload.permissions) {
      if (typeof p === "string") scopes.add(p);
    }
  }

  return scopes;
}

export class InsufficientScopeError extends Error {
  public readonly requiredScopes: string[];
  public readonly presentScopes: Set<string>;

  constructor(required: string[], present: Set<string>) {
    super(
      `Insufficient scope. Required one of: [${required.join(", ")}]. Present: [${[...present].join(", ")}]`
    );
    this.name = "InsufficientScopeError";
    this.requiredScopes = required;
    this.presentScopes = present;
  }
}
