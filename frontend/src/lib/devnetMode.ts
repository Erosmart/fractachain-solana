/**
 * Product mode helpers for the Fractachain UI.
 *
 * On Devnet (default) KYC is optional: wallet connection is enough to use
 * core flows. Mainnet keeps the hard KYC gate for production compliance.
 */

export function solanaCluster(): string {
  return (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet').trim();
}

/** True only when the UI should hard-block flows until KYC is APPROVED. */
export function isKycRequired(): boolean {
  return solanaCluster() === 'mainnet-beta';
}

/** Soft-notice mode: Devnet / testnet / localnet. */
export function isDevnetSoftKyc(): boolean {
  return !isKycRequired();
}
