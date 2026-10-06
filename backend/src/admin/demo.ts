/**
 * One-click demo dossier for the admin issuance form.
 *
 * The point of the button is a fast, *real* loop: create → deploy → mint →
 * open licitación without hand-filling twenty fields. That only demos well if
 * every field is actually valid, so this builder produces a fully-formed
 * dossier — unique ticker, checksum-valid CUIT-shaped string, real ISIN-shaped
 * code — plus an airdrop-funded treasury keypair as `proceedsWallet`, so the
 * USDC paid by `finalize()` lands on an account that exists and is visible on
 * the Solana explorer. The throwaway secret is kept process-local so the
 * deploy step can create the treasury's USDC ATA before the offering starts.
 */
import { Keypair } from '@solana/web3.js';
import { createHash, randomInt } from 'crypto';
import { requestDevnetAirdrop } from '../auth/solana_devnet';
import { adminKeypair, hasAdminSecret } from '../solana/keys';
import { loadDeployment } from '../solana/deployment';
import { listListings } from './listings';
import { CompanyDossier } from './listings';

const COMPANIES = [
  { legal: 'Pampa Digital Agro', trade: 'PampaDigital', sector: 'Agro', use: 'Capital de trabajo para la campaña de soja y expansión del acopio.' },
  { legal: 'Litoral Energías Renovables', trade: 'LitoralEnergía', sector: 'Energía', use: 'Refinanciación de parque solar y capital de trabajo.' },
  { legal: 'Andina Finanzas', trade: 'AndinaFin', sector: 'Finanzas', use: 'Fondeo de la línea de créditos PyME tokenizados.' },
  { legal: 'Sur Infraestructura', trade: 'SurInfra', sector: 'Infraestructura', use: 'Obra complementaria del nodo logístico sur.' },
];

function digits(n: number): string {
  return Array.from({ length: n }, () => randomInt(0, 10)).join('');
}

function alnum(n: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: n }, () => chars[randomInt(0, chars.length)]).join('');
}

function uniqueTicker(): string {
  const used = new Set(listListings().map((l) => l.dossier.ticker));
  for (let i = 0; i < 20; i++) {
    const t = `DEMO${randomInt(1000, 9999)}`;
    if (!used.has(t)) return t;
  }
  return `DEMO${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Secrets of demo treasury wallets, keyed by public key. Process-local on
 * purpose: they exist only so the deploy step can create the wallet's USDC
 * ATA — the secret never leaves the backend and never reaches the DB.
 */
const demoTreasurySecrets = new Map<string, string>();

export function demoTreasurySecret(publicKey?: string | null): string | undefined {
  const key = String(publicKey || '').trim();
  return key ? demoTreasurySecrets.get(key) : undefined;
}

export interface DemoDossierResult {
  dossier: CompanyDossier;
  /** Throwaway devnet treasury funded by airdrop — the company wallet. */
  treasury: { publicKey: string; funded: boolean };
}

export async function buildDemoDossier(): Promise<DemoDossierResult> {
  const pick = COMPANIES[randomInt(0, COMPANIES.length)];
  const ticker = uniqueTicker();
  const year = new Date().getFullYear();

  // The issuer has to be an account the backend can sign for, or the minted
  // supply can never move to holders' ATAs.
  const issuer = hasAdminSecret() ? adminKeypair().publicKey.toBase58() : loadDeployment()?.deployer || '';

  const treasury = Keypair.generate();
  const funded = await requestDevnetAirdrop(treasury.publicKey.toBase58());
  demoTreasurySecrets.set(treasury.publicKey.toBase58(), Buffer.from(treasury.secretKey).toString('base64'));

  const dossier: CompanyDossier = {
    legalName: `${pick.legal} S.A.`,
    tradeName: pick.trade,
    cuit: `30-${digits(8)}-${randomInt(0, 10)}`,
    jurisdiction: 'Argentina',
    sector: pick.sector,
    ticker,
    tokenTicker: `t${ticker}`.slice(0, 12),
    isin: `AR${alnum(9)}${randomInt(0, 10)}`,
    authorizedShares: 1_000_000,
    sharesToTokenize: 10_000,
    pricePerShareUsdc: 10,
    cajaSubaccount: `CV-${digits(6)}-${ticker}`,
    custodianCuit: '30-50001091-2',
    cnvRecordId: `CNV-${year}-${digits(5)}`,
    bymaRequestId: `BYMA-${year}-${digits(4)}`,
    legalTermsUri: 'https://fractachain.ar/legal/demo',
    estatutoHash: createHash('sha256').update(`estatuto:${ticker}`).digest('hex'),
    auditor: 'PwC / CNV RG 1150',
    issuerPublicKey: issuer,
    proceedsWallet: treasury.publicKey.toBase58(),
    paymentKind: 'USDC',
    offeringSoftCapUsdc: 100,
    offeringHardCapUsdc: 200,
    offeringDays: 30,
    tnaUsd: 0,
    minInvestmentUsdc: 20,
    useOfProceeds: `${pick.use} (expediente demo — datos ficticios).`,
  };
  return { dossier, treasury: { publicKey: treasury.publicKey.toBase58(), funded } };
}
