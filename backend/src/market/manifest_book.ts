/**
 * Maps a Fractachain listing onto a Manifest CLOB market.
 *
 * The in-memory book in `orderbook.ts` stays as the sandbox fallback for
 * demos with no deployed program. Once a listing has a Manifest market
 * (`listing.manifestMarket`), this module takes over and the book the UI
 * renders is the on-chain one.
 *
 * Replaces the Stellar-era `sdex_book.ts`: instead of trustlines the holder
 * needs a Token-2022 ATA of the RWA mint (unfrozen = KYC'd), and instead of
 * signed XDR the wallet gets a serialized unsigned transaction.
 */
import { PublicKey } from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  getAccount as getTokenAccount,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { getListing, Listing } from '../admin/listings';
import { custodialSigningKeypair, getAccount, markTokensOnChain } from '../auth/accounts';
import { isSolanaPublicKey } from '../solana/keys';
import { getConnection } from '../solana/connection';
import { offeringPda, rwaMintPda } from '../solana/pda';
import { usdcAta, usdcBalance, usdcMint } from '../solana/usdc';
import {
  cancelOrderIxs,
  getBook,
  placeOrderIxs,
  traderOrders,
} from '../solana/manifest';
import { buildUnsignedTx, sendIxs, submitSignedTx } from '../solana/tx';
import { isInvestorVerifiedOnChain } from '../solana/kyc';
import { loadTokenBalance } from '../auth/solana_devnet';

/** The SPL mint every market quotes against (devnet mock or real USDC). */
export function counterAsset(): PublicKey {
  const mint = usdcMint();
  if (!mint) throw new Error('Falta el mint USDC configurado (SOLANA_USDC_MINT / deployments)');
  return mint;
}

/** The Token-2022 RWA mint this listing trades. Derived from the Offering PDA. */
export function listingAsset(listing: Listing): PublicKey {
  const [offering] = offeringPda(listing.id);
  const [mint] = rwaMintPda(offering);
  return mint;
}

/** A listing trades on Manifest once the admin created its market. */
export function marketAvailable(listing: Listing): boolean {
  return Boolean(listing.manifestMarket) && isSolanaPublicKey(listing.manifestMarket || '');
}

// Kept under the old name so call sites read naturally — it now means
// "has an on-chain order book", not "runs on Stellar".
export const sdexAvailable = marketAvailable;

function requireMarketListing(listingId: string): Listing {
  const listing = getListing(listingId);
  if (!listing) throw new Error('Mercado no encontrado');
  if (!marketAvailable(listing)) {
    throw new Error(
      'Este listing todavía no tiene mercado Manifest, así que no cotiza on-chain',
    );
  }
  return listing;
}

export interface BookLevel {
  price: number;
  quantity: number;
}

export interface ManifestBookView {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  market: string;
  bids: BookLevel[];
  asks: BookLevel[];
  spread: number | null;
  midPrice: number | null;
  refPrice: number;
  lastPrice: number;
  /**
   * Manifest keeps fills inside the market account; a trade tape needs an
   * indexer (see SETUP_SOLANA.md). Empty until then — lastPrice uses mid.
   */
  trades: { id: string; price: number; amount: number; createdAt: string }[];
  myOffers: { id: string; side: 'BUY' | 'SELL'; price: number; amount: number }[];
  /** Investor PDA verified on-chain (KYC). */
  authorized: boolean;
  /** Holder still needs the RWA ATA (the "trustline" of Solana). */
  needsTrustline: boolean;
  tokenBalance: number;
  usdcBalance: number;
  usdcTotal: number;
  tokenTotal: number;
  sandbox: false;
}

const inflightBooks = new Map<string, Promise<ManifestBookView>>();

export async function getSdexBook(listingId: string, accountId?: string): Promise<ManifestBookView> {
  const key = `${listingId}:${accountId || ''}`;
  const pending = inflightBooks.get(key);
  if (pending) return pending;
  const next = loadManifestBook(listingId, accountId).finally(() => inflightBooks.delete(key));
  inflightBooks.set(key, next);
  return next;
}

