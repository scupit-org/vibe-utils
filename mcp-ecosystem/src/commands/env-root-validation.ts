import { join } from "node:path";
import { isManagedClientCredentialEnvKey } from "../config/index.js";
import type { CommandContext } from "../utils/index.js";

export function assertNoManagedClientCredentialsOutsideManagedBlock(
  ctx: Pick<CommandContext, "envManager" | "rootDir">
): void {
  const invalidAssignments = ctx.envManager.getOuterAssignments(
    isManagedClientCredentialEnvKey
  );

  if (invalidAssignments.length === 0) {
    return;
  }

  const envPath = join(ctx.rootDir, ".env");
  const entries = invalidAssignments.map(
    (assignment) => `    ${maskSecretAssignment(assignment.rawLine)}`
  );

  throw new Error(
    `Invalid tool-managed client credentials in root .env at ${envPath}\n\n` +
      `  These variables are managed by mcp-ecosystem and must appear only inside\n` +
      `  the auto-generated block marked by:\n` +
      `    # <automatically-generated>\n` +
      `    # </automatically-generated>\n\n` +
      `  Remove these user-authored assignments from outside the managed block:\n` +
      `${entries.join("\n")}\n\n` +
      `  Then re-run reconcile-client or reconcile-all so the CLI can regenerate\n` +
      `  the managed entries safely.`
  );
}

function maskSecretAssignment(line: string): string {
  const eqIdx = line.indexOf("=");
  if (eqIdx === -1) return line;
  const key = line.slice(0, eqIdx).trim();
  return key.includes("_SECRET") ? `${key}=********` : line;
}
