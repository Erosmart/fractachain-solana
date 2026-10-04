'use client';

import React from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import BrandMark from './BrandMark';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';

export default function Footer() {
  const { user } = useAuth();
  const { t } = useI18n();
  return (
    <footer className="relative z-10 border-t border-black/10 pt-8 sm:pt-14 pb-8 sm:pb-10 text-neutral-600 text-sm">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 md:gap-12 mb-8 sm:mb-10">
          <div className="space-y-4 max-w-sm shrink-0">
            <BrandMark />
            <p className="text-neutral-600 text-sm leading-relaxed">
              {t('footer.blurb')} <strong className="text-black">Solana</strong>.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
            <div>
              <h4 className="font-display font-extrabold text-black text-xs tracking-wider uppercase mb-3">{t('footer.markets')}</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/market" className="hover:text-black">{t('nav.market')}</Link></li>
                <li><Link href="/orderbook" className="hover:text-black">{t('nav.orderbook')}</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-display font-extrabold text-black text-xs tracking-wider uppercase mb-3">{t('footer.platform')}</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/dashboard" className="hover:text-black">{t('nav.portfolio')}</Link></li>
                <li><Link href="/wallet" className="hover:text-black">{t('nav.wallet')}</Link></li>
                <li><Link href="/login" className="hover:text-black">{t('nav.login')}</Link></li>
              </ul>
            </div>
            {user?.isAdmin && (
            <div>
              <h4 className="font-display font-extrabold text-black text-xs tracking-wider uppercase mb-3">Admin</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/admin/issuance" className="hover:text-black">{t('nav.issuance')}</Link></li>
                <li><Link href="/admin/kyc" className="hover:text-black">{t('nav.kyc')}</Link></li>
              </ul>
            </div>
            )}
          </div>
        </div>
        <div className="p-4 rounded-2xl crystal-card mb-8">
          <div className="flex items-center gap-2 text-black font-display font-bold text-xs uppercase tracking-wider">
            <Lock className="w-4 h-4" /> {t('footer.notice')}
          </div>
          <p className="text-[11px] leading-relaxed text-neutral-600 mt-2">
            {t('footer.legal')}
          </p>
        </div>
        <div className="flex justify-between text-xs text-neutral-500 font-lcd">
          <p suppressHydrationWarning>© {new Date().getFullYear()} Fractachain</p>
          <p>TESTNET</p>
        </div>
      </div>
    </footer>
  );
}
