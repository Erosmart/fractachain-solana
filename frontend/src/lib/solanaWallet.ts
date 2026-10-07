'use client';

import type { WalletContextState } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { tClient } from './i18n';

export const SOLANA_CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet';

export type WalletLoginPayload = { publicKey: string; message: string; signature: string };

/**
 * Imperative bridge to the React wallet-adapter — the same role freighter.ts
 * played for Stellar. `<WalletBridge/>` (inside SolanaWalletProvider) keeps a
 * live reference to the connected wallet so non-React code can ask it to sign.
 */
let walletState: WalletContextState | null = null;

export function registerWalletContext(ctx: WalletContextState | null) {
  walletState = ctx;
}

function requireWallet(): WalletContextState {
  if (!walletState) throw new Error(tClient('err.walletMissing'));
  return walletState;
}

export function walletAddress(): string {
  const w = requireWallet();
  if (!w.connected || !w.publicKey) throw new Error(tClient('err.walletNoAddress'));
  return w.publicKey.toBase58();
}

export async function connectWallet(): Promise<void> {
  const w = requireWallet();
  if (w.connected) return;
  if (!w.wallet) throw new Error(tClient('err.walletMissing'));
  await w.connect();
}

async function signPayload(prefix: string): Promise<WalletLoginPayload> {
  const w = requireWallet();
  if (!w.connected || !w.publicKey) await connectWallet();
  const ctx = requireWallet();
  if (!ctx.publicKey) throw new Error(tClient('err.walletNoAddress'));
  if (!ctx.signMessage) throw new Error(tClient('err.walletNoSign'));
  const message = `${prefix}${Date.now()}`;
  const sig = await ctx.signMessage(new TextEncoder().encode(message));
  return {
    publicKey: ctx.publicKey.toBase58(),
    message,
    signature: bs58.encode(sig),
  };
}

/** Login challenge-response (`fractachain-login:<ts>`). */
export function solanaLoginPayload(): Promise<WalletLoginPayload> {
  return signPayload('fractachain-login:');
}

/** Same challenge-response but for linking the wallet to an existing account. */
export function solanaLinkPayload(): Promise<WalletLoginPayload> {
  return signPayload('fractachain-link:');
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Signs a transaction the backend already built (base64-serialized
 * `Transaction`). The wallet is the fee payer / required signer — the backend
 * never holds the key. Returns the signed tx re-serialized to base64.
 *
 * Uses browser base64 helpers (no Node `Buffer` polyfill required).
 */
export async function solanaSignTransaction(base64Tx: string): Promise<string> {
  const w = requireWallet();
  if (!w.connected || !w.publicKey) await connectWallet();
  const ctx = requireWallet();
  if (!ctx.signTransaction) throw new Error(tClient('err.walletNoSignedTx'));
  const tx = Transaction.from(b64ToBytes(base64Tx));
  const signed = await ctx.signTransaction(tx);
  return bytesToB64(signed.serialize());
}
