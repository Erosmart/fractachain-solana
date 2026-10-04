'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../lib/api';
import { useI18n } from '../context/I18nContext';

export default function LiveContractLink({ kind }: { kind: 'forward' | 'warrant' | 'stockVault' }) {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/onchain/status`)
      .then((r) => r.json())
      .then((json) => {
        const value = json?.data?.[kind];
        if (typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(value)) setId(value);
      })
      .catch(() => {});
  }, [kind]);

  if (!id) return null;

  return (
    <p className="text-xs font-mono text-neutral-600 break-all">
      {t('misc.devnetInstance')}{' '}
      <a
        href={`https://explorer.solana.com/address/${id}?cluster=devnet`}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        {id}
      </a>
    </p>
  );
}
