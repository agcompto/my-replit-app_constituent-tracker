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

RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
ENV PORT=8080

RUN pnpm run build:deploy

EXPOSE 8080

CMD ["pnpm", "start"]
