import { PublicKey } from '@solana/web3.js';
import { explorerAddress, explorerTx, getConnection, SOLANA_CLUSTER, SOLANA_RPC_URL } from './connection';
import { isProgramDeployed, loadDeployment } from './deployment';
import { adminPublicKey } from './keys';
import { canFinalizeFromSnapshot, parseOfferingState } from './lifecycle_rules';
import { fetchOffering, OfferingSnapshot } from './offering_state';
import { offeringPda, programId } from './pda';
import { usdcMint, unitsToUsdc } from './usdc';

export { explorerTx, explorerAddress };

export interface OnChainStatus {
  cluster: string;
  rpcUrl: string;
  programId: string;
  deployed: boolean;
  admin: string | null;
  usdcMint: string | null;
  latestSlot?: number;
}

export async function getOnChainStatus(): Promise<OnChainStatus> {
  const dep = loadDeployment();
  let slot: number | undefined;
  try {
    slot = await getConnection().getSlot();
  } catch {
    slot = undefined;
  }
  return {
    cluster: SOLANA_CLUSTER,
    rpcUrl: SOLANA_RPC_URL,
    programId: programId().toBase58(),
    deployed: isProgramDeployed(),
    admin: adminPublicKey(),
    usdcMint: usdcMint()?.toBase58() || dep?.usdcMint || null,
    latestSlot: slot,
  };
}

/**
 * Listing metadata the API attaches to payloads — mirrors the old
 * `listingChainMeta` shape (contractId → offering PDA, explorer links).
 *
 * `live` is true only when the stored address matches the derived Offering PDA
 * for `listing.id` (sandbox fake contract ids stay false).
 */
export function listingChainMeta(
  listing?: { id?: string; licitacionContract?: string | null; stockContract?: string | null } | null,
) {
  const offering = listing?.licitacionContract || listing?.stockContract || null;
  let live = false;
  if (offering && listing?.id) {
    try {
      const [pda] = offeringPda(listing.id);
      live = pda.toBase58() === offering;
    } catch {
      live = false;
    }
  }
  return {
    contractId: offering,
    /** True only for a real Offering PDA tied to this listing id. */
    live,
    programId: programId().toBase58(),
    explorer: explorerAddress(offering),
    cluster: SOLANA_CLUSTER,
  };
}

/**
 * Post-contribute receipt the frontend renders: snapshot of the offering
 * after the tx plus the signature link.
 */
export async function receiptAfterContribute(
  listingId: string,
  wallet: string | undefined,
  extra?: { contributeHash?: string },
) {
  const snap = await fetchOffering(listingId).catch(() => null);
  const contributeHash = extra?.contributeHash || null;
  const explorer = explorerTx(contributeHash);
  return {
    ...(snap ? snapshotToApi(snap) : {}),
    hash: contributeHash,
    explorer,
    // Aliases kept for mercado list/detail UIs that read contributeHash*.
    contributeHash,
    contributeExplorer: explorer,
    wallet: wallet || null,
  };
}

/** Converts the on-chain snapshot to the API shape the frontend consumes. */
export function snapshotToApi(snap: OfferingSnapshot) {
  const fin = canFinalizeFromSnapshot({
    state: parseOfferingState(snap.state),
    raised: Number(snap.totalRaised),
    hardCap: Number(snap.hardCap),
    deadlineMs: Number(snap.deadline) * 1000,
  });
  return {
    state: snap.state,
    /** Alias kept for the market detail UI. */
    stateName: snap.state,
    canFinalize: fin.canFinalize,
    finalizeReason: fin.reason,
    softCap: unitsToUsdc(snap.softCap),
    hardCap: unitsToUsdc(snap.hardCap),
    raised: unitsToUsdc(snap.totalRaised),
    totalRaised: unitsToUsdc(snap.totalRaised),
    pricePerUnit: unitsToUsdc(snap.pricePerUnit),
    unitsMinted: Number(snap.unitsMinted),
    unitsSold: Number(snap.unitsSold),
    unitsAvailable: Number(snap.unitsMinted - snap.unitsSold),
    deadline: new Date(Number(snap.deadline) * 1000).toISOString(),
    rwaMint: snap.rwaMint.toBase58(),
    treasuryAta: snap.treasuryAta.toBase58(),
    escrowAta: snap.escrowAta.toBase58(),
    paymentMint: snap.paymentMint.toBase58(),
    fiduciary: snap.fiduciary.toBase58(),
    cvDepositHash: snap.cvDepositHash,
    highestPrice: unitsToUsdc(snap.highestPrice),
    squeezePrice: unitsToUsdc(snap.squeezePrice),
    proceedsWithdrawn: snap.proceedsWithdrawn,
    productId: Number(snap.productId),
  };
}

export async function snapshotOfferingApi(listingId: string) {
  const snap = await fetchOffering(listingId);
  return snap ? snapshotToApi(snap) : null;
}

/**
 * Loose check: stored address parses as a Pubkey (incl. PDAs). Prefer
 * `admin/listings.isOnChainListing` when a listing id is available — that one
 * matches against the derived Offering PDA and rejects sandbox fakes.
 */
export function isOnChainListing(listing: { licitacionContract?: string | null; stockContract?: string | null } | null): boolean {
  const addr = listing?.licitacionContract || listing?.stockContract;
  if (!addr) return false;
  try {
    // eslint-disable-next-line no-new
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}
