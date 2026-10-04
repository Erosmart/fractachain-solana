'use client';

// Demo 100% client-side de Fractachain sobre Solana (devnet simulado).
// Modelos Solana del demo:
//   keypair/ATA Solana (base58)
//   SOL + airdrop de devnet
//   programa Anchor: PDA base58
//   signature base58 (~88 chars)
//   ATA (congelada hasta KYC)
//   orderbook estilo Manifest (matching engine local)

import { useEffect, useState } from 'react';

/* ------------------------------------------------------------------ types */

export type DemoStatus =
  | 'DRAFT'
  | 'DEPLOYED'
  | 'TOKENS_MINTED'
  | 'LISTED'
  | 'CLOSED_SUCCESS'
  | 'CLOSED_FAILED';

/** Espejo 1:1 de backend/src/admin/listings.ts :: CompanyDossier. */
export interface Dossier {
  legalName: string;
  tradeName: string;
  cuit: string;
  jurisdiction: string;
  sector: string;
  ticker: string;
  tokenTicker: string;
  isin: string;
  authorizedShares: number;
  sharesToTokenize: number;
  pricePerShareUsdc: number;
  cajaSubaccount: string;
  custodianCuit: string;
  cnvRecordId: string;
  bymaRequestId: string;
  legalTermsUri: string;
  estatutoHash: string;
  auditor: string;
  /** Wallet Solana del emisor (base58). */
  issuerWallet: string;
  /** Wallet que cobra la licitación al cerrar (base58). Ex-Fiduciary/proceedsWallet. */
  proceedsWallet: string;
  paymentKind: 'USDC';
  offeringSoftCapUsdc: number;
  offeringHardCapUsdc: number;
  offeringDays: number;
  tnaUsd: number;
  useOfProceeds: string;
  minInvestmentUsdc: number;
}

export interface DemoListing {
  id: string; // IPO-TICKER-xxxx (igual que listings.ts)
  dossier: Dossier;
  status: DemoStatus;
  offeringPda: string;
  rwaMint: string;
  marketAddress: string;
  tokensMinted: number;
  raisedUsdc: number;
  contributions: { wallet: string; usdc: number; units: number; refunded: boolean }[];
  deadlineAt?: string;
  createdAt: string;
  lastPrice: number;
}

export interface Order {
  id: string;
  listingId: string;
  side: 'BUY' | 'SELL';
  price: number;
  amount: number;
  remaining: number;
  owner: 'me' | 'bot';
  createdAt: number;
}

export interface Trade {
  id: string;
  listingId: string;
  price: number;
  amount: number;
  takerSide: 'BUY' | 'SELL';
  sig: string;
  createdAt: number;
}

export interface WalletState {
  connected: boolean;
  pubkey: string;
  sol: number;
  usdc: number;
  usdcLocked: number;
  holdings: Record<string, { free: number; locked: number }>;
  kycVerified: boolean;
  /** ATAs creadas. */
  atas: Record<string, boolean>;
}

export interface Candle {
  t: number; // timestamp del bucket
  o: number; h: number; l: number; c: number;
}

export interface DemoState {
  wallet: WalletState;
  listings: DemoListing[];
  orders: Order[];
  trades: Trade[];
  candles: Record<string, Candle[]>;
}

/* ------------------------------------------------------- solana-ish utils */

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Datos seed deterministas: el server (SSR) y el primer render del cliente
 * deben producir exactamente los mismos valores o React rompe hidratación.
 * Por eso el seed usa un PRNG con semilla fija y un timestamp constante;
 * las acciones runtime (post-hidratación) sí usan Math.random()/Date.now().
 */
const SEED_NOW = 1_759_600_000_000;
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rand58(len: number, rng: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < len; i++) s += B58[Math.floor(rng() * B58.length)];
  return s;
}
export const fakeKeypair = () => rand58(44);
export const fakeSig = () => rand58(87);
export const shortPk = (pk: string) => (pk ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : '');
export const isSolanaPk = (s: string) =>
  /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test((s || '').trim());
export const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (pk: string) =>
  `https://explorer.solana.com/address/${pk}?cluster=devnet`;

export const fmt = (n: number, dec = 2) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const fmtInt = (n: number) => Math.round(n).toLocaleString('es-AR');

/* ------------------------------------------------------------- validation */

