'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Coins,
  Layers,
  Building2,
  Menu,
  X,
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import BrandMark from './BrandMark';
import { LangToggle, ThemeToggle } from './UiToggles';

export default function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useI18n();

  const primaryLinks = [
    { href: '/?tab=emision', label: t('demo.tabs.emision'), icon: Coins },
    { href: '/?tab=primario', label: t('nav.market'), icon: Layers },
    { href: '/?tab=orderbook', label: t('nav.orderbook'), icon: Coins },
    { href: '/?tab=portfolio', label: t('nav.portfolio'), icon: Building2 },
  ];

  const searchParams = useSearchParams();
  const currentDemoTab = searchParams.get('tab') ?? 'emision';
  const linkActive = (href: string) =>
    href.startsWith('/?tab=')
      ? pathname === '/' && href === `/?tab=${currentDemoTab}`
      : pathname === href || pathname.startsWith(`${href}/`);

  const allLinks = primaryLinks;
  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-black/8">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 sm:gap-3 h-[3.75rem] sm:h-[4.25rem] min-w-0">
          <BrandMark />

          <div className="hidden xl:flex items-center gap-0.5 2xl:gap-1 flex-1 min-w-0">
            {allLinks.map((link) => {
              const isActive = linkActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-2 2xl:px-2.5 py-2 rounded-lg text-[12px] 2xl:text-[13px] font-display font-bold tracking-tight whitespace-nowrap transition-colors ${
                    isActive ? 'text-black bg-black/[0.05]' : 'text-neutral-500 hover:text-black hover:bg-black/[0.03]'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <LangToggle />
            <ThemeToggle />
            <button
              type="button"
              className="xl:hidden p-2 text-black"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-black/10 px-3 sm:px-4 pt-2 pb-4 space-y-1 bg-white/95 max-h-[min(80vh,32rem)] overflow-y-auto">
          {allLinks.map((link) => {
            const Icon = link.icon;
            const isActive = linkActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-bold ${
                  isActive ? 'bg-black text-white' : 'text-neutral-700 hover:bg-black/5'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {link.label}
              </Link>
            );
          })}

        </div>
      )}
    </nav>
  );
}
