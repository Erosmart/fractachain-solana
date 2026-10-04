// Fractachain Frontend API Client
export function getApiBaseUrl(): string {
  const fallback = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  if (typeof window === 'undefined') return fallback;
  try {
    const configured = new URL(fallback, window.location.origin);
    const pageHost = window.location.hostname;
    if (
      (configured.hostname === 'localhost' || configured.hostname === '127.0.0.1') &&
      pageHost !== 'localhost' &&
      pageHost !== '127.0.0.1'
    ) {
      configured.hostname = pageHost;
      configured.protocol = window.location.protocol;
      return configured.origin;
    }
  } catch {
    // keep fallback
  }
  return fallback;
}

export const API_BASE_URL = {
  toString() {
    return getApiBaseUrl();
  },
  valueOf() {
    return getApiBaseUrl();
  },
} as unknown as string;

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
export type PaymentKind = 'XLM' | 'USDC' | 'USDT';

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
