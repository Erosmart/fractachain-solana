import { Check, Minus, Info, Scale } from 'lucide-react';
import { getServerMessages } from '../lib/i18n-server';

export default function VersusSection() {
  const messages = getServerMessages();
  const v = messages.versus;

  return (
    <section className="rounded-2xl sm:rounded-3xl crystal-card p-5 sm:p-8 lg:p-12 space-y-6 sm:space-y-8">
      <div className="max-w-3xl space-y-3">
        <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500 inline-flex items-center gap-2">
          <Scale className="w-4 h-4" /> {v.kicker}
        </p>
        <h2 className="font-section text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black">
          {v.title}
        </h2>
        <p className="text-neutral-600 text-sm sm:text-base leading-relaxed">{v.lead}</p>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[640px] text-left border-collapse">
          <thead>
            <tr>
              <th className="p-3 text-xs font-lcd uppercase tracking-wider text-neutral-500" />
              {v.cols.map((col, i) => (
                <th
                  key={col}
                  className={`p-3 text-sm font-display font-extrabold ${
                    i === 0 ? 'text-black bg-leaf-100/60 rounded-t-xl' : 'text-neutral-500'
                  }`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.rows.map((row) => (
              <tr key={row[0]} className="border-t border-black/10">
                <td className="p-3 text-xs sm:text-sm font-display font-bold text-black">{row[0]}</td>
                {row.slice(1).map((cell, i) => (
                  <td key={i} className={`p-3 ${i === 0 ? 'bg-leaf-100/60' : ''}`}>
                    {cell === '✓' ? (
                      <Check className="w-5 h-5 text-[#4ea743]" strokeWidth={3} />
                    ) : cell === '—' ? (
                      <Minus className="w-5 h-5 text-neutral-300" strokeWidth={3} />
                    ) : (
                      <span className="text-[11px] text-neutral-500 leading-tight block">{cell}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500 leading-relaxed max-w-4xl">{v.note}</p>

      <div className="border-t border-black/10 pt-4">
        <span title={v.ndaText} className="relative group inline-flex items-center gap-1.5 text-xs font-display font-bold text-neutral-600 cursor-help">
          <Info className="w-4 h-4 text-[#4ea743]" />
          <span className="underline decoration-dotted underline-offset-4">{v.ndaLabel}</span>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-0 mb-2 w-72 sm:w-96 max-w-[85vw] p-4 rounded-xl bg-black text-white text-xs leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-200 z-20 shadow-xl font-normal"
          >
            {v.ndaText}
          </span>
        </span>
      </div>
    </section>
  );
}
