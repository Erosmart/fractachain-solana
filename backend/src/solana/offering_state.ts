import { PublicKey } from '@solana/web3.js';
import { accountDiscriminator, Reader } from './borsh';
import { getConnection } from './connection';
import { offeringPda, investorPda, opaPda, contributionPda, platformPda } from './pda';

export type OfferingStateName =
  | 'Draft'
  | 'Minted'
  | 'Open'
  | 'Successful'
  | 'Failed'
  | 'Terminated';

const OFFERING_STATES: OfferingStateName[] = [
  'Draft',
  'Minted',
  'Open',
  'Successful',
  'Failed',
  'Terminated',
];

export interface OfferingSnapshot {
  offering: PublicKey;
  listingSeed: string; // hex
  admin: PublicKey;
  fiduciary: PublicKey;
  paymentMint: PublicKey;
  paymentKind: 'Usdc' | 'Usdt';
  rwaMint: PublicKey;
  treasuryAta: PublicKey;
  escrowAta: PublicKey;
  softCap: bigint;
  hardCap: bigint;
  deadline: bigint;
  pricePerUnit: bigint;
  totalRaised: bigint;
  unitsMinted: bigint;
  unitsSold: bigint;
  cvDepositHash: string; // hex
  state: OfferingStateName;
  fideicomisoHash: string; // hex
  cnvRecordId: string;
  legalTermsUri: string;
  proceedsWithdrawn: boolean;
  highestPrice: bigint;
  squeezePrice: bigint;
  productId: bigint;
}

export function decodeOffering(data: Buffer): OfferingSnapshot {
  const r = new Reader(data);
  const disc = r.bytes(8);
  if (!disc.equals(accountDiscriminator('Offering'))) {
    throw new Error('Not an Offering account');
  }
  const listingSeed = r.bytes(32);
  const admin = r.pubkey();
  const fiduciary = r.pubkey();
  const paymentMint = r.pubkey();
  const paymentKind = r.u8() === 0 ? 'Usdc' : 'Usdt';
  const rwaMint = r.pubkey();
  const treasuryAta = r.pubkey();
  const escrowAta = r.pubkey();
  const softCap = r.u64();
  const hardCap = r.u64();
  const deadline = r.i64();
  const pricePerUnit = r.u64();
  const totalRaised = r.u64();
  const unitsMinted = r.u64();
  const unitsSold = r.u64();
  const cvDepositHash = r.bytes(32);
  const state = OFFERING_STATES[r.u8()] ?? 'Draft';
  const fideicomisoHash = r.bytes(32);
  const cnvRecordId = r.str();
  const legalTermsUri = r.str();
  const proceedsWithdrawn = r.bool();
  const highestPrice = r.u64();
  const squeezePrice = r.u64();
  const productId = r.u64();
  return {
    offering: PublicKey.default,
    listingSeed: listingSeed.toString('hex'),
    admin,
    fiduciary,
    paymentMint,
    paymentKind,
    rwaMint,
    treasuryAta,
    escrowAta,
    softCap,
    hardCap,
    deadline,
    pricePerUnit,
    totalRaised,
    unitsMinted,
    unitsSold,
    cvDepositHash: cvDepositHash.toString('hex'),
    state,
    fideicomisoHash: fideicomisoHash.toString('hex'),
    cnvRecordId,
    legalTermsUri,
    proceedsWithdrawn,
    highestPrice,
    squeezePrice,
    productId,
  };
}

export interface InvestorSnapshot {
  wallet: PublicKey;
  countryCode: number;
  investorType: number;
  kycExpiry: bigint;
  isActive: boolean;
  votingRights: boolean;
}

export function decodeInvestor(data: Buffer): InvestorSnapshot {
  const r = new Reader(data);
  const disc = r.bytes(8);
  if (!disc.equals(accountDiscriminator('Investor'))) {
    throw new Error('Not an Investor account');
  }
  const wallet = r.pubkey();
  const countryCode = r.u32();
  const investorType = r.u8();
  const kycExpiry = r.i64();
  const isActive = r.bool();
  const votingRights = r.bool();
  r.i64(); // registered_at
  r.u8(); // bump
  return { wallet, countryCode, investorType, kycExpiry, isActive, votingRights };
}

