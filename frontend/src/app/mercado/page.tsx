'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useAuth, nextOnboardingPath } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import { API_BASE_URL, bearerHeaders } from '../../lib/api';
import { signAndRelay } from '../../lib/selfCustody';
import { explorerTx } from '../../lib/explorer';

type Pool = {
  id: string;
  title: string;
  producerName: string;
  location: string;
  raisedAmount: number;
  softCap: number;
  hardCap: number;
  tna: number;
  daysRemaining: number;
  minInvestment: number;
  status: string;
  tokenTicker: string;
  onChain: boolean;
};

type ContributeResult = { onChain?: { contributeHash?: string } };

const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—');

function PoolCard({ pool, onDone }: { pool: Pool; onDone: () => void }) {
  const { user, token, refreshUser } = useAuth();
  const { t } = useI18n();
  const [amount, setAmount] = useState(String(pool.minInvestment || 100));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const ready = user && nextOnboardingPath(user) === '/dashboard';
  const open = pool.status === 'OPEN';
  const pct = pool.hardCap > 0 ? Math.min(100, (pool.raisedAmount / pool.hardCap) * 100) : 0;

  const subscribe = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const body = { usdcAmount: Number(amount) };
      let data: ContributeResult;
      if (pool.onChain && user?.custodyMode === 'SELF') {
        // The investor signs in their own wallet; the backend only relays.
        data = await signAndRelay<ContributeResult>({
          prepare: `/api/listings/${pool.id}/contribute/prepare`,
          submit: `/api/listings/${pool.id}/contribute/submit`,
          token,
          body,
        });
      } else {
        const res = await fetch(`${API_BASE_URL}/api/listings/${pool.id}/contribute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...bearerHeaders(token) },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || t('acct.errorGeneric'));
        data = json.data;
      }
      setMsg({ ok: true, text: t('acct.subscribed'), tx: data?.onChain?.contributeHash });
      await refreshUser();
      onDone();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || t('acct.errorGeneric') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display font-bold text-lg">{pool.tokenTicker}</p>
          <p className="text-xs text-black/60">{pool.producerName}</p>
          <p className="text-xs text-black/40">{pool.location}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
            pool.onChain ? 'bg-purple-100 text-purple-800' : 'bg-black/[0.06] text-black/60'
          }`}
        >
          {pool.onChain ? t('acct.onChainBadge') : t('acct.sandboxBadge')}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-black/60">
          <span>{t('acct.raised')}</span>
          <span className="font-lcd">
            {fmt(pool.raisedAmount)} / {fmt(pool.hardCap)} USDC
          </span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-black/10 overflow-hidden">
          <div className="h-full bg-brand-accent" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-black/50">
          <span>TNA {fmt(pool.tna)}%</span>
          <span>{t('acct.daysLeft', { n: pool.daysRemaining })}</span>
        </div>
      </div>

      <div className="mt-4 flex-1" />
      {!user ? (
        <Link href="/login?next=/mercado" className="rounded-xl bg-black text-white py-2.5 text-center text-sm font-bold">
          {t('acct.loginToInvest')}
        </Link>
      ) : !ready ? (
        <Link href={nextOnboardingPath(user)} className="rounded-xl border border-black/15 py-2.5 text-center text-sm font-bold">
          {t('acct.finishOnboarding')}
        </Link>
      ) : open ? (
        <div>
          <label className="text-[11px] text-black/50">
            {t('acct.amount')} · {t('acct.minInv', { n: fmt(pool.minInvestment) })}
          </label>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              min={pool.minInvestment}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-black/15 bg-white px-3 py-2 text-sm font-lcd"
            />
            <button
              type="button"
              disabled={busy || !(Number(amount) > 0)}
              onClick={subscribe}
              className="rounded-xl bg-black text-white px-4 text-sm font-bold disabled:opacity-50"
            >
              {busy ? t('acct.subscribing') : t('acct.subscribe')}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-black/50">{pool.status}</p>
      )}

      {msg && (
        <p className={`mt-3 text-xs ${msg.ok ? 'text-brand-accent' : 'text-red-700'}`}>
          {msg.text}{' '}
          {msg.tx && (
            <a href={explorerTx(msg.tx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
              {t('acct.viewTx')} <ExternalLink size={11} />
            </a>
          )}
        </p>
      )}
    </div>
  );
}

export default function MercadoPage() {
  const { t } = useI18n();
  const [pools, setPools] = useState<Pool[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/market/pools`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setPools(json.data);
    } catch {
      setError(t('err.apiDown'));
      setPools([]);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="py-6">
      <h1 className="font-serif italic text-3xl sm:text-4xl">{t('acct.marketTitle')}</h1>
      <p className="mt-2 text-sm text-black/60">{t('acct.marketLead')}</p>

      {pools === null ? (
        <p className="mt-8 text-sm text-black/50">{t('misc.loading')}</p>
      ) : pools.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-black/15 p-8 text-center text-sm text-black/60">
          {error || t('acct.marketEmpty')}
          <div className="mt-3">
            <Link href="/demo" className="font-bold underline underline-offset-2">
              {t('acct.navDemo')}
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pools.map((p) => (
            <PoolCard key={p.id} pool={p} onDone={load} />
          ))}
        </div>
      )}
    </div>
  );
}
