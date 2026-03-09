import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createMcpServer,
  mcpToolHandler,
  hostFromEnvOrLoopback,
  portFromEnvOr,
  resolveTransportSelection,
  stdioTransport,
  streamableHttpStatefulTransport,
} from "@scupit/mcp-ecosystem/server";
import type { ConfigureMcpServer } from "@scupit/mcp-ecosystem/server";
import { DocumentStore } from "./document-store.js";

const LOCAL_USER_ID = "local";

/**
 * Module-level: shared across all sessions for the same server process.
 */
const documentStore = new DocumentStore();

/**
 * Simulates background document processing with staged progress updates.
 * Replace with real processing logic when available.
 */
async function processDocumentInBackground(
  userId: string,
  taskId: string,
  documentId: string,
  store: DocumentStore
): Promise<void> {
  try {
    for (const [progress, delay] of [[25, 1000], [50, 1000], [75, 1000]] as const) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      store.updateTask(userId, taskId, { progress });
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    store.updateTask(userId, taskId, {
      status: "completed",
      progress: 100,
      content: `Document ${documentId} has been processed successfully.`,
    });
  } catch {
    store.updateTask(userId, taskId, { status: "failed" });
  }
}

function configureMcp(
  server: Parameters<ConfigureMcpServer>[0],
  context: Parameters<ConfigureMcpServer>[1]
) {
  server.registerTool(
    "start_task",
    {
      description:
        "Start processing a document. Returns a task ID that can be used to check progress and retrieve the result.",
      inputSchema: {
        documentId: z.string().describe("ID of the document to process"),
      },
    },
    mcpToolHandler(async ({ documentId }, extra) => {
      const auth = context.retrieveAuthData(extra);
      const userId = auth.isAuthEnabled ? auth.sub : LOCAL_USER_ID;

      const taskId = randomUUID();
      documentStore.createTask(userId, taskId);

      void processDocumentInBackground(userId, taskId, documentId, documentStore);

      return {
        content: [{ type: "text", text: taskId }],
      };
    })
  );

  server.registerTool(
    "check_progress",
    {
      description: "Check the progress of a running task.",
      inputSchema: {
        taskId: z.string().describe("Task ID returned by start_task"),
      },
    },
    mcpToolHandler(async ({ taskId }, extra) => {
      const auth = context.retrieveAuthData(extra);
      const userId = auth.isAuthEnabled ? auth.sub : LOCAL_USER_ID;

      const doc = documentStore.getTask(userId, taskId);

      if (!doc) {
        throw new Error(`Task not found: ${taskId}`);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: doc.status, progress: doc.progress }),
          },
        ],
      };
    })
  );

  server.registerTool(
    "retrieve_result",
    {
      description: "Retrieve the completed document content for a finished task.",
      inputSchema: {
        taskId: z.string().describe("Task ID returned by start_task"),
      },
    },
    mcpToolHandler(async ({ taskId }, extra) => {
      const auth = context.retrieveAuthData(extra);
      const userId = auth.isAuthEnabled ? auth.sub : LOCAL_USER_ID;

      const doc = documentStore.getTask(userId, taskId);

      if (!doc) {
        throw new Error(`Task not found: ${taskId}`);
      }
      if (doc.status !== "completed") {
        throw new Error(`Task is not complete. Current status: ${doc.status}`);
      }

      return {
        content: [{ type: "text", text: doc.content! }],
      };
    })
  );

  server.registerTool(
    "stop_task",
    {
      description: "Cancel a running task.",
      inputSchema: {
        taskId: z.string().describe("Task ID to cancel"),
      },
    },
    mcpToolHandler(async ({ taskId }, extra) => {
      const auth = context.retrieveAuthData(extra);
      const userId = auth.isAuthEnabled ? auth.sub : LOCAL_USER_ID;

      const doc = documentStore.getTask(userId, taskId);

      if (!doc) {
        throw new Error(`Task not found: ${taskId}`);
      }
      if (doc.status !== "working") {
        throw new Error(`Cannot cancel task with status: ${doc.status}`);
      }

      documentStore.updateTask(userId, taskId, { status: "cancelled" });

      return {
        content: [{ type: "text", text: "Task cancelled." }],
      };
    })
  );

  server.registerTool(
    "list_tasks",
    {
      description: "List all tasks for the current user.",
      inputSchema: {},
    },
    mcpToolHandler(async (_args, extra) => {
      const auth = context.retrieveAuthData(extra);
      const userId = auth.isAuthEnabled ? auth.sub : LOCAL_USER_ID;

      const tasks = documentStore.listTasks(userId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              tasks.map(({ taskId, status, progress, createdAt, updatedAt }) => ({
                taskId,
                status,
                progress,
                createdAt,
                updatedAt,
              })),
              null,
              2
            ),
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
      streamable_http_stateful: streamableHttpStatefulTransport({
        port: portFromEnvOr(3004),
        host: hostFromEnvOrLoopback(),
      }),
    },
    argv: process.argv,
    env: process.env,
  }),
}, configureMcp);

await mcp.begin();
