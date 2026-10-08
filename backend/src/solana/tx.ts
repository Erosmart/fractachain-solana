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

/**
 * Like buildUnsignedTx but some ixs need signatures the wallet can't provide
 * (e.g. a freshly generated Manifest wrapper keypair). The backend partial-
 * signs those; the wallet still signs as fee payer / owner.
 */
export async function buildPartiallySignedTx(
  feePayer: PublicKey,
  ixs: TransactionInstruction[],
  serverSigners: Keypair[],
): Promise<string> {
  const conn = getConnection();
  const tx = new Transaction().add(...ixs);
  tx.feePayer = feePayer;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  if (serverSigners.length) tx.partialSign(...serverSigners);
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

/** Anchor custom codes from `FractachainError` (errors.rs) — index = variant order. */
const FRACTACHAIN_ERROR_ES: Record<number, string> = {
  0: 'No autorizado (admin)',
  1: 'Plataforma ya inicializada',
  2: 'El monto debe ser positivo',
  3: 'El monto debe ser múltiplo del precio por unidad',
  4: 'Hard cap debe ser >= soft cap',
  5: 'El deadline debe ser futuro',
  6: 'País en lista GAFI',
  7: 'La vigencia de KYC debe ser futura',
  8: 'Fuera del horario de KYC (ART)',
  9: 'KYC no verificado o vencido',
  10: 'KYC del destinatario no verificado o vencido',
  11: 'La licitación no está abierta',
  12: 'Deadline vencido',
  13: 'Supera el hard cap',
  14: 'Supply insuficiente',
  15: 'La emisión no está abierta',
  16: 'No puede finalizar todavía',
  17: 'Solo hay refunds en licitaciones fallidas',
  18: 'Sin saldo para refund',
  19: 'Los proceeds solo se retiran tras un cierre exitoso',
  20: 'Proceeds ya retirados',
  21: 'No se puede cambiar la wallet de payout con aportes',
  22: 'Mint de pago no allowlisteado en la plataforma',
  23: 'La emisión no está en Draft (mint_supply es de una sola vez)',
  24: 'La emisión todavía no tiene supply mintado',
  25: 'OPA no disparada',
  26: 'No sos el adquirente de la OPA',
  27: 'OPA no se puede lanzar en el estado actual',
  28: 'Precio OPA bajo el piso equitativo',
  29: 'No hay oferta OPA activa',
  30: 'Oferta OPA vencida',
  31: 'El adquirente no puede aceptar su propia oferta',
  32: 'Escrow OPA agotado',
  33: 'La oferta OPA sigue activa',
  34: 'Squeeze-out solo tras emisión exitosa',
  35: 'Precio de buyout bajo el piso equitativo',
  36: 'Umbral de squeeze-out (95%) no alcanzado',
  37: 'Squeeze-out no ejecutado',
  38: 'El adquirente no puede reclamar squeeze-out',
  39: 'Overflow aritmético',
  40: 'Dirección de cuenta inválida (PDA/ATA)',
  41: 'No sos el dueño de la contribución',
  42: 'Nada para retirar',
  43: 'Nada para reclaim',
  44: 'Nada para reclamar',
  45: 'La emisión no está terminada',
  46: 'Contribución ya liquidada (nada para distribuir)',
  47: 'El mercado secundario abre solo tras un cierre exitoso',
};

export function mapSolanaError(err: unknown): Error {
  const msg = String((err as { message?: string })?.message || err);
  // Anchor custom errors surface as "custom program error: 0x17xx" — the
  // decode table lives in errors.rs; keep the mapping human-readable.
  const custom = msg.match(/custom program error: 0x([0-9a-f]+)/i);
  if (custom) {
    const code = parseInt(custom[1], 16) - 6000;
    return new Error(FRACTACHAIN_ERROR_ES[code] || `Error del programa (${code})`);
  }
  if (msg.includes('0x1') && msg.includes('insufficient')) {
    return new Error('Fondos insuficientes para la operación');
  }
  return err instanceof Error ? err : new Error(msg);
}
