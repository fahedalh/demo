# syntax=docker/dockerfile:1.7
# ── Masar API ────────────────────────────────────────────────────────────────
# Multi-stage: build with the full workspace, ship only production dependencies.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --filter @masar/api... --filter masar-ride-platform
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY prisma prisma
COPY apps/api apps/api
RUN pnpm exec prisma generate && pnpm --filter @masar/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --prod --filter @masar/api... --filter masar-ride-platform
COPY prisma prisma
RUN pnpm exec prisma generate
COPY --from=build /app/apps/api/dist apps/api/dist
RUN useradd --system --uid 10001 masar && mkdir -p apps/api/storage && chown -R masar apps/api/storage
USER masar
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then start. (Run seeds separately: see docker-compose `seed` service.)
CMD ["sh", "-c", "cd /app && pnpm exec prisma migrate deploy && cd apps/api && node dist/server.js"]
