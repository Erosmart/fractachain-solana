import Link from 'next/link';
import { ArrowRight, ShoppingBasket, LineChart, Landmark, Info } from 'lucide-react';
import { getServerMessages } from '../lib/i18n-server';

const ICONS = [ShoppingBasket, LineChart, Landmark];
const HREFS: (string | null)[] = [null, '/demo?tab=primario', null];

export default function ProductsSection() {
  const messages = getServerMessages();
  const copy = messages.products;

  return (
    <section className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500">{copy.kicker}</p>
          <h2 className="font-section text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black mt-1">{copy.title}</h2>
        </div>
        <p className="text-sm text-neutral-600 max-w-md">
          {copy.lead}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 items-stretch">
        {copy.items.map((p, i) => {
          const Icon = ICONS[i];
          const live = Boolean(HREFS[i]);
          return (
          <article
            key={p.title}
            className={`p-5 sm:p-7 rounded-2xl sm:rounded-3xl flex flex-col space-y-4 ${
              live
                ? 'bg-black text-white shadow-xl ring-1 ring-black md:-translate-y-1 md:scale-[1.02]'
                : 'crystal-card'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`font-lcd text-xs ${live ? 'text-white/60' : 'text-neutral-500'}`}>{p.kicker}</span>
              <Icon className={`w-5 h-5 ${live ? 'text-[#4ea743]' : 'text-black'}`} />
            </div>
            <h3 className={`font-section text-xl font-extrabold leading-tight ${live ? 'text-white' : 'text-black'}`}>{p.title}</h3>
            <p className={`font-semibold ${live ? 'text-white/90' : 'text-black'}`}>{p.lead}</p>
            <p className={`flex-1 text-sm sm:text-base ${live ? 'text-white/70' : 'text-neutral-600'}`}>
              {p.body}{' '}
              {p.tip && (
                <span className="group relative inline-flex align-middle">
                  <button
                    type="button"
                    aria-label={p.tip}
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${
                      live
                        ? 'border-white/30 text-white/60 hover:border-white/60 hover:text-white'
                        : 'border-black/20 text-neutral-500 hover:border-black/40 hover:text-black'
                    }`}
                  >
                    <Info className="h-3 w-3" />
                  </button>
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-64 -translate-x-1/2 rounded-xl border border-black/10 bg-white p-3 text-left text-xs font-normal leading-snug text-neutral-700 shadow-lg group-hover:block group-focus-within:block">
                    {p.tip}
                  </span>
                </span>
              )}
            </p>
            {live ? (
              <Link href={HREFS[i]!} className="inline-flex items-center gap-2 text-sm font-section font-bold text-white pt-2">
                {p.cta} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <span className="inline-flex w-fit items-center gap-2 px-3 py-1.5 rounded-full border border-black/10 bg-black/[0.04] text-xs font-section font-bold uppercase tracking-wider text-neutral-500">
                {copy.roadmap}
              </span>
            )}
          </article>
          );
        })}
      </div>
    </section>
  );
}
