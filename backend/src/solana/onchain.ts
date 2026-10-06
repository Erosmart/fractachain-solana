import { PublicKey } from '@solana/web3.js';
import { explorerAddress, explorerTx, getConnection, SOLANA_CLUSTER, SOLANA_RPC_URL } from './connection';
import { isProgramDeployed, loadDeployment } from './deployment';
import { adminPublicKey } from './keys';
import { fetchOffering, OfferingSnapshot } from './offering_state';
import { programId } from './pda';
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
 */
export function listingChainMeta(listing?: { licitacionContract?: string | null } | null) {
  const offering = listing?.licitacionContract || null;
  return {
    contractId: offering,
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
  return {
    ...(snap ? snapshotToApi(snap) : {}),
    hash: extra?.contributeHash || null,
    explorer: explorerTx(extra?.contributeHash),
    wallet: wallet || null,
  };
}

/** Converts the on-chain snapshot to the API shape the frontend consumes. */
export function snapshotToApi(snap: OfferingSnapshot) {
  return {
    state: snap.state,
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

export function isOnChainListing(listing: { licitacionContract?: string | null } | null): boolean {
  if (!listing?.licitacionContract) return false;
  try {
    new PublicKey(listing.licitacionContract);
    return true;
  } catch {
    return false;
  }
}
