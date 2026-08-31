FROM node:22-alpine AS builder

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
COPY database/ /app/database/
RUN npm run build
RUN mkdir -p dist/database && cp src/database/schema.sql dist/database/schema.sql
RUN npm prune --omit=dev

FROM node:22-alpine AS runner

WORKDIR /app/backend
RUN apk add --no-cache postgresql-client

ENV NODE_ENV=production

COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/database /app/database
COPY --from=builder /app/backend/src/database/migrations.json ./dist/database/migrations.json
COPY --from=builder /app/backend/src/database/schema.sql ./dist/database/schema.sql
RUN mkdir -p /var/backups/storesync && chown -R node:node /app/backend /var/backups/storesync

USER node

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:10000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
