import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { getConnection } from './connection';
import { adminKeypair } from './keys';
import { ixAuthorizeMarketVault } from './program';
import { sendIxs } from './tx';

/**
 * Manifest CLOB integration — the Solana replacement for the Stellar DEX
 * (sdex.ts / sdex_book.ts).
 *
 * The SDK (`@cks-systems/manifest-sdk`) is loaded lazily so the backend
 * compiles and the sandbox book keeps working if the dependency is missing.
 * Real flow per trader: getSetupIxs (create wrapper + claim seat) →
 * placeOrderWithRequiredDepositIxs (deposit + order in one tx) → cancelOrderIx.
 */

export const MANIFEST_PROGRAM_ID = new PublicKey(
  'MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms',
);

let sdkPromise: Promise<any> | null = null;

function sdk() {
  if (!sdkPromise) {
    sdkPromise = import('@cks-systems/manifest-sdk').catch(() => {
      throw new Error(
        'Manifest SDK no instalado: npm i @cks-systems/manifest-sdk (ver SETUP_SOLANA.md)',
      );
    });
  }
  return sdkPromise;
}

export interface ManifestMarketInfo {
  market: string;
  baseVault: string;
  quoteVault: string;
  baseMint: string;
  quoteMint: string;
}

/**
 * Creates a Manifest market for (rwaMint, paymentMint) — server-signed.
 * `Market.setupIxs` returns a fresh keypair whose pubkey IS the market
 * account (Manifest markets are ordinary accounts, not PDAs).
 */
export async function createMarket(
  baseMint: PublicKey,
  quoteMint: PublicKey,
): Promise<ManifestMarketInfo> {
  const { Market, getVaultAddress } = await sdk();
  const conn = getConnection();
  const admin = adminKeypair();
  const { ixs, signers } = await Market.setupIxs(conn, baseMint, quoteMint, admin.publicKey);
  const market: PublicKey = signers[0].publicKey;
  await sendIxs(admin, signers, ixs as TransactionInstruction[]);
  return {
    market: market.toBase58(),
    baseVault: getVaultAddress(market, baseMint).toBase58(),
    quoteVault: getVaultAddress(market, quoteMint).toBase58(),
    baseMint: baseMint.toBase58(),
    quoteMint: quoteMint.toBase58(),
  };
}

/** Thaws the freshly created Token-2022 vault — required before deposits. */
export async function authorizeVault(
  listingId: string,
  vault: PublicKey,
): Promise<string> {
  const admin = adminKeypair();
  return sendIxs(admin, [], [
    ixAuthorizeMarketVault(admin.publicKey, listingId, vault),
  ]);
}

/** Vault PDA for (market, mint) — the base vault is what authorizeVault thaws. */
export async function vaultAddress(market: PublicKey, mint: PublicKey): Promise<PublicKey> {
  const { getVaultAddress } = await sdk();
  return getVaultAddress(market, mint);
}

export interface OrderLevel {
  price: number;
  quantity: number;
}

export interface ManifestBook {
  market: string;
  bids: OrderLevel[];
  asks: OrderLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  midPrice: number | null;
  spread: number | null;
}

async function loadMarket(marketAddress: string) {
  const { Market } = await sdk();
  const conn = getConnection();
  const market = await Market.loadFromAddress({
    connection: conn,
    address: new PublicKey(marketAddress),
  });
  await market.reload();
  return market;
}

export async function getBook(marketAddress: string): Promise<ManifestBook> {
  const market = await loadMarket(marketAddress);
  const toLevel = (o: any): OrderLevel => ({
    price: Number(o.tokenPrice),
    quantity: Number(o.numBaseTokens),
  });
  const bids = market.bids().map(toLevel);
  const asks = market.asks().map(toLevel);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  return {
    market: marketAddress,
    bids,
    asks,
    bestBid,
    bestAsk,
    midPrice: bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null,
    spread: bestBid != null && bestAsk != null ? bestAsk - bestBid : null,
  };
}

export interface TraderSetup {
  setupNeeded: boolean;
  instructions: TransactionInstruction[];
  /** Fresh keypair that owns the new wrapper account — must co-sign. */
  wrapperKeypair: Keypair | null;
}

/**
 * First-contact setup for a trader on a market: creates their Manifest
 * wrapper account and claims a seat. `setupNeeded=false` → ready to trade.
 */
export async function traderSetup(
  marketAddress: string,
  trader: PublicKey,
): Promise<TraderSetup> {
  const { ManifestClient } = await sdk();
  const conn = getConnection();
  const data = await ManifestClient.getSetupIxs(conn, new PublicKey(marketAddress), trader);
  return {
    setupNeeded: Boolean(data.setupNeeded),
    instructions: (data.instructions || []) as TransactionInstruction[],
    wrapperKeypair: data.wrapperKeypair || null,
  };
}

async function clientFor(marketAddress: string, trader: PublicKey) {
  const { ManifestClient } = await sdk();
  const conn = getConnection();
  return ManifestClient.getClientForMarketNoPrivateKey(
    conn,
    new PublicKey(marketAddress),
    trader,
  );
}

/**
 * Deposit + place in one shot — the SDK only deposits whatever the
 * withdrawable balance doesn't already cover. `traderSetup` must have run.
 */
export async function placeOrderIxs(params: {
  market: string;
  trader: PublicKey;
  side: 'buy' | 'sell';
  numBaseTokens: number;
  price: number;
  clientOrderId?: bigint;
}): Promise<TransactionInstruction[]> {
  const { OrderType } = await sdk();
  const client = await clientFor(params.market, params.trader);
  return client.placeOrderWithRequiredDepositIxs(params.trader, {
    numBaseTokens: params.numBaseTokens,
    tokenPrice: params.price,
    isBid: params.side === 'buy',
    lastValidSlot: 0, // no expiration
    orderType: OrderType?.Limit ?? 0,
    clientOrderId: params.clientOrderId ?? BigInt(Date.now()),
  }) as Promise<TransactionInstruction[]>;
}

export async function cancelOrderIxs(params: {
  market: string;
  trader: PublicKey;
  clientOrderId: bigint;
}): Promise<TransactionInstruction[]> {
  const client = await clientFor(params.market, params.trader);
  return [client.cancelOrderIx({ clientOrderId: params.clientOrderId })];
}

export interface TraderOrder {
  clientOrderId: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
}

/** All resting orders of one trader on one market (for "mis órdenes" + cancel). */
export async function traderOrders(
  marketAddress: string,
  trader: PublicKey,
): Promise<TraderOrder[]> {
  const { ManifestClient, Wrapper, Market } = await sdk();
  const conn = getConnection();
  // fetchFirstUserWrapper is `private` in the .d.ts but is the same lookup
  // getSetupIxs uses internally — a getProgramAccounts scan on the wrapper
  // program filtered by owner.
  const userWrapper = await (ManifestClient as any).fetchFirstUserWrapper(conn, trader);
  if (!userWrapper) return [];
  const wrapper = await Wrapper.loadFromAddress({
    connection: conn,
    address: userWrapper.pubkey,
  });
  const orders = wrapper.openOrdersForMarket(new PublicKey(marketAddress)) || [];
  const market = await Market.loadFromAddress({
    connection: conn,
    address: new PublicKey(marketAddress),
  });
  const baseDecimals = market.baseDecimals();
  return orders.map((o: any) => ({
    clientOrderId: String(o.clientOrderId),
    side: o.isBid ? ('buy' as const) : ('sell' as const),
    price: Number(o.price),
    quantity: Number(o.numBaseAtoms) / 10 ** baseDecimals,
  }));
}
