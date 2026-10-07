'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../context/I18nContext';
import { API_BASE_URL, bearerHeaders, type KycRecord } from '../../../lib/api';

export default function AdminKycPage() {
  const { token } = useAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState<KycRecord[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE_URL}/api/kyc`, { headers: bearerHeaders(token) });
    const json = await res.json();
    if (json.success) setRows(json.data);
    else setError(json.message || t('acct.errorGeneric'));
  }, [token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: 'approve' | 'reject' | 'revoke') => {
    setBusy(id);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/kyc/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearerHeaders(token) },
        body: '{}',
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.message || json.error || t('acct.errorGeneric'));
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  // Selfies need the admin bearer token, so they can't be a plain <img src>.
  const openSelfie = async (url: string) => {
    const res = await fetch(`${API_BASE_URL}${url}`, { headers: bearerHeaders(token) });
    if (!res.ok) return setError(t('acct.errorGeneric'));
    window.open(URL.createObjectURL(await res.blob()), '_blank');
  };

  return (
    <div className="py-6">
      <h1 className="font-serif italic text-3xl sm:text-4xl">{t('acct.adminTitle')}</h1>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {rows === null ? (
        <p className="mt-6 text-sm text-black/50">{t('misc.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-black/60">{t('acct.adminEmpty')}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-brand-border bg-brand-card shadow-sm">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-black/5 first:border-0">
                  <td className="p-3">
                    <p className="font-bold">{r.fullName}</p>
                    <p className="text-xs text-black/50">{r.email}</p>
                  </td>
                  <td className="p-3 text-xs">
                    {r.docType} {r.docNumber}
                  </td>
                  <td className="p-3 font-lcd text-[11px] break-all max-w-[12rem]">{r.walletAddress}</td>
                  <td className="p-3 text-xs font-bold">{t(`acct.kyc${r.status}`)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {r.selfieUrl && (
                        <button type="button" onClick={() => openSelfie(r.selfieUrl!)} className="rounded-full border border-black/15 px-2.5 py-1 text-xs">
                          {t('acct.viewSelfie')}
                        </button>
                      )}
                      {r.status !== 'APPROVED' && (
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => act(r.id, 'approve')}
                          className="rounded-full bg-black text-white px-2.5 py-1 text-xs font-bold disabled:opacity-50"
                        >
                          {t('acct.approve')}
                        </button>
                      )}
                      {r.status === 'PENDING' && (
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => act(r.id, 'reject')}
                          className="rounded-full border border-red-300 text-red-700 px-2.5 py-1 text-xs font-bold disabled:opacity-50"
                        >
                          {t('acct.reject')}
                        </button>
                      )}
                      {r.status === 'APPROVED' && (
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => act(r.id, 'revoke')}
                          className="rounded-full border border-red-300 text-red-700 px-2.5 py-1 text-xs font-bold disabled:opacity-50"
                        >
                          {t('acct.revoke')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
