'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import {
  useDemoState, contribute, refund, ensureAta, fmt, fmtInt,
} from './lib';

export default function PrimarioPanel() {
  const s = useDemoState();
  const { t, locale } = useI18n();
  const w = s.wallet;
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notices, setNotices] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const setNotice = (id: string, ok: boolean, msg: string) =>
    setNotices((p) => ({ ...p, [id]: { ok, msg } }));

  const open = s.listings.filter((l) => l.status === 'LISTED');
  const failed = s.listings.filter(
    (l) => l.status === 'CLOSED_FAILED' &&
      l.contributions.some((c) => c.wallet === w.pubkey && !c.refunded),
  );

  return (
    <div className="space-y-4">
      {!w.kycVerified && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-center gap-2">
          <ShieldCheck size={16} />
          {t('demo.primario.kycBanner')}
        </div>
      )}

      {open.length === 0 && (
        <div className="rounded-2xl border border-brand-border bg-brand-card p-6 text-sm text-black/50">
          {t('demo.primario.none')}
        </div>
      )}

      {open.map((l) => {
        const d = l.dossier;
        const amount = Number(amounts[l.id] || '') || 0;
        const pct = Math.min(100, (l.raisedUsdc / d.offeringHardCapUsdc) * 100);
        const hasAta = !!w.atas[d.tokenTicker];
        return (
          <div key={l.id} className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-bold text-lg">
                  {d.tokenTicker} <span className="font-normal text-sm text-black/50">{d.legalName}</span>
                </div>
                <div className="text-xs text-black/50 mt-0.5">
                  {d.sector} · ISIN {d.isin} · CNV {d.cnvRecordId} · USDC (SPL)
                </div>
              </div>
              <div className="text-right">
                <div className="font-lcd text-xl font-bold">{fmt(d.pricePerShareUsdc)} <span className="text-xs font-normal text-black/45">USDC</span></div>
                <div className="text-[11px] text-black/45">{t('demo.primario.perUnit')}</div>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex justify-between text-[11px] text-black/50 mb-1">
                <span>{t('demo.primario.raised')} <b>{fmt(l.raisedUsdc)} USDC</b></span>
                <span>{t('demo.primario.caps', { soft: fmtInt(d.offeringSoftCapUsdc), hard: fmtInt(d.offeringHardCapUsdc) })}</span>
              </div>
              <div className="h-2 rounded-full bg-black/[.06] overflow-hidden">
                <div className={`h-full ${l.raisedUsdc >= d.offeringSoftCapUsdc ? 'bg-leaf-400' : 'bg-amber-400'}`}
                     style={{ width: `${pct}%` }} />
              </div>
              {l.deadlineAt && (
                <div className="mt-1 text-[11px] text-black/45">
                  {t('demo.primario.closes', { date: new Date(l.deadlineAt).toLocaleDateString(locale === 'es' ? 'es-AR' : 'en-US') })}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                value={amounts[l.id] || ''}
                onChange={(e) => setAmounts((p) => ({ ...p, [l.id]: e.target.value }))}
                placeholder={t('demo.primario.amountPh')}
                inputMode="decimal"
                className="w-64 rounded-xl border border-brand-border bg-white px-3 py-2 text-sm font-lcd outline-none focus:border-black/40"
              />
              {w.connected && !hasAta && (
                <button
                  onClick={() => ensureAta(d.tokenTicker)}
                  className="rounded-full border border-purple-300 bg-purple-50 px-4 py-2 text-xs font-bold text-purple-700 hover:bg-purple-100 transition"
                >
                  {t('demo.primario.createAta', { tk: d.tokenTicker })}
                </button>
              )}
              <button
                onClick={() => {
                  const err = contribute(l.id, amount);
                  setNotice(l.id, !err, err
                    ? t(err.key, err.vars)
                    : t('demo.primario.contributeOk', {
                        n: fmt(amount),
                        u: fmt(amount / d.pricePerShareUsdc, 2),
                        tk: d.tokenTicker,
                      }));
                }}
                className="rounded-full bg-black px-5 py-2 text-sm font-bold text-white hover:bg-black/85 transition"
              >
                {t('demo.primario.contributeBtn')}
              </button>
              {amount > 0 && (
                <span className="text-xs text-black/50 font-lcd">
                  {t('demo.primario.units', { u: fmt(amount / d.pricePerShareUsdc, 2), tk: d.tokenTicker })}
                </span>
              )}
            </div>
            {notices[l.id] && (
              <div className={`mt-2 text-xs ${notices[l.id].ok ? 'text-brand-accent font-bold' : 'text-red-600'}`}>
                {notices[l.id].msg}
              </div>
            )}
          </div>
        );
      })}

      {failed.map((l) => (
        <div key={l.id} className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="font-bold text-red-800">{t('demo.primario.failedTitle', { tk: l.dossier.tokenTicker })}</div>
          <p className="mt-1 text-xs text-red-700">{t('demo.primario.failedBody')}</p>
          <button
            onClick={() => {
              const err = refund(l.id);
              setNotice(l.id, !err, err ? t(err.key, err.vars) : t('demo.primario.refundOk'));
            }}
            className="mt-3 rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition"
          >
            {t('demo.primario.refundBtn')}
          </button>
          {notices[l.id] && <div className={`mt-2 text-xs ${notices[l.id].ok ? 'font-bold text-red-700' : 'text-red-700'}`}>{notices[l.id].msg}</div>}
        </div>
      ))}
    </div>
  );
}
