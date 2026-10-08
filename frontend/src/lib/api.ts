// Fractachain Frontend API Client

/**
 * Loopback / private-LAN helpers for resolving where the browser should call the API.
 * Public hosts must NOT inherit a baked `localhost` / Compose / private API URL
 * (browser cannot reach those → Failed to fetch → login "apiDown").
 */
export function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

export function isPrivateLanHost(hostname: string): boolean {
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  if (m) {
    const n = Number(m[1]);
    return n >= 16 && n <= 31;
  }
  return false;
}

/** Hosts the browser cannot call from a public Railway/Vercel page. */
export function isBrowserUnreachableApiHost(hostname: string): boolean {
  if (isLoopbackHost(hostname)) return true;
  if (isPrivateLanHost(hostname)) return true;
  if (hostname.endsWith('.railway.internal')) return true;
  if (hostname.endsWith('.internal')) return true;
  // Docker Compose short names (e.g. BACKEND_URL=http://backend:8080 copied into NEXT_PUBLIC_*).
  if (!hostname.includes('.')) return true;
  return false;
}

/**
 * Pure resolver (exported for unit tests).
 *
 * - Explicit absolute **public** `NEXT_PUBLIC_API_URL` → use it (split FE/BE).
 * - Unset / empty → same-origin `''` in the browser (Next proxies `/api` → BACKEND_URL).
 * - Loopback env + page on loopback → keep loopback API (local `next dev`).
 * - Loopback env + page on private LAN → rewrite host only (phone/LAN testing).
 * - Loopback / Compose / private / `.internal` env + public page → same-origin `''`.
 */
export function resolveApiBaseUrl(envUrl: string | undefined | null, pageOrigin: string | null): string {
  const raw = (envUrl ?? '').trim();
  const fallback = raw || 'http://localhost:8080';

  if (!pageOrigin) {
    // SSR / build: prefer explicit env; otherwise loopback for server-side fetches.
    return raw || 'http://localhost:8080';
  }

  let page: URL;
  try {
    page = new URL(pageOrigin);
  } catch {
    return raw || '';
  }

  // No env → same-origin; Next.js proxies `/api/*` and `/health`.
  if (!raw) return '';

  let configured: URL;
  try {
    configured = new URL(raw, page.origin);
  } catch {
    return '';
  }

  // Relative env (e.g. `/`) → same-origin proxy.
  if (raw.startsWith('/') || !configured.protocol.startsWith('http')) {
    return '';
  }

  const pageLoopback = isLoopbackHost(page.hostname);
  const pageLan = isPrivateLanHost(page.hostname);
  const apiUnreachableFromBrowser = isBrowserUnreachableApiHost(configured.hostname);

  // Hosted / public page: never call localhost, Compose DNS, or private Railway net.
  if (!pageLoopback && !pageLan) {
    if (apiUnreachableFromBrowser) return '';
    return configured.origin;
  }

  // LAN access to `next dev`: rewrite loopback API host → phone-reachable LAN IP.
  if (pageLan && isLoopbackHost(configured.hostname)) {
    configured.hostname = page.hostname;
    configured.protocol = page.protocol;
    return configured.origin;
  }

  // Local next ↔ local API (or explicit LAN API while on LAN).
  if (pageLoopback || pageLan) {
    return configured.origin || fallback;
  }

  return '';
}

export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === 'undefined') {
    return resolveApiBaseUrl(envUrl, null);
  }
  return resolveApiBaseUrl(envUrl, window.location.origin);
}

/** Join API base + path (`/api/...`). Empty base → same-origin absolute path. */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export const API_BASE_URL = {
  toString() {
    return getApiBaseUrl();
  },
  valueOf() {
    return getApiBaseUrl();
  },
  [Symbol.toPrimitive]() {
    return getApiBaseUrl();
  },
} as unknown as string;

