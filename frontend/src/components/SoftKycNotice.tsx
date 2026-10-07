'use client';

import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { isDevnetSoftKyc } from '../lib/devnetMode';

/**
 * Soft KYC banner for Devnet mode. Does not block navigation or trading;
 * shows the product-mandated notice and an optional KYC link.
 */
export default function SoftKycNotice({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const { t } = useI18n();

  if (!isDevnetSoftKyc() || !user?.custodyMode) return null;
  if (user.kycStatus === 'APPROVED') return null;

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 ${className}`}
      role="status"
    >
      <p>{t('kycSoft.body')}</p>
      {user.kycStatus === 'UNREGISTERED' && (
        <Link
          href="/onboarding/kyc"
          className="mt-2 inline-block text-xs font-bold underline underline-offset-2"
        >
          {t('kycSoft.cta')}
        </Link>
      )}
    </div>
  );
}
