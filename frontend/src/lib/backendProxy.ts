/**
 * Runtime server-side proxy to the Express API.
 *
 * Next.js `rewrites()` bake destinations at build time — a Docker Compose
 * default like `http://backend:8080` then fails on Railway with ENOTFOUND.
 * Route handlers read BACKEND_URL at request time instead.
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

/**
 * Resolve the Express origin for server-side proxying.
 * Prefer BACKEND_URL / API_PROXY_URL. NEXT_PUBLIC_API_URL is only used when it
 * looks like a real absolute http(s) origin (never use the frontend URL).
 */
export function getBackendOrigin(): string {
  const candidates = [
    process.env.BACKEND_URL,
    process.env.API_PROXY_URL,
    process.env.NEXT_PUBLIC_API_URL,
  ];
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

export async function proxyToBackend(
  req: Request,
  backendPath: string,
): Promise<Response> {
  const origin = getBackendOrigin();
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
