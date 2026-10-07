import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { isKycEnforced } from './connection';
import { adminKeypair } from './keys';
import {
  ataOf,
  ixFreezeHolder,
  ixRestoreVotes,
  ixRevokeInvestor,
  ixThawHolder,
  ixVerifyInvestor,
  InvestorType,
} from './program';
import { offeringPda, rwaMintPda } from './pda';
import { mapSolanaError, sendIxs } from './tx';
import { fetchInvestor } from './offering_state';

/**
 * Approves an investor on-chain — the Investor PDA doubles as the platform-
 * wide KYC record; every offering reads it.
 */
export async function verifyInvestorOnChain(
  wallet: PublicKey,
  countryCode = 32,
  expiry?: bigint,
): Promise<string> {
  const admin = adminKeypair();
  const expiryTs = expiry ?? BigInt(Math.floor(Date.now() / 1000) + 365 * 86400);
  return sendIxs(
    admin,
    [],
    [
      ixVerifyInvestor(
        admin.publicKey,
        wallet,
        countryCode,
        InvestorType.National,
        expiryTs,
      ),
    ],
  ).catch((e) => {
    throw mapSolanaError(e);
  });
}

/**
 * Ensures the Investor PDA exists and is active before an on-chain op that
 * requires `is_investor_verified` (contribute, OPA, etc.).
 *
 * On non-mainnet this auto-verifies without a completed KYC form so Devnet
 * flows are not blocked. On mainnet it only succeeds if compliance already
 * called `verify_investor`.
 */
export async function ensureInvestorVerifiedForOps(wallet: PublicKey): Promise<void> {
  if (await isInvestorVerifiedOnChain(wallet)) return;
  if (isKycEnforced()) {
    throw new Error('KYC on-chain requerido: el inversor no está verificado');
  }
  await verifyInvestorOnChain(wallet);
}

export async function revokeInvestorOnChain(wallet: PublicKey): Promise<string> {
  const admin = adminKeypair();
  return sendIxs(admin, [], [ixRevokeInvestor(admin.publicKey, wallet)]).catch((e) => {
    throw mapSolanaError(e);
  });
}

export async function restoreVotesOnChain(wallet: PublicKey): Promise<string> {
  const admin = adminKeypair();
  return sendIxs(admin, [], [ixRestoreVotes(admin.publicKey, wallet)]).catch((e) => {
    throw mapSolanaError(e);
  });
}

export async function isInvestorVerifiedOnChain(wallet: PublicKey): Promise<boolean> {
  const snap = await fetchInvestor(wallet).catch(() => null);
  if (!snap) return false;
  return snap.isActive && snap.kycExpiry > BigInt(Math.floor(Date.now() / 1000));
}

/**
 * Freezes/thaws the holder's RWA ATA for a specific offering — the Token-2022
 * equivalent of the Stellar trustline authorize/deauthorize sweep.
 */
export async function setHolderFrozenOnChain(
  listingId: string,
  holder: PublicKey,
  frozen: boolean,
): Promise<string> {
  const admin = adminKeypair();
  const [offering] = offeringPda(listingId);
  const [rwaMint] = rwaMintPda(offering);
  const holderAta = ataOf(holder, rwaMint, TOKEN_2022_PROGRAM_ID);
  const instruction = frozen
    ? ixFreezeHolder(admin.publicKey, listingId, holderAta)
    : ixThawHolder(admin.publicKey, listingId, holderAta);
  return sendIxs(admin, [], [instruction]).catch((e) => {
    throw mapSolanaError(e);
  });
}