async function loadManifestBook(listingId: string, accountId?: string): Promise<ManifestBookView> {
  const listing = requireMarketListing(listingId);
  const base = listingAsset(listing);
  const quote = counterAsset();
  const book = await getBook(listing.manifestMarket!);

  let myOffers: ManifestBookView['myOffers'] = [];
  let authorized = false;
  let needsTrustline = true;
  let tokenBalance = 0;
  let usdcAvailable = 0;
  let usdcTotal = 0;
  let tokenTotal = 0;

  const account = accountId ? getAccount(accountId) : undefined;
  if (account?.publicKey && isSolanaPublicKey(account.publicKey)) {
    const wallet = new PublicKey(account.publicKey);
    const [orders, verified, ataBalance, usdcBal] = await Promise.all([
      traderOrders(listing.manifestMarket!, wallet).catch(() => ({ bids: [], asks: [] })),
      isInvestorVerifiedOnChain(wallet).catch(() => account.kycStatus === 'APPROVED'),
      loadTokenBalance(account.publicKey, base.toBase58(), true).catch(() => 0),
      usdcBalance(wallet).catch(() => 0),
    ]);
    myOffers = [
      ...orders.bids.map((o: any, i: number) => ({
        id: String(o.clientOrderId ?? `bid-${i}`),
        side: 'BUY' as const,
        price: o.price,
        amount: o.quantity,
      })),
      ...orders.asks.map((o: any, i: number) => ({
        id: String(o.clientOrderId ?? `ask-${i}`),
        side: 'SELL' as const,
        price: o.price,
        amount: o.quantity,
      })),
    ];
    authorized = verified;
    const ata = getAssociatedTokenAddressSync(base, wallet, true, TOKEN_2022_PROGRAM_ID);
    needsTrustline = !(await getConnection().getAccountInfo(ata));
    tokenTotal = ataBalance;
    usdcTotal = usdcBal;
    tokenBalance = ataBalance;
    usdcAvailable = usdcBal;
  }

  return {
    listingId,
    tokenTicker: listing.dossier.tokenTicker,
    legalName: listing.dossier.legalName,
    market: listing.manifestMarket!,
    bids: book.bids,
    asks: book.asks,
    spread: book.spread,
    midPrice: book.midPrice,
    refPrice: listing.dossier.pricePerShareUsdc,
    lastPrice: book.midPrice ?? listing.dossier.pricePerShareUsdc,
    trades: [],
    myOffers,
    authorized,
    needsTrustline,
    tokenBalance,
    usdcBalance: usdcAvailable,
    usdcTotal,
    tokenTotal,
    sandbox: false,
  };
}

export type Side = 'BUY' | 'SELL';

/**
 * Prepares an order for the investor to sign — returns a serialized unsigned
 * transaction (base64). The wallet signs it and posts it back through
 * `submitSignedTransaction`.
 */
export async function prepareOrder(params: {
  listingId: string;
  accountId: string;
  side: Side;
  price: number;
  quantity: number;
  clientOrderId?: bigint;
}): Promise<{ transaction: string; summary: Record<string, unknown> }> {
  const listing = requireMarketListing(params.listingId);
  const account = getAccount(params.accountId);
  if (!account?.publicKey || !isSolanaPublicKey(account.publicKey)) {
    throw new Error('La cuenta no tiene wallet Solana asociada');
  }
  if (account.kycStatus !== 'APPROVED') {
    throw new Error('Solo inversores con KYC aprobado pueden operar');
  }
  if (params.price <= 0 || params.quantity <= 0) {
    throw new Error('Precio o cantidad inválidos');
  }
  const wallet = new PublicKey(account.publicKey);

  // Readable pre-check: selling without the ATA (or a frozen one) would fail
  // on-chain after the wallet already signed.
  const base = listingAsset(listing);
  const ata = getAssociatedTokenAddressSync(base, wallet, true, TOKEN_2022_PROGRAM_ID);
  const ataInfo = await getConnection().getAccountInfo(ata);
  if (params.side === 'SELL' && !ataInfo) {
    throw new Error(`Primero creá la cuenta del token ${listing.dossier.tokenTicker} (ATA)`);
  }

  const ixs = await placeOrderIxs({
    market: listing.manifestMarket!,
    trader: wallet,
    side: params.side === 'BUY' ? 'buy' : 'sell',
    numBaseTokens: params.quantity,
    price: params.price,
  });
  const transaction = await buildUnsignedTx(wallet, ixs);
  return {
    transaction,
    summary: {
      side: params.side,
      market: `${listing.dossier.tokenTicker}/USDC`,
      marketAddress: listing.manifestMarket,
      quantity: params.quantity,
      price: params.price,
      estimatedTotal: Math.round(params.quantity * params.price * 1e6) / 1e6,
      venue: 'Manifest CLOB',
    },
  };
}

/** Builds, signs and submits for a platform-custodied wallet. */
export async function placeCustodialOrder(params: {
  listingId: string;
  accountId: string;
  side: Side;
  price: number;
  quantity: number;
}) {
  const { transaction, summary } = await prepareOrder(params);
  const signer = custodialSigningKeypair(params.accountId);
  const hash = await sendSignedPreparedTx(transaction, signer);
  return { summary, hash, book: await getSdexBook(params.listingId, params.accountId) };
}

