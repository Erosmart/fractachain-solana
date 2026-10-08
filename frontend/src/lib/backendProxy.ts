/**
 * Runtime server-side proxy to the Express API.
 *
 * Next.js `rewrites()` bake destinations at build time — a Docker Compose
 * default like `http://backend:8080` then fails on Railway with ENOTFOUND.
 * Route handlers read BACKEND_URL at request time instead.
 *
 * On Railway, never silently fall back to localhost:8080 — that only works on
 * the developer's machine, not inside the Next container.
 */

const DEFAULT_BACKEND = 'http://localhost:8080';

/** Hop-by-hop / browser-only headers we must not forward upstream. */
const DROP_REQ_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

const DROP_RES_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
]);

type EnvLike = Record<string, string | undefined>;

/** True when any Railway-injected env is present. */
export function isRailwayRuntime(env: EnvLike = process.env): boolean {
  return Boolean(
    env.RAILWAY_ENVIRONMENT ||
      env.RAILWAY_ENVIRONMENT_ID ||
      env.RAILWAY_SERVICE_ID ||
      env.RAILWAY_PROJECT_ID ||
      env.RAILWAY_STATIC_URL ||
      env.RAILWAY_PUBLIC_DOMAIN,
  );
}

export function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    return isLoopbackHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * Resolve the Express origin for server-side proxying.
 * Prefer BACKEND_URL / API_PROXY_URL. NEXT_PUBLIC_API_URL is only used when it
 * looks like a real absolute http(s) origin (never use the frontend URL).
 */
export function getBackendOrigin(env: EnvLike = process.env): string {
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

const RAILWAY_LOCALHOST_HINT =
  'This Railway service is the Next.js frontend. Deploy a separate Express ' +
  'service (backend/Dockerfile) and set BACKEND_URL on this frontend to that ' +
  "service's public URL (https://….up.railway.app) or private URL " +
  '(http://${{express.RAILWAY_PRIVATE_DOMAIN}}:${{express.PORT}}). ' +
  'Do not leave BACKEND_URL empty or set to localhost / 127.0.0.1 on Railway.';

export type BackendProxyTarget =
  | { ok: true; origin: string }
  | {
      ok: false;
      error: 'backend_misconfigured';
      message: string;
      backend: string;
      hint: string;
    };

/**
 * On Railway, refuse missing/localhost BACKEND_URL instead of proxying to
 * http://localhost:8080 inside the container (fetch failed / unreachable).
 */
export function resolveBackendProxyTarget(
  env: EnvLike = process.env,
): BackendProxyTarget {
  const origin = getBackendOrigin(env);
  if (isRailwayRuntime(env) && isLoopbackOrigin(origin)) {
    const raw = (env.BACKEND_URL ?? '').trim();
    const reason = raw
      ? `BACKEND_URL is set to a loopback address (${origin})`
      : 'BACKEND_URL is missing (defaults to http://localhost:8080)';
    return {
      ok: false,
      error: 'backend_misconfigured',
      message:
        `${reason} while running on Railway. ` +
        'The Next frontend cannot reach Express at localhost inside the container.',
      backend: origin,
      hint: RAILWAY_LOCALHOST_HINT,
    };
  }
  return { ok: true, origin };
}

let warnedRailwayMisconfig = false;

function warnRailwayMisconfigOnce(target: Extract<BackendProxyTarget, { ok: false }>): void {
  if (warnedRailwayMisconfig) return;
  warnedRailwayMisconfig = true;
  console.error(
    '[fractachain] backend_misconfigured:',
    target.message,
    `| backend=${target.backend}`,
    `| hint=${target.hint}`,
  );
}

export async function proxyToBackend(
  req: Request,
  backendPath: string,
): Promise<Response> {
  const targetInfo = resolveBackendProxyTarget();
  if (!targetInfo.ok) {
    warnRailwayMisconfigOnce(targetInfo);
    return Response.json(
      {
        error: targetInfo.error,
        message: targetInfo.message,
        backend: targetInfo.backend,
        hint: targetInfo.hint,
      },
      { status: 503 },
    );
  }

  const origin = targetInfo.origin;
  const incoming = new URL(req.url);
  const target = `${origin}${backendPath}${incoming.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (DROP_REQ_HEADERS.has(key.toLowerCase())) return;
    headers.set(key, value);
  });

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
    // Required by Node fetch when streaming a Request body.
    (init as RequestInit & { duplex?: string }).duplex = 'half';
  }

  try {
    const upstream = await fetch(target, init);
    const outHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (DROP_RES_HEADERS.has(key.toLowerCase())) return;
      outHeaders.set(key, value);
    });
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        error: 'backend_unreachable',
        message: `Failed to proxy ${target}: ${message}`,
        backend: origin,
        hint:
          'Set BACKEND_URL on the frontend service to the Express API origin ' +
          '(Railway private URL or public https://….up.railway.app). ' +
          'Do not use the Docker Compose hostname "backend" unless that DNS name exists.',
      },
      { status: 502 },
    );
  }
}