/** User-facing message when `fetch` cannot reach the API (network / wrong base). */
export function formatApiUnreachableError(): string {
  const base = getApiBaseUrl();
  const shown = base || '(same-origin /api)';
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (!isLoopbackHost(host) && !isPrivateLanHost(host)) {
      return (
        `No se pudo conectar al API (base: ${shown}). ` +
        `En Railway el browser debe usar same-origin /api: dejá NEXT_PUBLIC_API_URL vacío y redeploy del frontend. ` +
        `BACKEND_URL solo lo usa el proxy de Next en el server.`
      );
    }
  }
  return (
    `No se pudo conectar al API (base: ${shown}). ` +
    `Local: levantá Express en :8080, o configurá NEXT_PUBLIC_API_URL / BACKEND_URL.`
  );
}

/**
 * True when the error looks like a browser network failure (not an HTTP/JSON app error).
 * Does not treat FirebaseAuth errors as API-down.
 */
export function isFetchNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string; code?: string };
  // Firebase / auth SDK errors must surface their own message.
  if (typeof e.code === 'string' && (e.code.startsWith('auth/') || e.code.startsWith('firebase/'))) {
    return false;
  }
  const msg = e.message || '';
  if (/failed to fetch/i.test(msg) || /networkerror/i.test(msg) || /load failed/i.test(msg)) {
    return true;
  }
  // Native fetch rejection is typically TypeError("Failed to fetch").
  return e.name === 'TypeError' && /fetch|network|load/i.test(msg);
}

/**
 * Parse a fetch Response as JSON, with a clear error when the server returned HTML
 * (wrong API base, SPA fallback, or Next 404 page).
 */
export async function parseApiJson<T = unknown>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  const trimmed = text.trimStart();
  const looksHtml =
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    (contentType.includes('text/html') && trimmed.startsWith('<'));

  if (looksHtml) {
    const base = getApiBaseUrl() || '(same-origin)';
    throw new Error(
      `El API devolvió HTML en vez de JSON (${res.status}). ` +
        `Revisá NEXT_PUBLIC_API_URL (ahora: ${base}) o BACKEND_URL del proxy de Next. ` +
        `En Railway dejá NEXT_PUBLIC_API_URL vacío (same-origin /api).`,
    );
  }

  if (!trimmed) {
    throw new Error(`Respuesta vacía del API (${res.status}).`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Respuesta no-JSON del API (${res.status}). ` +
        `Content-Type: ${contentType || 'desconocido'}. ` +
        `¿NEXT_PUBLIC_API_URL apunta al backend público o está vacío (same-origin)?`,
    );
  }
}

export interface KycRecord {
  id: string;
  fullName: string;
  docType: 'DNI' | 'PASSPORT' | 'CUIT';
  docNumber: string;
  country: string;
  walletAddress: string;
  userType: 'PRODUCER' | 'INVESTOR' | 'INSTITUTIONAL';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  isGafiHighRisk: boolean;
  createdAt: string;
  selfieUrl?: string;
  userId?: string;
  email?: string;
}

export interface StockCustody {
  symbol: string;
  companyName: string;
  tickerMerval: string;
  cajaDeValoresSubaccount: string;
  isin: string;
  totalSharesInCustody: number;
  tokensCirculating: number;
  backingRatio: number;
  lastAuditTimestamp: string;
  auditor: string;
  priceUsd: number;
  change24h: number;
}

export type ProductKind = 'LICITACION' | 'FORWARD' | 'WARRANT' | 'STOCK';
export type PaymentKind = 'SOL' | 'USDC' | 'USDT';

export interface IssuanceProduct {
  id: string;
  kind: ProductKind;
  name: string;
  paymentKind: PaymentKind;
  paymentTokenAddress: string;
  pricePerUnit: string;
  contractAddress: string;
  active: boolean;
  createdAt: string;
  notes?: string;
}

/** Optional Bearer header that stays assignable to fetch's HeadersInit. */
export function bearerHeaders(token?: string | null): HeadersInit {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
