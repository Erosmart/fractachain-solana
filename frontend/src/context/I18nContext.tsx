'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dictionaries, interpolate, type Locale, type Messages } from '../lib/i18n';

// Session-scoped on purpose: every new visit starts in English; a language
// switch only lasts for the current browser session.
export const LANG_KEY = 'fc_lang_session';

function readLangCookie(): Locale | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${LANG_KEY}=(\\w+)`));
  return m?.[1] === 'en' ? 'en' : m?.[1] === 'es' ? 'es' : null;
}

function writeLangCookie(locale: Locale) {
  document.cookie = `${LANG_KEY}=${locale}; path=/; SameSite=Lax`;
}

type I18nCtx = {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  messages: Messages;
  toggleLocale: () => void;
};

const I18nContext = createContext<I18nCtx>({
  locale: 'en',
  t: (key) => key,
  messages: dictionaries.en,
  toggleLocale: () => {},
});

export function useI18n() {
  return useContext(I18nContext);
}

function lookup(messages: Messages, key: string): string | undefined {
  const parts = key.split('.');
  let cur: unknown = messages;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object' || !(part in (cur as object))) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>('en');
  const [hydrated, setHydrated] = useState(false);
  const refreshed = useRef(false);

  useEffect(() => {
    localStorage.removeItem('fc_lang');
    document.cookie = 'fc_lang=; path=/; max-age=0';
    const saved = sessionStorage.getItem(LANG_KEY);
    const cookie = readLangCookie();
    if (saved === 'en' || saved === 'es') setLocale(saved);
    // Keep the cookie in sync so server-rendered sections match the client.
    if (cookie !== saved && (saved === 'en' || saved === 'es')) {
      writeLangCookie(saved);
      if (!refreshed.current) {
        refreshed.current = true;
        router.refresh();
      }
    }
    setHydrated(true);
  }, [router]);

  useEffect(() => {
    if (!hydrated) return;
    sessionStorage.setItem(LANG_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale, hydrated]);

  const messages = dictionaries[locale];

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      return interpolate(lookup(messages, key) ?? key, vars);
    },
    [messages],
  );

  const toggleLocale = useCallback(() => {
    const next = locale === 'es' ? 'en' : 'es';
    writeLangCookie(next);
    setLocale(next);
    // Server-rendered sections (RSC) read the locale from the cookie.
    router.refresh();
  }, [locale, router]);

  const value = useMemo(
    () => ({ locale, t, messages, toggleLocale }),
    [locale, t, messages, toggleLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
