'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, nextOnboardingPath } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';

/**
 * Renders an onboarding step only while it is the user's current one; any
 * state change (custody chosen, KYC sent/approved) moves them along.
 */
export default function OnboardingStep({
  path,
  allow = [],
  children,
}: {
  path: string;
  allow?: string[];
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const dest = nextOnboardingPath(user);
  const here = dest === path || allow.includes(dest);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(path)}`);
    else if (!here) router.replace(dest);
  }, [user, isLoading, here, dest, path, router]);

  if (isLoading) return <p className="py-16 text-center text-neutral-500">{t('auth.loading')}</p>;
  if (!user || !here) return null;
  return (
    <div className="mx-auto max-w-3xl py-8">
      <div className="mb-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-black/40">
        {['/onboarding/wallet', '/onboarding/kyc', '/dashboard'].map((step, i) => (
          <span key={step} className="flex items-center gap-2">
            <span
              className={`grid h-5 w-5 place-items-center rounded-full ${
                step === path || (step === '/onboarding/kyc' && path === '/onboarding/pending')
                  ? 'bg-black text-white'
                  : 'bg-black/10'
              }`}
            >
              {i + 1}
            </span>
            {i < 2 && <span className="h-px w-6 bg-black/15" />}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}
