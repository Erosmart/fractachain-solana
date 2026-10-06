/**
 * Mark-to-market for tokenized shares.
 *
 * No external price oracle. The live quote is the SDEX book (last trade, then
 * mid). Listings without a real issuer fall back to the sandbox matcher, then
 * to the IPO price from the dossier. That last one is a reference, not a
 * market — we label it so the portfolio does not pretend BYMA printed it.
 */
import { getListing, listListings, type Listing } from '../admin/listings';
import { economicShares, getAccount } from '../auth/accounts';
import { getBook } from './orderbook';
import { counterAsset, listingAsset, sdexAvailable } from './manifest_book';
import { getBook as getManifestBook } from '../solana/manifest';
import { listDividends } from './dividends';
import { loadSolBalance, loadTokenBalance, loadUsdcBalance } from '../auth/solana_devnet';
import { explorerTx } from '../solana/onchain';
import { usdcMint } from '../solana/usdc';
import { isSolanaPublicKey } from '../solana/keys';

// Canonical platform USDC mint: SOLANA_USDC_MINT env first, then
// deployments/<cluster>.json.
function usdcIssuer(): string | null {
  return usdcMint()?.toBase58() || null;
}

export type PriceSource = 'sdex_last' | 'sdex_mid' | 'sandbox_last' | 'ipo';
// 'sdex_*' keys kept for API stability — they now mean Manifest CLOB.

export interface MarketQuote {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  price: number;
  source: PriceSource;
  asOf: string;
}

const SOURCE_LABEL: Record<PriceSource, string> = {
  sdex_last: 'Último cruce Manifest',
  sdex_mid: 'Mid del libro Manifest',
  sandbox_last: 'Último cruce (sandbox)',
  ipo: 'Precio de la licitación',
};

export function priceSourceLabel(source: PriceSource) {
  return SOURCE_LABEL[source];
}

export async function quoteListing(listing: Listing): Promise<MarketQuote> {
  const ipo = listing.dossier.pricePerShareUsdc;
  const base = {
    listingId: listing.id,
    tokenTicker: listing.dossier.tokenTicker,
    legalName: listing.dossier.legalName,
  };

  if (sdexAvailable(listing)) {
    try {
      const book = await getManifestBook(listing.manifestMarket!).catch(() => null);
      if (book?.midPrice && book.midPrice > 0) {
        return { ...base, price: book.midPrice, source: 'sdex_mid', asOf: new Date().toISOString() };
      }
      if (book?.bestBid && book.bestBid > 0) {
        return { ...base, price: book.bestBid, source: 'sdex_mid', asOf: new Date().toISOString() };
      }
    } catch {
      // RPC down: fall through to the local book rather than blanking the portfolio.
    }
  }

  try {
    const sandbox = getBook(listing.id);
    if (sandbox.trades?.length && sandbox.lastPrice > 0) {
      return {
        ...base,
        price: sandbox.lastPrice,
        source: 'sandbox_last',
        asOf: sandbox.trades[0]?.createdAt || new Date().toISOString(),
      };
    }
  } catch {
    // listing without a book yet
  }

  return {
    ...base,
    price: ipo,
    source: 'ipo',
    asOf: listing.closedAt || listing.listedAt || listing.createdAt,
  };
}

