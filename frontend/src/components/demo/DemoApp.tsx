'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wallet, ShieldCheck, RotateCcw, Zap, Landmark, BookOpen,
  Briefcase, Rocket,
} from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import {
  useDemoState, connectWallet, disconnectWallet, airdrop, verifyKyc,
  resetDemo, shortPk, fmt,
} from './lib';
import EmisionPanel from './EmisionPanel';
import PrimarioPanel from './PrimarioPanel';
import OrderbookPanel from './OrderbookPanel';
import PortfolioPanel from './PortfolioPanel';

export type DemoTab = 'emision' | 'primario' | 'orderbook' | 'portfolio';

const TAB_ROUTES: Record<DemoTab, string> = {
  emision: '/emision',
  primario: '/licitaciones',
  orderbook: '/orderbook',
  portfolio: '/portfolio',
};

const TABS: { id: DemoTab; icon: ReactNode }[] = [
  { id: 'emision', icon: <Landmark size={15} /> },
  { id: 'primario', icon: <Rocket size={15} /> },
  { id: 'orderbook', icon: <BookOpen size={15} /> },
  { id: 'portfolio', icon: <Briefcase size={15} /> },
];

export default function DemoApp({ tab }: { tab: DemoTab }) {
  const s = useDemoState();
  const { t } = useI18n();
  const router = useRouter();
  const setTab = (id: DemoTab) => router.push(TAB_ROUTES[id]);
  const w = s.wallet;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif italic text-3xl sm:text-4xl">{t('demo.title')}</h1>
            <span className="rounded-full bg-purple-100 text-purple-800 border border-purple-200 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
              {t('demo.badge')}
            </span>
          </div>
          <p className="mt-1 text-sm text-black/60 max-w-2xl">
            {t('demo.lead')}
          </p>
        </div>
        <button
          onClick={() => { if (confirm(t('demo.resetConfirm'))) resetDemo(); }}
          className="flex items-center gap-1.5 rounded-full border border-brand-border px-3 py-1.5 text-xs text-black/60 hover:text-black hover:border-black/30 transition"
        >
          <RotateCcw size={13} /> {t('demo.reset')}
        </button>
      </div>

      {/* Wallet bar */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-brand-border bg-brand-card p-3 shadow-sm">
        {!w.connected ? (
          <button
            onClick={connectWallet}
            className="flex items-center gap-2 rounded-full bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-700 transition"
          >
            <Wallet size={15} /> {t('demo.connect')}
          </button>
        ) : (
          <>
            <span className="flex items-center gap-2 rounded-full bg-black/[.04] px-3 py-1.5 font-lcd text-xs">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {shortPk(w.pubkey)}
            </span>
            <span className="rounded-full bg-black/[.04] px-3 py-1.5 font-lcd text-xs">
              {fmt(w.sol, 2)} SOL
            </span>
            <span className="rounded-full bg-black/[.04] px-3 py-1.5 font-lcd text-xs">
              {fmt(w.usdc)} USDC
            </span>
            {w.usdcLocked > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1.5 font-lcd text-xs text-amber-800">
                {fmt(w.usdcLocked)} {t('demo.inOrders')}
              </span>
            )}
            {!w.kycVerified ? (
              <button
                onClick={verifyKyc}
                className="flex items-center gap-1.5 rounded-full border border-leaf-400 bg-leaf-50 px-3 py-1.5 text-xs font-bold text-leaf-400 hover:bg-leaf-100 transition"
              >
                <ShieldCheck size={13} /> {t('demo.verifyKyc')}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-leaf-100 px-3 py-1.5 text-xs font-bold text-brand-accent">
                <ShieldCheck size={13} /> {t('demo.kycOk')}
              </span>
            )}
            <button
              onClick={airdrop}
              className="flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 transition"
            >
              <Zap size={13} /> {t('demo.airdrop')}
            </button>
            <button
              onClick={disconnectWallet}
              className="ml-auto text-xs text-black/40 hover:text-black/70 transition"
            >
              {t('demo.disconnect')}
            </button>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-4 flex flex-wrap gap-1 rounded-full border border-brand-border bg-white p-1 w-fit">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${
              tab === tb.id
                ? 'bg-black text-white'
                : 'text-black/60 hover:text-black'
            }`}
          >
            {tb.icon} {t(`demo.tabs.${tb.id}`)}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'emision' && <EmisionPanel />}
        {tab === 'primario' && <PrimarioPanel />}
        {tab === 'orderbook' && <OrderbookPanel />}
        {tab === 'portfolio' && <PortfolioPanel />}
      </div>
    </div>
  );
}
