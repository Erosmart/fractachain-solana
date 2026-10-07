'use client';

import { useState } from 'react';
import OnboardingStep from '../../../components/OnboardingStep';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../context/I18nContext';

export default function PendingPage() {
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const rejected = user?.kycStatus === 'REJECTED';

  return (
    <OnboardingStep path="/onboarding/pending">
      <div className="max-w-lg rounded-2xl border border-brand-border bg-brand-card p-6 shadow-sm">
        <h1 className="font-serif italic text-3xl">
          {rejected ? t('onboarding.rejectedTitle') : t('onboarding.pendingTitle')}
        </h1>
        <p className="mt-2 text-sm text-black/60">
          {rejected ? t('onboarding.rejectedBody') : t('onboarding.pendingBody')}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await refreshUser().finally(() => setBusy(false));
          }}
          className="mt-5 rounded-xl border border-black/15 px-4 py-2 text-sm font-bold hover:bg-black/[0.04] disabled:opacity-50"
        >
          {t('acct.pendingRefresh')}
        </button>
      </div>
    </OnboardingStep>
  );
}
