/**
 * Unit checks for getBackendOrigin (mirrored — keep in sync with src/lib/backendProxy.ts).
 * Run: node scripts/check-backend-proxy.mjs
 */

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
  return 'http://localhost:8080';
}

const cases = [
  [{}, 'http://localhost:8080'],
  [{ BACKEND_URL: 'http://backend:8080' }, 'http://backend:8080'],
  [{ BACKEND_URL: 'https://api.up.railway.app/foo' }, 'https://api.up.railway.app'],
  [{ BACKEND_URL: '', API_PROXY_URL: 'http://express.railway.internal:8080' }, 'http://express.railway.internal:8080'],
  [{ NEXT_PUBLIC_API_URL: 'https://public-api.example' }, 'https://public-api.example'],
  [{ BACKEND_URL: 'not-a-url', NEXT_PUBLIC_API_URL: 'https://fallback.example' }, 'https://fallback.example'],
  [{ BACKEND_URL: 'ftp://nope' }, 'http://localhost:8080'],
];

let failed = 0;
for (const [env, expected] of cases) {
  const got = getBackendOrigin(env);
  if (got !== expected) {
    failed += 1;
    console.error('FAIL', { env, expected, got });
  } else {
    console.log('ok', { env, got });
  }
}

if (failed) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log(`\n${cases.length} cases passed`);
