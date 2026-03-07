#!/usr/bin/env node

import { Command } from "commander";
import { resolve } from "node:path";
import { loadAllConfig } from "./config/index.js";
import { createLazyAuth0Context, logger, setVerbose, EnvManager } from "./utils/index.js";
import type { CommandContext } from "./utils/index.js";
import {
  verifyTenant,
  reconcileClient,
  reconcileServer,
  reconcileAll,
  addScope,
  grantClient,
  generateArtifacts,
} from "./commands/index.js";

const program = new Command();

program
  .name("mcp-ecosystem")
  .description(
    "Provisioning and runtime tooling for a personal MCP ecosystem backed by Auth0"
  )
  .version("0.1.0")
  .option("-d, --dir <path>", "Root directory of the ecosystem", ".")
  .option("--dry-run", "Preview changes without modifying Auth0 or local files", false)
  .option("--verbose", "Enable verbose/debug output", false)
  .option("--json", "Output results as JSON", false);

async function buildContext(opts: {
  dir: string;
  dryRun: boolean;
  verbose: boolean;
}): Promise<CommandContext> {
  if (opts.verbose) setVerbose(true);

  const rootDir = resolve(opts.dir);
  logger.debug(`Root directory: ${rootDir}`);

  const envManager = await EnvManager.load(rootDir);
  envManager.populateProcessEnv();

  logger.info("Loading ecosystem configuration...");
  const config = await loadAllConfig(rootDir);
  logger.success(
    `Loaded: ${config.clientConfigs.size} client(s), ${config.serverConfigs.size} server(s), ${config.clientDescriptors.size} descriptor(s)`
  );

  const lazy = createLazyAuth0Context(config.ecosystem);

  return {
    rootDir,
    config,
    get auth0() {
      return lazy.auth0;
    },
    envManager,
    dryRun: opts.dryRun,
  };
}

function output(json: boolean, data: unknown): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  }
}

program
  .command("verify-tenant")
  .description("Verify Auth0 tenant prerequisites for MCP compatibility")
  .action(async () => {
    const opts = program.opts() as { dir: string; dryRun: boolean; verbose: boolean; json: boolean };
    try {
      const ctx = await buildContext(opts);
      const result = await verifyTenant(ctx);
      output(opts.json, result);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("reconcile-client <client-key>")
  .description("Create or reuse an Auth0 Application for a specific client")
  .action(async (clientKey: string) => {
    const opts = program.opts() as { dir: string; dryRun: boolean; verbose: boolean; json: boolean };
    try {
      const ctx = await buildContext(opts);
      await ctx.auth0.authenticate();
      const result = await reconcileClient(ctx, clientKey);
      await ctx.envManager.flush(ctx.dryRun);
      output(opts.json, result);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("reconcile-server <server-slug>")
  .description(
    "Reconcile Auth0 API, scopes, access policy, and grants for an MCP server"
  )
  .action(async (serverSlug: string) => {
    const opts = program.opts() as { dir: string; dryRun: boolean; verbose: boolean; json: boolean };
    try {
      const ctx = await buildContext(opts);
      await ctx.auth0.authenticate();
      const result = await reconcileServer(ctx, serverSlug);
      await ctx.envManager.flush(ctx.dryRun);
      output(opts.json, result);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("reconcile-all")
  .description("Full ecosystem reconciliation: tenant, clients, servers, grants")
  .action(async () => {
    const opts = program.opts() as { dir: string; dryRun: boolean; verbose: boolean; json: boolean };
    try {
      const ctx = await buildContext(opts);
      const result = await reconcileAll(ctx);
      await ctx.envManager.flush(ctx.dryRun);
      output(opts.json, result);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("add-scope <server-slug> <scope>")
  .description("Add a scope to a server and reconcile it into Auth0")
  .action(async (serverSlug: string, scope: string) => {
    const opts = program.opts() as { dir: string; dryRun: boolean; verbose: boolean; json: boolean };
    try {
      const ctx = await buildContext(opts);
      await ctx.auth0.authenticate();
      const result = await addScope(ctx, serverSlug, scope);
      output(opts.json, result);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("grant-client <server-slug> <client-key> [scopes...]")
  .description("Create or update a client grant for a server/client pair")
  .action(async (serverSlug: string, clientKey: string, scopes: string[]) => {
    const opts = program.opts() as { dir: string; dryRun: boolean; verbose: boolean; json: boolean };
    try {
      const ctx = await buildContext(opts);
      await ctx.auth0.authenticate();
      const result = await grantClient(ctx, serverSlug, clientKey, scopes);
      await ctx.envManager.flush(ctx.dryRun);
      output(opts.json, result);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("generate-artifacts")
  .description(
    "Generate .env.example and per-server runtime config files"
  )
  .action(async () => {
    const opts = program.opts() as { dir: string; dryRun: boolean; verbose: boolean; json: boolean };
    try {
      const ctx = await buildContext(opts);
      const result = await generateArtifacts(ctx);
      await ctx.envManager.flush(ctx.dryRun);
      output(opts.json, result);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse();
