import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { fetchOffering } from './offering_state';
import { adminKeypair } from './keys';
import { ensureInvestorPdaForDistribute, ensureInvestorVerifiedForOps } from './kyc';
import {
  ataOf,
  ixContribute,
  ixCreateOffering,
  ixDistribute,
  ixFinalize,
  ixMintSupply,
  ixOpenOffering,
  ixRefund,
  ixSetFiduciary,
  ixWithdrawProceeds,
  TOKEN_2022_PROGRAM_ID,
} from './program';
import { buildUnsignedTx, mapSolanaError, sendIxs, submitSignedTx } from './tx';
import { offeringPda, rwaMintPda } from './pda';
import { paymentTokenProgram, usdcMintOrThrow } from './usdc';

/** Matches `LegalInfo` #[max_len] in programs/fractachain/src/state.rs. */
export const LEGAL_CNV_RECORD_MAX = 64;
export const LEGAL_TERMS_URI_MAX = 128;

export interface LegalInfoInput {
  fideicomisoHash: Buffer;
  cnvRecordId: string;
  legalTermsUri: string;
}

/** Exported for unit tests — mirrors program `LegalInfo` #[max_len]. */
export function assertLegalInfoLengths(legal: LegalInfoInput) {
  if (legal.cnvRecordId.length > LEGAL_CNV_RECORD_MAX) {
    throw new Error(`cnvRecordId supera ${LEGAL_CNV_RECORD_MAX} caracteres (InitSpace on-chain)`);
  }
  if (legal.legalTermsUri.length > LEGAL_TERMS_URI_MAX) {
    throw new Error(`legalTermsUri supera ${LEGAL_TERMS_URI_MAX} caracteres (InitSpace on-chain)`);
  }
  if (legal.fideicomisoHash.length !== 32) {
    throw new Error('fideicomisoHash debe ser exactamente 32 bytes');
  }
}

/**
 * Payment mint + token program for an already-opened Offering.
 * Prefers the on-chain snapshot so env drift cannot break contribute/finalize/refund.
 */
export async function offeringPaymentContext(listingId: string): Promise<{
  paymentMint: PublicKey;
  paymentTokenProgram: PublicKey;
}> {
  const snap = await fetchOffering(listingId);
  if (snap && !snap.paymentMint.equals(PublicKey.default)) {
    return { paymentMint: snap.paymentMint, paymentTokenProgram: paymentTokenProgram() };
  }
  return { paymentMint: usdcMintOrThrow(), paymentTokenProgram: paymentTokenProgram() };
}

/**
 * Creates the Offering PDA + Token-2022 RWA mint + treasury ATA in one tx.
 * Admin-signed (platform pays rent).
 */
export async function createOfferingOnChain(
  listingId: string,
  legal: LegalInfoInput,
  tokenMeta: { name: string; symbol: string; uri: string },
) {
  assertLegalInfoLengths(legal);
  const admin = adminKeypair();
  const [offering] = offeringPda(listingId);
  const [rwaMint] = rwaMintPda(offering);
  const treasuryAta = ataOf(offering, rwaMint, TOKEN_2022_PROGRAM_ID);
  const { instruction, accounts } = ixCreateOffering(
    admin.publicKey,
    listingId,
    {
      fideicomisoHash: legal.fideicomisoHash,
      cnvRecordId: legal.cnvRecordId,
      legalTermsUri: legal.legalTermsUri,
    },
    tokenMeta.name,
    tokenMeta.symbol,
    tokenMeta.uri,
    treasuryAta,
  );
  const signature = await sendIxs(admin, [], [instruction]).catch((e) => {
    throw mapSolanaError(e);
  });
  return { signature, ...accounts };
}

export async function mintSupplyOnChain(
  listingId: string,
  amountUnits: bigint,
  cvDepositHash: Buffer,
) {
  const admin = adminKeypair();
  const instruction = ixMintSupply(admin.publicKey, listingId, amountUnits, cvDepositHash);
  return sendIxs(admin, [], [instruction]).catch((e) => {
    throw mapSolanaError(e);
  });
}

export interface OpenOfferingInput {
  listingId: string;
  fiduciary: PublicKey;
  softCap: bigint;
  hardCap: bigint;
  deadline: bigint;
  pricePerUnit: bigint;
}

export async function openOfferingOnChain(p: OpenOfferingInput) {
  const admin = adminKeypair();
  const instruction = ixOpenOffering({
    admin: admin.publicKey,
    listingId: p.listingId,
    fiduciary: p.fiduciary,
    paymentMint: usdcMintOrThrow(),
    paymentTokenProgram: TOKEN_PROGRAM_ID,
    softCap: p.softCap,
    hardCap: p.hardCap,
    deadline: p.deadline,
    pricePerUnit: p.pricePerUnit,
  });
  return sendIxs(admin, [], [instruction]).catch((e) => {
    throw mapSolanaError(e);
  });
}

