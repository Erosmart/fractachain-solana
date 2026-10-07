import Link from 'next/link';
import { MERVAL_NAMES } from '../lib/merval';
import BrandLogo from './BrandLogo';
import { getServerMessages } from '../lib/i18n-server';

function StockCard({
  ticker,
  name,
}: {
  ticker: string;
  name: string;
}) {
  return (
    <div
      aria-label={name}
      className="flex items-center justify-center h-[88px] min-w-[140px] px-4 shrink-0"
    >
      <BrandLogo
        slug={ticker.toLowerCase()}
        alt={name}
        className="h-14 w-auto max-w-[140px] object-contain opacity-70"
      />
    </div>
  );
}

export default function MervalLogosSection() {
  const { merval, products } = getServerMessages();
  const loop = [...MERVAL_NAMES, ...MERVAL_NAMES];

  return (
    <section className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="space-y-2">
          <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500">{merval.kicker}</p>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <h2 className="font-section text-3xl sm:text-4xl font-extrabold text-black">
              {merval.title}
            </h2>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full border border-black/10 bg-black/[0.04] text-xs font-section font-bold uppercase tracking-wider text-neutral-500">
              {products.roadmap}
            </span>
          </div>
        </div>
        <p className="text-sm text-neutral-600 max-w-md">
          {merval.lead}
        </p>
      </div>
      <div className="merval-reel opacity-80">
        <div className="merval-reel-track">
          {loop.map((c, i) => (
            <StockCard key={`${c.ticker}-${i}`} ticker={c.ticker} name={c.name} />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/demo/licitaciones" className="px-6 py-3.5 rounded-2xl bg-white/80 border border-black/10 text-black font-section font-bold text-sm">
          {merval.ctaBonds}
        </Link>
      </div>
      <p className="text-sm text-neutral-600 max-w-3xl border-l-2 border-[#4ea743] pl-4">
        {merval.stake}
      </p>
    </section>
  );
}
