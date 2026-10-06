import fs from 'fs';
import path from 'path';
import { persistToPg } from '../data/pgstore';

export interface MervalStock {
  ticker: string;
  tokenTicker: string;
  companyName: string;
  isin: string;
  sector: string;
  priceUsdc: number;
  change24hPct: number;
  volume24hUsdc: number;
  custodiedSharesInCajaDeValores: number;
  mintedTokens: number;
  reserveRatio: string; // '1:1 (100.0%)'
  lastAuditTimestamp: string;
  custodianCuit: string;
  /** Only active stocks show up in the public market. */
  active: boolean;
  createdAt: string;
}

/** Seed used the first time the store boots without data/stocks.json. */
const SEED: Omit<MervalStock, 'active' | 'createdAt'>[] = [
  {
    ticker: 'YPFD',
    tokenTicker: 'tYPF',
    companyName: 'YPF Sociedad Anónima (Clase D)',
    isin: 'ARP9897X1319',
    sector: 'Energía y Petróleo',
    priceUsdc: 24.50,
    change24hPct: 3.42,
    volume24hUsdc: 482900,
    custodiedSharesInCajaDeValores: 50000,
    mintedTokens: 50000,
    reserveRatio: '1:1 (100.0%)',
    lastAuditTimestamp: '',
    custodianCuit: '30-71829304-8',
  },
  {
    ticker: 'GGAL',
    tokenTicker: 'tGGAL',
    companyName: 'Grupo Financiero Galicia S.A.',
    isin: 'ARP432631215',
    sector: 'Banca y Finanzas',
    priceUsdc: 38.20,
    change24hPct: -0.85,
    volume24hUsdc: 615000,
    custodiedSharesInCajaDeValores: 80000,
    mintedTokens: 80000,
    reserveRatio: '1:1 (100.0%)',
    lastAuditTimestamp: '',
    custodianCuit: '30-71829304-8',
  },
  {
    ticker: 'PAMP',
    tokenTicker: 'tPAMP',
    companyName: 'Pampa Energía S.A.',
    isin: 'ARP7346A1033',
    sector: 'Generación Eléctrica y Gas',
    priceUsdc: 52.10,
    change24hPct: 1.75,
    volume24hUsdc: 230400,
    custodiedSharesInCajaDeValores: 25000,
    mintedTokens: 25000,
    reserveRatio: '1:1 (100.0%)',
    lastAuditTimestamp: '',
    custodianCuit: '30-71829304-8',
  },
  {
    ticker: 'ALUA',
    tokenTicker: 'tALUA',
    companyName: 'Aluar Aluminio Argentino S.A.',
    isin: 'ARP017251016',
    sector: 'Materiales e Industria',
    priceUsdc: 0.95,
    change24hPct: 0.20,
    volume24hUsdc: 98000,
    custodiedSharesInCajaDeValores: 200000,
    mintedTokens: 200000,
    reserveRatio: '1:1 (100.0%)',
    lastAuditTimestamp: '',
    custodianCuit: '30-71829304-8',
  },
  {
    ticker: 'BMA',
    tokenTicker: 'tBMA',
    companyName: 'Banco Macro S.A. (Clase B)',
    isin: 'ARP125991090',
    sector: 'Banca y Finanzas',
    priceUsdc: 64.80,
    change24hPct: -1.20,
    volume24hUsdc: 175000,
    custodiedSharesInCajaDeValores: 15000,
    mintedTokens: 15000,
    reserveRatio: '1:1 (100.0%)',
    lastAuditTimestamp: '',
    custodianCuit: '30-71829304-8',
  },
  {
    ticker: 'CRES',
    tokenTicker: 'tCRES',
    companyName: 'Cresud S.A.C.I.F. y A.',
    isin: 'ARP315071179',
    sector: 'Agro e Inmuebles',
    priceUsdc: 9.40,
    change24hPct: 2.10,
    volume24hUsdc: 142000,
    custodiedSharesInCajaDeValores: 40000,
    mintedTokens: 40000,
    reserveRatio: '1:1 (100.0%)',
    lastAuditTimestamp: '',
    custodianCuit: '30-71829304-8',
  },
];

const DATA = path.join(__dirname, '..', '..', 'data', 'stocks.json');
let stocks: MervalStock[] = [];

function load() {
  try {
    if (fs.existsSync(DATA)) {
      const raw = JSON.parse(fs.readFileSync(DATA, 'utf8')) as MervalStock[];
      if (Array.isArray(raw)) {
        stocks = raw.map((s) => ({ ...s, active: s.active !== false }));
      }
      return;
    }
  } catch {
    // fall through to seed
  }
  const now = new Date().toISOString();
  stocks = SEED.map((s) => ({
    ...s,
    lastAuditTimestamp: s.lastAuditTimestamp || now,
    active: true,
    createdAt: now,
  }));
  save();
}

