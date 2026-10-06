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
import { addTrustline, claimListingTokens, listAccounts } from '../auth/accounts';
import {
  closeListing,
  getListing,
  isOnChainListing,
  Listing,
  listListings,
  markListingClosed,
} from '../admin/listings';
import { finalizeOnChain } from '../solana/offering';
import { fetchOffering } from '../solana/offering_state';
import { adminKeypair } from '../solana/keys';
import { unitsToUsdc } from '../solana/usdc';
import { explorerTx, listingChainMeta, snapshotToApi } from '../solana/onchain';
import { distributeClaimedTokens, sdexAvailable } from './manifest_book';
import { settlementAction } from './settlement_rules';

const SWEEP_MS = Number(process.env.SETTLEMENT_SWEEP_MS || 60_000);

export type SettlementResult = {
  accountId: string;
  claimed: number;
  distributedHash?: string | null;
  error?: string;
};

/**
 * Credits the units of every contributor of a successful offering.
 *
 * The units already exist on chain since `contribute()`; what is pending is
 * the platform-ledger entry and, for listings with a Manifest market, the
 * ATA balance check that makes the position visible in a wallet. Self-custody
 * holders may still need to create their ATA, so their distribution is
 * reported as an error and retried from `/distribute`.
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
    } catch (err: any) {
      results.push({ accountId: account.id, claimed: 0, error: err?.message || String(err) });
      continue;
    }

    const result: SettlementResult = { accountId: account.id, claimed: owed };
    if (sdexAvailable(listing)) {
      try {
        const paid = await distributeClaimedTokens({ listingId: listing.id, accountId: account.id });
        result.distributedHash = paid.hash;
      } catch (err: any) {
        result.error = err?.message || String(err);
      }
    }
    results.push(result);
  }

  return results;
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
    return {
      ...updated,
      settlements: await settleHolders(updated),
      onChain: {
        ...listingChainMeta(updated),
        ...snapshotToApi(snap),
        hash: listing.finalizeHash || null,
        explorer: explorerTx(listing.finalizeHash),
        alreadyClosed: true,
        note:
          snap.state === 'Successful'
            ? `La emisión ya estaba Successful. Los USDC de devnet fueron a la wallet fiduciaria en finalize(); no hay un segundo payout al inversor.`
            : `La emisión ya estaba Failed. El inversor puede llamar refund() para recuperar USDC.`,
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
  return {
    ...updated,
    settlements: await settleHolders(updated),
    onChain: {
      ...listingChainMeta(updated),
      ...(snapAfter ? snapshotToApi(snapAfter) : {}),
      hash: result,
      explorer: explorerTx(result),
      alreadyClosed: false,
      note: success
        ? `finalize() pagó los USDC recaudados a la wallet fiduciaria (proceeds) y las unidades quedaron acreditadas al inversor. No hace falta reclamar nada.`
        : `finalize() dejó Failed (no se llegó al soft cap). El inversor recupera USDC con refund().`,
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
