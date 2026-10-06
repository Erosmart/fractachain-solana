import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { getConnection } from './connection';

/**
 * Sends `ixs` fully signed server-side (custodial/admin flows).
 * Returns the confirmed signature.
 */
export async function sendIxs(
  feePayer: Keypair,
  signers: Keypair[],
  ixs: TransactionInstruction[],
): Promise<string> {
  const conn = getConnection();
  const tx = new Transaction().add(...ixs);
  tx.feePayer = feePayer.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  const all = [feePayer, ...signers.filter((s) => !s.publicKey.equals(feePayer.publicKey))];
  tx.sign(...all);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, 'confirmed');
  return sig;
}

/**
 * Serializes an unsigned transaction for wallet signing (self-custody).
 * The wallet is the fee payer AND required signer — the backend builds,
 * never signs.
 */
export async function buildUnsignedTx(
  feePayer: PublicKey,
  ixs: TransactionInstruction[],
): Promise<string> {
  const conn = getConnection();
  const tx = new Transaction().add(...ixs);
  tx.feePayer = feePayer;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');
}

/** Relays a wallet-signed transaction. Returns the signature. */
export async function submitSignedTx(signedTxBase64: string): Promise<string> {
  const conn = getConnection();
  const raw = Buffer.from(signedTxBase64, 'base64');
  const sig = await conn.sendRawTransaction(raw, { skipPreflight: false });
  await conn.confirmTransaction(sig, 'confirmed');
  return sig;
}

export function mapSolanaError(err: unknown): Error {
  const msg = String((err as { message?: string })?.message || err);
  // Anchor custom errors surface as "custom program error: 0x17xx" — the
  // decode table lives in errors.rs; keep the mapping human-readable.
  const custom = msg.match(/custom program error: 0x([0-9a-f]+)/i);
  if (custom) {
    const code = parseInt(custom[1], 16) - 6000;
    const table: Record<number, string> = {
      0: 'No autorizado (admin)',
      6: 'País en lista GAFI',
      8: 'Fuera del horario de KYC (ART)',
      9: 'KYC no verificado o vencido',
      11: 'La licitación no está abierta',
      12: 'Deadline vencido',
      13: 'Supera el hard cap',
      14: 'Supply insuficiente',
      16: 'No puede finalizar todavía',
      17: 'Solo hay refunds en licitaciones fallidas',
    };
    return new Error(table[code] || `Error del programa (${code})`);
  }
  if (msg.includes('0x1') && msg.includes('insufficient')) {
    return new Error('Fondos insuficientes para la operación');
  }
  return err instanceof Error ? err : new Error(msg);
}
