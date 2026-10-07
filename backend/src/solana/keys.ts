import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SOLANA_CLUSTER } from './connection';

/**
 * Key material for the platform.
 *
 * Env vars (never committed):
 *   SOLANA_ADMIN_SECRET_KEY   — base58-encoded 64-byte secret key of the
 *                               platform admin (signs initialize/kyc/offerings)
 *   SOLANA_DEPLOYER_SECRET_KEY— upgrade/deploy keypair (anchor deploy)
 *   SOLANA_ISSUER_SECRET_KEY  — optional dedicated issuer signer
 *   SOLANA_USDC_MINT_AUTHORITY— mint authority for the local USDC mock mint
 *
 * Managed-custody user keys are AES-256-GCM sealed in data/users.json
 * (see auth/accounts.ts) — this module only unseals what it stores there.
 */

const WALLET_PEPPER = process.env.WALLET_PEPPER || 'fractachain-dev-wallet';

function walletKey() {
  return crypto.scryptSync(WALLET_PEPPER, 'fractachain-wallet', 32);
}

export function sealSecretKey(secretKeyBase58: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', walletKey(), iv);
  const enc = Buffer.concat([cipher.update(secretKeyBase58, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function openSecretKey(sealed: string): string {
  const [prefix, ivHex, tagHex, dataHex] = sealed.split(':');
  if (prefix !== 'enc' || !ivHex || !tagHex || !dataHex) {
    throw new Error('Clave de custodia con formato inválido');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', walletKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

/**
 * True for any wallet/system account on the ed25519 curve.
 * Use for fee-payers, fiduciaries, investor wallets — not for program PDAs.
 */
export function isSolanaPublicKey(value: string): boolean {
  try {
    const pk = new PublicKey(value);
    return PublicKey.isOnCurve(pk.toBytes());
  } catch {
    return false;
  }
}

/**
 * True for any valid base58 Pubkey, including off-curve PDAs (Offerings, etc.).
 * Prefer this when validating on-chain account addresses stored on listings.
 */
export function isSolanaAddress(value: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export function keypairFromBase58(secret: string): Keypair {
  const raw = bs58.decode(secret.trim());
  if (raw.length === 64) return Keypair.fromSecretKey(raw);
  if (raw.length === 32) return Keypair.fromSeed(raw);
  throw new Error('Secret key Solana inválida (se esperaban 64 o 32 bytes en base58)');
}

export function createSolanaKeypair(): { publicKey: string; secretKey: string } {
  const kp = Keypair.generate();
  return {
    publicKey: kp.publicKey.toBase58(),
    secretKey: bs58.encode(kp.secretKey),
  };
}

/** Platform admin — required for any server-signed write. */
export function adminKeypair(): Keypair {
  const secret = process.env.SOLANA_ADMIN_SECRET_KEY;
  if (!secret) throw new Error('Falta SOLANA_ADMIN_SECRET_KEY');
  return keypairFromBase58(secret);
}

export function hasAdminSecret(): boolean {
  return Boolean(process.env.SOLANA_ADMIN_SECRET_KEY?.trim());
}

export function adminPublicKey(): string | null {
  try {
    return adminKeypair().publicKey.toBase58();
  } catch {
    return null;
  }
}

/** Dedicated issuer signer, falls back to the admin. */
export function issuerKeypair(): Keypair {
  const secret = process.env.SOLANA_ISSUER_SECRET_KEY || process.env.SOLANA_ADMIN_SECRET_KEY;
  if (!secret) throw new Error('Falta SOLANA_ISSUER_SECRET_KEY / SOLANA_ADMIN_SECRET_KEY');
  return keypairFromBase58(secret);
}

export function issuerPublicKey(): string | null {
  try {
    return issuerKeypair().publicKey.toBase58();
  } catch {
    return null;
  }
}

/** Mint authority for the local/devnet USDC mock mint. */
export function usdcMintAuthority(): Keypair {
  const secret =
    process.env.SOLANA_USDC_MINT_AUTHORITY || process.env.SOLANA_ADMIN_SECRET_KEY;
  if (!secret) throw new Error('Falta SOLANA_USDC_MINT_AUTHORITY');
  return keypairFromBase58(secret);
}

/** Custodial key generated server-side for a user account. */
export function sealCustodialKeypair(): { publicKey: string; sealedSecret: string } {
  const kp = createSolanaKeypair();
  return { publicKey: kp.publicKey, sealedSecret: sealSecretKey(kp.secretKey) };
}

export function unsealCustodialKeypair(sealed: string): Keypair {
  return keypairFromBase58(openSecretKey(sealed));
}

/* ----------------------------------------------- local dev-keypair files */

const KEYS_DIR = path.join(__dirname, '..', '..', '..', '.keys');

/**
 * Loads a keypair from `.keys/<name>.json` (solana-keygen format). Local
 * tooling only — never required in production, never committed.
 */
export function localKeypairFile(name: string): Keypair | null {
  try {
    const file = path.join(KEYS_DIR, `${name}.json`);
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  } catch {
    return null;
  }
}

export function isLocalCluster(): boolean {
  return SOLANA_CLUSTER === 'localnet';
}
