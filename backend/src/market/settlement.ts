/**
 * Closing and settlement of an offering without anyone pressing a button.
 *
 * Solana has no scheduler: `finalize()` is an ordinary transaction that some
 * client has to send. Until it lands the money stays in the contract, so the
 * company never sees it and the investor's position looks pending. This module
 * is that client — it runs `finalize()` as soon as the contract allows it
 * (hard cap or deadline) and then credits every holder, so "reclamar" is a
 * retry and not a step the user has to discover.
 */
import { addTrustline, claimListingTokens, listAccounts, markHoldingRefunded, markTokensOnChain } from '../auth/accounts';
import {
  closeListing,
  getListing,
  isOnChainListing,
  Listing,
  listListings,
  markListingClosed,
  setListingMarket,
} from '../admin/listings';
import { distributeOnChain, finalizeOnChain, refundOnChain } from '../solana/offering';
import { fetchOffering, listContributions, OfferingSnapshot } from '../solana/offering_state';
import { adminKeypair } from '../solana/keys';
import { unitsToUsdc, usdcMint } from '../solana/usdc';
import { explorerTx, listingChainMeta, snapshotToApi } from '../solana/onchain';
import { authorizeVault, createMarket, vaultAddress } from '../solana/manifest';
import { PublicKey } from '@solana/web3.js';
import { settlementAction } from './settlement_rules';

const SWEEP_MS = Number(process.env.SETTLEMENT_SWEEP_MS || 60_000);

export type SettlementResult = {
  accountId: string;
  claimed: number;
  distributedHash?: string | null;
  error?: string;
};

/**
 * Credits the units of every contributor of a successful offering —
 * SANDBOX path only (listings without an Offering PDA). On-chain listings
 * settle through `settleOnChainContributors`.
 */
export async function settleHolders(listing: Listing): Promise<SettlementResult[]> {
  if (listing.status !== 'CLOSED_SUCCESS') return [];
  const results: SettlementResult[] = [];

  for (const account of listAccounts()) {
    const holding = (account.holdings || []).find((h) => h.listingId === listing.id);
    if (!holding || (holding.tokensOwed || 0) <= 0 || holding.refundedAt) continue;

    const owed = holding.tokensOwed || 0;
    try {
      addTrustline(account.id, listing.id);
      claimListingTokens(account.id, listing.id, true);
      markTokensOnChain(account.id, listing.id, owed);
    } catch (err: any) {
      results.push({ accountId: account.id, claimed: 0, error: err?.message || String(err) });
      continue;
    }
    results.push({ accountId: account.id, claimed: owed });
  }

  return results;
}

/**
 * On-chain settlement — the crank half of the delayed-delivery model.
 *
 * Successful close: `distribute()` delivers the units to every Contribution
 * PDA (the crank pays ATA rent, the holder never signs). Failed close:
 * `refund()` returns each escrowed payment the same way. Per-contribution
 * errors are collected, not thrown: one bad wallet must not strand the rest,
 * and the next sweep retries whatever is still pending.
 */
export async function settleOnChainContributors(
  listing: Listing,
  snap: OfferingSnapshot,
): Promise<SettlementResult[]> {
  const admin = adminKeypair();
  const contributions = await listContributions(listing.id);
  const results: SettlementResult[] = [];

  for (const c of contributions) {
    const wallet = c.wallet;
    const account = listAccounts().find((a) => a.publicKey === wallet.toBase58());
    const tag = account?.id || wallet.toBase58().slice(0, 8);
    try {
      if (snap.state === 'Successful') {
        const hash = await distributeOnChain(admin, listing.id, wallet);
        if (account) {
          try {
            addTrustline(account.id, listing.id);
            claimListingTokens(account.id, listing.id, true);
            markTokensOnChain(account.id, listing.id, Number(c.units));
          } catch (err: any) {
            console.warn(`[settlement] ledger mark for ${tag}:`, err?.message || err);
          }
        }
        results.push({ accountId: tag, claimed: Number(c.units), distributedHash: hash });
      } else if (snap.state === 'Failed') {
        const hash = await refundOnChain(admin, listing.id, wallet);
        if (account) {
          try {
            markHoldingRefunded(account.id, listing.id, { hash });
          } catch (err: any) {
            console.warn(`[settlement] refund mark for ${tag}:`, err?.message || err);
          }
        }
        results.push({ accountId: tag, claimed: 0, distributedHash: hash });
      }
    } catch (err: any) {
      results.push({ accountId: tag, claimed: 0, error: err?.message || String(err) });
    }
  }
  return results;
}

/**
 * Opens the Manifest secondary market after a successful close — create the
 * market account, thaw the frozen-by-default Token-2022 base vault, record
 * the address on the listing. Idempotent (skipped if already set) and
 * best-effort: settlement must not fail because the venue did.
 */
export async function openSecondaryMarket(listing: Listing): Promise<string | null> {
  if (listing.manifestMarket) return listing.manifestMarket;
  const snap = await fetchOffering(listing.id);
  if (!snap || snap.state !== 'Successful') return null;
  const quote = usdcMint();
  if (!quote) throw new Error('Falta el mint USDC configurado');
  const market = await createMarket(snap.rwaMint, quote);
  const baseVault = await vaultAddress(new PublicKey(market.market), snap.rwaMint);
  await authorizeVault(listing.id, baseVault);
  setListingMarket(listing.id, market.market);
  return market.market;
}