export type OpaStateName = 'Triggered' | 'ActiveOffer' | 'SuspendedVotes' | 'SqueezedOut';

export interface OpaSnapshot {
  offering: PublicKey;
  state: OpaStateName;
  acquirer: PublicKey;
  pricePerShare: bigint;
  escrowAmount: bigint;
  acceptedTotal: bigint;
  triggeredAt: bigint;
  deadline: bigint;
}

export function decodeOpa(data: Buffer): OpaSnapshot {
  const r = new Reader(data);
  r.bytes(8);
  const states: OpaStateName[] = ['Triggered', 'ActiveOffer', 'SuspendedVotes', 'SqueezedOut'];
  const offering = r.pubkey();
  const state = states[r.u8()] ?? 'Triggered';
  const acquirer = r.pubkey();
  const pricePerShare = r.u64();
  const escrowAmount = r.u64();
  const acceptedTotal = r.u64();
  const triggeredAt = r.i64();
  const deadline = r.i64();
  return { offering, state, acquirer, pricePerShare, escrowAmount, acceptedTotal, triggeredAt, deadline };
}

export interface ContributionSnapshot {
  offering: PublicKey;
  wallet: PublicKey;
  amount: bigint;
  units: bigint;
}

export function decodeContribution(data: Buffer): ContributionSnapshot {
  const r = new Reader(data);
  r.bytes(8);
  const offering = r.pubkey();
  const wallet = r.pubkey();
  const amount = r.u64();
  const units = r.u64();
  return { offering, wallet, amount, units };
}

export interface PlatformSnapshot {
  admin: PublicKey;
  usdcMint: PublicKey;
  usdtMint: PublicKey | null;
  feeBps: number;
  enforceKycHours: boolean;
  productCount: bigint;
}

export function decodePlatform(data: Buffer): PlatformSnapshot {
  const r = new Reader(data);
  r.bytes(8);
  const admin = r.pubkey();
  const usdcMint = r.pubkey();
  const usdtMint = r.optionPubkey();
  const feeBps = r.u16();
  const enforceKycHours = r.bool();
  const productCount = r.u64();
  return { admin, usdcMint, usdtMint, feeBps, enforceKycHours, productCount };
}

/* ------------------------------------------------------------ fetchers */

export async function fetchOffering(listingId: string): Promise<OfferingSnapshot | null> {
  const [pda] = offeringPda(listingId);
  const info = await getConnection().getAccountInfo(pda);
  if (!info?.data?.length) return null;
  const snap = decodeOffering(info.data as Buffer);
  snap.offering = pda;
  return snap;
}

export async function fetchInvestor(wallet: PublicKey): Promise<InvestorSnapshot | null> {
  const [pda] = investorPda(wallet);
  const info = await getConnection().getAccountInfo(pda);
  if (!info?.data?.length) return null;
  return decodeInvestor(info.data as Buffer);
}

export async function fetchOpa(listingId: string): Promise<OpaSnapshot | null> {
  const [offering] = offeringPda(listingId);
  const [pda] = opaPda(offering);
  const info = await getConnection().getAccountInfo(pda);
  if (!info?.data?.length) return null;
  return decodeOpa(info.data as Buffer);
}

export async function fetchContribution(
  listingId: string,
  wallet: PublicKey,
): Promise<ContributionSnapshot | null> {
  const [offering] = offeringPda(listingId);
  const [pda] = contributionPda(offering, wallet);
  const info = await getConnection().getAccountInfo(pda);
  if (!info?.data?.length) return null;
  return decodeContribution(info.data as Buffer);
}

export async function fetchPlatform(): Promise<PlatformSnapshot | null> {
  const [pda] = platformPda();
  const info = await getConnection().getAccountInfo(pda);
  if (!info?.data?.length) return null;
  return decodePlatform(info.data as Buffer);
}
