import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Encoder, ixDiscriminator } from './borsh';
import {
  contributionPda,
  investorPda,
  listingSeed,
  offeringPda,
  opaPda,
  platformPda,
  programId,
  rwaMintPda,
} from './pda';

export { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID };

type Meta = { pubkey: PublicKey; isSigner?: boolean; isWritable?: boolean };

function meta(pubkey: PublicKey, opts: { mut?: boolean; signer?: boolean } = {}): Meta {
  return { pubkey, isSigner: Boolean(opts.signer), isWritable: Boolean(opts.mut) };
}

function ix(name: string, metas: Meta[], encode?: (e: Encoder) => void): TransactionInstruction {
  const enc = new Encoder();
  encode?.(enc);
  return new TransactionInstruction({
    programId: programId(),
    keys: metas.map((m) => ({
      pubkey: m.pubkey,
      isSigner: Boolean(m.isSigner),
      isWritable: Boolean(m.isWritable),
    })),
    data: Buffer.concat([ixDiscriminator(name), enc.done()]),
  });
}

export const enum PaymentKind { Usdc = 0, Usdt = 1 }
export const enum InvestorType { National = 0, Foreign = 1, Qualified = 2, Institutional = 3 }

export interface LegalInfoArg {
  fideicomisoHash: Buffer; // 32 bytes
  cnvRecordId: string;
  legalTermsUri: string;
}

/* ---------------------------------------------------------- platform */

export function ixInitializePlatform(admin: PublicKey, feeBps: number) {
  const [platform] = platformPda();
  return ix('initialize_platform', [
    meta(admin, { mut: true, signer: true }),
    meta(platform, { mut: true }),
    meta(SystemProgram.programId),
  ], (e) => e.u16(feeBps));
}

export function ixTransferAdmin(admin: PublicKey, newAdmin: PublicKey) {
  const [platform] = platformPda();
  return ix('transfer_admin', [
    meta(admin, { mut: true, signer: true }),
    meta(newAdmin, { signer: true }),
    meta(platform, { mut: true }),
  ]);
}

export function ixSetPaymentMint(admin: PublicKey, kind: PaymentKind, mint: PublicKey) {
  const [platform] = platformPda();
  return ix('set_payment_mint', [
    meta(admin, { signer: true }),
    meta(platform, { mut: true }),
  ], (e) => e.enumVariant(kind).pubkey(mint));
}

export function ixSetKycHours(admin: PublicKey, enforce: boolean) {
  const [platform] = platformPda();
  return ix('set_kyc_hours', [
    meta(admin, { signer: true }),
    meta(platform, { mut: true }),
  ], (e) => e.bool(enforce));
}

/* ---------------------------------------------------------------- kyc */

export function ixVerifyInvestor(
  admin: PublicKey,
  wallet: PublicKey,
  countryCode: number,
  investorType: InvestorType,
  expiry: bigint,
) {
  const [platform] = platformPda();
  const [investor] = investorPda(wallet);
  return ix('verify_investor', [
    meta(admin, { mut: true, signer: true }),
    meta(platform),
    meta(investor, { mut: true }),
    meta(SystemProgram.programId),
  ], (e) => e.pubkey(wallet).u32(countryCode).enumVariant(investorType).i64(expiry));
}

export function ixRevokeInvestor(admin: PublicKey, wallet: PublicKey) {
  const [platform] = platformPda();
  const [investor] = investorPda(wallet);
  return ix('revoke_investor', [
    meta(admin, { signer: true }),
    meta(platform),
    meta(investor, { mut: true }),
  ]);
}

export function ixRestoreVotes(admin: PublicKey, wallet: PublicKey) {
  const [platform] = platformPda();
  const [investor] = investorPda(wallet);
  return ix('restore_votes', [
    meta(admin, { signer: true }),
    meta(platform),
    meta(investor, { mut: true }),
  ]);
}

/* ----------------------------------------------------------- offerings */

export interface OfferingAccounts {
  offering: PublicKey;
  rwaMint: PublicKey;
  treasuryAta: PublicKey;
}

