'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Coins, Copy, ExternalLink, KeyRound, ShieldCheck } from 'lucide-react';
import SoftKycNotice from '../../components/SoftKycNotice';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import { API_BASE_URL, bearerHeaders } from '../../lib/api';
import { explorerAddress } from '../../lib/explorer';
import { isDevnetSoftKyc } from '../../lib/devnetMode';
import { ensureUsdcReady } from '../../lib/usdc';

type Position = {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  shares: number;
  costBasis: number;
  marketValue: number;
  listingStatus: string;
};

type Portfolio = {
  usdcOnChain: number;
  solOnChain: number;
  positions: Position[];
  totals: { costBasis: number; marketValue: number };
};

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');

export default function DashboardPage() {
  const { user, token } = useAuth();
  const { t } = useI18n();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [onChain, setOnChain] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [funding, setFunding] = useState<'idle' | 'working' | 'done' | 'fail'>('idle');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [p, h] = await Promise.all([
        fetch(`${API_BASE_URL}/api/portfolio`, { headers: bearerHeaders(token) }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/health`).then((r) => r.json()),
      ]);
      if (p.success) setPortfolio(p.data);
      else setError(p.message || t('acct.errorGeneric'));
      setOnChain(Boolean(h.onChain));
    } catch {
      setError(t('err.apiDown'));
    }
  }, [token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestFunds = useCallback(async () => {
    if (!token || funding === 'working') return;
    setFunding('working');
    try {
      await ensureUsdcReady(token);
      setFunding('done');
      await load();
    } catch {
      setFunding('fail');
    }
  }, [token, funding, load]);

  if (!user) return null;
  const custodial = user.custodyMode === 'CUSTODIAL';

  return (
    <div className="py-6">
      <h1 className="font-serif italic text-3xl sm:text-4xl">{t('dash.hello', { name: user.name || user.email })}</h1>

      <SoftKycNotice className="mt-3" />

      {onChain !== null && (
        <p
          className={`mt-3 rounded-xl border px-4 py-2.5 text-xs ${
            onChain ? 'border-leaf-200 bg-leaf-50 text-brand-accent' : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {onChain ? t('acct.onchainNote') : t('acct.sandboxNote')}
        </p>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-black/50">{t('acct.walletLabel')}</p>
            <span className="flex items-center gap-1.5 rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-bold">
              {custodial ? <ShieldCheck size={12} /> : <KeyRound size={12} />}
              {custodial ? t('acct.custodyCustodial') : t('acct.custodySelf')}
            </span>
          </div>
          <p className="mt-2 font-lcd text-sm break-all">{user.publicKey || '—'}</p>
          {user.publicKey && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(user.publicKey);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="flex items-center gap-1.5 rounded-full border border-black/15 px-3 py-1.5 text-xs font-bold hover:bg-black/[0.04]"
              >
                <Copy size={12} /> {copied ? t('misc.copied') : t('misc.copy')}
              </button>
              <a
                href={explorerAddress(user.publicKey)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-black/15 px-3 py-1.5 text-xs font-bold hover:bg-black/[0.04]"
              >
                <ExternalLink size={12} /> {t('acct.explorer')}
              </a>
            </div>
          )}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-black/[0.03] p-3">
              <p className="text-[11px] text-black/50">SOL</p>
              <p className="font-lcd text-lg">{portfolio ? fmt(portfolio.solOnChain, 4) : '…'}</p>
            </div>
            <div className="rounded-xl bg-black/[0.03] p-3">
              <p className="text-[11px] text-black/50">{t('acct.usdc')}</p>
              <p className="font-lcd text-lg">{portfolio ? fmt(portfolio.usdcOnChain) : '…'}</p>
            </div>
          </div>
          {isDevnetSoftKyc() && user.publicKey && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void requestFunds()}
                disabled={funding === 'working'}
                className="flex items-center gap-1.5 rounded-full bg-brand-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                <Coins size={13} /> {funding === 'working' ? t('acct.faucetWorking') : t('acct.faucetCta')}
              </button>
              {funding === 'done' && <p className="mt-1.5 text-xs text-brand-accent">{t('acct.faucetDone')}</p>}
              {funding === 'fail' && <p className="mt-1.5 text-xs text-red-700">{t('acct.faucetFail')}</p>}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-black/50">{t('acct.kyc')}</p>
          <p className="mt-2 font-display font-bold text-xl">{t(`acct.kyc${user.kycStatus}`)}</p>
          {user.legalName && <p className="mt-1 text-sm text-black/60">{user.legalName}</p>}
          {user.cuit && <p className="text-xs text-black/50">CUIT {user.cuit}</p>}
          <p className="mt-4 text-xs text-black/50">{user.email}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">{t('acct.holdings')}</h2>
          <Link href="/mercado" className="text-xs font-bold underline underline-offset-2">
            {t('acct.goMarket')}
          </Link>
        </div>
        {!portfolio?.positions.length ? (
          <p className="mt-3 text-sm text-black/60">{t('acct.noHoldings')}</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <tbody>
              {portfolio.positions.map((p) => (
                <tr key={p.listingId} className="border-t border-black/5">
                  <td className="py-2.5">
                    <p className="font-bold">{p.tokenTicker}</p>
                    <p className="text-xs text-black/50">{p.legalName}</p>
                  </td>
                  <td className="py-2.5 text-right font-lcd">{fmt(p.shares, 4)}</td>
                  <td className="py-2.5 text-right font-lcd">${fmt(p.marketValue)}</td>
                  <td className="py-2.5 text-right text-xs text-black/50">{p.listingStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
    </div>
  );
}
