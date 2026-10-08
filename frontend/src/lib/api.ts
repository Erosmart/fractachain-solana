// Fractachain Frontend API Client

/**
 * Loopback / private-LAN helpers for resolving where the browser should call the API.
 * Public hosts must NOT inherit a baked `localhost` API URL (that produced HTML
 * SPA responses and `Unexpected token '<' ... is not valid JSON` on login).
 */
function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isPrivateLanHost(hostname: string): boolean {
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  if (m) {
    const n = Number(m[1]);
    return n >= 16 && n <= 31;
  }
  return false;
}

/**
 * Pure resolver (exported for unit tests).
 *
 * - Explicit absolute non-loopback `NEXT_PUBLIC_API_URL` → use it (cross-origin API).
 * - Unset / empty → same-origin `''` in the browser (Next proxies `/api` → BACKEND_URL).
 * - Loopback env + page on loopback → keep loopback API (local `next dev`).
 * - Loopback env + page on private LAN → rewrite host only (phone/LAN testing).
 * - Loopback env + page on a public host → same-origin `''` (never `https://app:8080`).
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

  if (!isLoopbackHost(configured.hostname)) {
    return configured.origin;
  }

  // Baked localhost while the UI is served from a real host.
  if (!isLoopbackHost(page.hostname)) {
    if (isPrivateLanHost(page.hostname)) {
      // LAN access to `next dev`: hit API on the same machine, keep port.
      configured.hostname = page.hostname;
      configured.protocol = page.protocol;
      return configured.origin;
    }
    // Hosted / public: use same-origin proxy instead of rewriting to page:8080.
    return '';
  }

  return configured.origin || fallback;
}

export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === 'undefined') {
    return resolveApiBaseUrl(envUrl, null);
  }
  return resolveApiBaseUrl(envUrl, window.location.origin);
}

export const API_BASE_URL = {
  toString() {
    return getApiBaseUrl();
  },
  valueOf() {
    return getApiBaseUrl();
  },
} as unknown as string;

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
        `El frontend no debe llamar a su propia URL para /api/*.`,
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
        `¿NEXT_PUBLIC_API_URL apunta al backend (puerto 8080) y no al frontend?`,
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
