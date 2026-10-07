'use client';

import { usePathname } from 'next/navigation';
import OnboardingGuard from './OnboardingGuard';
import AdminGate from './AdminGate';

const GATED = ['/dashboard'];

export default function AppGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith('/admin')) {
    return <AdminGate>{children}</AdminGate>;
  }
  const gated = GATED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!gated) return <>{children}</>;
  return <OnboardingGuard>{children}</OnboardingGuard>;
}
