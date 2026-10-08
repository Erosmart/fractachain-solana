/**
 * Startup guard for Railway: refuse to start Next when BACKEND_URL is missing
 * or points at localhost. Keep logic aligned with src/lib/backendProxy.ts.
 *
 * Usage (Docker runner): node railway-backend-guard.mjs && node server.js
 * Local / Compose without RAILWAY_* → no-op (exit 0).
 */

const DEFAULT_BACKEND = 'http://localhost:8080';

function isRailwayRuntime(env) {
  return Boolean(
    env.RAILWAY_ENVIRONMENT ||
      env.RAILWAY_ENVIRONMENT_ID ||
      env.RAILWAY_SERVICE_ID ||
      env.RAILWAY_PROJECT_ID ||
      env.RAILWAY_STATIC_URL ||
      env.RAILWAY_PUBLIC_DOMAIN,
  );
}

function isLoopbackHostname(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

function getBackendOrigin(env) {
  const candidates = [env.BACKEND_URL, env.API_PROXY_URL, env.NEXT_PUBLIC_API_URL];
  for (const raw of candidates) {
    const v = (raw ?? '').trim();
    if (!v) continue;
    try {
      const u = new URL(v);
      if (!u.protocol.startsWith('http')) continue;
      return u.origin;
    } catch {
      continue;
    }
  }
  return DEFAULT_BACKEND;
}

const env = process.env;
if (!isRailwayRuntime(env)) {
  process.exit(0);
}

const origin = getBackendOrigin(env);
let loopback = false;
try {
  loopback = isLoopbackHostname(new URL(origin).hostname);
} catch {
  loopback = true;
}

if (!loopback) {
  process.exit(0);
}

const raw = (env.BACKEND_URL ?? '').trim();
const reason = raw
  ? `BACKEND_URL is set to a loopback address (${origin})`
  : 'BACKEND_URL is missing (defaults to http://localhost:8080)';

console.error(`
[fractachain] backend_misconfigured — refusing to start Next on Railway.

${reason}.
The Next frontend cannot reach Express at localhost inside the container.

Fix:
  1. Deploy a separate Express service (backend/Dockerfile) in this Railway project.
  2. Set BACKEND_URL on THIS frontend service to that Express URL:
       Private: http://\${{express.RAILWAY_PRIVATE_DOMAIN}}:\${{express.PORT}}
       Public:  https://<your-express>.up.railway.app
  3. Leave NEXT_PUBLIC_API_URL empty (same-origin /api proxy).
  4. Redeploy the frontend.

Do NOT set BACKEND_URL=http://localhost:8080 on Railway.
`);

process.exit(1);
