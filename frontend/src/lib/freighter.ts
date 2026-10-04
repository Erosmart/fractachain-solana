'use client';

import {
  isConnected,
  isAllowed,
  requestAccess,
  getAddress,
  getNetwork,
  signMessage,
  signTransaction,
} from '@stellar/freighter-api';
import { tClient } from './i18n';

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

export type FreighterLoginPayload = { publicKey: string; message: string; signature: string };

export async function freighterAddress(): Promise<string> {
  const conn = await isConnected().catch(() => ({ isConnected: false }));
  if (!conn.isConnected) {
    throw new Error(tClient('err.walletMissing'));
  }
  const allowed = await isAllowed().catch(() => ({ isAllowed: false }));
  if (!allowed.isAllowed) {
    const acc = await requestAccess();
    if (acc.error) throw new Error(acc.error.message || tClient('err.walletRejected'));
  }
  const { address, error: addrErr } = await getAddress();
  if (addrErr || !address) throw new Error(addrErr?.message || tClient('err.walletNoAddress'));
  return address;
}

async function freighterSignPayload(prefix: string): Promise<FreighterLoginPayload> {
  const address = await freighterAddress();
  const message = `${prefix}${Date.now()}`;
  const res = await signMessage(message, { address });
  if (res.error) throw new Error(res.error.message || tClient('err.walletNoSign'));
  const sig = res.signedMessage;
  if (!sig) throw new Error(tClient('err.walletNoSign'));

  const signature = typeof sig === 'string' ? sig : toBase64(sig);
  return { publicKey: address, message, signature };
}

export function freighterLoginPayload(): Promise<FreighterLoginPayload> {
  return freighterSignPayload('fractachain-login:');
}

/** Same challenge-response but for linking the wallet to an existing account. */
export function freighterLinkPayload(): Promise<FreighterLoginPayload> {
  return freighterSignPayload('fractachain-link:');
}

/**
 * Signs a transaction the backend already built and simulated.
 *
 * Works for both token-account creation and program
 * invocations: the wallet is the transaction source, so its signature is what
 * satisfies the signer check inside the program.
 */
export async function freighterSignXdr(xdr: string): Promise<string> {
  const address = await freighterAddress();
  const net = await getNetwork().catch(() => ({ networkPassphrase: '' }));
  if (net.networkPassphrase && net.networkPassphrase !== TESTNET_PASSPHRASE) {
    throw new Error(tClient('err.walletWrongNet'));
  }
  const res = await signTransaction(xdr, {
    address,
    networkPassphrase: TESTNET_PASSPHRASE,
  });
  if (res.error) throw new Error(res.error.message || tClient('err.walletSignRejected'));
  if (!res.signedTxXdr) throw new Error(tClient('err.walletNoSignedTx'));
  return res.signedTxXdr;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