export function ixCreateOffering(
  admin: PublicKey,
  listingId: string,
  legal: LegalInfoArg,
  name: string,
  symbol: string,
  uri: string,
  treasuryAta: PublicKey,
): { instruction: TransactionInstruction; accounts: OfferingAccounts } {
  const [platform] = platformPda();
  const [offering] = offeringPda(listingId);
  const [rwaMint] = rwaMintPda(offering);
  const instruction = ix('create_offering', [
    meta(admin, { mut: true, signer: true }),
    meta(platform, { mut: true }),
    meta(offering, { mut: true }),
    meta(rwaMint, { mut: true }),
    meta(treasuryAta, { mut: true }),
    meta(TOKEN_2022_PROGRAM_ID),
    meta(ASSOCIATED_TOKEN_PROGRAM_ID),
    meta(SystemProgram.programId),
    meta(SYSVAR_RENT_PUBKEY),
  ], (e) =>
    e
      .bytes32(listingSeed(listingId))
      .bytes32(legal.fideicomisoHash)
      .str(legal.cnvRecordId)
      .str(legal.legalTermsUri)
      .str(name)
      .str(symbol)
      .str(uri),
  );
  return { instruction, accounts: { offering, rwaMint, treasuryAta } };
}

export function ixMintSupply(
  admin: PublicKey,
  listingId: string,
  amount: bigint,
  cvDepositHash: Buffer,
) {
  const [offering] = offeringPda(listingId);
  const [rwaMint] = rwaMintPda(offering);
  return ix('mint_supply', [
    meta(admin, { signer: true }),
    meta(offering, { mut: true }),
    meta(rwaMint, { mut: true }),
    meta(treasuryAtaOf(offering, rwaMint), { mut: true }),
    meta(TOKEN_2022_PROGRAM_ID),
  ], (e) => e.u64(amount).bytes32(cvDepositHash));
}

export interface OpenOfferingParams {
  admin: PublicKey;
  listingId: string;
  fiduciary: PublicKey;
  paymentMint: PublicKey;
  paymentTokenProgram: PublicKey;
  softCap: bigint;
  hardCap: bigint;
  deadline: bigint;
  pricePerUnit: bigint;
}

export function ixOpenOffering(p: OpenOfferingParams) {
  const [platform] = platformPda();
  const [offering] = offeringPda(p.listingId);
  const escrowAta = ataOf(offering, p.paymentMint, p.paymentTokenProgram);
  return ix('open_offering', [
    meta(p.admin, { mut: true, signer: true }),
    meta(platform, { mut: true }),
    meta(offering, { mut: true }),
    meta(p.paymentMint),
    meta(escrowAta, { mut: true }),
    meta(p.paymentTokenProgram),
    meta(ASSOCIATED_TOKEN_PROGRAM_ID),
    meta(SystemProgram.programId),
  ], (e) =>
    e.pubkey(p.fiduciary).u64(p.softCap).u64(p.hardCap).i64(p.deadline).u64(p.pricePerUnit));
}

export function ixSetFiduciary(admin: PublicKey, listingId: string, fiduciary: PublicKey) {
  const [offering] = offeringPda(listingId);
  return ix('set_fiduciary', [
    meta(admin, { signer: true }),
    meta(offering, { mut: true }),
  ], (e) => e.pubkey(fiduciary));
}

export function ixSetOfferingPaymentMint(
  admin: PublicKey,
  listingId: string,
  paymentMint: PublicKey,
  paymentTokenProgram: PublicKey,
) {
  const [platform] = platformPda();
  const [offering] = offeringPda(listingId);
  return ix('set_offering_payment_mint', [
    meta(admin, { mut: true, signer: true }),
    meta(platform),
    meta(offering, { mut: true }),
    meta(paymentMint),
    meta(ataOf(offering, paymentMint, paymentTokenProgram), { mut: true }),
    meta(paymentTokenProgram),
    meta(ASSOCIATED_TOKEN_PROGRAM_ID),
    meta(SystemProgram.programId),
  ]);
}

export function ixSetPricePerUnit(admin: PublicKey, listingId: string, price: bigint) {
  const [offering] = offeringPda(listingId);
  return ix('set_price_per_unit', [
    meta(admin, { signer: true }),
    meta(offering, { mut: true }),
  ], (e) => e.u64(price));
}

