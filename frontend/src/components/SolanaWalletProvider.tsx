'use client';

import React, { useEffect, useMemo } from 'react';
import { ConnectionProvider, useWallet, WalletProvider } from '@solana/wallet-adapter-react';
import { registerWalletContext } from '../lib/solanaWallet';

const ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

/**
 * Feeds the connected wallet into the imperative `solanaWallet.ts` bridge so
 * AuthContext / selfCustody helpers can sign without hooks.
 */
function WalletBridge() {
  const ctx = useWallet();
  useEffect(() => {
    registerWalletContext(ctx);
    return () => registerWalletContext(null);
  }, [ctx]);
  return null;
}

/**
 * Standard-wallet detection (Wallet Standard) covers Phantom, Solflare and
 * Backpack without per-wallet adapters — `wallets={[]}` is intentional.
 */
export default function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletBridge />
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
