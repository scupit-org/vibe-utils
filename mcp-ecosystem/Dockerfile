# MCP Live Monitor (stateful HTTP) - example-ecosystem
# Node.js 24 LTS (Krypton)
FROM node:24-alpine

WORKDIR /app

# Build mcp-ecosystem and example-ecosystem
COPY package.json package-lock.json ./
COPY src ./src
COPY tsconfig.json ./
RUN npm ci && npm run build

COPY example-ecosystem ./example-ecosystem
WORKDIR /app/example-ecosystem
RUN npm ci

# Live-monitor: stateful HTTP on port 3004
ENV PORT=3004
ENV MCP_TRANSPORT=streamable_http_stateful

EXPOSE 3004

CMD ["npx", "tsx", "mcps/live-monitor/server.ts"]
