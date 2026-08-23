# syntax=docker/dockerfile:1

# ---- build stage: native modules ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force \
  && apk del .build-deps

# ---- runtime stage ----
FROM node:24-alpine
LABEL org.opencontainers.image.source="https://github.com/szkly/dartmania" \
  org.opencontainers.image.description="Touch-friendly darts scoring app"

ENV NODE_ENV=production \
  PORT=8003 \
  DB_PATH=/data/dartmania.sqlite

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 8003
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/state" >/dev/null || exit 1

CMD ["node", "server/index.js"]
