import { execSync } from "node:child_process";
import { z } from "zod";
import { createMcpServer, mcpToolHandler } from "@scupit/mcp-ecosystem/server";
import type { ConfigureMcpServer } from "@scupit/mcp-ecosystem/server";

function configureMcp(server: Parameters<ConfigureMcpServer>[0]) {
  server.registerTool(
    "git_status",
    {
      description: "Run `git status` in the specified directory and return the output.",
      inputSchema: { directory: z.string().describe("Absolute path to the git repository") },
    },
    mcpToolHandler(async ({ directory }) => {
      const output = execSync("git status", {
        cwd: directory,
        encoding: "utf-8",
        timeout: 10_000,
      });
      return { content: [{ type: "text", text: output }] };
    })
  );
}

const mcp = await createMcpServer(import.meta.url, {
  transport: {
    type: "streamable-http-stateless",
    port: parseInt(process.env["PORT"] ?? "3001", 10),
    // Auth disabled for local development. Remove this override in production.
    auth: { enabled: false },
  },
}, configureMcp);

await mcp.begin();
