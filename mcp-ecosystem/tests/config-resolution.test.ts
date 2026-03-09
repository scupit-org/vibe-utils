import test from "node:test";
import assert from "node:assert/strict";
import {
  loadAllConfig,
  resolveSessionIdleTimeoutSeconds,
  DEFAULT_TRANSPORT_SETTINGS,
} from "../src/config/index.js";

test("resolveSessionIdleTimeoutSeconds returns ecosystem default when server has no override", async () => {
  const temp = await createTempEcosystem();
  try {
    const { ecosystem, serverConfigs } = await loadAllConfig(temp.dir);
    const server = serverConfigs.get("demo");
    assert.ok(server);

    const value = resolveSessionIdleTimeoutSeconds(ecosystem, server);
    assert.equal(value, DEFAULT_TRANSPORT_SETTINGS.session_idle_timeout_seconds);
  } finally {
    await temp.cleanup();
  }
});

test("resolveSessionIdleTimeoutSeconds returns server override when set", async () => {
  const temp = await createTempEcosystem({
    serverOverrides: { transport: { session_idle_timeout_seconds: 1800 } },
  });
  try {
    const { ecosystem, serverConfigs } = await loadAllConfig(temp.dir);
    const server = serverConfigs.get("demo");
    assert.ok(server);

    const value = resolveSessionIdleTimeoutSeconds(ecosystem, server);
    assert.equal(value, 1800);
  } finally {
    await temp.cleanup();
  }
});

test("resolveSessionIdleTimeoutSeconds returns ecosystem override when server has none", async () => {
  const temp = await createTempEcosystem({
    ecosystemOverrides: {
      defaults: { transport: { session_idle_timeout_seconds: 900 } },
    },
  });
  try {
    const { ecosystem, serverConfigs } = await loadAllConfig(temp.dir);
    const server = serverConfigs.get("demo");
    assert.ok(server);

    const value = resolveSessionIdleTimeoutSeconds(ecosystem, server);
    assert.equal(value, 900);
  } finally {
    await temp.cleanup();
  }
});

test("session_idle_timeout_seconds 0 in server config fails Zod parse", async () => {
  const temp = await createTempEcosystem({
    serverOverrides: { transport: { session_idle_timeout_seconds: 0 } },
  });
  try {
    await assert.rejects(
      async () => loadAllConfig(temp.dir),
      (err: Error) =>
        err.message.includes("session_idle_timeout_seconds") ||
        err.message.includes("0") ||
        err.message.includes("minimum")
    );
  } finally {
    await temp.cleanup();
  }
});

async function createTempEcosystem(options?: {
  ecosystemOverrides?: Record<string, unknown>;
  serverOverrides?: Record<string, unknown>;
}) {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const dir = await mkdtemp(join(tmpdir(), "config-resolution-"));

  const ecosystem = {
    domain: { server_host_pattern: "{slug}-mcp.{base_domain}" },
    ...options?.ecosystemOverrides,
  };
  await writeFile(
    join(dir, "ecosystem-configuration.json"),
    JSON.stringify(ecosystem),
    "utf-8"
  );

  await mkdir(join(dir, "mcps", "demo"), { recursive: true });
  const serverConfig = {
    name: "Demo",
    slug: "demo",
    ...options?.serverOverrides,
  };
  await writeFile(
    join(dir, "mcps", "demo", "mcp-configuration.json"),
    JSON.stringify(serverConfig),
    "utf-8"
  );

  return {
    dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}
