import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  stdioTransport,
  streamableHttpStatelessTransport,
  streamableHttpStatefulTransport,
  resolveTransportSelection,
  normalizeTransportName,
  createMcpServer,
} from "../src/mcp-server/index.js";
import type { TransportConfig } from "../src/mcp-server/index.js";

// --- Transport helpers ---

test("stdioTransport returns config with canonical type", () => {
  const config = stdioTransport({});
  assert.equal(config.type, "stdio");
});

test("streamableHttpStatelessTransport returns config with canonical type", () => {
  const config = streamableHttpStatelessTransport({ port: 3000 });
  assert.equal(config.type, "streamable_http_stateless");
});

test("streamableHttpStatelessTransport preserves config options", () => {
  const config = streamableHttpStatelessTransport({
    port: 3001,
    auth: { enabled: false },
  });
  assert.equal(config.type, "streamable_http_stateless");
  assert.equal(config.port, 3001);
  assert.equal(config.auth?.enabled, false);
});

test("streamableHttpStatefulTransport returns config with canonical type", () => {
  const config = streamableHttpStatefulTransport({ port: 3000 });
  assert.equal(config.type, "streamable_http_stateful");
});

test("streamableHttpStatefulTransport preserves config options", () => {
  const config = streamableHttpStatefulTransport({
    port: 3002,
    retryInterval: 5000,
  });
  assert.equal(config.type, "streamable_http_stateful");
  assert.equal(config.port, 3002);
  assert.equal(config.retryInterval, 5000);
});

// --- normalizeTransportName ---

test("normalizeTransportName accepts stdio", () => {
  assert.equal(normalizeTransportName("stdio"), "stdio");
  assert.equal(normalizeTransportName("  stdio  "), "stdio");
});

test("normalizeTransportName accepts underscore HTTP names", () => {
  assert.equal(
    normalizeTransportName("streamable_http_stateless"),
    "streamable_http_stateless"
  );
  assert.equal(
    normalizeTransportName("streamable_http_stateful"),
    "streamable_http_stateful"
  );
});

test("normalizeTransportName accepts hyphenated HTTP names", () => {
  assert.equal(
    normalizeTransportName("streamable-http-stateless"),
    "streamable_http_stateless"
  );
  assert.equal(
    normalizeTransportName("streamable-http-stateful"),
    "streamable_http_stateful"
  );
});

test("normalizeTransportName returns null for invalid names", () => {
  assert.equal(normalizeTransportName("invalid"), null);
  assert.equal(normalizeTransportName("streamable_http"), null);
  assert.equal(normalizeTransportName(""), null);
});

// --- resolveTransportSelection ---

test("one configured transport with no selection throws", () => {
  assert.throws(
    () =>
      resolveTransportSelection({
        configuredTransports: {
          stdio: stdioTransport({}),
        },
      }),
    /No transport selected/
  );
});

test("one configured transport with selectedTransport works", () => {
  const result = resolveTransportSelection({
    configuredTransports: {
      stdio: stdioTransport({}),
    },
    selectedTransport: "stdio",
  });
  assert.equal(result.type, "stdio");
});

test("explicit selectedTransport overrides CLI and env", () => {
  const result = resolveTransportSelection({
    configuredTransports: {
      stdio: stdioTransport({}),
      streamable_http_stateless: streamableHttpStatelessTransport({ port: 3001 }),
    },
    selectedTransport: "stdio",
    argv: ["node", "script.js", "--transport=streamable_http_stateless"],
    env: { MCP_TRANSPORT: "streamable_http_stateless" },
  });
  assert.equal(result.type, "stdio");
});

test("CLI overrides env when selectedTransport is absent", () => {
  const result = resolveTransportSelection({
    configuredTransports: {
      stdio: stdioTransport({}),
      streamable_http_stateless: streamableHttpStatelessTransport({ port: 3001 }),
    },
    argv: ["node", "script.js", "--transport=stdio"],
    env: { MCP_TRANSPORT: "streamable_http_stateless" },
  });
  assert.equal(result.type, "stdio");
});

