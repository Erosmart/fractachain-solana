import { PublicKey } from '@solana/web3.js';
import { verifyInvestorOnChain, revokeInvestorOnChain } from '../solana/kyc';
import { isSolanaPublicKey } from '../solana/keys';


export type InvestorType = 'National' | 'Foreign' | 'Qualified' | 'Institutional';
export type KycStatus = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'REVOCADO';

export interface KycRecord {
  id: string;
  userId?: string;
  fullName: string;
  documentNumber: string;
  taxId?: string; // CUIL / CUIT o CIE
  countryCode: number; // ISO 3166-1 numeric
  countryName: string;
  address: string;
  investorType: InvestorType;
  walletAddress: string;
  documentFrontUrl: string;
  documentBackUrl?: string;
  selfieUrl: string;
  status: KycStatus;
  rejectionReason?: string;
  createdAt: string;
  reviewedAt?: string;
  expiresAt?: string;
}

// Lista GAFI de Alto Riesgo (Rechazo automático)
export const GAFI_BLACKLIST = [
  { code: 364, name: 'Irán' },
  { code: 408, name: 'Corea del Norte' },
  { code: 104, name: 'Myanmar' },
];

export function isGafiBlacklisted(countryCode: number): boolean {
  return GAFI_BLACKLIST.some(c => c.code === countryCode);
}

