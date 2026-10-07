'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState, type WalletName } from '@solana/wallet-adapter-base';
import { useI18n } from '../context/I18nContext';

const INSTALL_LINKS = [
  { name: 'Phantom', url: 'https://phantom.com/download' },
  { name: 'Solflare', url: 'https://solflare.com/download' },
  { name: 'Backpack', url: 'https://backpack.app/download' },
];

/** MetaMask may register a Solana Wallet Standard account; keep the Solana path clear. */
function isSolanaNativeWallet(name: string): boolean {
  return !/metamask|rabby|coinbase|rainbow|trust\s*wallet|okx/i.test(name);
}

/**
 * Lists installed Solana wallets (Wallet Standard) and, once the chosen one is
 * connected, runs `onConnected` (sign-in or link signature). The action reads
 * the wallet through the solanaWallet.ts bridge, which only sees the new
 * connection after this render commits — hence the deferred call.
 */
export default function WalletPicker({
  onConnected,
  onError,
}: {
  onConnected: () => Promise<void>;
  onError?: (message: string) => void;
}) {
  const { wallets, wallet, select, connect, connected, connecting, publicKey } = useWallet();
  const { t } = useI18n();
  const [pending, setPending] = useState<WalletName | null>(null);
  const [busy, setBusy] = useState(false);
  const ran = useRef(false);

  const available = useMemo(
    () =>
      wallets.filter(
        (w) =>
          isSolanaNativeWallet(w.adapter.name) &&
          (w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable),
      ),
    [wallets],
  );

  const missingInstalls = useMemo(() => {
    const present = new Set(available.map((w) => w.adapter.name.toLowerCase()));
    return INSTALL_LINKS.filter((w) => !present.has(w.name.toLowerCase()));
  }, [available]);

  const fail = (err: unknown) => {
    setPending(null);
    setBusy(false);
    ran.current = false;
    onError?.((err as Error)?.message || t('acct.errorGeneric'));
  };

  useEffect(() => {
    if (!pending || wallet?.adapter.name !== pending || connected || connecting) return;
    connect().catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, wallet, connected, connecting]);

  useEffect(() => {
    if (!pending || !connected || !publicKey || ran.current) return;
    ran.current = true;
    setBusy(true);
    const id = setTimeout(() => {
      onConnected()
        .then(() => {
          setPending(null);
          setBusy(false);
          ran.current = false;
        })
        .catch(fail);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, connected, publicKey]);

  const choose = (name: WalletName) => {
    ran.current = false;
    setPending(name);
    if (wallet?.adapter.name !== name) select(name);
  };

  if (!available.length) {
    return (
      <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4 text-sm">
        <p className="text-black/70">{t('acct.noWallets')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {INSTALL_LINKS.map((w) => (
            <a
              key={w.name}
              href={w.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-bold hover:bg-black/[0.04]"
            >
              {w.name}
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-black/50">{t('acct.pickWallet')}</p>
      {available.map((w) => {
        const isPending = pending === w.adapter.name;
        return (
          <button
            key={w.adapter.name}
            type="button"
            disabled={Boolean(pending)}
            onClick={() => choose(w.adapter.name)}
            className="w-full flex items-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-bold hover:border-black/30 disabled:opacity-60 transition"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={w.adapter.icon} alt="" className="h-6 w-6 rounded" />
            <span className="flex-1 text-left">{w.adapter.name}</span>
            {isPending && (
              <span className="text-xs font-normal text-black/50">
                {busy ? t('acct.signing') : t('acct.connecting')}
              </span>
            )}
          </button>
        );
      })}
      {missingInstalls.length > 0 && (
        <div className="pt-2">
          <p className="text-[11px] text-black/45 mb-1.5">{t('acct.otherSolanaWallets')}</p>
          <div className="flex flex-wrap gap-2">
            {missingInstalls.map((w) => (
              <a
                key={w.name}
                href={w.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-bold hover:bg-black/[0.04]"
              >
                {w.name}
              </a>
            ))}
          </div>
        </div>
      )}
      {pending && (
        <button
          type="button"
          onClick={() => {
            setPending(null);
            setBusy(false);
            ran.current = false;
          }}
          className="text-xs text-black/50 hover:text-black"
        >
          {t('acct.cancel')}
        </button>
      )}
    </div>
  );
}
