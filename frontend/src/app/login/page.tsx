'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import GoogleLoginButton from '../../components/GoogleLoginButton';
import WalletPicker from '../../components/WalletPicker';
import { useAuth, afterAuthPath } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-5 text-[11px] uppercase tracking-wide text-black/40">
      <span className="h-px flex-1 bg-black/10" />
      {label}
      <span className="h-px flex-1 bg-black/10" />
    </div>
  );
}

function LoginInner() {
  const { user, isLoading, loginWithWallet, loginWithEmail } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && user) router.replace(afterAuthPath(user, next));
  }, [user, isLoading, next, router]);

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await loginWithEmail(email, password, name || undefined);
    } catch (err: any) {
      setError(err.message || t('misc.loginFail'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="rounded-3xl border border-brand-border bg-brand-card p-6 sm:p-8 shadow-sm">
        <h1 className="font-serif italic text-3xl">{t('acct.loginTitle')}</h1>
        <p className="mt-2 text-sm text-black/60">{t('acct.loginLead')}</p>

        <div className="mt-6">
          <GoogleLoginButton className="w-full !py-3 !text-sm" />
        </div>

        <Divider label={t('acct.orWallet')} />
        <WalletPicker
          onConnected={async () => {
            await loginWithWallet();
          }}
          onError={setError}
        />

        <Divider label={t('acct.orEmail')} />
        <form onSubmit={submitEmail} className="space-y-2.5">
          <input
            type="text"
            placeholder={t('auth.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
          />
          <input
            type="email"
            required
            placeholder={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-black text-white py-2.5 text-sm font-bold hover:bg-black/85 disabled:opacity-50"
          >
            {busy ? t('auth.entering') : t('auth.continue')}
          </button>
        </form>

        {error && <p className="mt-4 text-xs text-red-700 text-center">{error}</p>}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
