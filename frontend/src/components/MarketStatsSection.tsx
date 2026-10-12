import { BarChart3 } from 'lucide-react';
import { getServerMessages } from '../lib/i18n-server';

export default function MarketStatsSection() {
  const messages = getServerMessages();
  const s = messages.marketStats;

  return (
    <section className="rounded-2xl sm:rounded-3xl crystal-card p-5 sm:p-8 space-y-5">
      <div className="space-y-2">
        <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500 inline-flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> {s.kicker}
        </p>
        <h2 className="font-section text-xl sm:text-2xl lg:text-3xl font-extrabold text-black">
          {s.title}
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {s.items.map((item) => (
          <div key={item.n} className="p-4 sm:p-5 rounded-2xl bg-white/60 border border-black/10 space-y-2">
            <div className="font-lcd text-2xl sm:text-3xl font-extrabold text-black leading-none">
              {item.n}
            </div>
            <p className="text-xs sm:text-sm text-neutral-700 leading-snug">{item.label}</p>
            <p className="text-[10px] text-neutral-400 leading-snug">{item.source}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-neutral-500 leading-relaxed">{s.note}</p>
    </section>
  );
}
