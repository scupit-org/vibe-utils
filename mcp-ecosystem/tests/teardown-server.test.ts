import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_API_SETTINGS,
  DEFAULT_CLIENT_PROFILES,
} from "../src/config/index.js";
import { Auth0ManagementClient } from "../src/auth0/index.js";
import type { Auth0Api } from "../src/types/index.js";
import type { LoadedConfig } from "../src/config/index.js";
import type { CommandContext } from "../src/utils/index.js";
import { teardownServer } from "../src/commands/teardown-server.js";
import { teardownAll } from "../src/commands/teardown-all.js";
import { EnvManager } from "../src/utils/env-manager.js";

/**
 * Mock Auth0 client for teardown tests. Extends the real client so we satisfy
 * the type; only findApiByIdentifier and deleteApi are used by teardown.
 */
class MockAuth0ForTeardown extends Auth0ManagementClient {
  constructor(
    private findImpl: (identifier: string) => Promise<Auth0Api | null>,
    private deleteImpl: (apiId: string) => Promise<void>
  ) {
    super({
      tenantDomain: "test.auth0.com",
      managementAudience: "https://test.auth0.com/api/v2/",
      clientId: "test",
      clientSecret: "test",
    });
  }

  override async findApiByIdentifier(identifier: string): Promise<Auth0Api | null> {
    return this.findImpl(identifier);
  }

  override async deleteApi(apiId: string): Promise<void> {
    return this.deleteImpl(apiId);
  }
}

function createTestContext(
  tempDir: string,
  envManager: EnvManager,
  config: LoadedConfig,
  auth0: Auth0ManagementClient,
  dryRun: boolean
): CommandContext {
  return {
    rootDir: tempDir,
    config,
    auth0,
    envManager,
    dryRun,
  };
}

const ENV_BLOCK_LINES = [
  "# <automatically-generated>",
  "# Managed by @scupit/mcp-ecosystem -- do not edit manually.",
  "# Re-run reconcile-client or reconcile-all to regenerate.",
  "# </automatically-generated>",
];

function createTestEcosystem() {
  return {
    ecosystem_name: "test-ecosystem",
    domain: {
      base_domain: "real.example.com",
      server_host_pattern: "{slug}-mcp.{base_domain}",
    },
    auth0: {
      tenant_domain: "tenant.example.auth0.com",
      management_audience: "https://tenant.example.auth0.com/api/v2/",
    },
    defaults: {
      api: DEFAULT_API_SETTINGS,
      scope_profiles: {},
      client_profiles: DEFAULT_CLIENT_PROFILES,
    },
  };
}