/* ----------------------------------------------------------- lifecycle */

export interface ContributeParams {
  listingId: string;
  buyer: PublicKey;
  paymentMint: PublicKey;
  paymentTokenProgram: PublicKey;
  amount: bigint;
}

export function ixContribute(p: ContributeParams) {
  const [offering] = offeringPda(p.listingId);
  const [investor] = investorPda(p.buyer);
  const [contribution] = contributionPda(offering, p.buyer);
  const buyerPaymentAta = ataOf(p.buyer, p.paymentMint, p.paymentTokenProgram);
  const escrowAta = ataOf(offering, p.paymentMint, p.paymentTokenProgram);
  return ix('contribute', [
    meta(p.buyer, { mut: true, signer: true }),
    meta(investor),
    meta(offering, { mut: true }),
    meta(buyerPaymentAta, { mut: true }),
    meta(p.paymentMint),
    meta(escrowAta, { mut: true }),
    meta(contribution, { mut: true }),
    meta(p.paymentTokenProgram),
    meta(SystemProgram.programId),
  ], (e) => e.u64(p.amount));
}

/** Permissionless crank: delivers `wallet`'s units after a successful close. */
export function ixDistribute(caller: PublicKey, listingId: string, wallet: PublicKey) {
  const [offering] = offeringPda(listingId);
  const [rwaMint] = rwaMintPda(offering);
  const [investor] = investorPda(wallet);
  const [contribution] = contributionPda(offering, wallet);
  const [opa] = opaPda(offering);
  return ix('distribute', [
    meta(caller, { mut: true, signer: true }),
    meta(offering, { mut: true }),
    meta(wallet, { mut: true }),
    meta(investor, { mut: true }),
    meta(contribution, { mut: true }),
    meta(ataOf(wallet, rwaMint, TOKEN_2022_PROGRAM_ID), { mut: true }),
    meta(rwaMint),
    meta(ataOf(offering, rwaMint, TOKEN_2022_PROGRAM_ID), { mut: true }),
    meta(opa, { mut: true }),
    meta(TOKEN_2022_PROGRAM_ID),
    meta(ASSOCIATED_TOKEN_PROGRAM_ID),
    meta(SystemProgram.programId),
  ]);
}

export function ixFinalize(
  caller: PublicKey,
  listingId: string,
  fiduciary: PublicKey,
  paymentMint: PublicKey,
  paymentTokenProgram: PublicKey,
) {
  const [offering] = offeringPda(listingId);
  const escrowAta = ataOf(offering, paymentMint, paymentTokenProgram);
  const fiduciaryAta = ataOf(fiduciary, paymentMint, paymentTokenProgram);
  return ix('finalize', [
    meta(caller, { mut: true, signer: true }),
    meta(offering, { mut: true }),
    meta(escrowAta, { mut: true }),
    meta(fiduciaryAta, { mut: true }),
    meta(fiduciary),
    meta(paymentMint),
    meta(paymentTokenProgram),
    meta(ASSOCIATED_TOKEN_PROGRAM_ID),
    meta(SystemProgram.programId),
  ]);
}

/**
 * Permissionless crank: refunds `wallet`'s escrowed payment after a failed
 * close. `caller` pays the fee + refund ATA rent; the contributor never signs.
 */
export function ixRefund(
  caller: PublicKey,
  listingId: string,
  wallet: PublicKey,
  paymentMint: PublicKey,
  paymentTokenProgram: PublicKey,
) {
  const [offering] = offeringPda(listingId);
  const [contribution] = contributionPda(offering, wallet);
  return ix('refund', [
    meta(caller, { mut: true, signer: true }),
    meta(offering, { mut: true }),
    meta(wallet, { mut: true }),
    meta(contribution, { mut: true }),
    meta(paymentMint),
    meta(ataOf(offering, paymentMint, paymentTokenProgram), { mut: true }),
    meta(ataOf(wallet, paymentMint, paymentTokenProgram), { mut: true }),
    meta(paymentTokenProgram),
    meta(ASSOCIATED_TOKEN_PROGRAM_ID),
    meta(SystemProgram.programId),
  ]);
}

