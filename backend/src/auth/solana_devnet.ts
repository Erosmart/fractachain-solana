import { PublicKey } from '@solana/web3.js';
import { autoFaucetEnabled, getConnection } from '../solana/connection';
import { createSolanaKeypair, isSolanaPublicKey } from '../solana/keys';
import { usdcBalance, solBalance } from '../solana/usdc';
import { getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

/**
 * Replaces auth/stellar_testnet.ts — keypair creation, devnet funding and
 * balance reads for Solana wallets.
 */

export { isSolanaPublicKey };

export function createWalletKeypair(): { publicKey: string; secretKey: string } {
  return createSolanaKeypair();
}

/**
 * Devnet SOL airdrop — the friendbot equivalent. Never called for
 * mainnet-beta and failures are soft (faucet rate limits are common).
 */
export async function requestDevnetAirdrop(publicKey: string, sol = 0.5): Promise<boolean> {
  if (!autoFaucetEnabled()) return false;
  try {
    const conn = getConnection();
    const sig = await conn.requestAirdrop(new PublicKey(publicKey), Math.round(sol * 1e9));
    await conn.confirmTransaction(sig, 'confirmed');
    return true;
  } catch {
    return false;
  }
}

export async function loadSolBalance(publicKey: string): Promise<number> {
  if (!isSolanaPublicKey(publicKey)) return 0;
  try {
    return await solBalance(publicKey);
  } catch {
    return 0;
  }
}

/** Balance of an SPL/Token-2022 mint for a wallet. */
export async function loadTokenBalance(publicKey: string, mint: string, token2022 = false): Promise<number> {
  if (!isSolanaPublicKey(publicKey)) return 0;
  try {
    const program = token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(publicKey), true, program);
    const account = await getAccount(getConnection(), ata, undefined, program);
    return Number(account.amount);
  } catch {
    return 0;
  }
}

export async function loadUsdcBalance(publicKey: string): Promise<number> {
  if (!isSolanaPublicKey(publicKey)) return 0;
  try {
    return await usdcBalance(publicKey);
  } catch {
    return 0;
  }
}
