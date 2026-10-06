'use client';

import { AuthProvider } from '../context/AuthContext';
import { I18nProvider } from '../context/I18nContext';
import { ThemeProvider } from '../context/ThemeContext';
import SolanaWalletProvider from './SolanaWalletProvider';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <SolanaWalletProvider>
          <AuthProvider>{children}</AuthProvider>
        </SolanaWalletProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
