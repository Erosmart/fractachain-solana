'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { useAuth, afterAuthPath } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import GoogleLoginButton from '../../components/GoogleLoginButton';
import WalletAddress from '../../components/WalletAddress';
import BrandLogo from '../../components/BrandLogo';

export default function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loginWithEmail, loginWithWallet, linkFreighterWallet, isLoading, logout } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const goNext = () => {
    if (!user) return;
    router.push(afterAuthPath(user, params.get('next')));
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const u = await loginWithEmail(email, password, name);
      router.push(afterAuthPath(u, params.get('next')));
    } catch (err: any) {
      setError(err.message || t('misc.loginFail'));
    }
  };

  const handleWallet = async () => {
    setError('');
    try {
      const u = await loginWithWallet();
      router.push(afterAuthPath(u, params.get('next')));
    } catch (err: any) {
      setError(err.message || t('misc.loginWalletFail'));
    }
  };

  if (user) {
    return (
      <div className="max-w-md mx-auto py-16 space-y-6 text-center">
        <h1 className="text-2xl font-extrabold font-display">{t('auth.alreadyIn')}</h1>
        <p className="text-neutral-600">{user.email}</p>
        {user.kycStatus !== 'APPROVED' && (
          <div className="p-4 rounded-2xl border border-amber-300/60 bg-amber-50 text-left">
            <p className="text-sm font-bold">{t('auth.kycNoticeTitle')}</p>
            <p className="text-xs text-neutral-600 mt-1">{t('auth.kycNoticeBody')}</p>
          </div>
        )}
        <div className="p-4 rounded-2xl crystal-card text-left space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-display font-bold">{t('nav.yourWallet')}</p>
          <WalletAddress address={user.publicKey} />
        </div>
        {user.custodyMode !== 'SELF' && (
          <button
            type="button"
            onClick={() =>
              linkFreighterWallet()
                .then(() => setNotice(t('auth.linkWalletHint')))
                .catch((e: any) => setError(e.message))
            }
            disabled={isLoading}
            className="px-6 py-3 rounded-2xl border border-black/15 bg-white font-display font-bold"
          >
            {t('auth.linkWallet')}
          </button>
        )}
        {notice && <p className="text-sm text-green-700">{notice}</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="button" onClick={goNext} className="px-6 py-3 rounded-2xl bg-black text-white font-display font-bold">
          {t('auth.continue')}
        </button>
        <button type="button" onClick={logout} className="block mx-auto text-sm text-neutral-500">
          {t('auth.logout')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-12 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold font-display">{t('auth.title')}</h1>
        <p className="text-neutral-600">
          {t('auth.subtitle')}
        </p>
      </div>

      <div className="p-4 rounded-2xl border border-amber-300/60 bg-amber-50 text-left">
        <p className="text-sm font-bold">{t('auth.kycNoticeTitle')}</p>
        <p className="text-xs text-neutral-600 mt-1">{t('auth.kycNoticeBody')}</p>
      </div>

      <div className="p-6 rounded-3xl crystal-card space-y-5">
        <GoogleLoginButton
          className="w-full py-3"
          onSuccess={(u) => router.push(afterAuthPath(u as any, params.get('next')))}
        />
        <button
          type="button"
          onClick={handleWallet}
          disabled={isLoading}
          className="w-full py-3 rounded-2xl border border-black/15 bg-white font-display font-bold flex items-center justify-center gap-2 hover:bg-black/[0.03] transition-colors"
        >
          <BrandLogo
            slug="phantom"
            alt="Phantom"
            className="h-4 w-auto object-contain"
            fallback={<Wallet size={18} />}
          />
          {isLoading ? t('auth.walletLoading') : t('auth.wallet')}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <p className="text-center text-xs text-neutral-500">{t('auth.orEmail')}</p>
        <form onSubmit={handleEmail} className="space-y-3">
          <input
            type="text"
            placeholder={t('auth.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white"
          />
          <input
            required
            type="email"
            placeholder={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white"
          />
          <input
            required
            minLength={6}
            type="password"
            placeholder={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white"
          />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-2xl bg-black text-white font-display font-bold"
          >
            {isLoading ? t('auth.entering') : t('auth.continue')}
          </button>
        </form>
      </div>
    </div>
  );
}
