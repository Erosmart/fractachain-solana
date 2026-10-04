'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

export default function MockDisclaimer({
  product,
}: {
  product: string;
}) {
  const { t } = useI18n();
  return (
    <div className="mock-disclaimer rounded-2xl px-4 py-3 text-sm flex items-start gap-3">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
      <div>
        <p className="font-display font-bold">{t('mock.title')}</p>
        <p className="mt-1 mock-disclaimer-body">
          {t('mock.body', { product })}{' '}
          <Link href="/?tab=primario" className="font-bold underline underline-offset-2">
            {t('mock.listing')}
          </Link>
          {t('mock.tail')}
        </p>
      </div>
    </div>
  );
}
