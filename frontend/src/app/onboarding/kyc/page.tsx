'use client';

import Link from 'next/link';
import { useState } from 'react';
import OnboardingStep from '../../../components/OnboardingStep';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../context/I18nContext';
import { isDevnetSoftKyc } from '../../../lib/devnetMode';

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export default function KycOnboardingPage() {
  const { user, submitKyc } = useAuth();
  const { t } = useI18n();
  const [legalName, setLegalName] = useState(user?.name || '');
  const [cuit, setCuit] = useState('');
  const [email, setEmail] = useState('');
  const [selfie, setSelfie] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Wallet-only sign-ups have no email yet; Google/email accounts need a photo.
  const walletAccount = user?.authProvider === 'wallet';
  const soft = isDevnetSoftKyc();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await submitKyc({ legalName, cuit, selfieDataUrl: selfie || undefined, email: walletAccount ? email : undefined });
    } catch (err: any) {
      setError(err.message || t('acct.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm';

  return (
    // Devnet: KYC is optional — allow visiting after wallet while dest is /dashboard.
    <OnboardingStep path="/onboarding/kyc" allow={soft ? ['/dashboard'] : []}>
      <h1 className="font-serif italic text-3xl sm:text-4xl">{t('onboarding.kycTitle')}</h1>
      <p className="mt-2 text-sm text-black/60">
        {soft ? t('onboarding.kycLeadDevnet') : t('onboarding.kycLead')}
      </p>

      {soft && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>{t('kycSoft.body')}</p>
          <Link href="/dashboard" className="mt-2 inline-block text-xs font-bold underline underline-offset-2">
            {t('kycSoft.skip')}
          </Link>
        </div>
      )}

      <form onSubmit={submit} className="mt-6 max-w-md space-y-3 rounded-2xl border border-brand-border bg-brand-card p-5 shadow-sm">
        <label className="block text-xs font-bold text-black/60">
          {t('onboarding.fullName')}
          <input required value={legalName} onChange={(e) => setLegalName(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="block text-xs font-bold text-black/60">
          {t('onboarding.cuit')}
          <input required value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="20-12345678-9" className={`${input} mt-1`} />
        </label>
        {walletAccount && (
          <label className="block text-xs font-bold text-black/60">
            {t('onboarding.kycEmail')}
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} mt-1`} />
          </label>
        )}
        <label className="block text-xs font-bold text-black/60">
          {t('onboarding.selfie')} {walletAccount && <span className="font-normal">({t('onboarding.selfieOptional')})</span>}
          <input
            type="file"
            accept="image/*"
            required={!walletAccount}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setSelfie(f ? await readAsDataUrl(f) : '');
            }}
            className="mt-1 block w-full text-sm"
          />
        </label>
        {selfie && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selfie} alt="" className="h-24 w-24 rounded-xl object-cover border border-black/10" />
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-black text-white py-2.5 text-sm font-bold hover:bg-black/85 disabled:opacity-50"
        >
          {busy ? t('onboarding.sending') : t('onboarding.send')}
        </button>
        {error && <p className="text-xs text-red-700">{error}</p>}
      </form>
    </OnboardingStep>
  );
}
