'use client';

import React, { useState } from 'react';
import {
  Activity,
  ShieldAlert,
  AlertTriangle,
  Scale,
  Users,
  CheckCircle2,
  Lock,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { useI18n } from '../../../context/I18nContext';

interface TokenHolder {
  address: string;
  name: string;
  /** i18n key used instead of `name` when present. */
  nameKey?: string;
  tokensHeld: number;
  percentage: number;
  isDominant: boolean;
}

const INITIAL_HOLDERS: TokenHolder[] = [
  {
    address: 'GD6CGAZZY4Z2HQAIBL4RHJJWHJULLCO5F5XW6VL3CECJWLDBCDKWB7KR',
    name: 'Fondo de Inversión Agrícola Sur (Dominante)',
    nameKey: 'admOpa.holderDominant',
    tokensHeld: 262000,
    percentage: 52.4,
    isDominant: true,
  },
  {
    address: 'GB78A...9182',
    name: 'Cresud S.A.C.I.F. y A.',
    tokensHeld: 95000,
    percentage: 19.0,
    isDominant: false,
  },
  {
    address: 'GC23M...4419',
    name: 'Molinos Agro S.A.',
    tokensHeld: 60000,
    percentage: 12.0,
    isDominant: false,
  },
  {
    address: 'GDK81...5520',
    name: 'Minoristas en Manifest (142 cuentas)',
    nameKey: 'admOpa.holderRetail',
    tokensHeld: 83000,
    percentage: 16.6,
    isDominant: false,
  },
];

export default function AdminOpaPage() {
  const { t } = useI18n();
  const [holders, setHolders] = useState<TokenHolder[]>(INITIAL_HOLDERS);
  const [dominantPercent, setDominantPercent] = useState<number>(52.4);
  const [opaState, setOpaState] = useState<'NORMAL' | 'OPA_ACTIVE' | 'SQUEEZE_OUT'>('OPA_ACTIVE');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleTriggerOpa = () => {
    setOpaState('OPA_ACTIVE');
    setActionMessage(t('admOpa.opaMsg'));
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleSimulateSqueezeOut = () => {
    setDominantPercent(96.2);
    setHolders((prev) => [
      { ...prev[0], percentage: 96.2, tokensHeld: 481000 },
      { ...prev[1], percentage: 1.8, tokensHeld: 9000 },
      { ...prev[2], percentage: 1.0, tokensHeld: 5000 },
      { ...prev[3], percentage: 1.0, tokensHeld: 5000 },
    ]);
    setOpaState('SQUEEZE_OUT');
    setActionMessage(t('admOpa.squeezeMsg'));
    setTimeout(() => setActionMessage(null), 5000);
  };

  return (
    <div className="space-y-8 py-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-semibold uppercase tracking-wider">
          <Activity className="w-3.5 h-3.5 shrink-0" />
          {t('admOpa.kicker')}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
          {t('admOpa.title')}
        </h1>
        <p className="text-neutral-600 text-xs sm:text-sm max-w-2xl">
          {t('admOpa.lead')}
        </p>
      </div>

      {/* Threshold Status Banner */}
      <div className="p-6 rounded-3xl crystal-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-black">{t('admOpa.gov')}</h3>
            <p className="text-xs text-neutral-600">{t('admOpa.dominantPre')} <strong className="text-black font-mono">{dominantPercent}%</strong> {t('admOpa.dominantPost')}</p>
          </div>

          <div className="flex items-center gap-2">
            {dominantPercent >= 95 ? (
              <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-200 text-xs font-bold font-mono">
                {t('admOpa.squeezeOn')}
              </span>
            ) : dominantPercent >= 50 ? (
              <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs font-bold font-mono">
                {t('admOpa.opaOn')}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-leaf-100 text-[#2f6f28] border border-[#8fcb7a]/50 text-xs font-bold font-mono">
                {t('admOpa.normal')}
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar of Dominance */}
        <div className="space-y-1.5">
          <div className="relative w-full h-4 bg-black/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                dominantPercent >= 95
                  ? 'bg-purple-500'
                  : dominantPercent >= 50
                  ? 'bg-gradient-to-r from-yellow-500 to-red-500'
                  : 'bg-[#7ed86a]'
              }`}
              style={{ width: `${dominantPercent}%` }}
            />
            {/* 50% OPA line marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500"
              style={{ left: '50%' }}
              title={t('admOpa.opaThreshold')}
            />
            {/* 95% Squeeze-out line marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-purple-500"
              style={{ left: '95%' }}
              title={t('admOpa.squeezeThreshold')}
            />
          </div>

          <div className="grid grid-cols-2 gap-1 sm:flex sm:justify-between text-[10px] sm:text-[11px] text-neutral-500 font-mono">
            <span>0%</span>
            <span className="text-red-700 font-bold">50% OPA</span>
            <span className="text-purple-700 font-bold">95% Squeeze</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 rounded-xl bg-leaf-100 border border-[#8fcb7a]/50 text-[#2f6f28] text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Holders Table & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Table (8 Cols) */}
        <div className="lg:col-span-8 rounded-3xl crystal-card overflow-hidden">
          <div className="p-4 bg-black/5 border-b border-black/8 flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center">
            <span className="text-xs font-bold text-black uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-[#2f6f28] shrink-0" />
              {t('admOpa.holders')}
            </span>
            <span className="text-[11px] text-neutral-500 font-mono">{t('admOpa.totalTokens', { n: '500,000' })}</span>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-black/8">
            {holders.map((holder, idx) => (
              <div key={idx} className={`p-4 space-y-2 ${holder.isDominant ? 'bg-red-50' : ''}`}>
                <div className="font-bold text-black text-xs break-words">{holder.nameKey ? t(holder.nameKey) : holder.name}</div>
                {holder.isDominant && (
                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                    {t('admOpa.obliged')}
                  </span>
                )}
                <div className="font-mono text-[11px] text-neutral-500 break-all">{holder.address}</div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-black">{holder.tokensHeld.toLocaleString()} {t('admOpa.tokensUnit')}</span>
                  <span className={holder.percentage >= 50 ? 'text-red-700 font-bold' : 'text-neutral-700'}>
                    {holder.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[36rem]">
              <thead className="text-neutral-500 font-mono text-[11px] uppercase border-b border-black/8 bg-black/5">
                <tr>
                  <th className="px-4 py-3">{t('admOpa.thHolder')}</th>
                  <th className="px-4 py-3">{t('admOpa.thAddress')}</th>
                  <th className="px-4 py-3 text-right">{t('admOpa.thTokens')}</th>
                  <th className="px-4 py-3 text-right">{t('admOpa.thPct')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/8">
                {holders.map((holder, idx) => (
                  <tr key={idx} className={holder.isDominant ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3">
                      <div className="font-bold text-black text-xs">{holder.nameKey ? t(holder.nameKey) : holder.name}</div>
                      {holder.isDominant && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                          {t('admOpa.obliged')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-neutral-500">
                      <span className="truncate block max-w-[140px]">{holder.address}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-black">
                      {holder.tokensHeld.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      <span className={holder.percentage >= 50 ? 'text-red-700' : 'text-neutral-700'}>
                        {holder.percentage.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Simulation Controls (4 Cols) */}
        <div className="lg:col-span-4 p-6 rounded-3xl crystal-card space-y-5">
          <h3 className="text-sm font-bold text-black uppercase tracking-wider">{t('admOpa.actions')}</h3>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleTriggerOpa}
              className="w-full py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
            >
              <Zap className="w-3.5 h-3.5" />
              {t('admOpa.notifyOpa')}
            </button>

            <button
              type="button"
              onClick={handleSimulateSqueezeOut}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
            >
              <Scale className="w-3.5 h-3.5" />
              {t('admOpa.simSqueeze')}
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-black/5 border border-black/8 space-y-2 text-xs text-neutral-600">
            <div className="flex items-center gap-1.5 text-black font-semibold text-xs">
              <Scale className="w-4 h-4 text-[#2f6f28]" /> {t('admOpa.legalTitle')}
            </div>
            <p className="text-[11px] leading-relaxed">
              <strong>{t('admOpa.art86Label')}</strong> {t('admOpa.art86Body')}
            </p>
            <p className="text-[11px] leading-relaxed">
              <strong>{t('admOpa.art91Label')}</strong> {t('admOpa.art91Body')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
