import { PublicKey } from '@solana/web3.js';
import crypto from 'crypto';
import { FALLBACK_PROGRAM_ID } from './connection';
import { readDeployment } from './connection';

export function programId(): PublicKey {
  const dep = readDeployment<{ programId?: string }>();
  return new PublicKey(dep?.programId || FALLBACK_PROGRAM_ID);
}

/** SHA-256 of the off-chain listing id → 32-byte offering seed. */
export function listingSeed(listingId: string): Buffer {
  return crypto.createHash('sha256').update(listingId, 'utf8').digest();
}

export function platformPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('platform')], programId());
}

export function investorPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('investor'), wallet.toBuffer()],
    programId(),
  );
}

export function offeringPda(listingId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('offering'), listingSeed(listingId)],
    programId(),
  );
}

export function rwaMintPda(offering: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('rwa_mint'), offering.toBuffer()],
    programId(),
  );
}

export function contributionPda(offering: PublicKey, wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('contribution'), offering.toBuffer(), wallet.toBuffer()],
    programId(),
  );
}

export function opaPda(offering: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('opa'), offering.toBuffer()],
    programId(),
  );
}
