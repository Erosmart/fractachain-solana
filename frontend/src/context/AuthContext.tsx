'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { API_BASE_URL } from '../lib/api';
import { signAndRelay } from '../lib/selfCustody';
import { tClient } from '../lib/i18n';
import { ensureUsdcReady } from '../lib/usdc';

export type CustodyMode = 'CUSTODIAL' | 'SELF' | null;
export type KycStatus = 'UNREGISTERED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  publicKey: string;
  custodyMode: CustodyMode;
  kycStatus: KycStatus;
  kycId?: string;
  legalName?: string;
  cuit?: string;
  selfieUrl?: string;
  custodialWallet?: string;
  authProvider?: string;
  holdings?: { listingId: string; tokenTicker: string; usdcAmount: number; tokens: number; tokensOwed?: number; tokensOnChain?: number; pendingDividendUsdc?: number; refundedAt?: string; refundHash?: string }[];
  trustlines?: string[];
  cashUsdc?: number;
  solBalance?: number;
  xlmBalance?: number; // legacy alias
  faucetFunded?: boolean;
  isAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  loginWithGoogle: () => Promise<User>;
  loginWithWallet: () => Promise<User>;
  loginWithEmail: (email: string, password: string, name?: string) => Promise<User>;
  chooseCustody: (mode: 'CUSTODIAL' | 'SELF', publicKey?: string) => Promise<void>;
  linkSolanaWallet: () => Promise<void>;
  submitKyc: (payload: { legalName: string; cuit: string; selfieDataUrl?: string; email?: string }) => Promise<void>;
  approveToken: (listingId: string) => Promise<void>;
  claimTokens: (listingId: string) => Promise<any>;
  distributeTokens: (listingId: string) => Promise<any>;
  claimDividends: (listingId: string) => Promise<void>;
  finalizeOffering: (listingId: string) => Promise<any>;
  refundContribution: (listingId: string, selfCustody?: boolean) => Promise<any>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  loginWithGoogle: async () => {
    throw new Error('no session');
  },
  loginWithWallet: async () => {
    throw new Error('no session');
  },
  loginWithEmail: async () => {
    throw new Error('no session');
  },
  chooseCustody: async () => {},
  linkSolanaWallet: async () => {},
  submitKyc: async () => {},
  approveToken: async () => {},
  claimTokens: async () => {},
  distributeTokens: async () => {},
  claimDividends: async () => {},
  finalizeOffering: async () => ({}),
  refundContribution: async () => ({}),
  refreshUser: async () => {},
  logout: () => {},
});

function persist(token: string, user: User) {
  localStorage.setItem('fc_auth_token', token);
  localStorage.setItem('fc_auth_user', JSON.stringify(user));
}

