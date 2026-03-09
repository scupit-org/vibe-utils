import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import {
  createMcpServer,
  mcpToolHandler,
  mcpResourceHandler,
  mcpPromptHandler,
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
  // registerTool - CallToolResult
  server.registerTool(
    "echo",
    {
      description: "Echo the given message.",
      inputSchema: { message: z.string().describe("Message to echo") },
    },
    mcpToolHandler(async ({ message }) => {
      return { content: [{ type: "text", text: message }] };
    })
  );

  // registerResource (static URI) - ReadResourceCallback → ReadResourceResult
  const samplePath = join(dirname(fileURLToPath(import.meta.url)), "sample.txt");
  const sampleResourceUri = pathToFileURL(samplePath).href;
  server.registerResource(
    "readme",
    sampleResourceUri,
    { description: "Sample resource file for testing" },
    mcpResourceHandler(async (uri) => {
      const path = fileURLToPath(uri);
      const text = await readFile(path, "utf-8");
      return { contents: [{ uri: uri.href, text, mimeType: "text/plain" }] };
    })
  );

  // registerPrompt - PromptCallback → GetPromptResult
  server.registerPrompt(
    "greeting",
    {
      description: "Get a greeting prompt",
      argsSchema: { name: z.string().describe("Name to greet") },
    },
    mcpPromptHandler(async ({ name }) => {
      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text: `Hello, ${name}!` },
          },
        ],
      };
    })
  );
}

const mcp = await createMcpServer(import.meta.url, {
  transport: resolveTransportSelection({
    configuredTransports: {
      stdio: stdioTransport({}),
      streamable_http_stateless: streamableHttpStatelessTransport({
        port: portFromEnvOr(3003),
        auth: { enabled: false },
      }),
    },
    argv: process.argv,
    env: process.env,
  }),
}, configureMcp);

await mcp.begin();
