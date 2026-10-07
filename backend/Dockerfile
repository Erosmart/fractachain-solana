# Build from the repo root:
#   docker build -f backend/Dockerfile .
# Railway: empty Root Directory, Dockerfile path = backend/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci || npm install
COPY backend/ ./
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
# System CAs for openssl/curl and optional NODE_EXTRA_CA_CERTS. Node 20 has no
# --use-system-ca (that flag is Node 23+); its TLS stack uses the bundled Mozilla store.
RUN apk add --no-cache ca-certificates
ENV NODE_ENV=production
ENV PORT=8080
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY --from=builder /app/dist ./dist
# solana/connection.ts resolves deployments/ three levels above dist/solana/ → /deployments
COPY --chown=node:node deployments/devnet.json /deployments/devnet.json
COPY backend/data ./data
COPY backend/scripts ./scripts
RUN mkdir -p data/selfies \
  && chown -R node:node /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# pg_restore rewrites data/*.json from Postgres BEFORE the modules load them;
# without DATABASE_URL it exits quietly and the files baked above are used.
CMD ["sh", "-c", "node scripts/pg_restore.js && node dist/server.js"]