test("env works when CLI is absent", () => {
  const result = resolveTransportSelection({
    configuredTransports: {
      stdio: stdioTransport({}),
      streamable_http_stateless: streamableHttpStatelessTransport({ port: 3001 }),
    },
    argv: ["node", "script.js"],
    env: { MCP_TRANSPORT: "streamable_http_stateless" },
  });
  assert.equal(result.type, "streamable_http_stateless");
});

test("hyphenated CLI name normalizes correctly", () => {
  const result = resolveTransportSelection({
    configuredTransports: {
      streamable_http_stateless: streamableHttpStatelessTransport({ port: 3001 }),
    },
    argv: ["node", "script.js", "--transport=streamable-http-stateless"],
    cliFlagName: "transport",
  });
  assert.equal(result.type, "streamable_http_stateless");
});

test("hyphenated env name normalizes correctly", () => {
  const result = resolveTransportSelection({
    configuredTransports: {
      streamable_http_stateful: streamableHttpStatefulTransport({ port: 3002 }),
    },
    env: { MCP_TRANSPORT: "streamable-http-stateful" },
  });
  assert.equal(result.type, "streamable_http_stateful");
});

test("underscored CLI name works", () => {
  const result = resolveTransportSelection({
    configuredTransports: {
      streamable_http_stateless: streamableHttpStatelessTransport({ port: 3001 }),
    },
    argv: ["node", "script.js", "--transport=streamable_http_stateless"],
  });
  assert.equal(result.type, "streamable_http_stateless");
});

test("invalid CLI name throws", () => {
  assert.throws(
    () =>
      resolveTransportSelection({
        configuredTransports: {
          streamable_http_stateless: streamableHttpStatelessTransport({ port: 3000 }),
        },
        argv: ["node", "script.js", "--transport=invalid"],
      }),
    /Invalid transport name from CLI/
  );
});

test("invalid env name throws", () => {
  assert.throws(
    () =>
      resolveTransportSelection({
        configuredTransports: {
          streamable_http_stateless: streamableHttpStatelessTransport({ port: 3000 }),
        },
        env: { MCP_TRANSPORT: "invalid" },
      }),
    /Invalid transport name from MCP_TRANSPORT/
  );
});

test("multiple configured transports with no selection throws", () => {
  assert.throws(
    () =>
      resolveTransportSelection({
        configuredTransports: {
          stdio: stdioTransport({}),
          streamable_http_stateless: streamableHttpStatelessTransport({ port: 3000 }),
        },
      }),
    /No transport selected/
  );
});

test("selected transport not configured throws", () => {
  assert.throws(
    () =>
      resolveTransportSelection({
        configuredTransports: {
          stdio: stdioTransport({}),
        },
        selectedTransport: "streamable_http_stateless",
      }),
    /Requested transport "streamable_http_stateless", but it is not configured/
  );
});

test("zero configured transports throws", () => {
  assert.throws(
    () =>
      resolveTransportSelection({
        configuredTransports: {},
      }),
    /No transports are configured/
  );
});

test("key/type mismatch throws", () => {
  assert.throws(
    () =>
      resolveTransportSelection({
        configuredTransports: {
          streamable_http_stateless: {
            type: "streamable_http_stateful",
            port: 3001,
          } as never,
        },
      }),
    /Configured transport key "streamable_http_stateless" does not match config.type/
  );
});

test("missing config.type throws", () => {
  assert.throws(
    () =>
      resolveTransportSelection({
        configuredTransports: {
          streamable_http_stateless: { port: 3001 } as never,
        },
      }),
    /Configured transport key "streamable_http_stateless" is missing config.type/
  );
});

test("custom cliFlagName and envVarName work", () => {
  const result = resolveTransportSelection({
    configuredTransports: {
      stdio: stdioTransport({}),
      streamable_http_stateless: streamableHttpStatelessTransport({ port: 3000 }),
    },
    argv: ["node", "script.js", "--mcp-transport=stdio"],
    cliFlagName: "mcp-transport",
    envVarName: "TRANSPORT",
  });
  assert.equal(result.type, "stdio");
});

