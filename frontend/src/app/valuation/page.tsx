import Link from 'next/link';
import { BarChart3, BookOpen, ArrowLeft } from 'lucide-react';
import { getServerMessages, getServerLocale } from '../../lib/i18n-server';
import { valuationSources } from '../../lib/valuation-sources';
import { reportSections } from '../../lib/valuation-report';

export default function ValuationPage() {
  const messages = getServerMessages();
  const locale = getServerLocale();
  const v = messages.valuation;

  return (
    <div className="mx-auto max-w-4xl space-y-10 sm:space-y-14 py-4 sm:py-8">
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

      {reportSections.map((sec) => (
        <section key={sec.id} className="space-y-4 sm:space-y-5">
          <h2 className="font-section text-lg sm:text-2xl font-extrabold text-black leading-snug">
            {sec.title[locale]}
          </h2>

          {sec.paras[locale].map((p, i) => (
            <p key={i} className="text-sm sm:text-[0.95rem] text-neutral-700 leading-relaxed">
              {p}
            </p>
          ))}

          {sec.formulas && (
            <div className="rounded-2xl crystal-card p-5 sm:p-6 space-y-3 bg-white/70">
              {sec.formulas.map((f) => (
                <p key={f} className="font-mono text-sm sm:text-base text-black text-center font-bold">
                  {f}
                </p>
              ))}
            </div>
          )}

          {sec.bullets && (
            <ul className="space-y-2.5 pl-1">
              {sec.bullets[locale].map((b) => (
                <li key={b.term} className="text-sm text-neutral-700 leading-relaxed flex gap-2">
                  <span className="text-[#4ea743] font-bold shrink-0">·</span>
                  <span>
                    <strong className="text-black">{b.term}</strong> — {b.def}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {sec.table && (
            <div className="overflow-x-auto rounded-2xl crystal-card">
              <table className="w-full min-w-[520px] text-left border-collapse">
                <thead>
                  <tr>
                    {sec.table.head[locale].map((h) => (
                      <th key={h} className="p-3 text-[11px] font-lcd uppercase tracking-wider text-neutral-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.table.rows.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-t border-black/10 ${
                        (sec.id === 'modelo' || sec.id === 'costos') && i === sec.table!.rows.length - 1 ? 'bg-leaf-100/70' : ''
                      }`}
                    >
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className={`p-3 text-xs sm:text-sm leading-snug ${
                            j === 1 ? 'font-lcd font-extrabold text-black whitespace-nowrap' : 'text-neutral-600'
                          } ${j === 0 ? 'font-display font-semibold text-black' : ''}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {sec.statCards && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sec.statCards.map((c) => (
                <div key={c.n} className="p-5 rounded-2xl crystal-card space-y-2">
                  <div className="font-lcd text-2xl font-extrabold text-black">{c.n}</div>
                  <p className="text-xs sm:text-sm text-neutral-600 leading-snug">{c.label[locale]}</p>
                </div>
              ))}
            </div>
          )}

          {sec.note && (
            <p className="text-[11px] text-neutral-500 leading-relaxed italic border-l-2 border-leaf-100 pl-3">
              {sec.note[locale]}
            </p>
          )}
        </section>
      ))}

      <section className="space-y-5 border-t border-black/10 pt-8">
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
