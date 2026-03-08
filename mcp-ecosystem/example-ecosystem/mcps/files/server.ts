import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { createMcpServer } from "@scupit/mcp-ecosystem/server";
import type { ConfigureMcpServer } from "@scupit/mcp-ecosystem/server";

function configureMcp(server: Parameters<ConfigureMcpServer>[0]) {
  server.registerTool(
    "read_file",
    {
      description: "Read the contents of a file at the given absolute path.",
      inputSchema: { path: z.string().describe("Absolute path to the file to read") },
    },
    async ({ path }) => {
      try {
        const content = await readFile(path, "utf-8");
        return { content: [{ type: "text", text: content }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error reading file: ${message}` }],
          isError: true,
        };
      }
    }
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
    async ({ path, content }) => {
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content, "utf-8");
        return {
          content: [{ type: "text", text: `Successfully wrote ${content.length} characters to ${path}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error writing file: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

const mcp = await createMcpServer(import.meta.url, {
  transport: {
    type: "streamable-http-stateless",
    port: parseInt(process.env["PORT"] ?? "3002", 10),
    // Auth disabled for local development. Remove this override in production.
    auth: { enabled: false },
  },
}, configureMcp);

await mcp.begin();
