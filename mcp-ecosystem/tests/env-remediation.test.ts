import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_API_SETTINGS,
  DEFAULT_CLIENT_PROFILES,
} from "../src/config/index.js";
import { generateArtifacts } from "../src/commands/generate-artifacts.js";
import { grantClient } from "../src/commands/grant-client.js";
import { reconcileClient } from "../src/commands/reconcile-client.js";
import { reconcileServer } from "../src/commands/reconcile-server.js";
import { assertNoManagedClientCredentialsOutsideManagedBlock } from "../src/commands/env-root-validation.js";
import {
  createMcpServer,
  stdioTransport,
} from "../src/mcp-server/index.js";
import { EnvManager } from "../src/utils/env-manager.js";

interface TempEnvContext {
  dir: string;
  cleanup(): Promise<void>;
}

const ENV_BLOCK_LINES = [
  "# <automatically-generated>",
  "# Managed by @scupit/mcp-ecosystem -- do not edit manually.",
  "# Re-run reconcile-client or reconcile-all to regenerate.",
];

test("EnvManager preserves user-authored outer content when flushing managed values", async () => {
  const temp = await createTempDir("env-preserve-");
  try {
    const envPath = join(temp.dir, ".env");
    await writeFile(
      envPath,
      [
        "# user-before",
        "CUSTOM_ONE=alpha",
        ...ENV_BLOCK_LINES,
        "AUTH0_EXISTING_CLIENT_ID='abc'",
        "# </automatically-generated>",
        "# user-after",
        "CUSTOM_TWO=beta",
        "",
      ].join("\n"),
      "utf-8"
    );

    const manager = await EnvManager.load(temp.dir);
    manager.set("AUTH0_NEW_CLIENT_ID", "xyz");
    await manager.flush(false);

    const updated = await readFile(envPath, "utf-8");
    assert.match(updated, /# user-before\nCUSTOM_ONE=alpha/);
    assert.match(updated, /# user-after\nCUSTOM_TWO=beta/);
    assert.match(updated, /AUTH0_NEW_CLIENT_ID='xyz'/);
  } finally {
    await temp.cleanup();
  }
});

test("tool-managed client credential keys outside the managed block hard-fail", async () => {
  const temp = await createTempDir("env-outer-key-");
  try {
    await writeFile(
      join(temp.dir, ".env"),
      "AUTH0_CURSOR_PRIMARY_CLIENT_SECRET=abc\n",
      "utf-8"
    );

    const envManager = await EnvManager.load(temp.dir);

    assert.throws(
      () =>
        assertNoManagedClientCredentialsOutsideManagedBlock({
          envManager,
          rootDir: temp.dir,
        } as const),
      /Invalid tool-managed client credentials/
    );
  } finally {
    await temp.cleanup();
  }
});

test("managed client secrets preserve write-once semantics inside the managed block", async () => {
  const temp = await createTempDir("env-write-once-");
  try {
    await writeFile(
      join(temp.dir, ".env"),
      [
        ...ENV_BLOCK_LINES,
        "AUTH0_WORKER_CLIENT_SECRET='existing'",
        "# </automatically-generated>",
        "",
      ].join("\n"),
      "utf-8"
    );

    const envManager = await EnvManager.load(temp.dir);
    const sameValue = envManager.set("AUTH0_WORKER_CLIENT_SECRET", "existing", {
      writeOnce: true,
      rejectOuterCollision: true,
    });
    const newValue = envManager.set("AUTH0_WORKER_CLIENT_SECRET", "new-secret", {
      writeOnce: true,
      rejectOuterCollision: true,
    });

    assert.equal(sameValue.status, "matched_existing_managed");
    assert.equal(newValue.status, "skipped_existing_managed");
  } finally {
    await temp.cleanup();
  }
});

test("reconcileClient rejects cached client IDs that point at the wrong managed app", async () => {
  const temp = await createTempDir("env-cached-id-");
  try {
    await writeFile(
      join(temp.dir, ".env"),
      [
        ...ENV_BLOCK_LINES,
        "AUTH0_WORKER_CLIENT_ID='cid123'",
        "# </automatically-generated>",
        "",
      ].join("\n"),
      "utf-8"
    );

    const envManager = await EnvManager.load(temp.dir);

    await assert.rejects(
      async () =>
        reconcileClient(
          {
            rootDir: temp.dir,
            dryRun: false,
            envManager,
            auth0: {
              getApplication: async () => ({
                client_id: "cid123",
                name: "Wrong App",
                client_metadata: {
                  managed_by: "@scupit/mcp-ecosystem",
                  ecosystem: "other-ecosystem",
                  client_key: "worker",
                },
              }),
            },
            config: {
              ecosystem: createTestEcosystem("expected-ecosystem"),
              clientDescriptors: new Map(),
              clientConfigs: new Map([
                [
                  "worker",
                  {
                    client_key: "worker",
                    display_name: "Worker",
                    profile: "service_m2m",
                    auth0: { create_if_missing: true },
                  },
                ],
              ]),
              serverConfigs: new Map(),
            },
          } as any,
          "worker"
        ),
      /Cached client ID mismatch/
    );
  } finally {
    await temp.cleanup();
  }
});

test("reconcileClient dry-run reports patch when cached managed app would be patched", async () => {
  const temp = await createTempDir("env-dry-run-patch-");
  try {
    await writeFile(
      join(temp.dir, ".env"),
      [
        ...ENV_BLOCK_LINES,
        "AUTH0_WEBAPP_CLIENT_ID='cid456'",
        "# </automatically-generated>",
        "",
      ].join("\n"),
      "utf-8"
    );

    const envManager = await EnvManager.load(temp.dir);

    const result = await reconcileClient(
      {
        rootDir: temp.dir,
        dryRun: true,
        envManager,
        auth0: {
          getApplication: async () => ({
            client_id: "cid456",
            name: "Managed App",
            app_type: "regular_web",
            token_endpoint_auth_method: "client_secret_basic",
            client_metadata: {
              managed_by: "@scupit/mcp-ecosystem",
              ecosystem: "expected-ecosystem",
              client_key: "webapp",
            },
          }),
        },
        config: {
          ecosystem: createTestEcosystem("expected-ecosystem"),
          clientDescriptors: new Map([
            [
              "browser-app",
              {
                descriptor_key: "browser-app",
                display_name: "Browser App",
                access_mode: "user",
                reuse_policy: "patch_if_safe",
              },
            ],
          ]),
          clientConfigs: new Map([
            [
              "webapp",
              {
                client_key: "webapp",
                display_name: "Web App",
                descriptor: "browser-app",
                profile: "regular_web_interactive",
                auth0: { create_if_missing: true },
              },
            ],
          ]),
          serverConfigs: new Map(),
        },
      } as any,
      "webapp"
    );

    assert.equal(result.action, "dry_run");
  } finally {
    await temp.cleanup();
  }
});

test("generateArtifacts preserves outer .env.example content and writes placeholders only", async () => {
  const temp = await createTempDir("env-example-");
  const previousEnv = snapshotEnv([
    "ECOSYSTEM_BASE_DOMAIN",
    "AUTH0_TENANT_DOMAIN",
    "AUTH0_MGMT_CLIENT_ID",
    "AUTH0_MGMT_CLIENT_SECRET",
  ]);

  try {
    process.env.ECOSYSTEM_BASE_DOMAIN = "real.example.com";
    process.env.AUTH0_TENANT_DOMAIN = "tenant.real.auth0.com";
    process.env.AUTH0_MGMT_CLIENT_ID = "real-client-id";
    process.env.AUTH0_MGMT_CLIENT_SECRET = "real-client-secret";

    await writeFile(
      join(temp.dir, ".env.example"),
      ["# custom note", "CUSTOM_DOCS=value", ""].join("\n"),
      "utf-8"
    );

    await generateArtifacts({ rootDir: temp.dir, dryRun: false } as any);
    const updated = await readFile(join(temp.dir, ".env.example"), "utf-8");

    assert.match(updated, /# custom note\nCUSTOM_DOCS=value/);
    assert.match(updated, /ECOSYSTEM_BASE_DOMAIN=example\.com/);
    assert.match(updated, /AUTH0_TENANT_DOMAIN=your-tenant\.auth0\.com/);
    assert.match(updated, /AUTH0_MGMT_CLIENT_ID=__REQUIRED__/);
    assert.match(updated, /AUTH0_MGMT_CLIENT_SECRET=__REQUIRED__/);
    assert.doesNotMatch(updated, /real\.example\.com|tenant\.real\.auth0\.com|real-client-id|real-client-secret/);
  } finally {
    restoreEnv(previousEnv);
    await temp.cleanup();
  }
});

test("grantClient rejects cached client IDs that point at the wrong managed app", async () => {
  const temp = await createTempDir("grant-client-cached-id-");
  try {
    await writeFile(
      join(temp.dir, ".env"),
      [
        ...ENV_BLOCK_LINES,
        "AUTH0_WEBAPP_CLIENT_ID='cid789'",
        "# </automatically-generated>",
        "",
      ].join("\n"),
      "utf-8"
    );

    const envManager = await EnvManager.load(temp.dir);

    await assert.rejects(
      async () =>
        grantClient(
          {
            rootDir: temp.dir,
            dryRun: false,
            envManager,
            auth0: {
              getApplication: async () => ({
                client_id: "cid789",
                name: "Wrong App",
                client_metadata: {
                  managed_by: "@scupit/mcp-ecosystem",
                  ecosystem: "other-ecosystem",
                  client_key: "webapp",
                },
              }),
            },
            config: {
              ecosystem: createTestEcosystem("expected-ecosystem"),
              clientDescriptors: new Map(),
              clientConfigs: new Map([
                [
                  "webapp",
                  {
                    client_key: "webapp",
                    display_name: "Web App",
                    profile: "regular_web_interactive",
                    auth0: { create_if_missing: true },
                  },
                ],
              ]),
              serverConfigs: new Map([
                [
                  "svc",
                  {
                    name: "Svc",
                    slug: "svc",
                  },
                ],
              ]),
            },
          } as any,
          "svc",
          "webapp"
        ),
      /Cached client ID mismatch/
    );
  } finally {
    await temp.cleanup();
  }
});

test("reconcileServer rejects cached client IDs that point at the wrong managed app", async () => {
  const temp = await createTempDir("reconcile-server-cached-id-");
  try {
    await writeFile(
      join(temp.dir, ".env"),
      [
        ...ENV_BLOCK_LINES,
        "AUTH0_WEBAPP_CLIENT_ID='cid999'",
        "# </automatically-generated>",
        "",
      ].join("\n"),
      "utf-8"
    );

    const envManager = await EnvManager.load(temp.dir);

    await assert.rejects(
      async () =>
        reconcileServer(
          {
            rootDir: temp.dir,
            dryRun: true,
            envManager,
            auth0: {
              findApiByIdentifier: async () => null,
              getApplication: async () => ({
                client_id: "cid999",
                name: "Wrong App",
                client_metadata: {
                  managed_by: "@scupit/mcp-ecosystem",
                  ecosystem: "other-ecosystem",
                  client_key: "webapp",
                },
              }),
            },
            config: {
              ecosystem: {
                ...createTestEcosystem("expected-ecosystem"),
                defaults: {
                  api: {
                    ...DEFAULT_API_SETTINGS,
                    client_access_policy: "require_client_grant",
                  },
                  scope_profiles: {},
                  client_profiles: DEFAULT_CLIENT_PROFILES,
                },
              },
              clientDescriptors: new Map(),
              clientConfigs: new Map([
                [
                  "webapp",
                  {
                    client_key: "webapp",
                    display_name: "Web App",
                    profile: "regular_web_interactive",
                    auth0: { create_if_missing: true },
                  },
                ],
              ]),
              serverConfigs: new Map([
                [
                  "svc",
                  {
                    name: "Svc",
                    slug: "svc",
                    grants: {
                      client_overrides: {
                        webapp: [],
                      },
                    },
                  },
                ],
              ]),
            },
          } as any,
          "svc"
        ),
      /Cached client ID mismatch/
    );
  } finally {
    await temp.cleanup();
  }
});

test("createMcpServer keeps the accepted bootstrap env boundary", async () => {
  const temp = await createTempDir("env-bootstrap-");
  const previousEnv = snapshotEnv([
    "ECOSYSTEM_BASE_DOMAIN",
    "AUTH0_MGMT_CLIENT_SECRET",
    "AUTH0_TEST_CLIENT_SECRET",
    "CUSTOM_KEEP",
  ]);

  try {
    await writeFile(
      join(temp.dir, "ecosystem-configuration.json"),
      JSON.stringify({
        domain: { server_host_pattern: "{slug}-mcp.{base_domain}" },
      }),
      "utf-8"
    );
    await mkdir(join(temp.dir, "mcps", "demo"), { recursive: true });
    await writeFile(
      join(temp.dir, "mcps", "demo", "mcp-configuration.json"),
      JSON.stringify({ name: "Demo", slug: "demo" }),
      "utf-8"
    );
    await writeFile(join(temp.dir, "mcps", "demo", "server.ts"), "", "utf-8");

    process.env.ECOSYSTEM_BASE_DOMAIN = "real.example.test";
    process.env.AUTH0_MGMT_CLIENT_SECRET = "topsecret";
    process.env.AUTH0_TEST_CLIENT_SECRET = "clientsecret";
    process.env.CUSTOM_KEEP = "keepme";

    await createMcpServer(
      pathToFileURL(join(temp.dir, "mcps", "demo", "server.ts")).href,
      { transport: stdioTransport({}) },
      () => {},
    );

    assert.equal(process.env.AUTH0_MGMT_CLIENT_SECRET, undefined);
    assert.equal(process.env.AUTH0_TEST_CLIENT_SECRET, undefined);
    assert.equal(process.env.CUSTOM_KEEP, "keepme");
  } finally {
    restoreEnv(previousEnv);
    await temp.cleanup();
  }
});

function createTestEcosystem(ecosystemName: string) {
  return {
    ecosystem_name: ecosystemName,
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

async function createTempDir(prefix: string): Promise<TempEnvContext> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return {
    dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
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
