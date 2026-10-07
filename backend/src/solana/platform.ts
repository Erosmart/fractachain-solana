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
import { usdcMint, usdcMintOrThrow } from './usdc';

/**
 * Platform PDA bootstrap for Devnet ops.
 *
 * Safe to re-run: skips `initialize_platform` when the PDA already exists, and
 * always applies `set_payment_mint` when `SOLANA_USDC_MINT` (or deployment
 * usdcMint) is configured — so a bare first init without USDC can be fixed
 * later without a one-off script.
 */
export async function initializePlatformOnChain(opts?: {
  feeBps?: number;
  enforceKycHours?: boolean;
}) {
  const admin = adminKeypair();
  const already = await isPlatformInitialized();
  const ixs = [];

  if (!already) {
    ixs.push(ixInitializePlatform(admin.publicKey, opts?.feeBps ?? 0));
  }
  if (opts?.enforceKycHours != null) {
    ixs.push(ixSetKycHours(admin.publicKey, opts.enforceKycHours));
  }

  const mint = usdcMint();
  if (mint) {
    ixs.push(ixSetPaymentMint(admin.publicKey, PaymentKind.Usdc, mint));
  } else if (!already) {
    // First init without a mint leaves open_offering blocked until ops sets
    // SOLANA_USDC_MINT and re-calls configure-issuer / set-payment-mint.
    console.warn(
      '[platform] initialized without USDC mint — call set-payment-mint after SOLANA_USDC_MINT is set',
    );
  }

  if (ixs.length === 0) {
    throw new Error(
      'Platform already initialized and no USDC mint configured (set SOLANA_USDC_MINT)',
    );
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

/** Convenience: allowlist the configured cluster USDC mint on the platform PDA. */
export async function setConfiguredUsdcMintOnChain() {
  return setPaymentMintOnChain('USDC', usdcMintOrThrow());
}