function save() {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(stocks, null, 2));
  persistToPg('stocks.json', stocks);
}

load();

function find(ticker: string): MervalStock | undefined {
  const t = String(ticker || '').trim().toUpperCase();
  return stocks.find((s) => s.ticker === t || s.tokenTicker === t);
}

/** Public market view: only stocks the admin left active. */
export function getMervalStocks(): MervalStock[] {
  return stocks.filter((s) => s.active);
}

/** Admin view: everything, active or not. */
export function listStocksAdmin(): MervalStock[] {
  return [...stocks].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Emits a new tokenized stock into the market catalog.
 *
 * This is the admin "emitir acción": the row is what the public /stocks
 * market renders, so creating it here lists it there immediately.
 */
export function createStock(input: {
  ticker: string;
  tokenTicker?: string;
  companyName: string;
  isin: string;
  sector?: string;
  priceUsdc: number;
  custodiedShares: number;
  custodianCuit?: string;
}): MervalStock {
  const ticker = String(input.ticker || '').trim().toUpperCase();
  if (!ticker || ticker.length > 12) throw new Error('Ticker inválido');
  const tokenTicker = (input.tokenTicker || `t${ticker}`).trim().toUpperCase();
  if (!input.companyName?.trim()) throw new Error('Falta la razón social');
  if (!input.isin?.trim()) throw new Error('Falta el ISIN');
  if (!(input.priceUsdc > 0)) throw new Error('Precio inválido');
  if (!(input.custodiedShares > 0)) throw new Error('Acciones en custodia inválidas');
  if (find(ticker) || find(tokenTicker)) {
    throw new Error(`Ya existe ${ticker} / ${tokenTicker} en el mercado`);
  }
  const stock: MervalStock = {
    ticker,
    tokenTicker,
    companyName: input.companyName.trim(),
    isin: input.isin.trim().toUpperCase(),
    sector: input.sector?.trim() || 'General',
    priceUsdc: input.priceUsdc,
    change24hPct: 0,
    volume24hUsdc: 0,
    custodiedSharesInCajaDeValores: input.custodiedShares,
    mintedTokens: input.custodiedShares,
    reserveRatio: '1:1 (100.0%)',
    lastAuditTimestamp: new Date().toISOString(),
    custodianCuit: input.custodianCuit?.trim() || '30-71829304-8',
    active: true,
    createdAt: new Date().toISOString(),
  };
  stocks.push(stock);
  save();
  return stock;
}

/** Activates (listed) or deactivates (hidden) a stock in the public market. */
export function setStockActive(ticker: string, active: boolean): MervalStock {
  const stock = find(ticker);
  if (!stock) throw new Error(`Acción ${ticker} no encontrada`);
  stock.active = Boolean(active);
  save();
  return stock;
}

/** Admin price fix for the demo quote shown in the market. */
export function updateStockPrice(ticker: string, priceUsdc: number, change24hPct?: number): MervalStock {
  const stock = find(ticker);
  if (!stock) throw new Error(`Acción ${ticker} no encontrada`);
  if (!(priceUsdc > 0)) throw new Error('Precio inválido');
  stock.change24hPct = ((priceUsdc - stock.priceUsdc) / stock.priceUsdc) * 100;
  if (Number.isFinite(change24hPct)) stock.change24hPct = Number(change24hPct);
  stock.priceUsdc = priceUsdc;
  save();
  return stock;
}

export function getProofOfReserveAudit() {
  const active = getMervalStocks();
  const totalShares = active.reduce((acc, s) => acc + s.custodiedSharesInCajaDeValores, 0);
  const totalTokens = active.reduce((acc, s) => acc + s.mintedTokens, 0);

  return {
    verified: totalShares === totalTokens,
    totalSharesCustodied: totalShares,
    totalTokensCirculating: totalTokens,
    custodianEntity: 'Fractachain PSAV Custodio Oficial (CNV RG 1058/2024)',
    depositoryAgent: 'Caja de Valores S.A. (Subcuenta Comitente Fiduciaria 94921-A)',
    lastAuditDate: new Date().toISOString(),
    sha256AuditHash: 'a7b8c9d0e1f23456789abcdef0123456789abcdef0123456789abcdef0123456',
    onChainAttestation: 'https://explorer.solana.com/tx/mock_por_attestation_daily?cluster=devnet',
  };
}