/** Error de dominio traducible: la UI lo pasa por t(key, vars). */
export interface DemoError {
  key: string;
  vars?: Record<string, string | number>;
}

export function validateDossier(d: Dossier): string[] {
  // Cada item es o un nombre de campo ('legalName' → demo.fields.legalName)
  // o una key i18n completa ('demo.err.*').
  const missing: string[] = [];
  const fields: (keyof Dossier)[] = [
    'legalName', 'cuit', 'ticker', 'tokenTicker', 'isin', 'cajaSubaccount',
    'custodianCuit', 'cnvRecordId', 'legalTermsUri', 'estatutoHash', 'auditor',
    'proceedsWallet',
  ];
  for (const f of fields) if (!String(d[f] || '').trim()) missing.push(f);
  if (d.proceedsWallet && !isSolanaPk(d.proceedsWallet.trim()))
    missing.push('demo.err.pkInvalid');
  if (
    d.proceedsWallet && d.issuerWallet &&
    d.proceedsWallet.trim() === d.issuerWallet.trim()
  )
    missing.push('demo.err.pkSame');
  if (!(d.sharesToTokenize > 0)) missing.push('sharesToTokenize');
  if (!(d.pricePerShareUsdc > 0)) missing.push('pricePerShareUsdc');
  if (!(d.offeringHardCapUsdc > 0)) missing.push('offeringHardCapUsdc');
  if (d.offeringSoftCapUsdc > d.offeringHardCapUsdc)
    missing.push('demo.err.softGtHard');
  if (d.cuit && d.cuit.replace(/[^\d]/g, '').length < 10)
    missing.push('demo.err.cuitInvalid');
  return missing;
}

export const EMPTY_DOSSIER: Dossier = {
  legalName: '', tradeName: '', cuit: '', jurisdiction: 'Argentina', sector: '',
  ticker: '', tokenTicker: '', isin: '', authorizedShares: 0, sharesToTokenize: 0,
  pricePerShareUsdc: 0, cajaSubaccount: '', custodianCuit: '', cnvRecordId: '',
  bymaRequestId: '', legalTermsUri: '', estatutoHash: '', auditor: '',
  issuerWallet: '', proceedsWallet: '', paymentKind: 'USDC',
  offeringSoftCapUsdc: 0, offeringHardCapUsdc: 0, offeringDays: 30, tnaUsd: 0,
  useOfProceeds: '', minInvestmentUsdc: 15000,
};

/* ------------------------------------------------------------------ store */

const KEY = 'fc_demo_solana_v1';
let state: DemoState;
const listeners = new Set<() => void>();

function seedWallet(): WalletState {
  return {
    connected: false,
    pubkey: '',
    sol: 0,
    usdc: 0,
    usdcLocked: 0,
    holdings: {},
    kycVerified: false,
    atas: {},
  };
}

