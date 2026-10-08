'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Layers,
  LayoutDashboard,
  ShieldCheck,
  BookOpen,
  FilePlus2,
  LogIn,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { useAuth } from '../context/AuthContext';
import BrandMark from './BrandMark';
import { LangToggle, ThemeToggle } from './UiToggles';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useI18n();
  const { user, logout } = useAuth();

  const allLinks = [
    { href: '/mercado', label: t('acct.navMarket'), icon: Layers },
    { href: '/orderbook', label: t('nav.orderbook'), icon: BookOpen },
    ...(user ? [{ href: '/dashboard', label: t('acct.navAccount'), icon: LayoutDashboard }] : []),
    ...(user?.isAdmin
      ? [
          { href: '/admin/emision', label: t('nav.issuance'), icon: FilePlus2 },
          { href: '/admin/kyc', label: t('acct.navAdmin'), icon: ShieldCheck },
        ]
      : []),
  ];

  const linkActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const closeMenu = () => setMobileMenuOpen(false);
  const signOut = () => {
    logout();
    closeMenu();
    router.push('/');
  };

  const authControl = user ? (
    <div className="flex items-center gap-1.5">
      <Link
        href="/dashboard"
        className="hidden sm:flex items-center gap-2 rounded-full border border-black/10 pl-1 pr-3 py-1 text-xs font-bold hover:bg-black/[0.03]"
      >
        {user.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar} alt="" className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="h-6 w-6 rounded-full bg-black text-white grid place-items-center text-[11px]">
            {(user.name || user.email || '?').slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="max-w-[9rem] truncate">{user.name || user.email}</span>
      </Link>
      <button
        type="button"
        onClick={signOut}
        className="p-2 rounded-lg text-neutral-500 hover:text-black hover:bg-black/[0.04]"
        aria-label={t('acct.logout')}
        title={t('acct.logout')}
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  ) : (
    <Link
      href={`/login?next=${encodeURIComponent(pathname)}`}
      className="flex items-center gap-1.5 rounded-full bg-black text-white px-3.5 py-2 text-xs font-bold hover:bg-black/85"
    >
      <LogIn className="w-3.5 h-3.5" />
      {t('acct.login')}
    </Link>
  );

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-black/8">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 sm:gap-3 h-[3.75rem] sm:h-[4.25rem] min-w-0">
          <BrandMark />

          <div className="hidden lg:flex items-center gap-0.5 2xl:gap-1 flex-1 min-w-0">
            {allLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-2.5 py-2 rounded-lg text-[13px] font-display font-bold tracking-tight whitespace-nowrap transition-colors ${
                  linkActive(link.href) ? 'text-black bg-black/[0.05]' : 'text-neutral-500 hover:text-black hover:bg-black/[0.03]'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <LangToggle />
            <ThemeToggle />
            {authControl}
            <button
              type="button"
              className="lg:hidden p-2 text-black"
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
        <div className="lg:hidden border-t border-black/10 px-3 sm:px-4 pt-2 pb-4 space-y-1 bg-white/95 max-h-[min(80vh,32rem)] overflow-y-auto">
          {allLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-bold ${
                  linkActive(link.href) ? 'bg-black text-white' : 'text-neutral-700 hover:bg-black/5'
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