export async function setFiduciaryOnChain(listingId: string, fiduciary: PublicKey) {
  const admin = adminKeypair();
  return sendIxs(admin, [], [ixSetFiduciary(admin.publicKey, listingId, fiduciary)]).catch(
    (e) => {
      throw mapSolanaError(e);
    },
  );
}

/* ------------------------------------------------ contribute / refund */

/**
 * Custodial contribute: the backend has the buyer's keypair and signs.
 */
export async function contributeOnChain(
  listingId: string,
  buyer: Keypair,
  amountUnits: bigint,
) {
  await ensureInvestorVerifiedForOps(buyer.publicKey);
  const pay = await offeringPaymentContext(listingId);
  const instruction = ixContribute({
    listingId,
    buyer: buyer.publicKey,
    paymentMint: pay.paymentMint,
    paymentTokenProgram: pay.paymentTokenProgram,
    amount: amountUnits,
  });
  return sendIxs(buyer, [], [instruction]).catch((e) => {
    throw mapSolanaError(e);
  });
}

/**
 * Self-custody contribute: unsigned tx for the wallet to sign.
 */
export async function prepareContributeTx(
  listingId: string,
  buyer: PublicKey,
  amountUnits: bigint,
) {
  // Program requires a live Investor PDA; on Devnet we mint one without a form.
  await ensureInvestorVerifiedForOps(buyer);
  const pay = await offeringPaymentContext(listingId);
  const instruction = ixContribute({
    listingId,
    buyer,
    paymentMint: pay.paymentMint,
    paymentTokenProgram: pay.paymentTokenProgram,
    amount: amountUnits,
  });
  return buildUnsignedTx(buyer, [instruction]);
}

export async function submitContributeTx(signedTx: string) {
  return submitSignedTx(signedTx).catch((e) => {
    throw mapSolanaError(e);
  });
}

export async function prepareRefundTx(listingId: string, contributor: PublicKey) {
  const pay = await offeringPaymentContext(listingId);
  const instruction = ixRefund(
    contributor,
    listingId,
    contributor,
    pay.paymentMint,
    pay.paymentTokenProgram,
  );
  return buildUnsignedTx(contributor, [instruction]);
}

/** Crank refund — `caller` signs and pays; `wallet` gets the escrow back. */
export async function refundOnChain(caller: Keypair, listingId: string, wallet: PublicKey) {
  const pay = await offeringPaymentContext(listingId);
  const instruction = ixRefund(
    caller.publicKey,
    listingId,
    wallet,
    pay.paymentMint,
    pay.paymentTokenProgram,
  );
  return sendIxs(caller, [], [instruction]).catch((e) => {
    throw mapSolanaError(e);
  });
}

export async function submitRefundTx(signedTx: string) {
  return submitSignedTx(signedTx).catch((e) => {
    throw mapSolanaError(e);
  });
}

/** Crank distribute — delivers `wallet`'s units after a successful close. */
export async function distributeOnChain(caller: Keypair, listingId: string, wallet: PublicKey) {
  // PDA must exist; expired/revoked KYC is OK (program delivers then re-freezes).
  await ensureInvestorPdaForDistribute(wallet);
  const instruction = ixDistribute(caller.publicKey, listingId, wallet);
  return sendIxs(caller, [], [instruction]).catch((e) => {
    throw mapSolanaError(e);
  });
}

/* --------------------------------------------------- finalize / withdraw */

/** Permissionless — any signer may crank it once cap/deadline is reached. */
export async function finalizeOnChain(listingId: string, crank: Keypair) {
  const snap = await fetchOffering(listingId);
  if (!snap) throw new Error('Offering no existe on-chain');
  const pay = await offeringPaymentContext(listingId);
  const instruction = ixFinalize(
    crank.publicKey,
    listingId,
    snap.fiduciary,
    pay.paymentMint,
    pay.paymentTokenProgram,
  );
  return sendIxs(crank, [], [instruction]).catch((e) => {
    throw mapSolanaError(e);
  });
}

export async function withdrawProceedsOnChain(listingId: string) {
  const admin = adminKeypair();
  const snap = await fetchOffering(listingId);
  if (!snap) throw new Error('Offering no existe on-chain');
  const pay = await offeringPaymentContext(listingId);
  const instruction = ixWithdrawProceeds(
    admin.publicKey,
    listingId,
    snap.fiduciary,
    pay.paymentMint,
    pay.paymentTokenProgram,
  );
  return sendIxs(admin, [], [instruction]).catch((e) => {
    throw mapSolanaError(e);
  });
}

export function unsignedTxForIxs(payer: PublicKey, ixs: TransactionInstruction[]) {
  return buildUnsignedTx(payer, ixs);
}
