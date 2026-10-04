'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Bot } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import {
  useDemoState, getBook, getTrades, getCandles, placeOrder, cancelOrder,
  simulateMarket, ensureAta, fmt, fmtInt, shortPk, explorerTx, Candle,
} from './lib';

function CandleChart({ candles }: { candles: Candle[] }) {
  if (candles.length < 2) return null;
  const W = 640, H = 150, PAD = 10;
  const lo = Math.min(...candles.map((c) => c.l));
  const hi = Math.max(...candles.map((c) => c.h));
  const range = Math.max(hi - lo, 0.01);
  const bw = (W - PAD * 2) / candles.length;
  const y = (p: number) => PAD + (1 - (p - lo) / range) * (H - PAD * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {candles.map((c, i) => {
        const x = PAD + i * bw + bw / 2;
        const up = c.c >= c.o;
        const col = up ? '#059669' : '#dc2626';
        const top = Math.min(y(c.o), y(c.c));
        const body = Math.max(1.5, Math.abs(y(c.o) - y(c.c)));
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1} />
            <rect x={x - bw * 0.32} y={top} width={Math.max(1.5, bw * 0.64)} height={body} fill={col} rx={0.5} />
          </g>
        );
      })}
    </svg>
  );
}

export default function OrderbookPanel() {
  const s = useDemoState();
  const { t, locale } = useI18n();
  const w = s.wallet;
  const markets = s.listings.filter((l) => l.status === 'CLOSED_SUCCESS' && l.marketAddress);
  const [sel, setSel] = useState('');
  const active = markets.find((m) => m.id === sel) || markets[0];
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);

  const book = active ? getBook(active.id) : null;
  const trades = active ? getTrades(active.id) : [];
  const candles = active ? getCandles(active.id) : [];

  if (markets.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-border bg-brand-card p-6 text-sm text-black/50">
        {t('demo.ob.none')}
      </div>
    );
  }
  if (!active || !book) return null;

  const tk = active.dossier.tokenTicker;
  const h = w.holdings[tk] || { free: 0, locked: 0 };
  const hasAta = !!w.atas[tk];
  const bestBid = book.bids[0]?.price ?? null;
  const bestAsk = book.asks[0]?.price ?? null;
  const spread = bestBid && bestAsk ? bestAsk - bestBid : null;
  const maxDepth = Math.max(
    ...book.bids.map((b) => b.amount),
    ...book.asks.map((a) => a.amount),
    1,
  );

  const submit = () => {
    setNotice(null);
    const err = placeOrder(active.id, side, Number(price), Number(amount));
    setNotice(err
      ? { ok: false, msg: t(err.key, err.vars) }
      : { ok: true, msg: t('demo.ob.orderOk', { side: t(side === 'BUY' ? 'demo.ob.sideBuy' : 'demo.ob.sideSell') }) });
    if (!err) { setPrice(''); setAmount(''); }
  };

  const lvl = (px: number, amt: number, isAsk: boolean) => (
    <button
      key={`${px}-${amt}`}
      type="button"
      title={t('demo.ob.pickPrice')}
      onClick={() => { setPrice(String(px)); setSide(isAsk ? 'BUY' : 'SELL'); }}
      className="relative flex w-full justify-between px-3 py-1 font-lcd text-xs cursor-pointer hover:bg-black/[.05] transition"
    >
      <div
        className={`absolute inset-y-0 right-0 ${isAsk ? 'bg-red-100/70' : 'bg-leaf-100'}`}
        style={{ width: `${(amt / maxDepth) * 100}%` }}
      />
      <span className={`relative ${isAsk ? 'text-red-600' : 'text-emerald-700'}`}>{fmt(px)}</span>
      <span className="relative text-black/70">{fmtInt(amt)}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Market selector */}
      <div className="flex flex-wrap items-center gap-2">
        {markets.map((m) => (
          <button
            key={m.id}
            onClick={() => { setSel(m.id); setNotice(null); }}
            className={`rounded-full border px-4 py-1.5 text-sm font-bold transition ${
              active.id === m.id
                ? 'border-black bg-black text-white'
                : 'border-brand-border text-black/60 hover:text-black'
            }`}
          >
            {m.dossier.tokenTicker}/USDC
          </button>
        ))}
        <button
          onClick={() => simulateMarket(active.id)}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-brand-border px-3 py-1.5 text-xs font-bold text-black/60 hover:text-black transition"
        >
          <Bot size={13} /> {t('demo.ob.simulate')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          [t('demo.ob.last'), fmt(active.lastPrice)],
          [t('demo.ob.bestBid'), bestBid ? fmt(bestBid) : '—'],
          [t('demo.ob.bestAsk'), bestAsk ? fmt(bestAsk) : '—'],
          [t('demo.ob.spread'), spread ? fmt(spread) : '—'],
          [t('demo.ob.market'), shortPk(active.marketAddress)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-brand-border bg-brand-card p-3 text-center">
            <div className="font-lcd text-sm font-bold truncate">{v}</div>
            <div className="text-[10px] uppercase tracking-wide text-black/45">{k}</div>
          </div>
        ))}
      </div>

      {/* Candle chart */}
      <div className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-black/45">
            {t('demo.ob.trend')} · {tk}/USDC
          </span>
          <span className="font-lcd text-xs text-black/40">{candles.length} candles</span>
        </div>
        <CandleChart candles={candles} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {/* Book */}
        <div className="rounded-2xl border border-brand-border bg-brand-card shadow-sm overflow-hidden">
          <div className="flex justify-between border-b border-brand-border px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-black/45">
            <span>{t('demo.ob.priceCol')}</span><span>{t('demo.ob.amountCol', { tk })}</span>
          </div>
          <div className="py-1">
            {book.asks.slice(0, 8).reverse().map((a) => lvl(a.price, a.amount, true))}
          </div>
          <div className="border-y border-brand-border bg-black/[.03] px-3 py-1.5 text-center font-lcd text-sm font-bold">
            {fmt(active.lastPrice)} USDC
          </div>
          <div className="py-1">
            {book.bids.slice(0, 8).map((b) => lvl(b.price, b.amount, false))}
          </div>
        </div>

        <div className="space-y-4">
          {/* Order form */}
          <div className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
            <div className="flex gap-1 rounded-full bg-black/[.05] p-1 w-fit">
              {(['BUY', 'SELL'] as const).map((sd) => (
                <button
                  key={sd}
                  onClick={() => setSide(sd)}
                  className={`flex items-center gap-1 rounded-full px-4 py-1.5 text-xs font-bold transition ${
                    side === sd
                      ? sd === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                      : 'text-black/60'
                  }`}
                >
                  {sd === 'BUY' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                  {t(sd === 'BUY' ? 'demo.ob.buy' : 'demo.ob.sell')}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label>
                <span className="block text-xs text-black/60 mb-1">{t('demo.ob.priceLabel')}</span>
                <input
                  value={price} onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal" placeholder={fmt(active.lastPrice)}
                  className="w-full rounded-xl border border-brand-border px-3 py-2 text-sm font-lcd outline-none focus:border-black/40"
                />
              </label>
              <label>
                <span className="block text-xs text-black/60 mb-1">{t('demo.ob.amountLabel', { tk })}</span>
                <input
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  className="w-full rounded-xl border border-brand-border px-3 py-2 text-sm font-lcd outline-none focus:border-black/40"
                />
              </label>
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-black/50">
              <span>{t('demo.ob.available')} <b className="font-lcd">{fmt(w.usdc)} USDC</b></span>
              <span>{tk}: <b className="font-lcd">
                {t('demo.ob.free', { n: fmtInt(h.free) })}
                {h.locked ? t('demo.ob.lockedPart', { n: fmtInt(h.locked) }) : ''}
              </b></span>
            </div>
            {w.connected && !hasAta && (
              <button
                onClick={() => ensureAta(tk)}
                className="mt-2 w-full rounded-full border border-purple-300 bg-purple-50 px-4 py-2 text-xs font-bold text-purple-700 hover:bg-purple-100 transition"
              >
                {t('demo.ob.createAta', { tk })}
              </button>
            )}
            <button
              onClick={submit}
              className={`mt-3 w-full rounded-full py-2.5 text-sm font-bold text-white transition ${
                side === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {t(side === 'BUY' ? 'demo.ob.buy' : 'demo.ob.sell')} {tk}
            </button>
            {notice && (
              <div className={`mt-2 text-xs ${notice.ok ? 'text-brand-accent font-bold' : 'text-red-600'}`}>
                {notice.msg}
              </div>
            )}
          </div>

          {/* My orders */}
          <div className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wide text-black/45 mb-2">
              {t('demo.ob.myOrders')}
            </div>
            {book.myOrders.length === 0 ? (
              <div className="text-xs text-black/40">{t('demo.ob.noOrders')}</div>
            ) : (
              <div className="space-y-1">
                {book.myOrders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-lg bg-black/[.03] px-3 py-1.5 font-lcd text-xs">
                    <span className={o.side === 'BUY' ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>
                      {o.side === 'BUY' ? t('demo.ob.takerBuy').toUpperCase() : t('demo.ob.takerSell').toUpperCase()}
                    </span>
                    <span>{fmtInt(o.remaining)} @ {fmt(o.price)}</span>
                    <button
                      onClick={() => cancelOrder(o.id)}
                      className="text-black/40 hover:text-red-600 font-body font-bold"
                    >
                      {t('demo.ob.cancel')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trades */}
      <div className="rounded-2xl border border-brand-border bg-brand-card p-4 shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-wide text-black/45 mb-2">
          {t('demo.ob.trades')}
        </div>
        {trades.length === 0 ? (
          <div className="text-xs text-black/40">{t('demo.ob.noTrades')}</div>
        ) : (
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-xs font-lcd">
              <thead className="text-left text-black/40">
                <tr>
                  <th className="py-1">{t('demo.ob.price')}</th><th>{t('demo.ob.amount')}</th>
                  <th>{t('demo.ob.taker')}</th><th>{t('demo.ob.sig')}</th>
                  <th className="text-right">{t('demo.ob.time')}</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((tr) => (
                  <tr key={tr.id} className="border-t border-black/[.05]">
                    <td className={`py-1.5 ${tr.takerSide === 'BUY' ? 'text-emerald-700' : 'text-red-600'}`}>
                      {fmt(tr.price)}
                    </td>
                    <td>{fmtInt(tr.amount)}</td>
                    <td>{tr.takerSide === 'BUY' ? t('demo.ob.takerBuy') : t('demo.ob.takerSell')}</td>
                    <td>
                      <a href={explorerTx(tr.sig)} target="_blank" rel="noreferrer"
                         className="text-purple-600 hover:underline">
                        {shortPk(tr.sig)}
                      </a>
                    </td>
                    <td className="text-right text-black/40">
                      {new Date(tr.createdAt).toLocaleTimeString(locale === 'es' ? 'es-AR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