function normalize(raw: any, fallback?: Partial<User>): User {
  return {
    id: raw.id || raw.uid || fallback?.id || '',
    email: raw.email || fallback?.email || '',
    name: raw.legalName || raw.name || raw.displayName || fallback?.name || '',
    avatar: raw.avatar || raw.photoURL || fallback?.avatar || '',
    publicKey: raw.publicKey || raw.custodialWallet || '',
    custodyMode: raw.custodyMode ?? null,
    kycStatus: raw.kycStatus || 'UNREGISTERED',
    kycId: raw.kycId,
    legalName: raw.legalName,
    cuit: raw.cuit,
    selfieUrl: raw.selfieUrl,
    custodialWallet: raw.publicKey || raw.custodialWallet,
    authProvider: raw.authProvider,
    holdings: raw.holdings || [],
    trustlines: raw.trustlines || [],
    cashUsdc: typeof raw.cashUsdc === 'number' ? raw.cashUsdc : 0,
          solBalance: typeof raw.solBalance === 'number' ? raw.solBalance : typeof raw.xlmBalance === 'number' ? raw.xlmBalance : 0,
    faucetFunded: Boolean(raw.faucetFunded),
    isAdmin: Boolean(raw.isAdmin),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applySession = useCallback((nextToken: string, raw: any) => {
    const u = normalize(raw);
    setToken(nextToken);
    setUser(u);
    persist(nextToken, u);
  }, []);

  const refreshUser = useCallback(async () => {
    const saved = localStorage.getItem('fc_auth_token');
    if (!saved) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${saved}` },
      });
      const data = await res.json();
      if (data.success && data.user) {
        applySession(saved, data.user);
      } else {
        localStorage.removeItem('fc_auth_token');
        localStorage.removeItem('fc_auth_user');
        setToken(null);
        setUser(null);
      }
    } catch {
      // keep local copy
    }
  }, [applySession]);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('fc_auth_token');
      const savedUser = localStorage.getItem('fc_auth_user');
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) refreshUser();
  }, [token, refreshUser]);

  const loginWithGoogle = useCallback(async () => {
    setIsLoading(true);
    try {
      const { loginWithFirebaseGoogle } = await import('../lib/firebase');
      const fbData = await loginWithFirebaseGoogle();
      const res = await fetch(`${API_BASE_URL}/api/auth/firebase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: fbData.uid,
          email: fbData.email,
          displayName: fbData.displayName,
          photoURL: fbData.photoURL,
          idToken: fbData.idToken,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.user) throw new Error(data.message || tClient('err.loginFail'));
      const u = normalize(data.user);
      applySession(data.token, data.user);
      return u;
    } catch (err: any) {
      if (err?.name === 'TypeError' || /failed to fetch/i.test(err?.message || '')) {
        throw new Error(tClient('err.apiDown'));
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [applySession]);

  const loginWithWallet = useCallback(async () => {
    setIsLoading(true);
    try {
      const { solanaLoginPayload } = await import('../lib/solanaWallet');
      const payload = await solanaLoginPayload();
      const res = await fetch(`${API_BASE_URL}/api/auth/wallet-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.user) throw new Error(data.message || tClient('err.walletLogin'));
      const u = normalize(data.user);
      applySession(data.token, data.user);
      // Una firma más dentro del login: crea la ATA de USDC y
      // dispara el grant. Sin ella la wallet no puede recibir USDC.
      await ensureUsdcReady(data.token).catch(() => undefined);
      return u;
    } catch (err: any) {
      if (err?.name === 'TypeError' || /failed to fetch/i.test(err?.message || '')) {
        throw new Error(tClient('err.apiDown'));
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [applySession]);

  const loginWithEmail = useCallback(async (email: string, password: string, name?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || tClient('err.loginGeneric'));
      const u = normalize(data.user);
      applySession(data.token, data.user);
      // Wallets ya configuradas: custodiales se fondean server-side sin popup;
      // self-custody firma la creación de la ATA una sola vez si le falta.
      if (u.publicKey && u.custodyMode) await ensureUsdcReady(data.token).catch(() => undefined);
      return u;
    } catch (err: any) {
      if (err?.name === 'TypeError' || /failed to fetch/i.test(err?.message || '')) {
        throw new Error(tClient('err.apiDown'));
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [applySession]);

  const linkSolanaWallet = useCallback(async () => {
    if (!token) throw new Error(tClient('err.signIn'));
    const { solanaLinkPayload } = await import('../lib/solanaWallet');
    const payload = await solanaLinkPayload();
    const res = await fetch(`${API_BASE_URL}/api/auth/wallet/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || tClient('err.walletLink'));
    applySession(token, data.user);
    // Al vincular la wallet también queda habilitada para recibir USDC.
    await ensureUsdcReady(token).catch(() => undefined);
  }, [token, applySession]);

  const chooseCustody = useCallback(async (mode: 'CUSTODIAL' | 'SELF', publicKey?: string) => {
    if (!token) throw new Error(tClient('err.signIn'));
    const res = await fetch(`${API_BASE_URL}/api/auth/wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode, publicKey }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || tClient('err.custodySave'));
    applySession(token, data.user);
    // Mismo post-paso que en login/link: custodial se resuelve en el backend,
    // self-custody firma la creación de la ATA en la wallet una sola vez.
    await ensureUsdcReady(token).catch(() => undefined);
  }, [token, applySession]);

  const submitKyc = useCallback(async (payload: { legalName: string; cuit: string; selfieDataUrl?: string; email?: string }) => {
    if (!token) throw new Error(tClient('err.signIn'));
    const res = await fetch(`${API_BASE_URL}/api/kyc/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || tClient('err.kycSend'));
    applySession(token, data.user);
  }, [token, applySession]);

  const approveToken = useCallback(async (listingId: string) => {
    if (!token) throw new Error(tClient('err.signIn'));
    if (user?.custodyMode === 'SELF') {
      // La ATA vive en la wallet del inversor: solo su firma la puede
      // crear. Después registramos el opt-in y el emisor la autoriza.
      await signAndRelay({
        prepare: `/api/manifest/${listingId}/trustline/prepare`,
        submit: '/api/solana/submit',
        token,
      }).catch((err: any) => {
        // Sin cuenta emisora todavía no hay asset que aprobar: el opt-in queda
        // registrado en la plataforma y la ATA se crea cuando exista.
        if (/no cotiza|mercado Manifest/i.test(err?.message || '')) return null;
        throw err;
      });
    }
    const res = await fetch(`${API_BASE_URL}/api/listings/${listingId}/trustline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || tClient('err.tokenApprove'));
    applySession(token, data.data);
  }, [token, user?.custodyMode, applySession]);

  const claimTokens = useCallback(async (listingId: string) => {
    if (!token) throw new Error(tClient('err.signIn'));
    const res = await fetch(`${API_BASE_URL}/api/listings/${listingId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || tClient('err.claimFail'));
    applySession(token, data.data);
    return data.data;
  }, [token, applySession]);

  const distributeTokens = useCallback(async (listingId: string) => {
    if (!token) throw new Error(tClient('err.signIn'));
    const res = await fetch(`${API_BASE_URL}/api/listings/${listingId}/distribute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || tClient('err.distributeFail'));
    await refreshUser();
    return data.data;
  }, [token, refreshUser]);

  const finalizeOffering = useCallback(async (listingId: string) => {
    if (!token) throw new Error(tClient('err.signIn'));
    const res = await fetch(`${API_BASE_URL}/api/listings/${listingId}/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || tClient('err.finalizeFail'));
    return data.data;
  }, [token]);

  const refundContribution = useCallback(async (listingId: string, selfCustody?: boolean) => {
    if (!token) throw new Error(tClient('err.signIn'));
    if (selfCustody ?? user?.custodyMode === 'SELF') {
      const data = await signAndRelay<{ user?: User } & Record<string, unknown>>({
        prepare: `/api/listings/${listingId}/refund/prepare`,
        submit: `/api/listings/${listingId}/refund/submit`,
        token,
      });
      if (data?.user) applySession(token, data.user);
      return data;
    }
    const res = await fetch(`${API_BASE_URL}/api/listings/${listingId}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || tClient('err.refundFail'));
    if (data.data?.user) applySession(token, data.data.user);
    return data.data;
  }, [token, user?.custodyMode, applySession]);

  const claimDividends = useCallback(async (listingId: string) => {
    if (!token) throw new Error(tClient('err.signIn'));
    const res = await fetch(`${API_BASE_URL}/api/listings/${listingId}/dividends/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || tClient('err.dividendFail'));
    applySession(token, data.data.user);
  }, [token, applySession]);

  const logout = useCallback(() => {
    void import('../lib/firebase').then((m) => m.logoutFromFirebase()).catch(() => undefined);
    setUser(null);
    setToken(null);
    localStorage.removeItem('fc_auth_token');
    localStorage.removeItem('fc_auth_user');
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      loginWithGoogle,
      loginWithWallet,
      loginWithEmail,
      chooseCustody,
      linkSolanaWallet,
      submitKyc,
      approveToken,
      claimTokens,
      distributeTokens,
      claimDividends,
      finalizeOffering,
      refundContribution,
      refreshUser,
      logout,
    }),
    [
      user,
      token,
      isLoading,
      loginWithGoogle,
      loginWithWallet,
      loginWithEmail,
      chooseCustody,
      linkSolanaWallet,
      submitKyc,
      approveToken,
      claimTokens,
      distributeTokens,
      claimDividends,
      finalizeOffering,
      refundContribution,
      refreshUser,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function nextOnboardingPath(user: User | null) {
  if (!user) return '/login';
  if (user.isAdmin) return '/dashboard';
  if (!user.custodyMode) return '/onboarding/wallet';
  if (user.kycStatus === 'UNREGISTERED') return '/onboarding/kyc';
  if (user.kycStatus !== 'APPROVED') return '/onboarding/pending';
  return '/dashboard';
}

export function afterAuthPath(user: User, nextParam?: string | null) {
  if (user.isAdmin) return nextParam || '/admin/kyc';
  const dest = nextOnboardingPath(user);
  if (nextParam && user.kycStatus === 'APPROVED') return nextParam;
  return dest;
}
