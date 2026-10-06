import { PublicKey } from '@solana/web3.js';
import { autoFaucetEnabled, getConnection } from './connection';
import { isSolanaPublicKey } from './keys';

/**
 * Devnet/localnet wallet hydration — replaces Stellar friendbot + USDC
 * trustline faucet. NEVER runs against mainnet; callers gate on cluster.
 */

const LAMPORTS_MIN = 0.05e9;
const LAMPORTS_TARGET = 0.2e9;

/**
 * Tops up a wallet with devnet/localnet SOL if below the minimum.
 * On localnet, airdrops are unlimited; on devnet they are rate-limited
 * (caller should treat failures as soft).
 */
export async function ensureSolBalance(pubkey: PublicKey): Promise<{ airdropped: boolean; balance: number }> {
  if (!autoFaucetEnabled()) {
    return { airdropped: false, balance: 0 };
  }
  const conn = getConnection();
  const balance = await conn.getBalance(pubkey);
  if (balance >= LAMPORTS_MIN) {
    return { airdropped: false, balance };
  }
  try {
    const sig = await conn.requestAirdrop(pubkey, Math.max(0, LAMPORTS_TARGET - balance));
    await conn.confirmTransaction(sig, 'confirmed');
    return { airdropped: true, balance: await conn.getBalance(pubkey) };
  } catch (err) {
    // Devnet faucet exhaustion — soft-fail so the UI keeps working.
    console.warn('[devnet] airdrop falló:', (err as Error)?.message);
    return { airdropped: false, balance };
  }
}

export function assertWalletAddress(value: string): PublicKey {
  if (!isSolanaPublicKey(value)) throw new Error('Dirección Solana inválida');
  return new PublicKey(value);
}

export { isSolanaPublicKey };
