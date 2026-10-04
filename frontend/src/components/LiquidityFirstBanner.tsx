import React from 'react';
import Link from 'next/link';
import { Zap, Droplets, ShieldCheck, ArrowRight, Activity, Sparkles } from 'lucide-react';
import { getServerMessages } from '../lib/i18n-server';

export default function LiquidityFirstBanner() {
  const messages = getServerMessages();
  const cards = [
    [Zap, messages.liquidity.cards[0][0], messages.liquidity.cards[0][1]],
    [Activity, messages.liquidity.cards[1][0], messages.liquidity.cards[1][1]],
    [ShieldCheck, messages.liquidity.cards[2][0], messages.liquidity.cards[2][1]],
  ] as const;

  return (
    <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl crystal-card p-5 sm:p-8 lg:p-12">
      <div className="absolute -top-20 -right-16 w-72 h-72 bg-leaf-200 rounded-full blur-3xl opacity-70 pointer-events-none" />
      <div className="relative z-10 space-y-6 sm:space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-black/10 text-neutral-600 text-xs font-section font-bold uppercase tracking-wider">
            <Droplets className="w-3.5 h-3.5" />
            {messages.liquidity.kicker}
          </div>
          <div className="font-lcd text-xs text-black border border-black/10 px-3 py-1 rounded-xl bg-white/80">
            T+0 · &lt; 4s
          </div>
        </div>
        <h2 className="font-section text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black leading-snug max-w-3xl">
          {messages.liquidity.title}
        </h2>
        <p className="text-neutral-600 text-sm sm:text-base max-w-3xl leading-relaxed">
          {messages.liquidity.body}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {cards.map(([Icon, title, desc]) => (
            <div key={title} className="p-5 rounded-2xl border border-black/10 bg-white/70 space-y-2">
              <Icon className="w-5 h-5" />
              <h3 className="font-section font-extrabold">{title}</h3>
              <p className="text-sm text-neutral-600">{desc}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3 border-t border-black/10 pt-4">
          <span className="text-xs text-neutral-500 flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" /> Argentina Builder Challenge
          </span>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Link href="/orderbook" className="flex-1 sm:flex-none justify-center px-5 py-2.5 btn-lcd btn-lcd-solid text-xs">
              {messages.nav.orderbook} <ArrowRight className="w-3.5 h-3.5" />
            </Link>

          </div>
        </div>
      </div>
    </section>
  );
}
