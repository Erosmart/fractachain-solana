import Link from 'next/link';
import { Building2, ArrowRight } from 'lucide-react';
import { getServerMessages } from '../lib/i18n-server';

export default function IssuerCtaBanner() {
  const messages = getServerMessages();
  return (
    <section className="p-5 sm:p-8 lg:p-10 rounded-2xl sm:rounded-3xl crystal-card space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center gap-5 sm:gap-6 justify-between">
        <div className="max-w-2xl space-y-3">
          <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500">{messages.issuer.kicker}</p>
          <h2 className="font-section text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black leading-snug">
            {messages.issuer.title}
          </h2>
          <p className="text-neutral-600 text-sm sm:text-base">
            {messages.issuer.body}
          </p>
        </div>
        <Link
          href="/admin/emision"
          className="w-full sm:w-auto shrink-0 justify-center px-6 py-3.5 rounded-2xl bg-black text-white font-display font-bold text-sm inline-flex items-center gap-2"
        >
          <Building2 className="w-4 h-4" />
          {messages.issuer.cta}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {messages.issuer.steps.map(([title, desc], i) => (
          <li key={title} className="rounded-2xl border border-black/10 bg-white/70 p-4 space-y-1.5">
            <span className="font-lcd text-[10px] uppercase tracking-wider text-neutral-500">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="text-sm font-display font-bold text-black">{title}</div>
            <p className="text-xs text-neutral-600 leading-relaxed">{desc}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
