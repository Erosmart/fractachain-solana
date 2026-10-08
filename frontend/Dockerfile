# Build context = frontend/ (Railway Root Directory = frontend):
#   docker build -f frontend/Dockerfile frontend/
# Compose: context ./frontend, dockerfile Dockerfile
# Config-as-code: frontend/railway.json → dockerfilePath "Dockerfile"
#
# Repo-root context (docker build -f frontend/Dockerfile .) will NOT work —
# paths here are relative to frontend/, not the monorepo root.
#
# Prefer same-origin `/api` + **runtime** BACKEND_URL (App Router proxy routes).
# Only set NEXT_PUBLIC_API_URL at build time when the browser must call a
# *separate public backend* origin — never the frontend URL, never localhost
# for a hosted build.
#
# Do NOT default BACKEND_URL to http://backend:8080 — that Docker Compose
# hostname does not resolve on Railway (getaddrinfo ENOTFOUND backend).
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci || npm install
COPY . ./
RUN mkdir -p public
# Empty default → browser uses same-origin proxy (see src/app/api/[...path]).
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_SOLANA_CLUSTER=devnet
ARG NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOLANA_CLUSTER=$NEXT_PUBLIC_SOLANA_CLUSTER
ENV NEXT_PUBLIC_SOLANA_RPC_URL=$NEXT_PUBLIC_SOLANA_RPC_URL
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_TELEMETRY_DISABLED=1
# Never bake loopback / Compose / private hosts into the client bundle.
# Railway often injects service env vars at build time; clear values the browser cannot call.
RUN set -eu; \
  u="${NEXT_PUBLIC_API_URL:-}"; \
  if [ -n "$u" ]; then \
    host="$(node -e "try{process.stdout.write(new URL(process.argv[1]).hostname)}catch{process.stdout.write('')}" "$u")"; \
    case "$host" in \
      localhost|127.0.0.1|0.0.0.0|"::1"|"[::1]"|"") \
        echo "[Dockerfile] clearing non-browser NEXT_PUBLIC_API_URL=$u"; export NEXT_PUBLIC_API_URL= ;; \
      *.railway.internal|*.internal) \
        echo "[Dockerfile] clearing private NEXT_PUBLIC_API_URL=$u"; export NEXT_PUBLIC_API_URL= ;; \
      *.*) ;; \
      *) \
        echo "[Dockerfile] clearing Compose-hostname NEXT_PUBLIC_API_URL=$u"; export NEXT_PUBLIC_API_URL= ;; \
    esac; \
  fi; \
  npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
# Runtime proxy target (docker-compose / Railway). Unset → localhost:8080 locally.
# Compose sets http://backend:8080. On Railway you MUST set the Express service
# URL — empty/localhost is refused at startup and by /health (see guard script).
ENV BACKEND_URL=
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/scripts/railway-backend-guard.mjs ./railway-backend-guard.mjs
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "node railway-backend-guard.mjs && node server.js"]