function seedListings(): DemoListing[] {
  const rng = mulberry32(0x1c7a1);
  const now = new Date(SEED_NOW).toISOString();
  const ggal: DemoListing = {
    id: 'IPO-GGAL-demo1',
    dossier: {
      ...EMPTY_DOSSIER,
      legalName: 'Grupo Financiero Galicia S.A.', tradeName: 'Galicia',
      cuit: '30-50000273-1', sector: 'Financiero', ticker: 'GGAL', tokenTicker: 'tGGAL',
      isin: 'AR3704326102', authorizedShares: 1475000000, sharesToTokenize: 500000,
      pricePerShareUsdc: 12.5, cajaSubaccount: 'CV-88412-GGAL', custodianCuit: '30-68200812-9',
      cnvRecordId: 'CNV-2025-1147', bymaRequestId: 'BYMA-REQ-3390',
      legalTermsUri: 'https://fractachain.example/legal/tggal', estatutoHash: '9f2c…a1',
      auditor: 'Pistrelli, Henry Martin y Asoc.', issuerWallet: rand58(44, rng),
      proceedsWallet: rand58(44, rng), offeringSoftCapUsdc: 100000,
      offeringHardCapUsdc: 500000, offeringDays: 30, tnaUsd: 4.5,
      useOfProceeds: 'Expansión de banca digital y tokenización de activos del balance.',
      minInvestmentUsdc: 15000,
    },
    status: 'CLOSED_SUCCESS', offeringPda: rand58(44, rng), rwaMint: rand58(44, rng),
    marketAddress: rand58(44, rng), tokensMinted: 500000, raisedUsdc: 500000,
    contributions: [], createdAt: now, lastPrice: 12.8,
  };
  const ypfd: DemoListing = {
    id: 'IPO-YPFD-demo2',
    dossier: {
      ...EMPTY_DOSSIER,
      legalName: 'YPF Sociedad Anónima', tradeName: 'YPF', cuit: '30-54668997-9',
      sector: 'Energía', ticker: 'YPFD', tokenTicker: 'tYPF', isin: 'ARPAGA580989',
      authorizedShares: 393312793, sharesToTokenize: 250000, pricePerShareUsdc: 38,
      cajaSubaccount: 'CV-77120-YPF', custodianCuit: '30-68200812-9',
      cnvRecordId: 'CNV-2025-0901', bymaRequestId: 'BYMA-REQ-3405',
      legalTermsUri: 'https://fractachain.example/legal/typf', estatutoHash: '3d8e…b7',
      auditor: 'Deloitte & Co.', issuerWallet: rand58(44, rng), proceedsWallet: rand58(44, rng),
      offeringSoftCapUsdc: 200000, offeringHardCapUsdc: 400000, offeringDays: 21,
      tnaUsd: 5.1,
      useOfProceeds: 'Inversión en Vaca Muerta: infraestructura de midstream.',
      minInvestmentUsdc: 15000,
    },
    status: 'LISTED', offeringPda: rand58(44, rng), rwaMint: rand58(44, rng), marketAddress: '',
    tokensMinted: 250000, raisedUsdc: 114000,
    contributions: [],
    deadlineAt: new Date(SEED_NOW + 21 * 86400e3).toISOString(),
    createdAt: now, lastPrice: 38,
  };
  return [ggal, ypfd];
}

function seedOrders(): Order[] {
  const mk = (side: 'BUY' | 'SELL', price: number, amount: number, i: number): Order => ({
    id: `o-seed-${i}`, listingId: 'IPO-GGAL-demo1', side, price, amount,
    remaining: amount, owner: 'bot', createdAt: SEED_NOW - i * 60e3,
  });
  return [
    mk('SELL', 13.4, 800, 1), mk('SELL', 13.1, 1500, 2), mk('SELL', 12.95, 2200, 3),
    mk('BUY', 12.6, 2500, 4), mk('BUY', 12.45, 1800, 5), mk('BUY', 12.2, 900, 6),
  ];
}

function seedTrades(): Trade[] {
  const trng = mulberry32(0x7ade5);
  return [
    { id: 't-seed-1', listingId: 'IPO-GGAL-demo1', price: 12.8, amount: 600, takerSide: 'BUY', sig: rand58(87, trng), createdAt: SEED_NOW - 26 * 60e3 },
    { id: 't-seed-2', listingId: 'IPO-GGAL-demo1', price: 12.75, amount: 1400, takerSide: 'SELL', sig: rand58(87, trng), createdAt: SEED_NOW - 55 * 60e3 },
    { id: 't-seed-3', listingId: 'IPO-GGAL-demo1', price: 12.7, amount: 900, takerSide: 'BUY', sig: rand58(87, trng), createdAt: SEED_NOW - 90 * 60e3 },
  ];
}

/** Random walk de 40 velas de 5 min que termina en el lastPrice del seed. */
function seedCandles(): Record<string, Candle[]> {
  const rng = mulberry32(0xc4d1e);
  const out: Candle[] = [];
  let px = 11.9;
  const end = 12.8;
  const n = 40;
  const drift = (end - px) / n;
  for (let i = 0; i < n; i++) {
    const o = px;
    const c = +(px + drift + (rng() - 0.48) * 0.12).toFixed(2);
    const h = Math.max(o, c) + +(rng() * 0.05).toFixed(2);
    const l = Math.min(o, c) - +(rng() * 0.05).toFixed(2);
    out.push({ t: SEED_NOW - (n - i) * 300e3, o: +o.toFixed(2), h, l, c });
    px = c;
  }
  out[out.length - 1].c = end;
  return { 'IPO-GGAL-demo1': out };
}

