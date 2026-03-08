import { Command } from "commander";
import type {
  TransportConfig,
  StdioTransportConfig,
  StreamableHttpStatelessTransportConfig,
  StreamableHttpStatefulTransportConfig,
} from "./transport-config.js";

/** Canonical transport names used in the TypeScript API. */
export type TransportSelectionName =
  | "stdio"
  | "streamable_http_stateless"
  | "streamable_http_stateful";

/** Keyed object of configured transports. Keys must use canonical underscore names. */
export interface ConfiguredTransports {
  stdio?: StdioTransportConfig;
  streamable_http_stateless?: StreamableHttpStatelessTransportConfig;
  streamable_http_stateful?: StreamableHttpStatefulTransportConfig;
}

/** Options for resolving which transport to use from multiple configured options. */
export interface ResolveTransportSelectionOptions {
  /** Keyed object of configured transports. Keys use canonical underscore names. */
  configuredTransports: ConfiguredTransports;

  /** Explicit programmatic override. Takes precedence over CLI and env. */
  selectedTransport?: TransportSelectionName;

  /** CLI arguments for parsing --transport=<name>. If omitted, CLI is not consulted. */
  argv?: string[];

  /** Environment variables for MCP_TRANSPORT. If omitted, env is not consulted. */
  env?: Record<string, string | undefined>;

  /** CLI flag name for transport selection. @default "transport" */
  cliFlagName?: string;

  /** Environment variable name for transport selection. @default "MCP_TRANSPORT" */
  envVarName?: string;
}

const HYPHEN_TO_UNDERSCORE: Record<string, TransportSelectionName> = {
  "streamable-http-stateless": "streamable_http_stateless",
  "streamable-http-stateful": "streamable_http_stateful",
};

/**
 * Normalizes a transport name from CLI or env to the canonical underscore form.
 * Accepts both hyphenated and underscored variants for HTTP transports.
 */
export function normalizeTransportName(
  raw: string
): TransportSelectionName | null {
  const trimmed = raw.trim().toLowerCase();
  if (["stdio", "streamable_http_stateless", "streamable_http_stateful"].includes(trimmed)) {
    return trimmed as TransportSelectionName;
  }
  const fromHyphen = HYPHEN_TO_UNDERSCORE[trimmed];
  if (fromHyphen) return fromHyphen;
  return null;
}

function parseCliFlag(argv: string[], flagName: string): string | undefined {
  const program = new Command();
  program.allowUnknownOption();
  program.allowExcessArguments();
  program.option(`--${flagName} <value>`, "");
  program.parse(argv, { from: "user" });
  const opts = program.opts() as Record<string, string | undefined>;
  const key = flagName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return opts[key];
}

function validateConfiguredTransports(
  configured: ConfiguredTransports
): TransportSelectionName[] {
  const configuredNames: TransportSelectionName[] = [];
  const keys: (keyof ConfiguredTransports)[] = [
    "stdio",
    "streamable_http_stateless",
    "streamable_http_stateful",
  ];

  for (const key of keys) {
    const config = configured[key];
    if (!config) continue;

    if (typeof config !== "object" || config === null) {
      throw new Error(
        `Configured transport key "${key}" must be a valid transport config object.`
      );
    }

    const expectedType = key;
    const actualType = (config as { type?: string }).type;

    if (actualType === undefined || actualType === null) {
      throw new Error(
        `Configured transport key "${key}" is missing config.type. Expected type "${expectedType}".`
      );
    }

    if (actualType !== expectedType) {
      throw new Error(
        `Configured transport key "${key}" does not match config.type "${actualType}". Expected type "${expectedType}".`
      );
    }

    configuredNames.push(key);
  }

  return configuredNames;
}

/**
 * Resolves exactly one transport from multiple configured options.
 *
 * Resolution order:
 * 1. `selectedTransport` explicit programmatic override
 * 2. CLI flag from `argv` (e.g. --transport=stdio)
 * 3. Environment variable from `env` (e.g. MCP_TRANSPORT=stdio)
 * 4. Otherwise throws a clear error (no default or auto-selection)
 *
 * CLI and env values accept both hyphenated and underscored HTTP names:
 * - streamable-http-stateless / streamable_http_stateless
 * - streamable-http-stateful / streamable_http_stateful
 */
export function resolveTransportSelection(
  options: ResolveTransportSelectionOptions
): TransportConfig {
  const {
    configuredTransports,
    selectedTransport,
    argv,
    env,
    cliFlagName = "transport",
    envVarName = "MCP_TRANSPORT",
  } = options;

  const configuredNames = validateConfiguredTransports(configuredTransports);

  if (configuredNames.length === 0) {
    throw new Error(
      "No transports are configured. Add at least one transport to configuredTransports."
    );
  }

  let resolvedName: TransportSelectionName | null = null;

  if (selectedTransport !== undefined && selectedTransport !== null) {
    resolvedName = selectedTransport;
  } else if (argv && argv.length > 0) {
    const cliValue = parseCliFlag(argv, cliFlagName);
    if (cliValue) {
      resolvedName = normalizeTransportName(cliValue);
      if (!resolvedName) {
        throw new Error(
          `Invalid transport name from CLI (--${cliFlagName}=${cliValue}). ` +
            `Accepted values: stdio, streamable_http_stateless, streamable_http_stateful, ` +
            `streamable-http-stateless, streamable-http-stateful.`
        );
      }
    }
  }

  if (!resolvedName && env) {
    const envValue = env[envVarName];
    if (envValue !== undefined && envValue !== null && envValue !== "") {
      resolvedName = normalizeTransportName(envValue);
      if (!resolvedName) {
        throw new Error(
          `Invalid transport name from ${envVarName}="${envValue}". ` +
            `Accepted values: stdio, streamable_http_stateless, streamable_http_stateful, ` +
            `streamable-http-stateless, streamable-http-stateful.`
        );
      }
    }
  }

  if (!resolvedName) {
    const list = configuredNames.join(", ");
    throw new Error(
      `No transport selected. Configured transports: ${list}. ` +
        `Select one with --${cliFlagName}=<name> or ${envVarName}=<name>.`
    );
  }

  const name = resolvedName as TransportSelectionName;

  if (!configuredNames.includes(name)) {
    const list = configuredNames.join(", ");
    throw new Error(
      `Requested transport "${name}", but it is not configured. ` +
        `Configured transports: ${list}.`
    );
  }

  const config = configuredTransports[name];
  if (!config) {
    throw new Error(
      `Internal error: transport "${name}" was validated but config is missing.`
    );
  }

  return config;
}
