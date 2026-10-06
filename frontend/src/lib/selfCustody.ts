'use client';

import { API_BASE_URL } from './api';
import { solanaSignTransaction } from './solanaWallet';
import { tClient } from './i18n';

/**
 * Self-custody transaction flow.
 *
 * The backend builds the transaction but never holds the key: `/prepare`
 * returns a serialized unsigned `Transaction` (base64), the wallet signs it,
 * and the submit endpoint relays it to the cluster. Custodial accounts skip
 * all of this and hit the one-shot endpoints where the platform signs on
 * their behalf.
 */

type ApiEnvelope = { success?: boolean; message?: string; data?: unknown };

export async function postJson<T>(
  path: string,
  token: string | null | undefined,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const json: ApiEnvelope = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.message || tClient('err.opFailed'));
  }
  return json.data as T;
}

/** prepare → sign in wallet → relay. Returns whatever the relay answered. */
export async function signAndRelay<T>(params: {
  prepare: string;
  submit: string;
  token: string | null | undefined;
  body?: Record<string, unknown>;
}): Promise<T> {
  const prepared = await postJson<{ transaction?: string; xdr?: string }>(
    params.prepare,
    params.token,
    params.body,
  );
  const unsigned = prepared?.transaction || (prepared as { xdr?: string })?.xdr;
  if (!unsigned) throw new Error(tClient('err.noXdr'));
  const signedTx = await solanaSignTransaction(unsigned);
  return postJson<T>(params.submit, params.token, {
    ...(params.body || {}),
    transaction: signedTx,
  });
}

export function isSelfCustody(user?: { custodyMode?: string | null } | null): boolean {
  return user?.custodyMode === 'SELF';
}
