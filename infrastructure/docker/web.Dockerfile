# syntax=docker/dockerfile:1.7
# ── Masar web apps (passenger, driver, admin) served by nginx ────────────────
FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/passenger-web/package.json apps/passenger-web/
COPY apps/driver-web/package.json apps/driver-web/
COPY apps/admin-dashboard/package.json apps/admin-dashboard/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --filter "./apps/*-web" --filter ./apps/admin-dashboard --filter ./packages/*
COPY packages packages
COPY apps/passenger-web apps/passenger-web
COPY apps/driver-web apps/driver-web
COPY apps/admin-dashboard apps/admin-dashboard
# Public, non-secret build-time settings only.
ARG VITE_MAP_TILE_URL=""
ARG VITE_DEFAULT_CENTER="25.2048,55.2708"
ENV VITE_MAP_TILE_URL=$VITE_MAP_TILE_URL VITE_DEFAULT_CENTER=$VITE_DEFAULT_CENTER
RUN pnpm --filter ./apps/passenger-web --filter ./apps/driver-web --filter ./apps/admin-dashboard build

FROM nginx:1.27-alpine
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY infrastructure/docker/masar-common.inc /etc/nginx/conf.d/masar-common.inc
COPY --from=build /app/apps/passenger-web/dist /usr/share/nginx/passenger
COPY --from=build /app/apps/driver-web/dist /usr/share/nginx/driver
COPY --from=build /app/apps/admin-dashboard/dist /usr/share/nginx/admin
EXPOSE 8080 8081 8082
