import {
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';
import { getConnection, isLocalCluster, SOLANA_CLUSTER } from './connection';
import { adminKeypair, isSolanaPublicKey, usdcMintAuthority } from './keys';
import { loadDeployment } from './deployment';
import { ataOf } from './program';

export const USDC_DECIMALS = 6;
export const USDC_UNITS = 1_000_000;

/** Payment mint for this cluster — SPL Token (not Token-2022). */
export function usdcMint(): PublicKey | null {
  // Env wins (Railway) — same precedence as FRACTACHAIN_PROGRAM_ID.
  const env = (process.env.SOLANA_USDC_MINT || '').trim();
  if (env) return new PublicKey(env);
  const dep = loadDeployment();
  const fromFile = (dep?.usdcMint || '').trim();
  return fromFile ? new PublicKey(fromFile) : null;
}

export function usdcMintOrThrow(): PublicKey {
  const mint = usdcMint();
  if (!mint) throw new Error('USDC mint no configurado (deployments/<cluster>.json o SOLANA_USDC_MINT)');
  return mint;
}

export function usdcAta(owner: PublicKey): PublicKey {
  return ataOf(owner, usdcMintOrThrow(), TOKEN_PROGRAM_ID);
}

export function usdcToUnits(amountUsdc: number): bigint {
  return BigInt(Math.round(amountUsdc * USDC_UNITS));
}

export function unitsToUsdc(units: bigint | number): number {
  return Number(units) / USDC_UNITS;
}

export async function usdcBalance(
  owner: PublicKey | string,
  mintOverride?: PublicKey | null,
): Promise<number> {
  const pk = typeof owner === 'string' ? new PublicKey(owner) : owner;
  const mint = mintOverride || usdcMint();
  if (!mint) return 0;
  try {
    const ata = getAssociatedTokenAddressSync(mint, pk, true, TOKEN_PROGRAM_ID);
    const account = await getAccount(getConnection(), ata, undefined, TOKEN_PROGRAM_ID);
    return unitsToUsdc(account.amount);
  } catch {
    return 0;
  }
}

export async function solBalance(owner: PublicKey | string): Promise<number> {
  const pk = typeof owner === 'string' ? new PublicKey(owner) : owner;
  const lamports = await getConnection().getBalance(pk);
  return lamports / 1e9;
}

/**
 * Creates the wallet's USDC ATA — the Solana equivalent of the USDC
 * trustline. Self-custody: backend builds the tx and returns it for wallet
 * signature; custodial: server signs directly.
 */
export function buildCreateUsdcAtaIx(owner: PublicKey, payer?: PublicKey) {
  const mint = usdcMintOrThrow();
  const ata = getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM_ID);
  return createAssociatedTokenAccountInstruction(
    payer || owner,
    ata,
    owner,
    mint,
    TOKEN_PROGRAM_ID,
  );
}

/**
 * Mints demo USDC — ONLY on localnet/devnet with a configured mint
 * authority. On devnet this is still the platform's own mock mint; there is
 * no real USDC faucet we control.
 */
export async function mintDemoUsdc(owner: PublicKey, amountUsdc: number): Promise<string> {
  if (SOLANA_CLUSTER === 'mainnet-beta') {
    throw new Error('mintDemoUsdc no existe en mainnet');
  }
  const mint = usdcMintOrThrow();
  const authority = usdcMintAuthority();
  const ata = getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM_ID);
  const conn = getConnection();
  const ix = createMintToInstruction(
    mint,
    ata,
    authority.publicKey,
    usdcToUnits(amountUsdc),
    [],
    TOKEN_PROGRAM_ID,
  );
  const tx = new Transaction();
  // Only create the ATA when missing — a second fund must mint into the existing account.
  let ataExists = false;
  try {
    await getAccount(conn, ata, undefined, TOKEN_PROGRAM_ID);
    ataExists = true;
  } catch {
    ataExists = false;
  }
  if (!ataExists) {
    tx.add(buildCreateUsdcAtaIx(owner, authority.publicKey));
  }
  tx.add(ix);
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(authority);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig);
  return sig;
}

export function validateWalletAddress(value: string): PublicKey {
  if (!isSolanaPublicKey(value)) throw new Error('Dirección Solana inválida');
  return new PublicKey(value);
}

export function paymentTokenProgram(): PublicKey {
  return TOKEN_PROGRAM_ID;
}

export { isLocalCluster };
