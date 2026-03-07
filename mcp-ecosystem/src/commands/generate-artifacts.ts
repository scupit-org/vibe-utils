import { join } from "node:path";
import type { CommandContext } from "../utils/index.js";
import { logger, ManagedEnvFile } from "../utils/index.js";
import {
  ECOSYSTEM_ENV,
  AUTH0_ENV,
  getEnvPlaceholder,
} from "../config/index.js";

export interface GenerateArtifactsResult {
  filesWritten: string[];
}

/**
 * Generates or refreshes the .env.example file.
 * Never writes live secrets.
 */
export async function generateArtifacts(
  ctx: CommandContext
): Promise<GenerateArtifactsResult> {
  const { rootDir, dryRun } = ctx;
  const written: string[] = [];

  const envLines: string[] = [
    "# Ecosystem base domain (required)",
    `${ECOSYSTEM_ENV.baseDomain}=${getEnvPlaceholder(ECOSYSTEM_ENV.baseDomain) ?? "example.com"}`,
    "",
    "# Auth0 tenant and Management API credentials (required for provisioning)",
    `${AUTH0_ENV.tenantDomain}=${getEnvPlaceholder(AUTH0_ENV.tenantDomain) ?? "your-tenant.auth0.com"}`,
    `${AUTH0_ENV.clientId}=${getEnvPlaceholder(AUTH0_ENV.clientId) ?? "__REQUIRED__"}`,
    `${AUTH0_ENV.clientSecret}=${getEnvPlaceholder(AUTH0_ENV.clientSecret) ?? "__REQUIRED__"}`,
    "",
    "# Client IDs and secrets are automatically written to .env by",
    "# reconcile-client and reconcile-all. Do not set them manually.",
    "",
  ];

  const envExamplePath = join(rootDir, ".env.example");
  const envExample = await ManagedEnvFile.load(envExamplePath, {
    displayName: ".env.example",
    blockHeaderLines: [
      "# Managed by @scupit/mcp-ecosystem -- placeholders only.",
      "# Add your own notes or extra example variables outside this block.",
    ],
  });

  if (!envExample.hasManagedBlock && isLegacyGeneratedEnvExample(envExample.getOuterContent())) {
    envExample.replaceOuterContent("");
  }

  envExample.setManagedLines(envLines);
  const changed = await envExample.flush(dryRun, {
    dryRunLabel: "[DRY RUN] Would update .env.example managed block:",
    successMessage: `Generated: ${envExamplePath}`,
  });

  if (changed && !dryRun) {
    written.push(envExamplePath);
  } else if (!changed) {
    logger.info(`No changes needed: ${envExamplePath}`);
  }

  return { filesWritten: written };
}

function isLegacyGeneratedEnvExample(content: string): boolean {
  const lines = content.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return (
    lines.length === 10 &&
    lines[0] === "# Ecosystem base domain (required)" &&
    /^ECOSYSTEM_BASE_DOMAIN=/.test(lines[1] ?? "") &&
    lines[2] === "" &&
    lines[3] === "# Auth0 tenant and Management API credentials (required for provisioning)" &&
    /^AUTH0_TENANT_DOMAIN=/.test(lines[4] ?? "") &&
    /^AUTH0_MGMT_CLIENT_ID=/.test(lines[5] ?? "") &&
    /^AUTH0_MGMT_CLIENT_SECRET=/.test(lines[6] ?? "") &&
    lines[7] === "" &&
    lines[8] === "# Client IDs and secrets are automatically written to .env by" &&
    lines[9] === "# reconcile-client and reconcile-all. Do not set them manually."
  );
}
