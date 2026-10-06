import { loadDeployment } from '../solana/deployment';
import { usdcMint } from '../solana/usdc';

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

const products: IssuanceProduct[] = [];
let seq = 1;

/**
 * Payment mints on Solana. SOL means wrapped SOL (wSOL) once the offering is
 * on-chain; USDC is read from SOLANA_USDC_MINT / deployments/<cluster>.json.
 * USDT is set from admin.
 */
const DEFAULT_PAYMENT_MINTS: Record<PaymentKind, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: '',
  USDT: '',
};

export function getPaymentAssets(): Record<PaymentKind, string> {
  return {
    ...DEFAULT_PAYMENT_MINTS,
    USDC: DEFAULT_PAYMENT_MINTS.USDC || usdcMint()?.toBase58() || loadDeployment()?.usdcMint || '',
  };
}

export function setPaymentAsset(kind: PaymentKind, address: string) {
  DEFAULT_PAYMENT_MINTS[kind] = address;
  return DEFAULT_PAYMENT_MINTS[kind];
}

export function listProducts(): IssuanceProduct[] {
  return [...products];
}

export function createProduct(input: {
  kind: ProductKind;
  name: string;
  paymentKind: PaymentKind;
  pricePerUnit: string;
  contractAddress?: string;
  notes?: string;
}): IssuanceProduct {
  const product: IssuanceProduct = {
    id: `ISS-${String(seq).padStart(3, '0')}`,
    kind: input.kind,
    name: input.name,
    paymentKind: input.paymentKind,
    paymentTokenAddress: getPaymentAssets()[input.paymentKind],
    pricePerUnit: input.pricePerUnit || '0',
    contractAddress: input.contractAddress || 'PENDING_DEPLOY',
    active: true,
    createdAt: new Date().toISOString(),
    notes: input.notes,
  };
  seq += 1;
  products.push(product);
  return product;
}

export function updateProductPrice(id: string, pricePerUnit: string): IssuanceProduct | null {
  const p = products.find((x) => x.id === id);
  if (!p) return null;
  p.pricePerUnit = pricePerUnit;
  return p;
}

export function bindContract(id: string, contractAddress: string): IssuanceProduct | null {
  const p = products.find((x) => x.id === id);
  if (!p) return null;
  p.contractAddress = contractAddress;
  return p;
}
