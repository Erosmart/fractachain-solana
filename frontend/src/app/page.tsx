import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp,
  ShieldCheck,
  Zap,
  Layers,
  Lock,
  Landmark,
  Globe2,
  CheckCircle2,
  Sparkles,
  Droplets,
  DollarSign,
  KeyRound,
  Sprout,
  FileText,
} from 'lucide-react';
import DynamicHeroText from '../components/DynamicHeroText';
import HeroBackground from '../components/HeroBackground';
import ProductsSection from '../components/ProductsSection';
import RegulationSection from '../components/RegulationSection';
import MervalLogosSection from '../components/MervalLogosSection';
import LiquidityFirstBanner from '../components/LiquidityFirstBanner';
import PartnersShowcase from '../components/PartnersShowcase';
import IssuerCtaBanner from '../components/IssuerCtaBanner';
import MoreThanRwaSection from '../components/MoreThanRwaSection';
import { getServerMessages } from '../lib/i18n-server';

export default function HomePage() {
  const messages = getServerMessages();

  const soonIcons: LucideIcon[] = [TrendingUp, Sprout, FileText, Landmark];
  const badgeIcons: LucideIcon[] = [ShieldCheck, Lock, Zap, CheckCircle2];
  const solanaIcons: LucideIcon[] = [Zap, DollarSign, Globe2, ShieldCheck, KeyRound];

  return (
    <div className="space-y-10 sm:space-y-16 lg:space-y-24">
      <section className="relative mx-auto flex min-h-0 sm:min-h-[calc(100svh-5.75rem)] max-w-5xl flex-col items-center justify-start sm:justify-center py-8 sm:py-10 pb-6 sm:pb-10 text-center">
        <HeroBackground />

        <div className="relative z-10 flex w-full flex-col items-center gap-4 sm:gap-5">
          <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full bg-white/70 border border-black/10 text-neutral-600 text-xs font-display font-bold uppercase tracking-[0.14em]">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="text-left">{messages.home.badge}</span>
          </div>
          <DynamicHeroText />
          <p className="hero-lead text-neutral-600 mx-auto px-1 text-[0.95rem] sm:text-[1.2rem] leading-relaxed">
            <span className="block">
              {messages.home.leadBefore} <strong className="text-black font-bold">{messages.home.leadStrong}</strong>{' '}
              {messages.home.leadL1End}
            </span>
            <span className="block">
              {messages.home.leadL2Pre}
              <strong className="text-black font-semibold">{messages.home.leadStrongCap}</strong>
              {messages.home.leadL2Post}
            </span>
            <span className="block">
              {messages.home.leadL3Pre}
              <strong className="text-black font-semibold">{messages.home.leadStrong90}</strong>
            </span>
          </p>
          <div className="flex w-full flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap items-stretch sm:items-center justify-center gap-2.5 pt-1 px-1">
            <Link
              href="/licitaciones"
              className="w-full sm:w-auto justify-center px-7 py-3.5 rounded-2xl bg-black text-white font-display font-bold text-[0.95rem] flex items-center gap-2"
            >
              <Layers className="w-4 h-4 shrink-0" />
              {messages.home.ctaMarket}
            </Link>
            <Link
              href="/orderbook"
              className="w-full sm:w-auto justify-center px-7 py-3.5 rounded-2xl bg-white/60 border border-black/10 text-black font-display font-semibold text-[0.95rem] flex items-center gap-2"
            >
              <Droplets className="w-4 h-4 shrink-0" />
              {messages.home.ctaOrderbook}
            </Link>
          </div>
        </div>
      </section>

      <MoreThanRwaSection />

      <div className="below-fold space-y-12 md:space-y-16 lg:space-y-24">
      <ProductsSection />
      <IssuerCtaBanner />
      <RegulationSection />
      <LiquidityFirstBanner />

      <PartnersShowcase />

      <section className="space-y-5 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-display font-bold text-neutral-500 uppercase tracking-wider">
              <Globe2 className="w-4 h-4" />
              {messages.partners.solana.kicker}
            </div>
            <h2 className="font-section text-2xl sm:text-3xl font-extrabold text-black">
              {messages.partners.solana.title}
            </h2>
          </div>
          <p className="text-sm text-neutral-600 max-w-md">
            {messages.partners.solana.body}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {messages.partners.solana.items.map(([title, desc], i) => {
            const Icon = solanaIcons[i];
            return (
              <div key={title} className="p-5 rounded-2xl crystal-card space-y-3">
                <Icon className="w-5 h-5 text-[#4ea743]" />
                <div className="text-sm font-display font-bold text-black">{title}</div>
                <p className="text-xs text-neutral-600 leading-relaxed">{desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <MervalLogosSection />

      <section className="space-y-5 sm:space-y-6">
        <h2 className="font-section text-2xl sm:text-3xl font-extrabold">{messages.home.soon}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {messages.home.soonItems.map(([title, desc], i) => {
            const Icon = soonIcons[i];
            return (
            <div key={title} className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl crystal-card space-y-3">
              <Icon className="w-5 h-5" />
              <h4 className="font-section font-extrabold">{title}</h4>
              <p className="text-sm text-neutral-600">{desc}</p>
            </div>
            );
          })}
        </div>
      </section>

      <section className="p-5 sm:p-8 rounded-2xl sm:rounded-3xl crystal-card grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        {messages.home.badges.map(([title, sub], i) => {
          const Icon = badgeIcons[i];
          return (
          <div key={title} className="flex items-center gap-3 min-w-0">
            <Icon className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-display font-bold">{title}</div>
              <div className="text-[11px] text-neutral-500">{sub}</div>
            </div>
          </div>
          );
        })}
      </section>

      </div>
    </div>
  );
}
