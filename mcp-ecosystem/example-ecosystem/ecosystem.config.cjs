/**
 * PM2 ecosystem configuration for the example MCP servers.
 *
 * Transport chosen via --env. Use the npm scripts in package.json; they pass --only
 * to start only the servers that support each transport (avoids launching incompatible
 * servers that would crash and waste time).
 *
 * IMPORTANT: When adding a new MCP server to this file, update the --only lists in
 * package.json for each script:
 *   - pm2:start:stdio         → add to all servers that support stdio
 *   - pm2:start:http_stateless → add to servers that support streamable_http_stateless
 *   - pm2:start:http_stateful  → add to servers that support streamable_http_stateful
 *
 * Current mapping:
 *   stdio:            mcp-git, mcp-files, mcp-all-in-one, mcp-live-monitor
 *   http_stateless:   mcp-git, mcp-files, mcp-all-in-one
 *   http_stateful:    mcp-live-monitor
 *
 * Interpreter: node + tsx/dist/cli.mjs (tsx v4.21.x)
 * @see https://pm2.keymetrics.io/docs/usage/application-declaration/
 */
const path = require("path");

const node = process.execPath;
const tsxPath = path.join(__dirname, "node_modules", "tsx", "dist", "cli.mjs");

// Shared restart policy:
//   - min_uptime: "5s"  → crashes within 5s count as "unstable"
//   - max_restarts: 3   → 3 unstable crashes → ERRORED (no more restarts)
//   - restart_delay: 1s → pause between attempts to reduce CPU churn
//
// Incompatible servers crash instantly → 3 fast crashes → ERRORED.
// Compatible servers run for minutes+ → crashes aren't "unstable" → normal restart.
const restartPolicy = {
  max_restarts: 3,
  min_uptime: "5s",
  restart_delay: 1000,
};

module.exports = {
  apps: [
    {
      name: "mcp-git",
      script: "mcps/git/server.ts",
      interpreter: node,
      interpreter_args: tsxPath,
      cwd: __dirname,
      ...restartPolicy,
      env: { PORT: "3001" },
      env_stdio: { PORT: "3001", MCP_TRANSPORT: "stdio" },
      env_http_stateless: { PORT: "3001", MCP_TRANSPORT: "streamable_http_stateless" },
      env_http_stateful: { PORT: "3001", MCP_TRANSPORT: "streamable_http_stateful" },
    },
    {
      name: "mcp-files",
      script: "mcps/files/server.ts",
      interpreter: node,
      interpreter_args: tsxPath,
      cwd: __dirname,
      ...restartPolicy,
      env: { PORT: "3002" },
      env_stdio: { PORT: "3002", MCP_TRANSPORT: "stdio" },
      env_http_stateless: { PORT: "3002", MCP_TRANSPORT: "streamable_http_stateless" },
      env_http_stateful: { PORT: "3002", MCP_TRANSPORT: "streamable_http_stateful" },
    },
    {
      name: "mcp-all-in-one",
      script: "mcps/all-in-one/server.ts",
      interpreter: node,
      interpreter_args: tsxPath,
      cwd: __dirname,
      ...restartPolicy,
      env: { PORT: "3003" },
      env_stdio: { PORT: "3003", MCP_TRANSPORT: "stdio" },
      env_http_stateless: { PORT: "3003", MCP_TRANSPORT: "streamable_http_stateless" },
      env_http_stateful: { PORT: "3003", MCP_TRANSPORT: "streamable_http_stateful" },
    },
    {
      name: "mcp-live-monitor",
      script: "mcps/live-monitor/server.ts",
      interpreter: node,
      interpreter_args: tsxPath,
      cwd: __dirname,
      ...restartPolicy,
      env: { PORT: "3004" },
      env_stdio: { PORT: "3004", MCP_TRANSPORT: "stdio" },
      env_http_stateful: { PORT: "3004", MCP_TRANSPORT: "streamable_http_stateful" },
    },
  ],
};
