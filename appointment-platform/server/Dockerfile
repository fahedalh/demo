# Build context: repository root (appointment-platform/)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspaces --include-workspace-root
COPY shared shared
COPY server server
RUN npm run build -w server && npm prune --omit=dev --workspaces --include-workspace-root

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/shared shared
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/package.json server/
USER node
EXPOSE 4000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "server/dist/index.js"]
