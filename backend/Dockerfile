FROM node:22-alpine AS builder

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
COPY database/ /app/database/
RUN npm run build
RUN mkdir -p dist/database && cp src/database/schema.sql dist/database/schema.sql

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
RUN mkdir -p /var/backups/storesync

EXPOSE 3001

CMD ["sh", "-c", "node dist/database/deployMigrate.js && node dist/index.js"]
