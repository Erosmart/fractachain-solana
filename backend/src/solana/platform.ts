import { PublicKey } from '@solana/web3.js';
import { getConnection } from './connection';
import { adminKeypair } from './keys';
import { platformPda } from './pda';
import {
  ixInitializePlatform,
  ixSetKycHours,
  ixSetPaymentMint,
  PaymentKind,
} from './program';
import { fetchPlatform } from './offering_state';
import { sendIxs } from './tx';
import { usdcMintOrThrow } from './usdc';

/** One-time platform PDA init — the issuer-configuration tx of Solana. */
export async function initializePlatformOnChain(opts?: { feeBps?: number; enforceKycHours?: boolean }) {
  const admin = adminKeypair();
  const ixs = [ixInitializePlatform(admin.publicKey, opts?.feeBps ?? 0)];
  if (opts?.enforceKycHours != null) {
    ixs.push(ixSetKycHours(admin.publicKey, opts.enforceKycHours));
  }
  // Record the USDC payment mint so offerings default to it.
  try {
    ixs.push(ixSetPaymentMint(admin.publicKey, PaymentKind.Usdc, usdcMintOrThrow()));
  } catch {
    // No USDC mint configured yet — can be set later via setPaymentMintOnChain.
  }
  return sendIxs(admin, [], ixs);
}

export async function isPlatformInitialized(): Promise<boolean> {
  try {
    const [pda] = platformPda();
    const info = await getConnection().getAccountInfo(pda);
    if (!info) return false;
    return (await fetchPlatform()) != null;
  } catch {
    return false;
  }
}

export async function setPaymentMintOnChain(kind: 'USDC' | 'USDT', mint: PublicKey) {
  const admin = adminKeypair();
  const k = kind === 'USDT' ? PaymentKind.Usdt : PaymentKind.Usdc;
  return sendIxs(admin, [], [ixSetPaymentMint(admin.publicKey, k, mint)]);
}
