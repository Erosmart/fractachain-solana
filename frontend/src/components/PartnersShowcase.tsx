import React from 'react';
import { Landmark, ShieldCheck, Zap, Globe, Coins, Building2, ExternalLink, Wallet } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { partnerSlug } from '../lib/brands';
import { getServerMessages } from '../lib/i18n-server';

interface Partner {
  name: string;
  accent: string;
}

const PARTNERS: Partner[] = [
  { name: 'BYMA', accent: 'from-blue-500/20 to-cyan-500/20 border-blue-500/40 text-blue-300' },
  { name: 'Caja de Valores', accent: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/40 text-emerald-300' },
  { name: 'Solana Foundation', accent: 'from-purple-500/20 to-pink-500/20 border-purple-500/40 text-purple-300' },
  { name: 'Manteca', accent: 'from-amber-500/20 to-orange-500/20 border-amber-500/40 text-amber-300' },
  { name: 'Matba Rofex', accent: 'from-yellow-500/20 to-lime-500/20 border-yellow-500/40 text-yellow-300' },
  { name: 'Koywe', accent: 'from-cyan-500/20 to-blue-500/20 border-cyan-500/40 text-cyan-300' },
  { name: 'Circle CCTP', accent: 'from-emerald-500/20 to-cyan-500/20 border-emerald-500/40 text-emerald-300' },
];

export default function PartnersShowcase() {
  const messages = getServerMessages();
  const funding = messages.partners.funding;
  const ptn = messages.ptn as Record<string, { role: string; description: string; badge: string }>;
  const fundingLogos = [
    <BrandLogo
      key="alfred"
      slug="manteca"
      alt="Manteca"
      className="h-7 w-auto max-h-7 max-w-[6rem] object-contain object-left"
      fallback={<span className="text-xs font-display font-bold text-black">Manteca</span>}
    />,
    <BrandLogo
      key="moneygram"
      slug="moneygram"
      alt="MoneyGram"
      className="h-7 w-auto max-h-7 max-w-[6rem] object-contain object-left"
      fallback={<span className="text-xs font-display font-bold text-black">MoneyGram</span>}
    />,
    <span key="wallet" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-black/10 bg-white/80">
      <Wallet className="h-4 w-4 text-[#4ea743]" />
    </span>,
  ];
  return (
    <section className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-section text-3xl font-extrabold text-black">{funding.title}</h2>
          <p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-300/80 text-amber-900 text-xs">
            {funding.demo}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {funding.items.map((item, i) => (
            <div key={item.title} className="p-5 rounded-2xl crystal-card space-y-3">
              <div className="flex items-start justify-between gap-2">
                {fundingLogos[i]}
                <span className="text-[10px] font-lcd text-neutral-500 bg-white/80 px-2 py-0.5 rounded border border-black/10 shrink-0">
                  {item.tag}
                </span>
              </div>
              <div>
                <div className="text-sm font-display font-bold text-black">{item.title}</div>
                <p className="text-xs text-neutral-600 mt-1 leading-relaxed">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-display font-bold text-neutral-500 uppercase tracking-wider">
            <Building2 className="w-4 h-4" />
            Building blocks
          </div>
          <h2 className="font-section text-3xl font-extrabold text-black">
            {messages.partners.title}
          </h2>
        </div>
        <p className="text-sm text-neutral-600 max-w-md">
          {messages.partners.lead}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PARTNERS.map((p) => {
          const copy = ptn[partnerSlug(p.name)];
          return (
            <div
              key={p.name}
              className="p-5 rounded-2xl crystal-card space-y-3"
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <BrandLogo
                  slug={partnerSlug(p.name)}
                  alt={p.name}
                  className="h-8 w-auto max-h-8 max-w-[6.5rem] object-contain object-left"
                  fallback={
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono uppercase bg-gradient-to-r ${p.accent} border shadow-sm`}>
                      {p.name}
                    </span>
                  }
                />
                <span className="text-[10px] font-lcd text-neutral-500 bg-white/80 px-2 py-0.5 rounded border border-black/10 shrink-0">
                  {copy?.badge}
                </span>
              </div>

              <div>
                <div className="text-sm font-display font-bold text-black">
                  {copy?.role}
                </div>
                <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                  {copy?.description}
                </p>
              </div>
            </div>
          );
        })}

        {/* Highlight Card: Colosseum / Superteam Argentina */}
        <div className="p-5 rounded-2xl crystal-card flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <BrandLogo
              slug="superteam"
              alt="Superteam Argentina"
              className="h-8 w-auto max-w-[7rem] object-contain"
              fallback={
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-lcd font-bold uppercase border border-black/10 text-black inline-block">
                  Colosseum H2 2026
                </span>
              }
            />
            <div className="text-sm font-display font-bold text-black">
              Superteam · Colosseum
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed">
              {messages.partners.scf}
            </p>
          </div>
          <div className="pt-2 border-t border-black/10 flex items-center justify-between text-[11px] font-lcd text-neutral-600">
            <span>Salta 2026</span>
            <span className="font-bold text-black">Instawards</span>
          </div>
        </div>
      </div>
    </section>
  );
}
