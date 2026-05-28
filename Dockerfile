FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts
COPY tsconfig*.json ./
COPY .env.example ./

# Temporary MVP-branch allowance: the Replit-exported workspace lockfile
# is stale relative to package.json catalog/workspace references. The image
# still validates install/build integrity, but the lockfile should be
# regenerated and this should return to --frozen-lockfile before production.
RUN pnpm install --no-frozen-lockfile

ENV NODE_ENV=production
ENV PORT=8080

RUN pnpm run build:deploy

EXPOSE 8080

CMD ["pnpm", "start"]
