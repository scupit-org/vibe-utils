import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
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
    "read_file",
    {
      description: "Read the contents of a file at the given absolute path.",
      inputSchema: { path: z.string().describe("Absolute path to the file to read") },
    },
    mcpToolHandler(async ({ path }) => {
      const content = await readFile(path, "utf-8");
      return { content: [{ type: "text", text: content }] };
    })
  );

  server.registerTool(
    "write_file",
    {
      description: "Write content to a file at the given absolute path. Creates parent directories if needed.",
      inputSchema: {
        path: z.string().describe("Absolute path to the file to write"),
        content: z.string().describe("Content to write to the file"),
      },
    },
    mcpToolHandler(async ({ path, content }) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf-8");
      return {
        content: [{ type: "text", text: `Successfully wrote ${content.length} characters to ${path}` }],
      };
    })
  );
}

const mcp = await createMcpServer(import.meta.url, {
  transport: resolveTransportSelection({
    configuredTransports: {
      stdio: stdioTransport({}),
      streamable_http_stateless: streamableHttpStatelessTransport({
        port: portFromEnvOr(3002),
        auth: { enabled: false },
      }),
    },
    argv: process.argv,
    env: process.env,
  }),
}, configureMcp);

await mcp.begin();
