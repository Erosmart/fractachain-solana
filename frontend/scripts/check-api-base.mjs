/**
 * Unit checks for resolveApiBaseUrl (mirrored logic — keep in sync with src/lib/api.ts).
 * Run: node scripts/check-api-base.mjs
 */

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isPrivateLanHost(hostname) {
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  if (m) {
    const n = Number(m[1]);
    return n >= 16 && n <= 31;
  }
  return false;
}

function resolveApiBaseUrl(envUrl, pageOrigin) {
  const raw = (envUrl ?? '').trim();
  const fallback = raw || 'http://localhost:8080';

  if (!pageOrigin) {
    return raw || 'http://localhost:8080';
  }

  let page;
  try {
    page = new URL(pageOrigin);
  } catch {
    return raw || '';
  }

  if (!raw) return '';

  let configured;
  try {
    configured = new URL(raw, page.origin);
  } catch {
    return '';
  }

  if (raw.startsWith('/') || !configured.protocol.startsWith('http')) {
    return '';
  }

  if (!isLoopbackHost(configured.hostname)) {
    return configured.origin;
  }

  if (!isLoopbackHost(page.hostname)) {
    if (isPrivateLanHost(page.hostname)) {
      configured.hostname = page.hostname;
      configured.protocol = page.protocol;
      return configured.origin;
    }
    return '';
  }

  return configured.origin || fallback;
}

const cases = [
  // Hosted FE + baked localhost → same-origin proxy (NOT page:8080)
  ['http://localhost:8080', 'https://app.railway.app', ''],
  ['http://127.0.0.1:8080', 'https://fractachain.example', ''],
  // Empty env → same-origin
  ['', 'https://app.railway.app', ''],
  [undefined, 'http://localhost:3000', ''],
  // Explicit public API
  ['https://api.example.com', 'https://app.railway.app', 'https://api.example.com'],
  // Local next ↔ local API
  ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:8080'],
  // LAN phone testing
  ['http://localhost:8080', 'http://192.168.0.14:3000', 'http://192.168.0.14:8080'],
  // SSR
  ['', null, 'http://localhost:8080'],
  ['https://api.example.com', null, 'https://api.example.com'],
];

let failed = 0;
for (const [env, page, expected] of cases) {
  const got = resolveApiBaseUrl(env, page);
  const ok = got === expected;
  if (!ok) {
    failed += 1;
    console.error('FAIL', { env, page, expected, got });
  } else {
    console.log('ok', { env, page, got });
  }
}

if (failed) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log(`\n${cases.length} cases passed`);