export async function buildPortfolio(accountId: string) {
  const account = getAccount(accountId);
  if (!account) throw new Error('Cuenta no encontrada');

  const listings = listListings();
  const [positions, usdcOnChain, solOnChain] = await Promise.all([
    Promise.all(
    (account.holdings || []).map(async (h) => {
      const listing = listings.find((l) => l.id === h.listingId) || getListing(h.listingId);
      const shares = economicShares(h);
      const quote = listing
        ? await quoteListing(listing)
        : {
            listingId: h.listingId,
            tokenTicker: h.tokenTicker,
            legalName: h.tokenTicker,
            price: 0,
            source: 'ipo' as PriceSource,
            asOf: new Date().toISOString(),
          };
      const marketValue = Math.round(shares * quote.price * 1e6) / 1e6;
      const costBasis = Math.round((h.usdcAmount || 0) * 1e6) / 1e6;
      const pnl = Math.round((marketValue - costBasis) * 1e6) / 1e6;
      const pendingDividendUsdc = Math.round((h.pendingDividendUsdc || 0) * 1e6) / 1e6;
      const onChain = listing ? Boolean(listing.licitacionContract && isSolanaPublicKey(listing.licitacionContract)) : false;
      const listingStatus = listing?.status || 'UNKNOWN';
      return {
        listingId: h.listingId,
        tokenTicker: h.tokenTicker,
        legalName: listing?.dossier.legalName || h.tokenTicker,
        shares,
        tokens: h.tokens,
        tokensOwed: h.tokensOwed || 0,
        tokensOnChain: h.tokensOnChain || 0,
        sdex: listing ? sdexAvailable(listing) : false,
        costBasis,
        marketPrice: quote.price,
        marketValue,
        pnl,
        pnlPct: costBasis > 0 ? Math.round((pnl / costBasis) * 10000) / 100 : 0,
        priceSource: quote.source,
        priceSourceLabel: priceSourceLabel(quote.source),
        priceAsOf: quote.asOf,
        pendingDividendUsdc,
        distributions: listDividends(h.listingId).slice(0, 3),
        listingStatus,
        paymentKind: listing?.dossier.paymentKind || null,
        finalizeHash: listing?.finalizeHash || null,
        refundedAt: h.refundedAt || null,
        refundHash: h.refundHash || null,
        canClaim: listingStatus === 'CLOSED_SUCCESS' && (h.tokensOwed || 0) > 0 && !h.refundedAt,
        canRefund: onChain && listingStatus === 'CLOSED_FAILED' && !h.refundedAt && ((h.tokensOwed || 0) > 0 || (h.tokens || 0) > 0 || (h.usdcAmount || 0) > 0),
      };
    }),
    ),
    account.publicKey && usdcIssuer()
      ? loadUsdcBalance(account.publicKey)
      : Promise.resolve(0),
    account.publicKey ? loadSolBalance(account.publicKey) : Promise.resolve(0),
  ]);

  // On-chain truth: Manifest buys never touch the local holdings ledger, so
  // the wallet's Token-2022 ATA balance per tradable listing is the source of
  // truth for what they actually hold and can sell.
  if (account.publicKey) {
    const tradable = listings.filter((l) => sdexAvailable(l));
    const onChainBals = await Promise.all(
      tradable.map((l) =>
        loadTokenBalance(account.publicKey!, listingAsset(l).toBase58(), true)
          .then((b) => [l.id, b] as const)
          .catch(() => [l.id, 0] as const),
      ),
    );
    for (const [listingId, bal] of onChainBals) {
      const pos = positions.find((p) => p.listingId === listingId);
      if (pos) {
        pos.tokensOnChain = bal;
        pos.shares = bal + (pos.tokensOwed || 0);
        pos.marketValue = Math.round(pos.shares * pos.marketPrice * 1e6) / 1e6;
        pos.pnl = Math.round((pos.marketValue - pos.costBasis) * 1e6) / 1e6;
        pos.pnlPct = pos.costBasis > 0 ? Math.round((pos.pnl / pos.costBasis) * 10000) / 100 : 0;
      } else if (bal > 0) {
        const listing = tradable.find((l) => l.id === listingId)!;
        const quote = await quoteListing(listing);
        const marketValue = Math.round(bal * quote.price * 1e6) / 1e6;
        positions.push({
          listingId,
          tokenTicker: listing.dossier.tokenTicker,
          legalName: listing.dossier.legalName,
          shares: bal,
          tokens: 0,
          tokensOwed: 0,
          tokensOnChain: bal,
          sdex: true,
          // Bought on the DEX — no platform cost basis exists, so P&L starts
          // flat instead of pretending the IPO price was the entry.
          costBasis: marketValue,
          marketPrice: quote.price,
          marketValue,
          pnl: 0,
          pnlPct: 0,
          priceSource: quote.source,
          priceSourceLabel: priceSourceLabel(quote.source),
          priceAsOf: quote.asOf,
          pendingDividendUsdc: 0,
          distributions: listDividends(listingId).slice(0, 3),
          listingStatus: listing.status,
          paymentKind: listing.dossier.paymentKind || null,
          finalizeHash: listing.finalizeHash || null,
          refundedAt: null,
          refundHash: null,
          canClaim: false,
          canRefund: false,
        });
      }
    }
  }

  // What the company sees: the offerings whose raise is paid into this wallet.
  // Without this the issuer only saw sandbox USDC and concluded the SOL never
  // arrived, when `finalize()` had already sent it on ledger.
  const proceeds = account.publicKey
    ? listings
        .filter((l) => l.dossier.proceedsWallet?.trim() === account.publicKey?.trim())
        .map((l) => ({
          listingId: l.id,
          tokenTicker: l.dossier.tokenTicker,
          legalName: l.dossier.legalName,
          status: l.status,
          paymentKind: l.dossier.paymentKind,
          amount: l.raisedUsdc,
          paidAt: l.proceedsPaidAt || null,
          finalizeHash: l.finalizeHash || null,
          explorer: explorerTx(l.finalizeHash),
        }))
    : [];

  const costBasis = positions.reduce((s, p) => s + p.costBasis, 0);
  const marketValue = positions.reduce((s, p) => s + p.marketValue, 0);
  const pendingDividends = positions.reduce((s, p) => s + p.pendingDividendUsdc, 0);
  const pnl = Math.round((marketValue - costBasis) * 1e6) / 1e6;

  return {
    cashUsdc: account.cashUsdc,
    usdcOnChain,
    solOnChain,
    xlmOnChain: solOnChain, // legacy key kept for API compatibility
    proceeds,
    positions,
    totals: {
      costBasis: Math.round(costBasis * 1e6) / 1e6,
      marketValue: Math.round(marketValue * 1e6) / 1e6,
      pnl,
      pnlPct: costBasis > 0 ? Math.round((pnl / costBasis) * 10000) / 100 : 0,
      pendingDividends: Math.round(pendingDividends * 1e6) / 1e6,
    },
  };
}
