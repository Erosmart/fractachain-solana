'use client';

import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import OnboardingStep from '../../../components/OnboardingStep';
import WalletPicker from '../../../components/WalletPicker';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../context/I18nContext';

export default function WalletOnboardingPage() {
  const { chooseCustody, linkSolanaWallet } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<'SELF' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const custodial = async () => {
    setError('');
    setBusy(true);
    try {
      await chooseCustody('CUSTODIAL');
    } catch (err: any) {
      setError(err.message || t('acct.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingStep path="/onboarding/wallet">
      <h1 className="font-serif italic text-3xl sm:text-4xl">{t('acct.custodyTitle')}</h1>
      <p className="mt-2 text-sm text-black/60">{t('acct.custodyLead')}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm flex flex-col">
          <KeyRound className="h-6 w-6" />
          <h2 className="mt-3 font-display font-bold text-lg">{t('acct.selfTitle')}</h2>
          <p className="mt-1 text-sm text-black/60 flex-1">{t('acct.selfBody')}</p>
          {mode === 'SELF' ? (
            <div className="mt-4">
              <WalletPicker onConnected={linkSolanaWallet} onError={setError} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMode('SELF')}
              className="mt-4 rounded-xl bg-purple-600 text-white py-2.5 text-sm font-bold hover:bg-purple-700"
            >
              {t('acct.selfCta')}
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm flex flex-col">
          <ShieldCheck className="h-6 w-6" />
          <h2 className="mt-3 font-display font-bold text-lg">{t('acct.custodialTitle')}</h2>
          <p className="mt-1 text-sm text-black/60 flex-1">{t('acct.custodialBody')}</p>
          <button
            type="button"
            disabled={busy}
            onClick={custodial}
            className="mt-4 rounded-xl bg-black text-white py-2.5 text-sm font-bold hover:bg-black/85 disabled:opacity-50"
          >
            {busy ? t('acct.creating') : t('acct.custodialCta')}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
    </OnboardingStep>
  );
}
