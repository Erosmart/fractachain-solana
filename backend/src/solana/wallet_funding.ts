import { PublicKey } from '@solana/web3.js';
import { autoFaucetEnabled } from './connection';
import { ensureSolBalance } from './devnet';
import { mintDemoUsdc, usdcBalance, usdcMint } from './usdc';

/**
 * Hydrates a registered wallet: devnet SOL top-up + demo USDC grant when the
 * platform controls a mint authority (localnet/devnet mock mint only).
 * Replaces stellar/usdc.ts ensureWalletFunded.
 */
export async function ensureWalletFunded(publicKey: string): Promise<void> {
  if (!autoFaucetEnabled()) return;
  const pk = new PublicKey(publicKey);
  await ensureSolBalance(pk);
  if (!usdcMint()) return;
  const balance = await usdcBalance(pk);
  if (balance >= 100) return;
  try {
    await mintDemoUsdc(pk, 5_000);
  } catch (err) {
    console.warn('[usdc-grant]', (err as Error)?.message || err);
  }
}
