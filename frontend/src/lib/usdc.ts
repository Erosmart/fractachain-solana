import { API_BASE_URL, parseApiJson } from './api';
import { solanaSignTransaction } from './solanaWallet';

export interface UsdcFundResult {
  status: 'FUNDED' | 'NEED_TRUSTLINE';
  hash?: string;
  transaction?: string;
  publicKey?: string;
}

/**
 * Garantiza que la wallet pueda recibir USDC de devnet y la carga con el
 * grant de la plataforma. Cuentas custodiales: todo server-side. Self-custody:
 * el backend devuelve la transacción de creación de ATA y se firma con la
 * wallet acá mismo — es la única firma que la cadena exige al dueño de la
 * wallet.
 */
export async function ensureUsdcReady(token: string): Promise<UsdcFundResult> {
  const res = await fetch(`${API_BASE_URL}/api/wallet/usdc/fund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
  const json = await parseApiJson<{ success?: boolean; message?: string; data?: UsdcFundResult }>(res);
  if (!res.ok || json.success === false) throw new Error(json.message || 'usdc fund failed');
  let data = json.data as UsdcFundResult;
  if (data?.status === 'NEED_TRUSTLINE' && data.transaction) {
    const signed = await solanaSignTransaction(data.transaction);
    const res2 = await fetch(`${API_BASE_URL}/api/solana/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ transaction: signed }),
    });
    const json2 = await parseApiJson<{ success?: boolean; message?: string }>(res2);
    if (!res2.ok || json2.success === false) throw new Error(json2.message || 'usdc submit failed');
    // Relayed the ATA creation — retry the grant now that the account exists.
    const res3 = await fetch(`${API_BASE_URL}/api/wallet/usdc/fund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    });
    const json3 = await parseApiJson<{ success?: boolean; message?: string; data?: UsdcFundResult }>(res3);
    if (!res3.ok || json3.success === false) throw new Error(json3.message || 'usdc grant failed');
    data = json3.data as UsdcFundResult;
  }
  return data;
}
