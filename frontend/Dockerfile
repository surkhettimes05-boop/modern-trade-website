FROM node:20-alpine AS builder

WORKDIR /app/frontend

ARG API_URL=http://backend:3001
ENV API_URL=${API_URL}

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/frontend/public ./public
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