// --- Integration: createMcpServer with single transport ---

test("createMcpServer works with stdioTransport helper", async () => {
  const temp = await createTempDir("transport-stdio-");
  const previousEnv = snapshotEnv(["ECOSYSTEM_BASE_DOMAIN"]);

  try {
    await setupMinimalEcosystem(temp.dir);
    process.env.ECOSYSTEM_BASE_DOMAIN = "real.example.test";

    const mcp = await createMcpServer(
      pathToFileURL(join(temp.dir, "mcps", "demo", "server.ts")).href,
      { transport: stdioTransport({}) },
      () => {}
    );

    assert.equal(mcp.config.server.slug, "demo");
  } finally {
    restoreEnv(previousEnv);
    await temp.cleanup();
  }
});

test("createMcpServer works with streamableHttpStatelessTransport helper", async () => {
  const temp = await createTempDir("transport-http-");
  const previousEnv = snapshotEnv(["ECOSYSTEM_BASE_DOMAIN"]);

  try {
    await setupMinimalEcosystem(temp.dir);
    process.env.ECOSYSTEM_BASE_DOMAIN = "real.example.test";

    const mcp = await createMcpServer(
      pathToFileURL(join(temp.dir, "mcps", "demo", "server.ts")).href,
      {
        transport: streamableHttpStatelessTransport({
          port: 0,
          auth: { enabled: false },
        }),
      },
      () => {}
    );

    assert.equal(mcp.config.server.slug, "demo");
    await mcp.stop();
  } finally {
    restoreEnv(previousEnv);
    await temp.cleanup();
  }
});

test("createMcpServer throws when transport is omitted", async () => {
  const temp = await createTempDir("transport-omit-");
  const previousEnv = snapshotEnv(["ECOSYSTEM_BASE_DOMAIN"]);

  try {
    await setupMinimalEcosystem(temp.dir);
    process.env.ECOSYSTEM_BASE_DOMAIN = "real.example.test";

    await assert.rejects(
      async () =>
        createMcpServer(
          pathToFileURL(join(temp.dir, "mcps", "demo", "server.ts")).href,
          {} as { transport: TransportConfig },
          () => {}
        ),
      /Transport is required/
    );
  } finally {
    restoreEnv(previousEnv);
    await temp.cleanup();
  }
});

test("createMcpServer works with resolveTransportSelection result", async () => {
  const temp = await createTempDir("transport-resolve-");
  const previousEnv = snapshotEnv(["ECOSYSTEM_BASE_DOMAIN"]);

  try {
    await setupMinimalEcosystem(temp.dir);
    process.env.ECOSYSTEM_BASE_DOMAIN = "real.example.test";

    const transport = resolveTransportSelection({
      configuredTransports: {
        stdio: stdioTransport({}),
      },
      selectedTransport: "stdio",
    });

    const mcp = await createMcpServer(
      pathToFileURL(join(temp.dir, "mcps", "demo", "server.ts")).href,
      { transport },
      () => {}
    );

    assert.equal(mcp.config.server.slug, "demo");
  } finally {
    restoreEnv(previousEnv);
    await temp.cleanup();
  }
});

// --- Helpers ---

async function createTempDir(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return {
    dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

async function setupMinimalEcosystem(rootDir: string) {
  await writeFile(
    join(rootDir, "ecosystem-configuration.json"),
    JSON.stringify({
      domain: { server_host_pattern: "{slug}-mcp.{base_domain}" },
    }),
    "utf-8"
  );
  await mkdir(join(rootDir, "mcps", "demo"), { recursive: true });
  await writeFile(
    join(rootDir, "mcps", "demo", "mcp-configuration.json"),
    JSON.stringify({ name: "Demo", slug: "demo" }),
    "utf-8"
  );
  await writeFile(join(rootDir, "mcps", "demo", "server.ts"), "", "utf-8");
}

function snapshotEnv(keys: string[]): Map<string, string | undefined> {
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Map<string, string | undefined>): void {
  for (const [key, value] of snapshot) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