test("teardownServer dry-run does not call deleteApi", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "teardown-dry-run-"));
  try {
    await writeFile(
      join(tempDir, ".env"),
      ENV_BLOCK_LINES.join("\n") + "\n",
      "utf-8"
    );
    const envManager = await EnvManager.load(tempDir);

    let deleteApiCallCount = 0;
    const auth0 = new MockAuth0ForTeardown(
      async (identifier) => {
        if (identifier === "https://svc-mcp.real.example.com") return { id: "api-1", name: "Svc", identifier };
        if (identifier === "https://svc-mcp.real.example.com/") return { id: "api-2", name: "Svc", identifier };
        return null;
      },
      async () => {
        deleteApiCallCount++;
      }
    );

    const config: LoadedConfig = {
      ecosystem: createTestEcosystem(),
      clientDescriptors: new Map(),
      clientConfigs: new Map(),
      serverConfigs: new Map([["svc", { name: "Svc", slug: "svc" }]]),
    };
    const result = await teardownServer(
      createTestContext(tempDir, envManager, config, auth0, true),
      "svc"
    );

    assert.equal(result.dryRun, true);
    assert.equal(result.slug, "svc");
    assert.equal(result.deleted.length, 2);
    assert.equal(result.notFound.length, 0);
    assert.equal(deleteApiCallCount, 0, "deleteApi must not be called in dry-run");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("teardownServer non-dry-run calls deleteApi for each found API", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "teardown-real-"));
  try {
    await writeFile(
      join(tempDir, ".env"),
      ENV_BLOCK_LINES.join("\n") + "\n",
      "utf-8"
    );
    const envManager = await EnvManager.load(tempDir);

    const deletedIds: string[] = [];
    const auth0 = new MockAuth0ForTeardown(
      async (identifier) => {
        if (identifier === "https://svc-mcp.real.example.com") return { id: "api-1", name: "Svc", identifier };
        if (identifier === "https://svc-mcp.real.example.com/") return { id: "api-2", name: "Svc", identifier };
        return null;
      },
      async (apiId) => {
        deletedIds.push(apiId);
      }
    );

    const config: LoadedConfig = {
      ecosystem: createTestEcosystem(),
      clientDescriptors: new Map(),
      clientConfigs: new Map(),
      serverConfigs: new Map([["svc", { name: "Svc", slug: "svc" }]]),
    };
    const result = await teardownServer(
      createTestContext(tempDir, envManager, config, auth0, false),
      "svc"
    );

    assert.equal(result.dryRun, false);
    assert.equal(result.slug, "svc");
    assert.equal(result.deleted.length, 2);
    assert.equal(result.notFound.length, 0);
    assert.deepEqual(deletedIds.sort(), ["api-1", "api-2"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("teardownServer reports notFound for identifiers with no matching API", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "teardown-notfound-"));
  try {
    await writeFile(
      join(tempDir, ".env"),
      ENV_BLOCK_LINES.join("\n") + "\n",
      "utf-8"
    );
    const envManager = await EnvManager.load(tempDir);

    const auth0 = new MockAuth0ForTeardown(async () => null, async () => {});

    const config: LoadedConfig = {
      ecosystem: createTestEcosystem(),
      clientDescriptors: new Map(),
      clientConfigs: new Map(),
      serverConfigs: new Map([["svc", { name: "Svc", slug: "svc" }]]),
    };
    const result = await teardownServer(
      createTestContext(tempDir, envManager, config, auth0, false),
      "svc"
    );

    assert.equal(result.deleted.length, 0);
    assert.equal(result.notFound.length, 2);
    assert.ok(
      result.notFound.includes("https://svc-mcp.real.example.com"),
      "should include base identifier"
    );
    assert.ok(
      result.notFound.includes("https://svc-mcp.real.example.com/"),
      "should include trailing-slash identifier"
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("teardownAll calls teardownServer for each server and aggregates results", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "teardown-all-aggregate-"));
  try {
    await writeFile(
      join(tempDir, ".env"),
      ENV_BLOCK_LINES.join("\n") + "\n",
      "utf-8"
    );
    const envManager = await EnvManager.load(tempDir);

    let deleteApiCallCount = 0;
    const auth0 = new MockAuth0ForTeardown(
      async (identifier) => {
        if (identifier === "https://svc-mcp.real.example.com") return { id: "api-1", name: "Svc", identifier };
        if (identifier === "https://svc-mcp.real.example.com/") return { id: "api-2", name: "Svc", identifier };
        if (identifier === "https://other-mcp.real.example.com") return { id: "api-3", name: "Other", identifier };
        if (identifier === "https://other-mcp.real.example.com/") return { id: "api-4", name: "Other", identifier };
        return null;
      },
      async () => {
        deleteApiCallCount++;
      }
    );

    const config: LoadedConfig = {
      ecosystem: createTestEcosystem(),
      clientDescriptors: new Map(),
      clientConfigs: new Map(),
      serverConfigs: new Map([
        ["svc", { name: "Svc", slug: "svc" }],
        ["other", { name: "Other", slug: "other" }],
      ]),
    };
    const result = await teardownAll(
      createTestContext(tempDir, envManager, config, auth0, true)
    );

    assert.equal(result.servers.length, 2);
    assert.equal(deleteApiCallCount, 0, "deleteApi must not be called in dry-run");

    const svcResult = result.servers.find((s) => s.slug === "svc");
    const otherResult = result.servers.find((s) => s.slug === "other");
    assert.ok(svcResult, "svc result should be present");
    assert.ok(otherResult, "other result should be present");
    assert.equal(svcResult!.deleted.length, 2);
    assert.equal(otherResult!.deleted.length, 2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("teardownAll continues after per-server failure", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "teardown-all-failure-"));
  try {
    await writeFile(
      join(tempDir, ".env"),
      ENV_BLOCK_LINES.join("\n") + "\n",
      "utf-8"
    );
    const envManager = await EnvManager.load(tempDir);

    const auth0 = new MockAuth0ForTeardown(
      async (identifier) => {
        if (identifier.includes("svc-mcp")) throw new Error("Auth0 API error");
        if (identifier === "https://other-mcp.real.example.com") return { id: "api-3", name: "Other", identifier };
        if (identifier === "https://other-mcp.real.example.com/") return { id: "api-4", name: "Other", identifier };
        return null;
      },
      async () => {}
    );

    const config: LoadedConfig = {
      ecosystem: createTestEcosystem(),
      clientDescriptors: new Map(),
      clientConfigs: new Map(),
      serverConfigs: new Map([
        ["svc", { name: "Svc", slug: "svc" }],
        ["other", { name: "Other", slug: "other" }],
      ]),
    };
    const result = await teardownAll(
      createTestContext(tempDir, envManager, config, auth0, false)
    );

    assert.equal(result.servers.length, 1);
    assert.equal(result.servers[0].slug, "other");
    assert.equal(result.servers[0].deleted.length, 2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("teardownAll throws when base_domain is empty and servers are configured", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "teardown-all-missing-env-"));
  try {
    await writeFile(
      join(tempDir, ".env"),
      ENV_BLOCK_LINES.join("\n") + "\n",
      "utf-8"
    );
    const envManager = await EnvManager.load(tempDir);

    const ecosystemWithEmptyBase = {
      ...createTestEcosystem(),
      domain: {
        base_domain: "",
        server_host_pattern: "{slug}-mcp.{base_domain}",
      },
    };

    const auth0 = new MockAuth0ForTeardown(async () => null, async () => {});
    const config: LoadedConfig = {
      ecosystem: ecosystemWithEmptyBase,
      clientDescriptors: new Map(),
      clientConfigs: new Map(),
      serverConfigs: new Map([["svc", { name: "Svc", slug: "svc" }]]),
    };

    await assert.rejects(
      async () => teardownAll(createTestContext(tempDir, envManager, config, auth0, false)),
      /Missing required|ECOSYSTEM_BASE_DOMAIN/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("teardownAll with zero servers returns empty result", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "teardown-all-zero-"));
  try {
    await writeFile(
      join(tempDir, ".env"),
      ENV_BLOCK_LINES.join("\n") + "\n",
      "utf-8"
    );
    const envManager = await EnvManager.load(tempDir);

    const auth0 = new MockAuth0ForTeardown(async () => null, async () => {});
    const config: LoadedConfig = {
      ecosystem: createTestEcosystem(),
      clientDescriptors: new Map(),
      clientConfigs: new Map(),
      serverConfigs: new Map(),
    };
    const result = await teardownAll(
      createTestContext(tempDir, envManager, config, auth0, false)
    );

    assert.equal(result.servers.length, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("teardownAll continues when first server succeeds and second fails", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "teardown-all-reverse-failure-"));
  try {
    await writeFile(
      join(tempDir, ".env"),
      ENV_BLOCK_LINES.join("\n") + "\n",
      "utf-8"
    );
    const envManager = await EnvManager.load(tempDir);

    const auth0 = new MockAuth0ForTeardown(
      async (identifier) => {
        if (identifier.includes("other-mcp")) throw new Error("Auth0 API error");
        if (identifier === "https://svc-mcp.real.example.com") return { id: "api-1", name: "Svc", identifier };
        if (identifier === "https://svc-mcp.real.example.com/") return { id: "api-2", name: "Svc", identifier };
        return null;
      },
      async () => {}
    );

    const config: LoadedConfig = {
      ecosystem: createTestEcosystem(),
      clientDescriptors: new Map(),
      clientConfigs: new Map(),
      serverConfigs: new Map([
        ["svc", { name: "Svc", slug: "svc" }],
        ["other", { name: "Other", slug: "other" }],
      ]),
    };
    const result = await teardownAll(
      createTestContext(tempDir, envManager, config, auth0, false)
    );

    assert.equal(result.servers.length, 1);
    assert.equal(result.servers[0].slug, "svc");
    assert.equal(result.servers[0].deleted.length, 2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("teardownServer throws for unknown server slug", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "teardown-unknown-"));
  try {
    await writeFile(
      join(tempDir, ".env"),
      ENV_BLOCK_LINES.join("\n") + "\n",
      "utf-8"
    );
    const envManager = await EnvManager.load(tempDir);

    const auth0 = new MockAuth0ForTeardown(async () => null, async () => {});
    const config: LoadedConfig = {
      ecosystem: createTestEcosystem(),
      clientDescriptors: new Map(),
      clientConfigs: new Map(),
      serverConfigs: new Map(),
    };

    await assert.rejects(
      async () =>
        teardownServer(
          createTestContext(tempDir, envManager, config, auth0, false),
          "nonexistent"
        ),
      /Unknown server slug/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
