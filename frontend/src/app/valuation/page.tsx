import Link from 'next/link';
import { BarChart3, TrendingDown, TrendingUp, BookOpen, ArrowLeft } from 'lucide-react';
import { getServerMessages, getServerLocale } from '../../lib/i18n-server';
import { valuationSources } from '../../lib/valuation-sources';

export default function ValuationPage() {
  const messages = getServerMessages();
  const locale = getServerLocale();
  const v = messages.valuation;

  return (
    <div className="mx-auto max-w-4xl space-y-8 sm:space-y-10 py-4 sm:py-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-display font-bold text-neutral-500 hover:text-black">
        <ArrowLeft className="w-3.5 h-3.5" /> {v.backHome}
      </Link>

      <header className="space-y-3">
        <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500 inline-flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> {v.kicker}
        </p>
        <h1 className="font-section text-2xl sm:text-4xl font-extrabold text-black leading-tight">
          {v.title}
        </h1>
        <p className="text-neutral-600 text-sm sm:text-base leading-relaxed max-w-3xl">{v.lead}</p>
      </header>

      <section className="rounded-2xl sm:rounded-3xl crystal-card p-6 sm:p-10 text-center space-y-3 bg-leaf-100/60">
        <div className="font-lcd text-5xl sm:text-7xl font-extrabold text-black leading-none">{v.resultN}</div>
        <p className="text-sm sm:text-base text-neutral-700 font-display font-semibold max-w-xl mx-auto">{v.resultLabel}</p>
        <p className="text-xs font-lcd uppercase tracking-wider text-[#4ea743] font-bold">{v.resultRange}</p>
        <p className="text-[11px] text-neutral-500 max-w-lg mx-auto leading-relaxed">{v.resultNote}</p>
      </section>

      <section className="space-y-4">
        <h2 className="font-section text-xl sm:text-2xl font-extrabold text-black">{v.contextTitle}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {v.context.map(([n, label]) => (
            <div key={n} className="p-5 rounded-2xl crystal-card space-y-2">
              <div className="font-lcd text-2xl font-extrabold text-black">{n}</div>
              <p className="text-xs sm:text-sm text-neutral-600 leading-snug">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-section text-xl sm:text-2xl font-extrabold text-black">{v.modelTitle}</h2>
        <div className="overflow-x-auto rounded-2xl crystal-card">
          <table className="w-full min-w-[560px] text-left border-collapse">
            <tbody>
              {v.modelSteps.map(([step, value, why], i) => (
                <tr
                  key={step}
                  className={`border-t border-black/10 first:border-t-0 ${
                    i === v.modelSteps.length - 1 ? 'bg-leaf-100/70' : ''
                  }`}
                >
                  <td className="p-3 sm:p-4 text-xs sm:text-sm font-display font-bold text-black w-1/3">{step}</td>
                  <td className="p-3 sm:p-4 font-lcd font-extrabold text-sm sm:text-base text-black whitespace-nowrap">{value}</td>
                  <td className="p-3 sm:p-4 text-[11px] sm:text-xs text-neutral-500 leading-snug">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-section text-xl sm:text-2xl font-extrabold text-black inline-flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-neutral-500" /> {v.whyTitle}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {v.whyCards.map(([title, body]) => (
            <div key={title} className="p-5 rounded-2xl crystal-card space-y-2">
              <div className="text-sm font-display font-bold text-black">{title}</div>
              <p className="text-xs text-neutral-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl sm:rounded-3xl crystal-card p-5 sm:p-8 space-y-3">
        <h2 className="font-section text-xl sm:text-2xl font-extrabold text-black inline-flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#4ea743]" /> {v.catalystTitle}
        </h2>
        <p className="text-sm text-neutral-600 leading-relaxed">{v.catalyst}</p>
      </section>

      <section className="space-y-5">
        <div className="space-y-2">
          <h2 className="font-section text-xl sm:text-2xl font-extrabold text-black inline-flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> {v.sourcesTitle}
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 leading-relaxed max-w-3xl">{v.sourcesNote}</p>
        </div>
        <div className="space-y-6">
          {valuationSources.map((group) => (
            <div key={group.category.es} className="space-y-2">
              <h3 className="font-lcd text-[11px] uppercase tracking-[0.18em] text-neutral-500 font-bold">
                {group.category[locale]}
              </h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {group.items.map(([name, url]) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-neutral-600 hover:text-black underline decoration-dotted underline-offset-2 leading-snug inline-block"
                    >
                      {name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
