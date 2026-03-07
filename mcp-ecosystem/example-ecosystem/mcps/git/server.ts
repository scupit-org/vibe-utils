import { execSync } from "node:child_process";
import { z } from "zod";
import { createMcpServer } from "@scupit/mcp-ecosystem/server";

const mcp = await createMcpServer(import.meta.url, {
  transport: {
    type: "streamable-http-stateless",
    port: parseInt(process.env["PORT"] ?? "3001", 10),
    // Auth disabled for local development. Remove this override in production.
    auth: { enabled: false },
  },
});

mcp.builder.registerTool(
  "git_status",
  {
    description: "Run `git status` in the specified directory and return the output.",
    inputSchema: { directory: z.string().describe("Absolute path to the git repository") },
  },
  async ({ directory }) => {
    try {
      const output = execSync("git status", {
        cwd: directory,
        encoding: "utf-8",
        timeout: 10_000,
      });
      return { content: [{ type: "text", text: output }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error running git status: ${message}` }],
        isError: true,
      };
    }
  }
);

await mcp.begin();