// In-Memory Database (Pre-cargada con ejemplos demostrativos)
let kycDatabase: KycRecord[] = [
  {
    id: 'kyc-001',
    fullName: 'Esteban Juan Morales',
    documentNumber: '34892110',
    taxId: '20-34892110-3',
    countryCode: 32, // Argentina
    countryName: 'Argentina',
    address: 'Av. Libertador 4520, CABA',
    investorType: 'National',
    walletAddress: '5xot9PVkPHVfvWxvXzMhQq9rY5vWn1bVfQ7kQp8mE3xJ',
    documentFrontUrl: '/mock/dni_front.jpg',
    documentBackUrl: '/mock/dni_back.jpg',
    selfieUrl: '/mock/selfie_esteban.jpg',
    status: 'APROBADO',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    reviewedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    expiresAt: new Date(Date.now() + 86400000 * 360).toISOString(),
  },
  {
    id: 'kyc-002',
    fullName: 'Sophie Catherine Dubois',
    documentNumber: '19FR84920',
    taxId: 'CIE-994821',
    countryCode: 250, // Francia
    countryName: 'Francia',
    address: '14 Rue Saint-Honoré, París',
    investorType: 'Foreign',
    walletAddress: '7yL4bN2wHjK8sPqR3tF9uXcV5zE6dG1aM8nB4vC7xT2W',
    documentFrontUrl: '/mock/passport_fr.jpg',
    selfieUrl: '/mock/selfie_sophie.jpg',
    status: 'PENDIENTE',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'kyc-003',
    fullName: 'Wei Zhang',
    documentNumber: 'CN88392019',
    countryCode: 156, // China
    countryName: 'China',
    address: 'Nanjing Rd 102, Shanghai',
    investorType: 'Foreign',
    walletAddress: '9pQ3mK6rT8wX2yN5bH7cV4fJ1sE9gL6uZ3aD8kB5nM2P',
    documentFrontUrl: '/mock/passport_cn.jpg',
    selfieUrl: '/mock/selfie_wei.jpg',
    status: 'PENDIENTE',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
];

export function getAllKycRecords(statusFilter?: KycStatus): KycRecord[] {
  if (statusFilter) {
    return kycDatabase.filter(r => r.status === statusFilter);
  }
  return kycDatabase;
}

export function getKycById(id: string): KycRecord | undefined {
  return kycDatabase.find(r => r.id === id);
}

export function registerKyc(data: Omit<KycRecord, 'id' | 'status' | 'createdAt'> & { id?: string }): { success: boolean; record?: KycRecord; error?: string } {
  // Verificación automática de lista negra GAFI
  if (isGafiBlacklisted(data.countryCode)) {
    return {
      success: false,
      error: `Registro denegado automáticamente: El país ${data.countryName} integra la Lista de Alto Riesgo del GAFI (FATF Blacklist).`,
    };
  }

  const record: KycRecord = {
    ...data,
    id: data.id || `kyc-${Date.now()}`,
    status: 'PENDIENTE',
    createdAt: new Date().toISOString(),
  };

  kycDatabase.unshift(record);
  return { success: true, record };
}

// Verificación de horario laboral bancario argentino (UTC-3)
// Lunes a Viernes de 08:00 a 16:00 ART para mitigar compromisos de claves de administración fuera de hora.
export function isArgentinaBusinessHours(date: Date = new Date()): boolean {
  const artString = date.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' });
  const artDate = new Date(artString);
  const day = artDate.getDay(); // 0 = Domingo, 1 = Lunes, ..., 5 = Viernes, 6 = Sábado
  const hour = artDate.getHours();

  return day >= 1 && day <= 5 && hour >= 8 && hour < 16;
}

export function approveKyc(id: string, bypassHoursCheck: boolean = false): { success: boolean; record?: KycRecord; error?: string } {
  const record = kycDatabase.find(r => r.id === id);
  if (!record) return { success: false, error: 'Solicitud no encontrada' };

  if (!isArgentinaBusinessHours() && !bypassHoursCheck && process.env.KYC_ENFORCE_HOURS === 'true') {
    return {
      success: false,
      error: 'Autorización on-chain bloqueada fuera del horario laboral argentino (Lunes a Viernes 08:00 a 16:00 ART). Medida de seguridad anti-compromiso.',
    };
  }

  record.status = 'APROBADO';
  record.reviewedAt = new Date().toISOString();
  record.expiresAt = new Date(Date.now() + 86400000 * 365).toISOString(); // 12 meses vigencia

  try {
    const { setKycStatus, setKycStatusByKycId } = require('../auth/accounts');
    if (record.userId) setKycStatus(record.userId, 'APPROVED');
    else setKycStatusByKycId(record.id, 'APPROVED');
  } catch {
    // accounts store optional
  }

  // On-chain half of the approval: authorize the holder's trustlines so the
  // ledger itself starts letting them hold and trade. Fire-and-forget on
  // purpose — the officer's decision is already recorded, and a Horizon
  // hiccup is recoverable through syncHolderAuthorization.
  if (isSolanaPublicKey(record.walletAddress)) void verifyInvestorOnChain(new PublicKey(record.walletAddress)).catch(() => {});


  return { success: true, record };
}

export function rejectKyc(id: string, reason: string): { success: boolean; record?: KycRecord; error?: string } {
  const record = kycDatabase.find(r => r.id === id);
  if (!record) return { success: false, error: 'Solicitud no encontrada' };

  record.status = 'RECHAZADO';
  record.rejectionReason = reason;
  record.reviewedAt = new Date().toISOString();
  try {
    const { setKycStatus, setKycStatusByKycId } = require('../auth/accounts');
    if (record.userId) setKycStatus(record.userId, 'REJECTED');
    else setKycStatusByKycId(record.id, 'REJECTED');
  } catch {}

  return { success: true, record };
}

export function revokeKyc(id: string, reason: string): { success: boolean; record?: KycRecord; error?: string } {
  const record = kycDatabase.find(r => r.id === id);
  if (!record) return { success: false, error: 'Solicitud no encontrada' };

  record.status = 'REVOCADO';
  record.rejectionReason = reason;
  record.reviewedAt = new Date().toISOString();

  try {
    const { setKycStatus, setKycStatusByKycId } = require('../auth/accounts');
    if (record.userId) setKycStatus(record.userId, 'REVOKED');
    else setKycStatusByKycId(record.id, 'REVOKED');
  } catch {}

  // Hard freeze: clearing the authorized flag without maintain-liabilities
  // makes the network delete this holder's open offers as well as locking the
  // balance. A revocation is a compliance action, not a grace period.
  if (isSolanaPublicKey(record.walletAddress)) void revokeInvestorOnChain(new PublicKey(record.walletAddress)).catch(() => {});

  return { success: true, record };
}

// On Solana the Investor PDA is platform-wide: a single `verify_investor`
// covers every offering, so no per-listing whitelist step is needed.