export async function prepareCancel(params: {
  listingId: string;
  accountId: string;
  clientOrderId: bigint;
}): Promise<{ transaction: string }> {
  const listing = requireMarketListing(params.listingId);
  const account = getAccount(params.accountId);
  if (!account?.publicKey || !isSolanaPublicKey(account.publicKey)) {
    throw new Error('La cuenta no tiene wallet Solana asociada');
  }
  const wallet = new PublicKey(account.publicKey);
  const ixs = await cancelOrderIxs({
    market: listing.manifestMarket!,
    trader: wallet,
    clientOrderId: params.clientOrderId,
  });
  return { transaction: await buildUnsignedTx(wallet, ixs) };
}

export async function cancelCustodialOrder(params: {
  listingId: string;
  accountId: string;
  clientOrderId: bigint;
}) {
  const { transaction } = await prepareCancel(params);
  const signer = custodialSigningKeypair(params.accountId);
  const hash = await sendSignedPreparedTx(transaction, signer);
  return { hash };
}

/**
 * Creates the holder's RWA ATA — the Solana analogue of the trustline opt-in.
 * Frozen-by-default accounts stay inert until KYC verifies the investor PDA
 * and compliance thaws the account on-chain.
 */
export async function prepareTrustline(params: {
  listingId: string;
  accountId: string;
}): Promise<{ transaction: string; tokenTicker: string }> {
  const listing = requireMarketListing(params.listingId);
  const account = getAccount(params.accountId);
  if (!account?.publicKey || !isSolanaPublicKey(account.publicKey)) {
    throw new Error('La cuenta no tiene wallet Solana asociada');
  }
  const wallet = new PublicKey(account.publicKey);
  const base = listingAsset(listing);
  const ata = getAssociatedTokenAddressSync(base, wallet, true, TOKEN_2022_PROGRAM_ID);
  const ix = createAssociatedTokenAccountInstruction(
    wallet,
    ata,
    wallet,
    base,
    TOKEN_2022_PROGRAM_ID,
  );
  return {
    transaction: await buildUnsignedTx(wallet, [ix]),
    tokenTicker: listing.dossier.tokenTicker,
  };
}

/** Custodial counterpart: create the ATA signed server-side. */
export async function openCustodialTrustline(params: { listingId: string; accountId: string }) {
  const listing = requireMarketListing(params.listingId);
  const account = getAccount(params.accountId);
  if (!account?.publicKey) throw new Error('La cuenta no tiene wallet Solana asociada');
  if (account.kycStatus !== 'APPROVED') {
    throw new Error('Solo inversores con KYC aprobado pueden aprobar el token');
  }
  const wallet = new PublicKey(account.publicKey);
  const base = listingAsset(listing);
  const ata = getAssociatedTokenAddressSync(base, wallet, true, TOKEN_2022_PROGRAM_ID);
  let hash: string | undefined;
  if (!(await getConnection().getAccountInfo(ata))) {
    const signer = custodialSigningKeypair(params.accountId);
    hash = await sendIxs(signer, [], [
      createAssociatedTokenAccountInstruction(
        signer.publicKey,
        ata,
        wallet,
        base,
        TOKEN_2022_PROGRAM_ID,
      ),
    ]);
  }
  return { tokenTicker: listing.dossier.tokenTicker, hash, listingId: listing.id };
}

/**
 * On Solana the units land in the holder's ATA at `contribute()` time — there
 * is nothing extra to pay. This verifies the ATA balance covers the claimed
 * amount and records it for the portfolio view.
 */
export async function distributeClaimedTokens(params: { listingId: string; accountId: string }) {
  const listing = requireMarketListing(params.listingId);
  const account = getAccount(params.accountId);
  if (!account?.publicKey) throw new Error('La cuenta no tiene wallet Solana asociada');
  const holding = (account.holdings || []).find((h) => h.listingId === params.listingId);
  const claimed = holding?.tokens || 0;
  if (!holding || claimed <= 0) {
    throw new Error('No hay tokens reclamados para distribuir');
  }
  const balance = await loadTokenBalance(account.publicKey, listingAsset(listing).toBase58(), true);
  if (balance + 1e-9 < claimed) {
    throw new Error(
      'El ATA todavía no refleja las unidades: reintentá o revisá la contribución on-chain',
    );
  }
  markTokensOnChain(account.id, params.listingId, claimed);
  return { hash: null, tokensOnChain: claimed };
}

export async function submitSignedTransaction(signedTxBase64: string): Promise<string> {
  return submitSignedTx(signedTxBase64);
}

async function sendSignedPreparedTx(txBase64: string, signer: { secretKey: Uint8Array; publicKey: PublicKey }) {
  const { Transaction, Keypair } = await import('@solana/web3.js');
  const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
  tx.sign(Keypair.fromSecretKey(signer.secretKey));
  return submitSignedTx(tx.serialize().toString('base64'));
}
