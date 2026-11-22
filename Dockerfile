# Fairway Live — production Docker image
FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies (including Prisma CLI for migrations)
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci || npm install

# Build Next.js
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npx prisma generate
RUN npm run build

# Production runner
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

# App source needed by next start + prisma
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/package-lock.json* ./
COPY --chown=node:node --from=builder /app/next.config.ts ./next.config.ts
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/node_modules ./node_modules

COPY --chown=node:node docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
USER node
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "start"]
