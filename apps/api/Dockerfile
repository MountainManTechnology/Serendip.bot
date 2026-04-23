FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g turbo

COPY package.json package-lock.json turbo.json ./
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/

RUN npm ci

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN turbo build --filter=@serendip-bot/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

ARG VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/MountainManTechnology/Serendip.bot"
LABEL org.opencontainers.image.version="${VERSION}"

COPY --from=base /app/apps/api/dist ./dist
COPY --from=base /app/node_modules ./node_modules
# Local workspace packages are symlinked from node_modules — copy their built dist
COPY --from=base /app/packages/db/dist ./packages/db/dist
COPY --from=base /app/packages/db/package.json ./packages/db/package.json
# Migration files — resolved at runtime relative to dist/index.js → ../migrations
COPY --from=base /app/packages/db/migrations ./migrations
COPY --from=base /app/packages/types/dist ./packages/types/dist
COPY --from=base /app/packages/types/package.json ./packages/types/package.json
COPY --from=base /app/packages/config ./packages/config

EXPOSE 4000
CMD ["node", "dist/index.js"]
