FROM node:26-alpine AS builder

WORKDIR /app/frontend

ARG API_URL=http://backend:3001
ARG NEXT_PUBLIC_ACTIVE_MARKET=NP
ENV API_URL=${API_URL}
ENV NEXT_PUBLIC_ACTIVE_MARKET=${NEXT_PUBLIC_ACTIVE_MARKET}
ENV NEXT_STANDALONE=1

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM node:26-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ARG API_URL=http://backend:3001
ENV API_URL=${API_URL}

COPY --chown=node:node --from=builder /app/frontend/public ./public
COPY --chown=node:node --from=builder /app/frontend/.next/standalone ./
COPY --chown=node:node --from=builder /app/frontend/.next/static ./.next/static

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