function freshState(): DemoState {
  return {
    wallet: seedWallet(), listings: seedListings(), orders: seedOrders(),
    trades: seedTrades(), candles: seedCandles(),
  };
}

function load(): DemoState {
  if (typeof window === 'undefined') return freshState();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      // Estados viejos (pre-velas): rellenar las series que falten o estén vacías.
      parsed.candles = parsed.candles || {};
      for (const [id, seed] of Object.entries(seedCandles())) {
        if (!parsed.candles[id]?.length) parsed.candles[id] = seed;
      }
      return parsed;
    }
  } catch { /* estado corrupto → re-seed */ }
  return freshState();
}

function save() {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

function emit() {
  save();
  listeners.forEach((fn) => fn());
}

state = load();

export function useDemoState(): DemoState {
  const [, force] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    state = load();
    setHydrated(true);
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return hydrated ? state : freshState();
}

export function resetDemo() {
  state = freshState();
  emit();
}

/* ------------------------------------------------------------- wallet ops */

export function connectWallet() {
  state.wallet.connected = true;
  if (!state.wallet.pubkey) state.wallet.pubkey = fakeKeypair();
  if (state.wallet.sol === 0) state.wallet.sol = 0.5;
  emit();
}

export function disconnectWallet() {
  state.wallet.connected = false;
  emit();
}

export function airdrop() {
  state.wallet.sol += 2;
  state.wallet.usdc += 10000;
  emit();
}

export function verifyKyc() {
  state.wallet.kycVerified = true;
  emit();
}

/** Crea la ATA del token. */
export function ensureAta(ticker: string) {
  state.wallet.atas[ticker] = true;
  if (!state.wallet.holdings[ticker]) state.wallet.holdings[ticker] = { free: 0, locked: 0 };
  emit();
}

/* ------------------------------------------------------------- lifecycle */

export function createListing(d: Dossier): { ok: true; id: string } | { ok: false; errors: string[] } {
  const errors = validateDossier(d);
  const ticker = d.tokenTicker.trim().toUpperCase();
  if (state.listings.some((l) => l.dossier.tokenTicker === ticker))
    errors.push('demo.err.dupTicker');
  if (errors.length) return { ok: false, errors };
  const listing: DemoListing = {
    id: `IPO-${d.ticker.trim().toUpperCase()}-${Date.now().toString(36)}`,
    dossier: { ...d, ticker: d.ticker.trim().toUpperCase(), tokenTicker: ticker },
    status: 'DRAFT', offeringPda: '', rwaMint: '', marketAddress: '',
    tokensMinted: 0, raisedUsdc: 0, contributions: [],
    createdAt: new Date().toISOString(), lastPrice: d.pricePerShareUsdc,
  };
  state.listings = [listing, ...state.listings];
  emit();
  return { ok: true, id: listing.id };
}

export function deployOffering(id: string) {
  const l = state.listings.find((x) => x.id === id);
  if (!l || l.status !== 'DRAFT') return;
  l.offeringPda = rand58(44);
  l.rwaMint = rand58(44);
  l.status = 'DEPLOYED';
  emit();
}

export function mintTokens(id: string) {
  const l = state.listings.find((x) => x.id === id);
  if (!l || l.status !== 'DEPLOYED') return;
  l.tokensMinted = l.dossier.sharesToTokenize;
  l.status = 'TOKENS_MINTED';
  emit();
}

export function openOffering(id: string) {
  const l = state.listings.find((x) => x.id === id);
  if (!l || l.status !== 'TOKENS_MINTED') return;
  l.status = 'LISTED';
  l.deadlineAt = new Date(Date.now() + (l.dossier.offeringDays || 30) * 86400e3).toISOString();
  emit();
}

/** Aporte a la licitación. Requiere KYC + ATA, como el contrato Anchor. */
export function contribute(id: string, usdcAmount: number): DemoError | null {
  const l = state.listings.find((x) => x.id === id);
  const w = state.wallet;
  if (!l || l.status !== 'LISTED') return { key: 'demo.err.notOpen' };
  if (!w.connected) return { key: 'demo.err.noWallet' };
  if (!w.kycVerified) return { key: 'demo.err.noKyc' };
  const price = l.dossier.pricePerShareUsdc;
  if (usdcAmount <= 0)
    return { key: 'demo.err.badAmount' };
  if (l.raisedUsdc + usdcAmount > l.dossier.offeringHardCapUsdc)
    return { key: 'demo.err.hardCap' };
  const units = usdcAmount / price; // unidades fraccionadas permitidas
  const sold = l.contributions.filter((c) => !c.refunded).reduce((a, c) => a + c.units, 0);
  if (units > l.tokensMinted - sold)
    return { key: 'demo.err.noUnits' };
  if (w.usdc < usdcAmount) return { key: 'demo.err.noUsdc' };
  if (!w.atas[l.dossier.tokenTicker]) ensureAta(l.dossier.tokenTicker);
  w.usdc -= usdcAmount;
  w.holdings[l.dossier.tokenTicker].free += units;
  l.raisedUsdc += usdcAmount;
  l.contributions.push({ wallet: w.pubkey, usdc: usdcAmount, units, refunded: false });
  if (l.raisedUsdc >= l.dossier.offeringHardCapUsdc) finalizeOffering(id);
  emit();
  return null;
}

export function finalizeOffering(id: string) {
  const l = state.listings.find((x) => x.id === id);
  if (!l || l.status !== 'LISTED') return;
  l.status = l.raisedUsdc >= l.dossier.offeringSoftCapUsdc ? 'CLOSED_SUCCESS' : 'CLOSED_FAILED';
  if (l.status === 'CLOSED_SUCCESS') l.marketAddress = rand58(44);
  emit();
}

export function refund(id: string): DemoError | null {
  const l = state.listings.find((x) => x.id === id);
  const w = state.wallet;
  if (!l || l.status !== 'CLOSED_FAILED') return { key: 'demo.err.noRefund' };
  const c = l.contributions.find((x) => x.wallet === w.pubkey && !x.refunded);
  if (!c) return { key: 'demo.err.noContribution' };
  c.refunded = true;
  w.usdc += c.usdc;
  const h = w.holdings[l.dossier.tokenTicker];
  if (h) h.free = Math.max(0, h.free - c.units);
  emit();
  return null;
}

/* --------------------------------------------------------- matching engine */

export interface Book {
  bids: { price: number; amount: number }[];
  asks: { price: number; amount: number }[];
  myOrders: Order[];
}

export function getBook(listingId: string): Book {
  const os = state.orders.filter((o) => o.listingId === listingId && o.remaining > 0);
  const agg = (side: 'BUY' | 'SELL') => {
    const m = new Map<number, number>();
    os.filter((o) => o.side === side).forEach((o) =>
      m.set(o.price, (m.get(o.price) || 0) + o.remaining));
    return [...m.entries()]
      .map(([price, amount]) => ({ price, amount }))
      .sort((a, b) => (side === 'BUY' ? b.price - a.price : a.price - b.price));
  };
  return { bids: agg('BUY'), asks: agg('SELL'), myOrders: os.filter((o) => o.owner === 'me') };
}

export function getTrades(listingId: string): Trade[] {
  return state.trades
    .filter((t) => t.listingId === listingId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 30);
}

export function getCandles(listingId: string): Candle[] {
  return (state.candles || {})[listingId] || [];
}

/** Actualiza la vela corriente (buckets de 1 min) con cada fill. */
function recordCandle(listingId: string, price: number) {
  state.candles ||= {};
  const arr = (state.candles[listingId] ||= []);
  const bucket = Math.floor(Date.now() / 60e3) * 60e3;
  const last = arr[arr.length - 1];
  if (last && last.t === bucket) {
    last.h = Math.max(last.h, price);
    last.l = Math.min(last.l, price);
    last.c = price;
  } else {
    arr.push({ t: bucket, o: price, h: price, l: price, c: price });
  }
  if (arr.length > 90) arr.shift();
}

export function placeOrder(
  listingId: string, side: 'BUY' | 'SELL', price: number, amount: number,
): DemoError | null {
  const l = state.listings.find((x) => x.id === listingId);
  const w = state.wallet;
  if (!l || l.status !== 'CLOSED_SUCCESS' || !l.marketAddress)
    return { key: 'demo.err.noMarket' };
  if (!w.connected) return { key: 'demo.err.noWallet' };
  if (!w.kycVerified) return { key: 'demo.err.noKycTrade' };
  const tk = l.dossier.tokenTicker;
  if (!w.atas[tk]) return { key: 'demo.err.noAta' };
  if (!(price > 0) || !(amount > 0)) return { key: 'demo.err.badInput' };

  const h = w.holdings[tk] || { free: 0, locked: 0 };
  w.holdings[tk] = h;
  if (side === 'BUY') {
    const cost = price * amount;
    if (w.usdc < cost)
      return { key: 'demo.err.noUsdcBuy', vars: { need: fmt(cost), have: fmt(w.usdc) } };
    w.usdc -= cost;
    w.usdcLocked += cost;
  } else {
    if (h.free < amount)
      return { key: 'demo.err.noTokens', vars: { tk, have: fmtInt(h.free) } };
    h.free -= amount;
    h.locked += amount;
  }

  let remaining = amount;
  let paidOut = 0; // USDC efectivamente pagado en fills (BUY)
  const contra = state.orders
    .filter((o) => o.listingId === listingId && o.remaining > 0 &&
      o.side === (side === 'BUY' ? 'SELL' : 'BUY') &&
      (side === 'BUY' ? o.price <= price : o.price >= price))
    .sort((a, b) =>
      side === 'BUY' ? a.price - b.price || a.createdAt - b.createdAt
                     : b.price - a.price || a.createdAt - b.createdAt);

  for (const maker of contra) {
    if (remaining <= 0) break;
    const fill = Math.min(remaining, maker.remaining);
    const fillPx = maker.price; // price-time priority: ejecuta al precio del maker
    maker.remaining -= fill;
    remaining -= fill;
    state.trades.push({
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      listingId, price: fillPx, amount: fill, takerSide: side,
      sig: fakeSig(), createdAt: Date.now(),
    });
    recordCandle(listingId, fillPx);
    if (side === 'BUY') {
      paidOut += fillPx * fill;
      h.free += fill; // recibe los tokens del maker
    } else {
      h.locked -= fill;        // entrega sus tokens lockeados
      w.usdc += fillPx * fill; // cobra USDC del taker
    }
    l.lastPrice = fillPx;
  }

  if (side === 'BUY') {
    // El lock se reserva siempre a precio bid. Tras los fills el lock correcto
    // es price*remaining; la diferencia es la mejora de precio → se devuelve.
    const correctLock = price * remaining;
    const refund = price * amount - paidOut - correctLock;
    w.usdcLocked = Math.max(0, w.usdcLocked - (price * amount - correctLock));
    w.usdc += refund;
    // Nota: paidOut ya salió del lock vía el ajuste de arriba (lock -= paidOut + refund).
  }

  if (remaining > 0) {
    state.orders.push({
      id: `o-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      listingId, side, price, amount, remaining, owner: 'me', createdAt: Date.now(),
    });
  }
  emit();
  return null;
}

export function cancelOrder(orderId: string): DemoError | null {
  const i = state.orders.findIndex((o) => o.id === orderId && o.owner === 'me' && o.remaining > 0);
  if (i < 0) return { key: 'demo.err.noOrder' };
  const o = state.orders[i];
  const l = state.listings.find((x) => x.id === o.listingId)!;
  const w = state.wallet;
  const tk = l.dossier.tokenTicker;
  if (o.side === 'BUY') {
    w.usdcLocked -= o.price * o.remaining;
    w.usdc += o.price * o.remaining;
  } else {
    const h = w.holdings[tk];
    if (h) { h.locked -= o.remaining; h.free += o.remaining; }
  }
  state.orders.splice(i, 1);
  emit();
  return null;
}

/** Bot de mercado: agrega una orden aleatoria para animar el demo. */
export function simulateMarket(listingId: string) {
  const l = state.listings.find((x) => x.id === listingId);
  if (!l || l.status !== 'CLOSED_SUCCESS') return;
  const base = l.lastPrice || l.dossier.pricePerShareUsdc;
  const side: 'BUY' | 'SELL' = Math.random() < 0.5 ? 'BUY' : 'SELL';
  const px = +(base * (1 + (Math.random() * 0.06 - 0.03))).toFixed(2);
  const amount = [100, 250, 500, 800, 1200][Math.floor(Math.random() * 5)];
  state.orders.push({
    id: `o-bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    listingId, side, price: px, amount, remaining: amount,
    owner: 'bot', createdAt: Date.now(),
  });
  emit();
}
