'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { API_BASE_URL } from '../../lib/api';
import { isVisibleListing } from '../../lib/listings';
import { Pool } from '../../lib/mock-data';
import { useI18n } from '../../context/I18nContext';
import { formatInt } from '../../lib/format';

export default function MarketPage() {
  const [pools, setPools] = useState<(Pool & { validation?: any; tokenTicker?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/market/pools`)
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json?.data) && json.data.length) {
          setPools(json.data.filter((p: any) => isVisibleListing(p.id)));
        } else {
          setPools([]);
        }
      })
      .catch(() => setPools([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8 py-6">
      <div className="rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        {t('market.honestyBanner')}
      </div>
      <div>
        <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500">{t('market.kicker')}</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display">{t('market.title')}</h1>
        <p className="text-neutral-600 max-w-xl mt-1">
          {t(pools.filter((p) => p.status === 'OPEN').length === 1 ? 'market.openOne' : 'market.openMany', {
            n: pools.filter((p) => p.status === 'OPEN').length,
          })}
        </p>
        <p className="text-xs text-neutral-500 mt-2">
          {t('market.live')}
        </p>
      </div>
      {loading && <p className="text-sm text-neutral-500">{t('market.loading')}</p>}
      {!loading && pools.length === 0 && (
        <p className="text-sm text-neutral-500">{t('market.empty')}</p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {pools.map((pool) => {
          const progress = Math.min(100, Math.round((pool.raisedAmount / pool.hardCap) * 100));
          const unit = (pool as any).paymentKind === 'XLM' ? 'SOL' : 'USDC';
          return (
            <article key={pool.id} className="p-6 rounded-3xl crystal-card space-y-4 flex flex-col">
              <div className="flex justify-between gap-2">
                <span className="text-xs font-lcd text-[#3f8f38]">{pool.tna}% TNA USD</span>
                <span className="text-[10px] uppercase text-neutral-500">{pool.status}</span>
              </div>
              <h2 className="font-section text-xl font-extrabold leading-tight">{pool.title}</h2>
              <p className="text-sm text-neutral-600">{pool.producerName}</p>
              {(pool as any).tokenTicker && (
                <p className="text-xs font-mono">Token {(pool as any).tokenTicker} · ISIN {(pool as any).isin}</p>
              )}
              <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                <div className="h-full bg-black" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-neutral-500">
                {formatInt(pool.raisedAmount)} / {formatInt(pool.hardCap)} {unit}
                {pool.minInvestment ? ` · ${t('market.min')} ${formatInt(pool.minInvestment)} ${unit}` : ''}
              </p>
              <Link href={`/market/${pool.id}`} className="inline-flex items-center gap-2 text-sm font-display font-bold pt-2">
                {t('market.viewDossier')} <ArrowRight className="w-4 h-4" />
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
