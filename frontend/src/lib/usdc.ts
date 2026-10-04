import { API_BASE_URL } from './api';
import { freighterSignXdr } from './freighter';

export interface UsdcFundResult {
  status: 'FUNDED' | 'NEED_TRUSTLINE';
  funded?: boolean;
  already?: boolean;
  balance?: number;
  xdr?: string;
}

/**
 * Garantiza que la wallet pueda recibir USDC de testnet y la carga con el
 * grant de la plataforma. Cuentas custodiales: todo server-side. Self-custody:
 * el backend devuelve la transacción de creación de ATA y se firma con la wallet acá mismo —
 * es la única firma que la cadena exige al dueño de la wallet.
 */
export async function ensureUsdcReady(token: string): Promise<UsdcFundResult> {
  const res = await fetch(`${API_BASE_URL}/api/wallet/usdc/fund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.message || 'usdc fund failed');
  let data = json.data as UsdcFundResult;
  if (data?.status === 'NEED_TRUSTLINE' && data.xdr) {
    const signed = await freighterSignXdr(data.xdr);
    const res2 = await fetch(`${API_BASE_URL}/api/wallet/usdc/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ xdr: signed }),
    });
    const json2 = await res2.json();
    if (!res2.ok || json2.success === false) throw new Error(json2.message || 'usdc submit failed');
    data = json2.data;
  }
  return data;
}