/**
 * Closes an offering: `finalize()` on chain, or the sandbox equivalent.
 *
 * A successful close pays the company wallet inside `finalize()` itself, so
 * there is no separate payout step in the happy path.
 */
export async function finalizeListedOffering(listingId: string) {
  const listing = getListing(listingId);
  if (!listing) throw new Error('Listing no encontrado');
  if (!isOnChainListing(listing)) {
    const closed = closeListing(listing.id);
    const settlements = await settleHolders(closed);
    return { ...closed, settlements };
  }

  const snap = await fetchOffering(listing.id);
  if (snap && (snap.state === 'Successful' || snap.state === 'Failed')) {
    const status = snap.state === 'Successful' ? 'CLOSED_SUCCESS' : 'CLOSED_FAILED';
    const raised = unitsToUsdc(snap.totalRaised);
    const updated = markListingClosed(listing.id, status, raised, {
      finalizeHash: listing.finalizeHash,
      proceedsPaidTo: snap.fiduciary.toBase58(),
    });
    const settlements = await settleOnChainContributors(updated, snap);
    const marketAddress =
      snap.state === 'Successful'
        ? await openSecondaryMarket(getListing(listing.id)!).catch((err: any) => {
            console.warn(`[settlement] market for ${listing.id}:`, err?.message || err);
            return null;
          })
        : null;
    return {
      ...getListing(listing.id)!,
      settlements,
      onChain: {
        ...listingChainMeta(updated),
        ...snapshotToApi(snap),
        market: marketAddress,
        hash: listing.finalizeHash || null,
        explorer: explorerTx(listing.finalizeHash),
        alreadyClosed: true,
        note:
          snap.state === 'Successful'
            ? `La emisión ya estaba Successful. distribute() entrega las unidades a cada contribuyente; los USDC de devnet ya fueron a la wallet fiduciaria.`
            : `La emisión ya estaba Failed. refund() devuelve los USDC de cada contribuyente — el crank lo corre solo.`,
      },
    };
  }

  const result = await finalizeOnChain(listing.id, adminKeypair());
  const snapAfter = await fetchOffering(listing.id);
  const success = snapAfter?.state === 'Successful';
  const raised = snapAfter ? unitsToUsdc(snapAfter.totalRaised) : listing.raisedUsdc;
  const updated = markListingClosed(
    listing.id,
    success ? 'CLOSED_SUCCESS' : 'CLOSED_FAILED',
    raised,
    {
      finalizeHash: result,
      proceedsPaidTo: snapAfter?.fiduciary.toBase58(),
    },
  );
  const settlements = snapAfter ? await settleOnChainContributors(updated, snapAfter) : [];
  const marketAddress = success
    ? await openSecondaryMarket(getListing(listing.id)!).catch((err: any) => {
        console.warn(`[settlement] market for ${listing.id}:`, err?.message || err);
        return null;
      })
    : null;
  return {
    ...getListing(listing.id)!,
    settlements,
    onChain: {
      ...listingChainMeta(updated),
      ...(snapAfter ? snapshotToApi(snapAfter) : {}),
      market: marketAddress,
      hash: result,
      explorer: explorerTx(result),
      alreadyClosed: false,
      note: success
        ? `finalize() pagó los USDC a la wallet fiduciaria; distribute() entregó las unidades a cada contribuyente y el mercado secundario quedó abierto.`
        : `finalize() dejó Failed (no se llegó al soft cap). refund() devolvió los USDC a cada contribuyente — nadie tuvo que reclamar.`,
    },
  };
}

/**
 * Runs the close only when the contract would accept it (hard cap or deadline).
 *
 * Callable on every contribution and from the sweep, so it never throws: a
 * close that is not due yet, or an RPC hiccup, must not fail the request that
 * triggered it.
 */
export async function autoFinalizeIfDue(listingId: string) {
  // `getListing` already applies the sandbox settlement policy, so a sandbox
  // offering that met its cap arrives here closed and only needs settlement.
  const listing = getListing(listingId);
  if (!listing) return null;
  const action = settlementAction({ status: listing.status, onChain: isOnChainListing(listing) });
  if (action === 'skip') return null;
  try {
    if (action === 'settle_holders') {
      return { ...listing, settlements: await settleHolders(listing) };
    }
    const snap = await fetchOffering(listing.id);
    if (!snap) return null;
    const closed = snap.state === 'Successful' || snap.state === 'Failed';
    const due = snap.state === 'Open' && (snap.totalRaised >= snap.hardCap || BigInt(Math.floor(Date.now() / 1000)) >= snap.deadline);
    if (!closed && !due) return null;
    return await finalizeListedOffering(listing.id);
  } catch (err: any) {
    console.warn(`[settlement] ${listingId}: ${err?.message || err}`);
    return null;
  }
}

/** Settles offerings whose deadline passed while nobody was looking. */
export async function sweepDueOfferings() {
  for (const listing of listListings()) {
    if (listing.status === 'LISTED' || listing.status === 'CLOSED_SUCCESS') {
      await autoFinalizeIfDue(listing.id);
    }
  }
}

export function startSettlementSweep(intervalMs = SWEEP_MS) {
  if (intervalMs <= 0) return null;
  const timer = setInterval(() => {
    sweepDueOfferings().catch((err) => console.warn('[settlement] sweep:', err?.message || err));
  }, intervalMs);
  timer.unref?.();
  return timer;
}
