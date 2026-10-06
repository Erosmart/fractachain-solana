import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createWalletKeypair, isSolanaPublicKey, loadSolBalance, requestDevnetAirdrop } from './solana_devnet';
import { getTestnetConfig } from '../admin/testnet';
import { persistToPg } from '../data/pgstore';

export type CustodyMode = 'CUSTODIAL' | 'SELF' | null;
/**
 * `REVOKED` is distinct from `REJECTED`: the investor was approved and traded,
 * and compliance later withdrew that approval. On-chain it maps to clearing
 * the trustline's authorized flag, which freezes the balance and makes the
 * network pull their open offers.
 */
export type KycStatus = 'UNREGISTERED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

export interface Holding {
  listingId: string;
  tokenTicker: string;
  usdcAmount: number;
  tokens: number;
  tokensOwed: number;
  /** Accrued USDC from a dividend deposit, claimable by the holder. */
  pendingDividendUsdc?: number;
  /** Tokens already paid on-ledger to the holder's trustline (SDEX listings). */
  tokensOnChain?: number;
  /** Set after an on-chain `refund()` on a failed licitacion. */
  refundedAt?: string;
  refundHash?: string;
}

export interface Account {
  id: string;
  email: string;
  name: string;
  avatar: string;
  passwordHash?: string;
  custodyMode: CustodyMode;
  publicKey: string;
  secretKey?: string;
  recoveryHint?: string;
  kycStatus: KycStatus;
  kycId?: string;
  legalName?: string;
  cuit?: string;
  selfiePath?: string;
  holdings: Holding[];
  trustlines: string[];
  cashUsdc: number;
  xlmBalance?: number;
  faucetFundedAt?: string;
  authProvider?: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface PublicAccount {
  id: string;
  email: string;
  name: string;
  avatar: string;
  custodyMode: CustodyMode;
  publicKey: string;
  kycStatus: KycStatus;
  kycId?: string;
  legalName?: string;
  cuit?: string;
  selfieUrl?: string;
  holdings: Holding[];
  trustlines: string[];
  cashUsdc: number;
  xlmBalance?: number;
  faucetFunded?: boolean;
  isAdmin: boolean;
  uid?: string;
  authProvider?: string;
  createdAt?: string;
}

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SELFIE_DIR = path.join(DATA_DIR, 'selfies');

const accounts = new Map<string, Account>();
const sessions = new Map<string, string>();

function hashPassword(password: string) {
  return crypto.createHash('sha256').update(`fc:${password}`).digest('hex');
}

const AUTH_PEPPER = process.env.AUTH_PEPPER || 'fractachain-dev-auth';
const WALLET_PEPPER = process.env.WALLET_PEPPER || 'fractachain-dev-wallet';

function walletKey() {
  return crypto.scryptSync(WALLET_PEPPER, 'fractachain-wallet', 32);
}

function sealSecret(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', walletKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function openSecret(sealed: string) {
  const [prefix, ivHex, tagHex, dataHex] = sealed.split(':');
  if (prefix !== 'enc' || !ivHex || !tagHex || !dataHex) {
    throw new Error('Clave de custodia con formato inválido');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    walletKey(),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Hands out the signing key for a platform-custodied wallet.
 *
 * Deliberately narrow: only `CUSTODIAL` accounts resolve, because those are
 * the wallets the platform generated and already holds. An account in `SELF`
 * custody signs in its own wallet and the backend must never be able to act
 * for it, so this throws rather than returning undefined — a caller that
 * reaches here for a self-custody account has a bug worth surfacing.
 */
export function custodialSigningKey(accountId: string): string {
  const account = accounts.get(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  if (account.custodyMode !== 'CUSTODIAL' || !account.secretKey) {
    throw new Error('Esta cuenta es de autocustodia: firmá la orden desde tu wallet');
  }
  return openSecret(account.secretKey);
}

/** Same key as a web3.js Keypair for Solana transaction signing. */
export function custodialSigningKeypair(accountId: string) {
  const { Keypair } = require('@solana/web3.js') as typeof import('@solana/web3.js');
  const bs58mod = require('bs58') as typeof import('bs58');
  const decoded = bs58mod.default.decode(custodialSigningKey(accountId));
  return Keypair.fromSecretKey(decoded);
}

function load() {
  try {
    if (!fs.existsSync(USERS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) as Account[];
    for (const a of raw) {
      a.holdings = (a.holdings || []).map((h) => ({
        ...h,
        tokensOwed: h.tokensOwed || 0,
        pendingDividendUsdc: h.pendingDividendUsdc || 0,
      }));
      a.trustlines = a.trustlines || [];
      if (typeof a.cashUsdc !== 'number' || a.cashUsdc < 15000) a.cashUsdc = 50000;
      if (a.secretKey && !a.secretKey.startsWith('enc:')) {
        a.secretKey = sealSecret(a.secretKey);
      }
      accounts.set(a.id, a);
    }
    save();
  } catch {
    // first boot
  }
}

function save() {
  const rows = [...accounts.values()];
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(rows, null, 2));
  persistToPg('users.json', rows);
}

load();

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'erosnahuelp85@gmail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email?: string) {
  return Boolean(email && ADMIN_EMAILS.includes(email.trim().toLowerCase()));
}

export function isAdminAccount(account: { email: string }) {
  return isAdminEmail(account.email);
}

export function toPublic(a: Account): PublicAccount {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    avatar: a.avatar,
    custodyMode: a.custodyMode,
    publicKey: a.publicKey,
    kycStatus: a.kycStatus,
    kycId: a.kycId,
    legalName: a.legalName,
    cuit: a.cuit,
    selfieUrl: a.selfiePath ? `/api/kyc/selfie/${a.id}` : undefined,
    holdings: a.holdings || [],
    cashUsdc: a.cashUsdc ?? 0,
    trustlines: a.trustlines || [],
    xlmBalance: a.xlmBalance ?? 0,
    faucetFunded: Boolean(a.faucetFundedAt),
    isAdmin: isAdminEmail(a.email),
    uid: a.id,
    authProvider: a.authProvider,
    createdAt: a.createdAt,
  };
}

function issueToken(accountId: string) {
  const ts = Date.now().toString();
  const payload = `${accountId}.${ts}`;
  const sig = crypto.createHmac('sha256', AUTH_PEPPER).update(payload).digest('hex').slice(0, 24);
  const token = `fc1.${payload}.${sig}`;
  sessions.set(token, accountId);
  return token;
}

export function getAccountByToken(header?: string): Account | undefined {
  if (!header) return undefined;
  const token = header.replace(/^Bearer\s+/i, '');
  const mapped = sessions.get(token);
  if (mapped) return accounts.get(mapped);
  const parts = token.split('.');
  if (parts[0] === 'fc1' && parts.length === 4) {
    const accountId = parts[1];
    const ts = parts[2];
    const sig = parts[3];
    const expected = crypto.createHmac('sha256', AUTH_PEPPER).update(`${accountId}.${ts}`).digest('hex').slice(0, 24);
    if (sig === expected) return accounts.get(accountId);
  }
  return undefined;
}

export function revokeToken(header?: string) {
  if (!header) return false;
  return sessions.delete(header.replace(/^Bearer\s+/i, ''));
}

export function upsertLogin(payload: {
  email: string;
  name?: string;
  avatar?: string;
  uid?: string;
  password?: string;
}): { success: boolean; token: string; user: PublicAccount; message?: string } {
  const email = payload.email.trim().toLowerCase();
  if (!email.includes('@')) {
    throw new Error('Email inválido');
  }

  let account = [...accounts.values()].find((a) => a.email === email);
  const now = new Date().toISOString();

  if (!account) {
    if (payload.password && payload.password.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres');
    }
    account = {
      id: payload.uid || `usr_${crypto.randomBytes(6).toString('hex')}`,
      email,
      name: payload.name || email.split('@')[0],
      avatar: payload.avatar || '',
      passwordHash: payload.password ? hashPassword(payload.password) : undefined,
      custodyMode: null,
      publicKey: '',
      kycStatus: process.env.HACKATHON_DEMO === 'true' ? 'APPROVED' : 'UNREGISTERED',
      holdings: [],
      trustlines: [],
      cashUsdc: 50000,
      authProvider: payload.uid ? 'firebase-google' : 'email',
      createdAt: now,
      lastLoginAt: now,
    };
    accounts.set(account.id, account);
  } else {
    if (payload.password) {
      if (!account.passwordHash) {
        account.passwordHash = hashPassword(payload.password);
      } else if (account.passwordHash !== hashPassword(payload.password)) {
        throw new Error('Contraseña incorrecta');
      }
    }
    account.lastLoginAt = now;
    if (payload.uid) account.authProvider = 'firebase-google';
    if (payload.name) account.name = payload.name;
    if (payload.avatar) account.avatar = payload.avatar;
  }

  ensureAdminAccount(account);
  save();
  return {
    success: true,
    token: issueToken(account.id),
    user: toPublic(account),
  };
}

export function upsertWalletLogin(publicKey: string) {
  const email = `wallet-${publicKey.toLowerCase()}@fractachain`;
  let account = [...accounts.values()].find((a) => a.email === email);
  const now = new Date().toISOString();

  if (!account) {
    account = {
      id: `usr_${crypto.randomBytes(6).toString('hex')}`,
      email,
      name: `Wallet ${publicKey.slice(0, 6)}…${publicKey.slice(-4)}`,
      avatar: '',
      custodyMode: 'SELF',
      publicKey,
      kycStatus: 'UNREGISTERED',
      holdings: [],
      trustlines: [],
      cashUsdc: 50000,
      authProvider: 'wallet',
      createdAt: now,
      lastLoginAt: now,
    };
    accounts.set(account.id, account);
  } else {
    account.lastLoginAt = now;
    if (!account.publicKey) account.publicKey = publicKey;
    if (!account.custodyMode) account.custodyMode = 'SELF';
  }

  ensureAdminAccount(account);
  save();
  return { token: issueToken(account.id), user: toPublic(account) };
}

function randomKeypair() {
  return createWalletKeypair();
}

function ensureAdminAccount(account: Account) {
  if (!isAdminEmail(account.email)) return;
  if (!account.custodyMode || !isSolanaPublicKey(account.publicKey)) {
    const keys = randomKeypair();
    account.custodyMode = 'CUSTODIAL';
    account.publicKey = keys.publicKey;
    account.secretKey = sealSecret(keys.secretKey);
    account.recoveryHint = 'custodia-fractachain';
  }
  account.kycStatus = 'APPROVED';
  account.legalName = account.legalName || account.name || 'Eros';
  account.kycId = account.kycId || `kyc-${account.id}`;
  if (typeof account.cashUsdc !== 'number' || account.cashUsdc < 15000) account.cashUsdc = 50000;
}

for (const existing of accounts.values()) ensureAdminAccount(existing);

// Cuenta de prueba para validar el flujo de primera vez: login → custodia
// (vincular wallet Solana) → KYC. Se crea sólo si no existe.
const TEST_EMAIL = 'test@fractachain.dev';
if (![...accounts.values()].some((a) => a.email === TEST_EMAIL)) {
  const now = new Date().toISOString();
  const testId = `usr_test_${crypto.randomBytes(3).toString('hex')}`;
  accounts.set(testId, {
    id: testId,
    email: TEST_EMAIL,
    name: 'Cuenta de prueba',
    avatar: '',
    passwordHash: hashPassword('test1234'),
    custodyMode: null,
    publicKey: '',
    kycStatus: 'UNREGISTERED',
    holdings: [],
    trustlines: [],
    cashUsdc: 50000,
    authProvider: 'email',
    createdAt: now,
    lastLoginAt: now,
  });
  save();
}

if (process.env.HACKATHON_DEMO === 'true') {
  for (const a of accounts.values()) {
    if (a.kycStatus === 'UNREGISTERED' || a.kycStatus === 'PENDING') a.kycStatus = 'APPROVED';
  }
}
if (accounts.size) save();

export function setCustody(accountId: string, mode: 'CUSTODIAL' | 'SELF', externalPublicKey?: string) {
  const account = accounts.get(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  if (account.custodyMode) {
    return { user: toPublic(account), secretOnce: undefined as string | undefined };
  }
  if (mode === 'SELF' && externalPublicKey) {
    if (!isSolanaPublicKey(externalPublicKey)) throw new Error('Public key Solana inválida');
    account.custodyMode = 'SELF';
    account.publicKey = externalPublicKey;
    account.authProvider = account.authProvider || 'wallet';
    save();
    return { user: toPublic(account), secretOnce: undefined as string | undefined };
  }
  const keys = randomKeypair();
  account.custodyMode = mode;
  account.publicKey = keys.publicKey;
  if (mode === 'CUSTODIAL') {
    account.secretKey = sealSecret(keys.secretKey);
    account.recoveryHint = 'custodia-fractachain';
    save();
    return { user: toPublic(account), secretOnce: undefined as string | undefined };
  }
  save();
  return { user: toPublic(account), secretOnce: keys.secretKey };
}

/**
 * Linkea una wallet self-custody a una cuenta existente. La firma ya se
 * verificó en wallet_auth; acá sólo se persiste. Idempotente si la wallet
 * ya era esta; rechaza pisar otra clave que ya tiene operaciones.
 */
export function linkSelfCustodyWallet(accountId: string, publicKey: string) {
  const account = accounts.get(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  if (!isSolanaPublicKey(publicKey)) throw new Error('Public key Solana inválida');
  if (account.publicKey && account.publicKey !== publicKey) {
    throw new Error('La cuenta ya tiene otra wallet vinculada');
  }
  account.custodyMode = 'SELF';
  account.publicKey = publicKey;
  account.authProvider = account.authProvider || 'wallet';
  save();
  return toPublic(account);
}

export function markTokensOnChain(accountId: string, listingId: string, amount: number) {
  const account = accounts.get(accountId);
  const holding = account?.holdings?.find((h) => h.listingId === listingId);
  if (!account || !holding) throw new Error('Tenencia no encontrada');
  holding.tokensOnChain = (holding.tokensOnChain || 0) + amount;
  save();
  return toPublic(account);
}

export function submitOnboardingKyc(
  accountId: string,
  data: { legalName: string; cuit: string; selfieDataUrl?: string; email?: string }
) {
  const account = accounts.get(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  if (!account.custodyMode) throw new Error('Elegí primero el tipo de custodia');
  const isWalletAccount = account.authProvider === 'wallet';
  const cuit = data.cuit.replace(/[^\d]/g, '');
  if (cuit.length < 10) throw new Error('CUIT inválido');
  if (!data.legalName.trim()) throw new Error('Falta el nombre');
  if (isWalletAccount) {
    const email = String(data.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email inválido');
    const clash = [...accounts.values()].find((a) => a.id !== account.id && a.email === email);
    if (clash) throw new Error('Ese email ya tiene una cuenta');
    account.email = email;
  } else if (!data.selfieDataUrl || !data.selfieDataUrl.startsWith('data:image')) {
    throw new Error('Falta la foto');
  }

  if (data.selfieDataUrl && data.selfieDataUrl.startsWith('data:image')) {
    fs.mkdirSync(SELFIE_DIR, { recursive: true });
    const match = data.selfieDataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) throw new Error('Imagen inválida');
    const ext = match[1].includes('png') ? 'png' : 'jpg';
    const file = path.join(SELFIE_DIR, `${account.id}.${ext}`);
    fs.writeFileSync(file, Buffer.from(match[2], 'base64'));
    account.selfiePath = file;
  }

  account.legalName = data.legalName.trim();
  account.name = account.legalName;
  account.cuit = data.cuit.trim();
  // On testnet validation is automatic — there is no real KYC provider behind
  // the form, so anything else would just strand the user on the pending page.
  const autoApprove =
    process.env.HACKATHON_DEMO === 'true' ||
    getTestnetConfig().cluster !== 'mainnet-beta';
  account.kycStatus = autoApprove ? 'APPROVED' : 'PENDING';
  account.kycId = account.kycId || `kyc-${account.id}`;
  save();
  if (account.kycStatus === 'APPROVED' && account.publicKey && isSolanaPublicKey(account.publicKey)) {
    void import('../solana/kyc')
      .then(async ({ verifyInvestorOnChain }) => {
        await verifyInvestorOnChain(new (await import('@solana/web3.js')).PublicKey(account.publicKey));
      })
      .catch(() => {});
  }
  return toPublic(account);
}

export function readSelfie(accountId: string) {
  const account = accounts.get(accountId);
  if (!account?.selfiePath || !fs.existsSync(account.selfiePath)) return null;
  return account.selfiePath;
}

export function listPendingKyc() {
  return [...accounts.values()].map(toPublic);
}

export function setKycStatus(accountId: string, status: 'APPROVED' | 'REJECTED' | 'REVOKED', reason?: string) {
  const account = accounts.get(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  account.kycStatus = status;
  save();
  return toPublic(account);
}

export function setKycStatusByKycId(kycId: string, status: 'APPROVED' | 'REJECTED' | 'REVOKED') {
  const account = [...accounts.values()].find((a) => a.kycId === kycId || a.id === kycId);
  if (!account) throw new Error('Solicitud no encontrada');
  account.kycStatus = status;
  save();
  return toPublic(account);
}

export function requireApprovedTrader(account: Account) {
  if (account.kycStatus !== 'APPROVED') {
    throw new Error('Solo inversores con KYC aprobado pueden operar');
  }
  if (!account.custodyMode || !account.publicKey) {
    throw new Error('Primero creá la wallet');
  }
}

export function hasTrustline(accountId: string, listingId: string) {
  const account = accounts.get(accountId);
  return Boolean(account?.trustlines?.includes(listingId));
}

export function addTrustline(accountId: string, listingId: string) {
  const account = accounts.get(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  requireApprovedTrader(account);
  account.trustlines = account.trustlines || [];
  if (!account.trustlines.includes(listingId)) account.trustlines.push(listingId);
  save();
  return toPublic(account);
}

export function claimListingTokens(accountId: string, listingId: string, listingClosed: boolean) {
  const account = accounts.get(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  requireApprovedTrader(account);
  if (!listingClosed) throw new Error('La licitación todavía no cerró');
  if (!hasTrustline(accountId, listingId)) {
    throw new Error('Primero aprobá el token (trustline) para poder recibirlo');
  }
  const holding = (account.holdings || []).find((h) => h.listingId === listingId);
  if (!holding || (holding.tokensOwed || 0) <= 0) {
    throw new Error('No hay tokens pendientes de reclamo');
  }
  if (holding.refundedAt) {
    throw new Error('Ese aporte ya se reembolsó on-chain; no hay unidades para anotar');
  }
  holding.tokens += holding.tokensOwed;
  holding.tokensOwed = 0;
  save();
  return toPublic(account);
}

export function markHoldingRefunded(
  accountId: string,
  listingId: string,
  extra?: { hash?: string | null },
) {
  const account = accounts.get(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  const holding = (account.holdings || []).find((h) => h.listingId === listingId);
  if (!holding) throw new Error('No hay una posición en esta licitación');
  if (holding.refundedAt) {
    throw new Error('Este aporte ya está marcado como reembolsado');
  }
  holding.tokens = 0;
  holding.tokensOwed = 0;
  holding.refundedAt = new Date().toISOString();
  if (extra?.hash) holding.refundHash = extra.hash;
  save();
  return toPublic(account);
}

export function addHolding(accountId: string, holding: Holding) {
  const account = accounts.get(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  account.holdings = account.holdings || [];
  const existing = account.holdings.find((h) => h.listingId === holding.listingId);
  if (existing) {
    existing.usdcAmount += holding.usdcAmount;
    existing.tokens += holding.tokens;
    existing.tokensOwed = (existing.tokensOwed || 0) + (holding.tokensOwed || 0);
  } else {
    account.holdings.push({
      ...holding,
      tokensOwed: holding.tokensOwed || 0,
      pendingDividendUsdc: holding.pendingDividendUsdc || 0,
    });
  }
  save();
  return toPublic(account);
}

export function reduceHolding(accountId: string, listingId: string, tokens: number) {
  const account = accounts.get(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  const holding = (account.holdings || []).find((h) => h.listingId === listingId);
  if (!holding || holding.tokens + 1e-9 < tokens) {
    throw new Error('No hay tokens suficientes para vender');
  }
  const ratio = tokens / holding.tokens;
  holding.tokens -= tokens;
  holding.usdcAmount = Math.max(0, holding.usdcAmount * (1 - ratio));
  if (holding.tokens <= 1e-8 && (holding.tokensOwed || 0) <= 1e-8) {
    account.holdings = account.holdings.filter((h) => h.listingId !== listingId);
  }
  save();
}

export function debitCash(accountId: string, amount: number) {
  const account = accounts.get(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  if (account.cashUsdc + 1e-9 < amount) {
    throw new Error('USDC insuficiente en el saldo sandbox');
  }
  account.cashUsdc = Math.round((account.cashUsdc - amount) * 1e6) / 1e6;
  save();
}

export function creditCash(accountId: string, amount: number) {
  const account = accounts.get(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  account.cashUsdc = Math.round((account.cashUsdc + amount) * 1e6) / 1e6;
  save();
}

export function tokenBalance(accountId: string, listingId: string) {
  const account = accounts.get(accountId);
  const holding = account?.holdings?.find((h) => h.listingId === listingId);
  return holding?.tokens || 0;
}

export function cashBalance(accountId: string) {
  return accounts.get(accountId)?.cashUsdc || 0;
}

export function getAccount(id: string) {
  return accounts.get(id);
}

export function listAccounts(): Account[] {
  return [...accounts.values()];
}

export function economicShares(holding: Holding) {
  return (holding.tokens || 0) + (holding.tokensOwed || 0);
}

export function accrueDividend(accountId: string, listingId: string, usdc: number) {
  const account = accounts.get(accountId);
  if (!account) return;
  const holding = (account.holdings || []).find((h) => h.listingId === listingId);
  if (!holding) return;
  holding.pendingDividendUsdc = Math.round(((holding.pendingDividendUsdc || 0) + usdc) * 1e6) / 1e6;
  save();
}

export function claimPendingDividend(accountId: string, listingId: string): { amount: number; user: PublicAccount } {
  const account = accounts.get(accountId);
  if (!account) throw new Error('Cuenta no encontrada');
  requireApprovedTrader(account);
  const holding = (account.holdings || []).find((h) => h.listingId === listingId);
  const amount = Math.round((holding?.pendingDividendUsdc || 0) * 1e6) / 1e6;
  if (amount <= 0) throw new Error('No hay dividendos pendientes de cobro');
  holding!.pendingDividendUsdc = 0;
  save();
  creditCash(accountId, amount);
  return { amount, user: toPublic(accounts.get(accountId)!) };
}

export function findAccountByPublicKey(publicKey: string): Account | undefined {
  const needle = String(publicKey || '').trim();
  if (!needle) return undefined;
  return [...accounts.values()].find((a) => a.publicKey?.trim() === needle);
}

export async function hydrateTestnetWallet(accountId: string) {
  const account = accounts.get(accountId);
  if (!account) return undefined;
  if (account.custodyMode === 'CUSTODIAL' && !isSolanaPublicKey(account.publicKey)) {
    const keys = randomKeypair();
    account.publicKey = keys.publicKey;
    account.secretKey = sealSecret(keys.secretKey);
    account.recoveryHint = 'custodia-fractachain';
  }
  if (!isSolanaPublicKey(account.publicKey)) {
    save();
    return toPublic(account);
  }
  if (!account.faucetFundedAt && (await requestDevnetAirdrop(account.publicKey))) {
    account.faucetFundedAt = new Date().toISOString();
  }
  // Custodial accounts also get demo USDC minted when a mint authority is
  // configured (localnet/devnet mock mint only — never real USDC).
  try {
    const { ensureWalletFunded } = await import('../solana/wallet_funding');
    await ensureWalletFunded(account.publicKey);
  } catch (err: any) {
    console.warn('[wallet-faucet]', err?.message || err);
  }
  account.xlmBalance = await loadSolBalance(account.publicKey);
  save();
  return toPublic(account);
}
