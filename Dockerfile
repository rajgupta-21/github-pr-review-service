# Backend image. Bun is the runtime the project already uses locally.
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
# Lockfile first so dependency layers cache across source changes
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3-alpine AS runtime
WORKDIR /app

# Never run as root in a container
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=app:app package.json tsconfig.json ./
COPY --chown=app:app src ./src
COPY --chown=app:app scripts ./scripts

USER app

ENV NODE_ENV=production
EXPOSE 4000

# Readiness, so the orchestrator waits for Mongo and Redis to be reachable
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["bun", "src/index.ts"]
