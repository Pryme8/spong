# Single-Docker image: builds client + server, runs server and serves client from one port.
# See docs/DOCKER_SINGLE_PLAN.md.

FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install deps (all workspaces)
COPY package.json package-lock.json* ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci

# Build shared, then client, then server
COPY tsconfig.base.json ./
COPY shared shared
COPY client client
COPY server server
RUN npm run build:shared && npm run build:client && npm run build:server
# Point shared at built output so prod can run with node (no tsx/CJS top-level-await issue)
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('./shared/package.json','utf8')); p.main='./dist/index.js'; p.types='./dist/index.d.ts'; if(p.exports) p.exports['.']={ types:'./dist/index.d.ts', import:'./dist/index.js', default:'./dist/index.js' }; fs.writeFileSync('./shared/package.json', JSON.stringify(p,null,2));"
# Production image
FROM node:20-bookworm-slim AS prod
WORKDIR /app

ENV NODE_ENV=production
ENV PUBLIC_DIR=/app/client-dist

# Copy root package files and full node_modules; ensure @spong/shared has patched package + dist
COPY --from=base /app/package.json /app/package-lock.json* ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/shared/package.json ./node_modules/@spong/shared/package.json
COPY --from=base /app/shared/dist ./node_modules/@spong/shared/dist
COPY --from=base /app/server/dist ./server/dist
COPY --from=base /app/client/dist ./client-dist

# shared/package.json was patched to main=dist; node_modules/@spong/shared resolves to built JS
CMD ["sh", "-c", "ls -la node_modules/@spong/shared/ && ls -la node_modules/@spong/shared/dist/ 2>&1; exec node server/dist/index.js"]

EXPOSE 3000
