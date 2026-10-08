/**
 * Unit checks for backend proxy origin + Railway localhost guard
 * (mirrored — keep in sync with src/lib/backendProxy.ts).
 * Run: node scripts/check-backend-proxy.mjs
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

function isLoopbackOrigin(origin) {
  try {
    return isLoopbackHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
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

function resolveBackendProxyTarget(env) {
  const origin = getBackendOrigin(env);
  if (isRailwayRuntime(env) && isLoopbackOrigin(origin)) {
    return { ok: false, error: 'backend_misconfigured', backend: origin };
  }
  return { ok: true, origin };
}

const originCases = [
  [{}, 'http://localhost:8080'],
  [{ BACKEND_URL: 'http://backend:8080' }, 'http://backend:8080'],
  [{ BACKEND_URL: 'https://api.up.railway.app/foo' }, 'https://api.up.railway.app'],
  [{ BACKEND_URL: '', API_PROXY_URL: 'http://express.railway.internal:8080' }, 'http://express.railway.internal:8080'],
  [{ NEXT_PUBLIC_API_URL: 'https://public-api.example' }, 'https://public-api.example'],
  [{ BACKEND_URL: 'not-a-url', NEXT_PUBLIC_API_URL: 'https://fallback.example' }, 'https://fallback.example'],
  [{ BACKEND_URL: 'ftp://nope' }, 'http://localhost:8080'],
];

const guardCases = [
  // Local / Compose: localhost default is OK
  [{}, { ok: true, origin: 'http://localhost:8080' }],
  [{ BACKEND_URL: 'http://localhost:8080' }, { ok: true, origin: 'http://localhost:8080' }],
  [{ BACKEND_URL: 'http://backend:8080' }, { ok: true, origin: 'http://backend:8080' }],
  // Railway + missing / localhost → hard fail (do not proxy)
  [
    { RAILWAY_ENVIRONMENT: 'production' },
    { ok: false, error: 'backend_misconfigured', backend: 'http://localhost:8080' },
  ],
  [
    { RAILWAY_SERVICE_ID: 'svc', BACKEND_URL: '' },
    { ok: false, error: 'backend_misconfigured', backend: 'http://localhost:8080' },
  ],
  [
    { RAILWAY_PROJECT_ID: 'proj', BACKEND_URL: 'http://localhost:8080' },
    { ok: false, error: 'backend_misconfigured', backend: 'http://localhost:8080' },
  ],
  [
    { RAILWAY_ENVIRONMENT: 'production', BACKEND_URL: 'http://127.0.0.1:8080' },
    { ok: false, error: 'backend_misconfigured', backend: 'http://127.0.0.1:8080' },
  ],
  [
    { RAILWAY_ENVIRONMENT: 'production', NEXT_PUBLIC_API_URL: 'http://localhost:8080' },
    { ok: false, error: 'backend_misconfigured', backend: 'http://localhost:8080' },
  ],
  // Railway + real Express URL → OK
  [
    { RAILWAY_ENVIRONMENT: 'production', BACKEND_URL: 'http://express.railway.internal:8080' },
    { ok: true, origin: 'http://express.railway.internal:8080' },
  ],
  [
    { RAILWAY_ENVIRONMENT: 'production', BACKEND_URL: 'https://api.up.railway.app' },
    { ok: true, origin: 'https://api.up.railway.app' },
  ],
];

let failed = 0;

for (const [env, expected] of originCases) {
  const got = getBackendOrigin(env);
  if (got !== expected) {
    failed += 1;
    console.error('FAIL getBackendOrigin', { env, expected, got });
  } else {
    console.log('ok getBackendOrigin', { env, got });
  }
}

for (const [env, expected] of guardCases) {
  const got = resolveBackendProxyTarget(env);
  const match =
    got.ok === expected.ok &&
    (got.ok
      ? got.origin === expected.origin
      : got.error === expected.error && got.backend === expected.backend);
  if (!match) {
    failed += 1;
    console.error('FAIL resolveBackendProxyTarget', { env, expected, got });
  } else {
    console.log('ok resolveBackendProxyTarget', { env, got });
  }
}

const total = originCases.length + guardCases.length;
if (failed) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log(`\n${total} cases passed`);
