/**
 * PM2 ecosystem configuration for the example MCP servers.
 * Run from example-ecosystem/: npm run pm2:start:http_stateless or npm run pm2:start:stdio
 *
 * Transport must be explicitly chosen via --env (all servers use the same transport):
 *   pm2 start ecosystem.config.cjs --env http_stateless   (all servers via HTTP stateless)
 *   pm2 start ecosystem.config.cjs --env stdio (all servers via stdio)
 *
 * @see https://pm2.keymetrics.io/docs/usage/application-declaration/
 */
const path = require("path");

const tsx = path.join(__dirname, "node_modules", ".bin", "tsx");

module.exports = {
  apps: [
    {
      name: "mcp-git",
      script: "mcps/git/server.ts",
      interpreter: tsx,
      cwd: __dirname,
      env: { PORT: "3001" },
      env_stdio: { PORT: "3001", MCP_TRANSPORT: "stdio" },
      env_http_stateless: { PORT: "3001", MCP_TRANSPORT: "streamable_http_stateless" },
    },
    {
      name: "mcp-files",
      script: "mcps/files/server.ts",
      interpreter: tsx,
      cwd: __dirname,
      env: { PORT: "3002" },
      env_stdio: { PORT: "3002", MCP_TRANSPORT: "stdio" },
      env_http_stateless: { PORT: "3002", MCP_TRANSPORT: "streamable_http_stateless" },
    },
    {
      name: "mcp-all-in-one",
      script: "mcps/all-in-one/server.ts",
      interpreter: tsx,
      cwd: __dirname,
      env: { PORT: "3003" },
      env_stdio: { PORT: "3003", MCP_TRANSPORT: "stdio" },
      env_http_stateless: { PORT: "3003", MCP_TRANSPORT: "streamable_http_stateless" },
    },
  ],
};
