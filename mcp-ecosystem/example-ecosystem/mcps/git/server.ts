import { execSync } from "node:child_process";
import { z } from "zod";
import {
  createMcpServer,
  mcpToolHandler,
  portFromEnvOr,
  resolveTransportSelection,
  stdioTransport,
  streamableHttpStatelessTransport,
} from "@scupit/mcp-ecosystem/server";
import type { ConfigureMcpServer } from "@scupit/mcp-ecosystem/server";

function configureMcp(
  server: Parameters<ConfigureMcpServer>[0],
  _context: Parameters<ConfigureMcpServer>[1]
) {
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
  transport: resolveTransportSelection({
    configuredTransports: {
      stdio: stdioTransport({}),
      streamable_http_stateless: streamableHttpStatelessTransport({
        port: portFromEnvOr(3001),
        auth: { enabled: false },
      }),
    },
    argv: process.argv,
    env: process.env,
  }),
}, configureMcp);

await mcp.begin();