export function ixWithdrawProceeds(
  admin: PublicKey,
  listingId: string,
  fiduciary: PublicKey,
  paymentMint: PublicKey,
  paymentTokenProgram: PublicKey,
) {
  const [offering] = offeringPda(listingId);
  return ix('withdraw_proceeds', [
    meta(admin, { signer: true }),
    meta(offering, { mut: true }),
    meta(ataOf(offering, paymentMint, paymentTokenProgram), { mut: true }),
    meta(ataOf(fiduciary, paymentMint, paymentTokenProgram), { mut: true }),
    meta(fiduciary),
    meta(paymentMint),
    meta(paymentTokenProgram),
  ]);
}

/* ---------------------------------------------------- OPA / squeeze-out */

export function ixCheckThreshold(
  crank: PublicKey,
  listingId: string,
  holder: PublicKey,
  rwaMint: PublicKey,
) {
  const [offering] = offeringPda(listingId);
  const [investor] = investorPda(holder);
  const [opa] = opaPda(offering);
  return ix('check_threshold', [
    meta(crank, { mut: true, signer: true }),
    meta(investor, { mut: true }),
    meta(offering),
    meta(ataOf(holder, rwaMint, TOKEN_2022_PROGRAM_ID)),
    meta(opa, { mut: true }),
    meta(SystemProgram.programId),
  ]);
}

export interface OpaIxParams {
  listingId: string;
  acquirer: PublicKey;
  paymentMint: PublicKey;
  paymentTokenProgram: PublicKey;
}

function opaCommon(p: OpaIxParams) {
  const [offering] = offeringPda(p.listingId);
  const [rwaMint] = rwaMintPda(offering);
  const [opa] = opaPda(offering);
  const [investor] = investorPda(p.acquirer);
  return { offering, rwaMint, opa, investor };
}

export function ixLaunchOpa(p: OpaIxParams, pricePerShare: bigint) {
  const { offering, rwaMint, opa, investor } = opaCommon(p);
  return ix('launch_opa', [
    meta(p.acquirer, { mut: true, signer: true }),
    meta(investor),
    meta(offering, { mut: true }),
    meta(opa, { mut: true }),
    meta(ataOf(p.acquirer, rwaMint, TOKEN_2022_PROGRAM_ID)),
    meta(ataOf(p.acquirer, p.paymentMint, p.paymentTokenProgram), { mut: true }),
    meta(ataOf(offering, p.paymentMint, p.paymentTokenProgram), { mut: true }),
    meta(p.paymentMint),
    meta(p.paymentTokenProgram),
  ], (e) => e.u64(pricePerShare));
}

export function ixAcceptOpa(
  listingId: string,
  seller: PublicKey,
  acquirer: PublicKey,
  paymentMint: PublicKey,
  paymentTokenProgram: PublicKey,
) {
  const [offering] = offeringPda(listingId);
  const [rwaMint] = rwaMintPda(offering);
  const [opa] = opaPda(offering);
  const [acquirerInvestor] = investorPda(acquirer);
  return ix('accept_opa', [
    meta(seller, { mut: true, signer: true }),
    meta(acquirer),
    meta(acquirerInvestor),
    meta(offering, { mut: true }),
    meta(opa, { mut: true }),
    meta(ataOf(seller, rwaMint, TOKEN_2022_PROGRAM_ID), { mut: true }),
    meta(ataOf(acquirer, rwaMint, TOKEN_2022_PROGRAM_ID), { mut: true }),
    meta(ataOf(seller, paymentMint, paymentTokenProgram), { mut: true }),
    meta(ataOf(offering, paymentMint, paymentTokenProgram), { mut: true }),
    meta(rwaMint),
    meta(paymentMint),
    meta(TOKEN_2022_PROGRAM_ID),
    meta(paymentTokenProgram),
  ]);
}

