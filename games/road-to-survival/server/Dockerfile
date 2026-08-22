# Build context is the road-to-survival workspace root (../), not this directory,
# since npm workspaces need the root package.json/lockfile and all workspaces'
# package.json files to install correctly:
#   docker build -f server/Dockerfile -t <image> .

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY e2e/package.json e2e/package.json
RUN npm ci
COPY server ./server
RUN npm run prisma:generate --workspace=server
RUN npm run build --workspace=server

FROM node:20-alpine AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY e2e/package.json e2e/package.json
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/server/dist ./server/dist
COPY server/prisma ./server/prisma
COPY server/package.json ./server/package.json

EXPOSE 2567
CMD ["node", "server/dist/index.js"]
