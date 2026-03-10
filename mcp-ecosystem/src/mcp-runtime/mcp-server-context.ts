import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { getPopulatedStringOrNull } from "../utils/index.js";

/**
 * Minimal shape of the MCP handler `extra` argument. Avoids importing the
 * SDK's generic {@link RequestHandlerExtra} while remaining structurally
 * compatible.
 */
export interface HandlerExtra {
  authInfo?: AuthInfo;
}

/**
 * Tagged union returned by {@link McpServerContext.retrieveAuthData}.
 *
 * Use `sub` (never `clientId`) as the storage key for user-scoped data. The
 * same user has different `clientId` values from different MCP clients
 * (Cursor, Claude Code, etc.); using it would fragment their data.
 *
 * When `isAuthEnabled` is false, use a constant like `"local"` — auth-disabled
 * transports are single-user by definition.
 */
export type AuthData =
  | { isAuthEnabled: false }
  | {
      isAuthEnabled: true;
      sub: string;
      clientId: string | null;
      scopes: string[];
    };

/**
 * Auth context for the setup callback. `isAuthEnabled` comes from the toolkit's
 * transport config, not from `extra.authInfo` — both "auth disabled" and "auth
 * broken" produce undefined authInfo, so inferring from it would let misconfigured
 * servers silently skip identity checks.
 */
export class McpServerContext {
  readonly isAuthEnabled: boolean;

  constructor(isAuthEnabled: boolean) {
    this.isAuthEnabled = isAuthEnabled;
  }

  /**
   * When auth is enabled but `sub` is missing, throws rather than returning
   * `{ isAuthEnabled: false }`. That would hide a misconfiguration (middleware
   * not wired, wrong token shape) as "auth disabled" and let broken servers
   * run without identity checks.
   */
  retrieveAuthData(extra: HandlerExtra | undefined): AuthData {
    const authInfo = extra?.authInfo;

    if (!this.isAuthEnabled) {
      return { isAuthEnabled: false };
    }

    const sub = getPopulatedStringOrNull(authInfo?.extra?.["sub"]);
    if (!sub) {
      throw new Error(
        "Auth is enabled but user identity (sub claim) is missing from authInfo. " +
          "This indicates a misconfiguration — verify that auth middleware is correctly wired."
      );
    }

    return {
      isAuthEnabled: true,
      sub,
      clientId: getPopulatedStringOrNull(authInfo?.clientId),
      scopes: Array.isArray(authInfo?.scopes) ? authInfo.scopes : [],
    };
  }
}