export function ixReclaimOpa(p: OpaIxParams) {
  const { offering, opa } = opaCommon(p);
  return ix('reclaim_opa', [
    meta(p.acquirer, { mut: true, signer: true }),
    meta(offering),
    meta(opa, { mut: true }),
    meta(ataOf(p.acquirer, p.paymentMint, p.paymentTokenProgram), { mut: true }),
    meta(ataOf(offering, p.paymentMint, p.paymentTokenProgram), { mut: true }),
    meta(p.paymentMint),
    meta(p.paymentTokenProgram),
  ]);
}

export function ixExecuteSqueezeOut(p: OpaIxParams, pricePerShare: bigint) {
  const { offering, rwaMint, opa, investor } = opaCommon(p);
  return ix('execute_squeeze_out', [
    meta(p.acquirer, { mut: true, signer: true }),
    meta(investor),
    meta(offering, { mut: true }),
    meta(opa, { mut: true }),
    meta(ataOf(p.acquirer, rwaMint, TOKEN_2022_PROGRAM_ID)),
    meta(ataOf(p.acquirer, p.paymentMint, p.paymentTokenProgram), { mut: true }),
    meta(ataOf(offering, p.paymentMint, p.paymentTokenProgram), { mut: true }),
    meta(p.paymentMint),
    meta(p.paymentTokenProgram),
    meta(SystemProgram.programId),
  ], (e) => e.u64(pricePerShare));
}

export function ixClaimSqueezeOut(
  listingId: string,
  holder: PublicKey,
  paymentMint: PublicKey,
  paymentTokenProgram: PublicKey,
) {
  const [offering] = offeringPda(listingId);
  const [rwaMint] = rwaMintPda(offering);
  const [opa] = opaPda(offering);
  return ix('claim_squeeze_out', [
    meta(holder, { mut: true, signer: true }),
    meta(offering),
    meta(opa),
    meta(ataOf(holder, rwaMint, TOKEN_2022_PROGRAM_ID), { mut: true }),
    meta(ataOf(holder, paymentMint, paymentTokenProgram), { mut: true }),
    meta(ataOf(offering, paymentMint, paymentTokenProgram), { mut: true }),
    meta(rwaMint),
    meta(paymentMint),
    meta(TOKEN_2022_PROGRAM_ID),
    meta(paymentTokenProgram),
    meta(ASSOCIATED_TOKEN_PROGRAM_ID),
    meta(SystemProgram.programId),
  ]);
}

/* ----------------------------------------------------------- compliance */

function ixCompliance(admin: PublicKey, listingId: string, tokenAccount: PublicKey, name: string) {
  const [platform] = platformPda();
  const [offering] = offeringPda(listingId);
  const [rwaMint] = rwaMintPda(offering);
  return ix(name, [
    meta(admin, { signer: true }),
    meta(platform),
    meta(offering),
    meta(rwaMint),
    meta(tokenAccount, { mut: true }),
    meta(TOKEN_2022_PROGRAM_ID),
  ]);
}

export const ixFreezeHolder = (a: PublicKey, l: string, t: PublicKey) =>
  ixCompliance(a, l, t, 'freeze_holder');
export const ixThawHolder = (a: PublicKey, l: string, t: PublicKey) =>
  ixCompliance(a, l, t, 'thaw_holder');
export const ixAuthorizeMarketVault = (a: PublicKey, l: string, t: PublicKey) =>
  ixCompliance(a, l, t, 'authorize_market_vault');

export function ixRecordMarketPrice(admin: PublicKey, listingId: string, price: bigint) {
  const [platform] = platformPda();
  const [offering] = offeringPda(listingId);
  return ix('record_market_price', [
    meta(admin, { signer: true }),
    meta(platform),
    meta(offering, { mut: true }),
  ], (e) => e.u64(price));
}

/* -------------------------------------------------------------- helpers */

import { getAssociatedTokenAddressSync } from '@solana/spl-token';

/** ATA(owner, mint) — off-curve owners (PDAs) are allowed. */
export function ataOf(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey) {
  return getAssociatedTokenAddressSync(mint, owner, true, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
}

function treasuryAtaOf(offering: PublicKey, rwaMint: PublicKey) {
  return ataOf(offering, rwaMint, TOKEN_2022_PROGRAM_ID);
}
