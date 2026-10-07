import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PaymentKind } from './issuance';
import { persistToPg } from '../data/pgstore';
import { addHolding, creditCash, debitCash, findAccountByPublicKey, getAccount, requireApprovedTrader } from '../auth/accounts';
import { getTestnetConfig } from './testnet';
import { isSolanaAddress, isSolanaPublicKey, adminPublicKey } from '../solana/keys';
import { loadDeployment } from '../solana/deployment';
import { offeringPda } from '../solana/pda';
import { PublicKey } from '@solana/web3.js';

export type ListingStatus =
  | 'DRAFT'
  | 'DEPLOYED'
  | 'TOKENS_MINTED'
  | 'LISTED'
  | 'CLOSED_SUCCESS'
  | 'CLOSED_FAILED';

export interface CompanyDossier {
  legalName: string;
  tradeName: string;
  cuit: string;
  jurisdiction: string;
  sector: string;
  ticker: string;
  tokenTicker: string;
  isin: string;
  authorizedShares: number;
  sharesToTokenize: number;
  pricePerShareUsdc: number;
  cajaSubaccount: string;
  custodianCuit: string;
  cnvRecordId: string;
  bymaRequestId: string;
  legalTermsUri: string;
  estatutoHash: string;
  auditor: string;
  issuerPublicKey: string;
  /**
   * Wallet of the issuing company that receives the raise when the licitación
   * closes successfully. Mirrors the `Fiduciary` address in the licitación
   * contract, which is the address `withdraw_proceeds` actually pays.
   */
  proceedsWallet: string;
  paymentKind: PaymentKind;
  offeringSoftCapUsdc: number;
  offeringHardCapUsdc: number;
  offeringDays: number;
  tnaUsd: number;
  useOfProceeds: string;
  minInvestmentUsdc?: number;
}

export interface Listing {
  id: string;
  dossier: CompanyDossier;
  status: ListingStatus;
  stockContract: string;
  licitacionContract: string;
  factoryProductId: number | null;
  wasmStock: string;
  wasmLicitacion: string;
  tokensMinted: number;
  sharesCustodied: number;
  cvDepositHash: string;
  raisedUsdc: number;
  settlePolicy?: 'ON_MIN' | 'ON_DATE';
  settleAt?: string;
  closedAt?: string;
  listedAt?: string;
  deployedAt?: string;
  mintedAt?: string;
  createdAt: string;
  /** Wallet Solana que recibió el recaudado cuando cerró la emisión. */
  proceedsPaidTo?: string;
  proceedsPaidAt?: string;
  /** Manifest CLOB market address once the secondary is opened. */
  manifestMarket?: string;
  /** Hash of the on-chain `finalize()` (or refund recovery) transaction. */
  finalizeHash?: string;
  finalizeAt?: string;
}

const DATA = path.join(__dirname, '..', '..', 'data', 'listings.json');
let listings: Listing[] = [];

function load() {
  try {
    if (fs.existsSync(DATA)) {
      listings = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    }
  } catch {
    listings = [];
  }
}

function save() {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(listings, null, 2));
  persistToPg('listings.json', listings);
}

load();

function contractId(seed: string) {
  // Sandbox stand-in for an on-chain account address: a deterministic
  // base58-looking string derived from the seed.
  const h = crypto.createHash('sha256').update(seed).digest();
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = BigInt('0x' + h.toString('hex'));
  let out = '';
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  return (out + ALPHABET[0].repeat(44)).slice(0, 44);
}

function hexHash(seed: string) {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

function requireDossier(d: CompanyDossier) {
  const missing: string[] = [];
  const fields: (keyof CompanyDossier)[] = [
    'legalName',
    'cuit',
    'ticker',
    'tokenTicker',
    'isin',
    'cajaSubaccount',
    'custodianCuit',
    'cnvRecordId',
    'legalTermsUri',
    'estatutoHash',
    'auditor',
    'proceedsWallet',
  ];
  for (const f of fields) {
    if (!String(d[f] || '').trim()) missing.push(f);
  }
  // The raise is paid out to this address on-chain, so a typo here sends the
  // whole offering somewhere unrecoverable. Validate the checksum, not just
  // that the field is non-empty.
  if (d.proceedsWallet && !isSolanaPublicKey(d.proceedsWallet.trim())) {
    throw new Error('La wallet que recibe la licitación no es una dirección Solana válida (base58)');
  }
  if (
    d.proceedsWallet &&
    d.issuerPublicKey &&
    d.proceedsWallet.trim() === d.issuerPublicKey.trim()
  ) {
    throw new Error(
      'La wallet que cobra no puede ser la cuenta emisora: el emisor de un activo no puede mantener saldo propio del token',
    );
  }
  if (!d.sharesToTokenize || d.sharesToTokenize <= 0) missing.push('sharesToTokenize');
  if (!d.pricePerShareUsdc || d.pricePerShareUsdc <= 0) missing.push('pricePerShareUsdc');
  if (!d.offeringHardCapUsdc || d.offeringHardCapUsdc <= 0) missing.push('offeringHardCapUsdc');
  if (d.offeringSoftCapUsdc > d.offeringHardCapUsdc) {
    throw new Error('Soft cap no puede ser mayor que hard cap');
  }
  if (missing.length) {
    throw new Error('Falta información para salir a la bolsa: ' + missing.join(', '));
  }
  const cuit = d.cuit.replace(/[^\d]/g, '');
  if (cuit.length < 10) throw new Error('CUIT inválido');
}

export function listListings() {
  listings.forEach(applyDueClose);
  return [...listings].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getListing(id: string) {
  const listing = listings.find((l) => l.id === id);
  if (listing) applyDueClose(listing);
  return listing;
}

export function createListing(dossier: CompanyDossier): Listing {
  requireDossier(dossier);
  const ticker = dossier.ticker.trim().toUpperCase();
  if (listings.some((l) => l.dossier.ticker === ticker)) {
    throw new Error(`Ya existe un listing para ${ticker}`);
  }
  const chain = loadDeployment();
  // Default to the issuer account the backend can actually sign with — the
  // deployments issuer belongs to a wallet we may not control, and issuing
  // under it would leave tokens undistributable (invisible in holders'
  // wallets) unless SOLANA_ISSUER_SECRET_KEY is configured for it.
  const issuer = dossier.issuerPublicKey.trim() || adminPublicKey() || '';
  const listing: Listing = {
    id: `IPO-${ticker}-${Date.now().toString(36)}`,
    dossier: {
      ...dossier,
      ticker,
      tokenTicker: dossier.tokenTicker.trim().toUpperCase(),
      issuerPublicKey: issuer,
      proceedsWallet: dossier.proceedsWallet.trim(),
      paymentKind: dossier.paymentKind || 'USDC',
      jurisdiction: dossier.jurisdiction || 'Argentina',
      minInvestmentUsdc: dossier.minInvestmentUsdc && dossier.minInvestmentUsdc > 0 ? dossier.minInvestmentUsdc : 15000,
      offeringSoftCapUsdc: dossier.offeringSoftCapUsdc > 0 ? dossier.offeringSoftCapUsdc : 15000,
    },
    status: 'DRAFT',
    stockContract: '',
    licitacionContract: '',
    factoryProductId: null,
    wasmStock: '',
    wasmLicitacion: '',
    tokensMinted: 0,
    sharesCustodied: 0,
    cvDepositHash: '',
    raisedUsdc: 0,
    createdAt: new Date().toISOString(),
  };
  listings.unshift(listing);
  save();
  return listing;
}

/**
 * Pre-deploy validation, kept separate so the route can run it *before*
 * paying for the on-chain offering creation: a failed transaction must not burn
 * the listing's DRAFT state nor its ledger entry.
 */
export function assertDeployable(id: string): Listing {
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  requireDossier(listing.dossier);
  if (listing.status !== 'DRAFT') throw new Error('Ya está deployado');
  return listing;
}

/**
 * The Caja de Valores deposit hash for this dossier, derived the same way at
 * deploy time and at mint time so the vault's PoR audit hash and the mint
 * proof tie to the same slip.
 */
export function listingCvDepositHash(listing: Listing): string {
  return hexHash(`${listing.dossier.cajaSubaccount}:${listing.dossier.isin}`);
}

export function deployListing(id: string, onChain?: { contractId: string }): Listing {
  const listing = assertDeployable(id);
  if (onChain?.contractId) {
    // Solana: one Offering PDA covers custody + primary sale. Keep both
    // fields pointing at it so mint/contribute/settlement recognize on-chain.
    listing.stockContract = onChain.contractId;
    listing.licitacionContract = onChain.contractId;
  } else {
    listing.stockContract = contractId(`${listing.id}:stock`);
    // Sandbox: licitación address is assigned when the offering opens.
    listing.licitacionContract = '';
  }
  listing.factoryProductId = listings.filter((l) => l.factoryProductId).length + 1;
  listing.deployedAt = new Date().toISOString();
  listing.status = 'DEPLOYED';
  listing.cvDepositHash = listingCvDepositHash(listing);
  if (!isSolanaPublicKey(listing.dossier.issuerPublicKey)) {
    listing.dossier.issuerPublicKey = adminPublicKey() || '';
  }
  save();
  return listing;
}

/**
 * Mint pre-checks run before the on-chain `mint_supply` call so a
 * rejected mint never leaves an orphaned balance on the vault.
 */
export function assertMintable(id: string, amount: number): Listing {
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  if (listing.status === 'DRAFT') throw new Error('Primero deployá el contrato');
  if (amount <= 0) throw new Error('Monto inválido');
  // Program `mint_supply` is one-shot (Draft → Minted). Incremental remints fail with NotDraft.
  if (isOnChainListing(listing) && (listing.tokensMinted > 0 || listing.status === 'TOKENS_MINTED')) {
    throw new Error(
      'mint_supply on-chain es de una sola vez; esta emisión ya tiene supply mintado',
    );
  }
  const next = listing.tokensMinted + amount;
  if (next > listing.dossier.sharesToTokenize) {
    throw new Error('No se puede mintear más que las acciones a tokenizar');
  }
  return listing;
}

export function mintListingTokens(id: string, amount: number, cvDepositHash?: string): Listing {
  const listing = assertMintable(id, amount);
  const next = listing.tokensMinted + amount;
  listing.tokensMinted = next;
  listing.sharesCustodied = next;
  if (cvDepositHash) listing.cvDepositHash = cvDepositHash;
  listing.mintedAt = new Date().toISOString();
  listing.status = 'TOKENS_MINTED';
  save();
  return listing;
}

type SettleOpts = { settlePolicy?: 'ON_MIN' | 'ON_DATE'; settleAt?: string };

/**
 * Checks a listing can open and returns when its offering will close, so the
 * contract can be initialized with that deadline before anything is saved.
 */
export function prepareOpenLicitacion(id: string, opts?: SettleOpts): { listing: Listing; deadlineMs: number } {
  const listing = listings.find((l) => l.id === id);
  if (!listing) throw new Error('Listing no encontrado');
  if (listing.tokensMinted <= 0) throw new Error('Primero minteá los tokens respaldados 1:1');
  if (listing.status === 'LISTED') throw new Error('Ya está en licitación');
  if (!isSolanaPublicKey(listing.dossier.proceedsWallet)) {
    throw new Error('Configurá la wallet de cobro de la empresa antes de abrir la licitación');
  }
  const { settleAt } = resolveSettleChoice(opts);
  const days = listing.dossier.offeringDays > 0 ? listing.dossier.offeringDays : 30;
  const deadlineMs = settleAt ? new Date(settleAt).getTime() : Date.now() + days * 86_400_000;
  if (!Number.isFinite(deadlineMs) || deadlineMs <= Date.now()) {
    throw new Error('La fecha de cierre tiene que ser futura');
  }
  return { listing, deadlineMs };
}

export function openLicitacion(
  id: string,
  opts?: SettleOpts,
  onChain?: { contractId: string; factoryProductId?: number | null },
): Listing {
  const { listing } = prepareOpenLicitacion(id, opts);
  listing.licitacionContract = onChain?.contractId || contractId(`${listing.id}:licitacion`);
  if (onChain?.factoryProductId != null) listing.factoryProductId = onChain.factoryProductId;
  listing.status = 'LISTED';
  listing.listedAt = new Date().toISOString();
  applySettleChoice(listing, opts);
  save();
  return listing;
}

/**
 * Repoints the wallet that will receive the raise.
 *
 * Mirrors `set_fiduciary` in the Anchor program, including its guard:
 * once money is in, the payout address is frozen. Changing it afterwards would
 * let the platform redirect funds investors already committed.
 */
export function setListingProceedsWallet(id: string, wallet: string): Listing {
  const listing = listings.find((l) => l.id === id);
  if (!listing) throw new Error('Listing no encontrado');
  const next = String(wallet || '').trim();
  if (!isSolanaPublicKey(next)) {
    throw new Error('La wallet que recibe la licitación no es una dirección Solana válida (base58)');
  }
  if (next === listing.dossier.issuerPublicKey?.trim()) {
    throw new Error('La wallet que cobra no puede ser la cuenta emisora del token');
  }
  if (listing.raisedUsdc > 0) {
    throw new Error('Ya hay inversores que aportaron: la wallet de cobro no se puede cambiar');
  }
  listing.dossier.proceedsWallet = next;
  save();
  return listing;
}

export function setListingSettle(id: string, opts?: { settlePolicy?: 'ON_MIN' | 'ON_DATE'; settleAt?: string }): Listing {
  const listing = listings.find((l) => l.id === id);
  if (!listing) throw new Error('Listing no encontrado');
  if (listing.status !== 'LISTED') throw new Error('La licitación no está abierta');
  applySettleChoice(listing, opts);
  save();
  applyDueClose(listing);
  return listing;
}

function resolveSettleChoice(opts?: SettleOpts): { settlePolicy: 'ON_MIN' | 'ON_DATE'; settleAt?: string } {
  const cfg = getTestnetConfig();
  const policy = opts?.settlePolicy || cfg.settlePolicy || 'ON_MIN';
  if (policy !== 'ON_DATE') return { settlePolicy: 'ON_MIN' };
  const at = opts?.settleAt || cfg.settleAt;
  if (!at) throw new Error('Indicá la fecha hasta la que esperás para repartir tokens');
  return { settlePolicy: 'ON_DATE', settleAt: new Date(at).toISOString() };
}

function applySettleChoice(listing: Listing, opts?: SettleOpts) {
  const { settlePolicy, settleAt } = resolveSettleChoice(opts);
  listing.settlePolicy = settlePolicy;
  listing.settleAt = settleAt;
}

export function validationPack(listing: Listing) {
  const d = listing.dossier;
  const backing =
    listing.tokensMinted === 0
      ? 'sin mint'
      : listing.sharesCustodied === listing.tokensMinted
        ? '1:1 (100%)'
        : `${listing.sharesCustodied}:${listing.tokensMinted}`;
  return {
    listingId: listing.id,
    status: listing.status,
    token: {
      ticker: d.tokenTicker,
      underlying: d.ticker,
      isin: d.isin,
      pricePerShareUsdc: d.pricePerShareUsdc,
      paymentKind: d.paymentKind,
      tokensMinted: listing.tokensMinted,
      sharesCustodied: listing.sharesCustodied,
      backing,
    },
    company: {
      legalName: d.legalName,
      tradeName: d.tradeName,
      cuit: d.cuit,
      jurisdiction: d.jurisdiction,
      sector: d.sector,
      authorizedShares: d.authorizedShares,
      sharesToTokenize: d.sharesToTokenize,
    },
    custody: {
      cajaSubaccount: d.cajaSubaccount,
      custodianCuit: d.custodianCuit,
      cvDepositHash: listing.cvDepositHash,
      auditor: d.auditor,
    },
    regulator: {
      cnvRecordId: d.cnvRecordId,
      bymaRequestId: d.bymaRequestId,
      legalTermsUri: d.legalTermsUri,
      estatutoHash: d.estatutoHash,
    },
    payout: {
      proceedsWallet: d.proceedsWallet,
      proceedsPaidTo: listing.proceedsPaidTo || null,
      proceedsPaidAt: listing.proceedsPaidAt || null,
      issuerPublicKey: d.issuerPublicKey,
      // Locked as soon as the first investor pays in: from that point the
      // destination is part of the deal they agreed to.
      editable: listing.raisedUsdc === 0,
    },
    contracts: {
      offering: listing.stockContract,
      offeringPda: listing.licitacionContract,
      factoryProductId: listing.factoryProductId,
      wasmStock: listing.wasmStock,
      wasmLicitacion: listing.wasmLicitacion,
    },
    offering: {
      softCapUsdc: d.offeringSoftCapUsdc,
      hardCapUsdc: d.offeringHardCapUsdc,
      raisedUsdc: listing.raisedUsdc,
      days: d.offeringDays,
      tnaUsd: d.tnaUsd,
      useOfProceeds: d.useOfProceeds,
      deadline: listing.settleAt
        || (listing.listedAt
          ? new Date(new Date(listing.listedAt).getTime() + d.offeringDays * 86400000).toISOString()
          : null),
      settlePolicy: listing.settlePolicy || 'ON_MIN',
      settleAt: listing.settleAt || null,
    },
    checks: [
      { key: 'cuit', ok: d.cuit.replace(/[^\d]/g, '').length >= 10, label: 'CUIT emisor' },
      { key: 'isin', ok: Boolean(d.isin), label: 'ISIN' },
      { key: 'cnv', ok: Boolean(d.cnvRecordId), label: 'Expediente CNV' },
      { key: 'caja', ok: Boolean(d.cajaSubaccount), label: 'Subcuenta Caja de Valores' },
      { key: 'deploy', ok: Boolean(listing.stockContract), label: 'Offering PDA creado' },
      { key: 'mint', ok: listing.tokensMinted > 0, label: 'Tokens 1:1 minteados' },
      { key: 'por', ok: listing.tokensMinted === listing.sharesCustodied && listing.tokensMinted > 0, label: 'Proof of reserve 1:1' },
      { key: 'payout', ok: isSolanaPublicKey(d.proceedsWallet), label: 'Wallet de cobro de la empresa' },
      { key: 'paid', ok: Boolean(listing.proceedsPaidAt) || listing.status !== 'CLOSED_SUCCESS', label: 'Fondos acreditados a la empresa' },
      { key: 'licitacion', ok: listing.status === 'LISTED', label: 'Licitación abierta' },
    ],
  };
}

function poolStatus(listing: Listing): 'OPEN' | 'SUCCESSFUL' | 'SETTLED' | 'FAILED' {
  if (listing.status === 'LISTED') return 'OPEN';
  if (listing.status === 'CLOSED_SUCCESS') return 'SUCCESSFUL';
  if (listing.status === 'CLOSED_FAILED') return 'FAILED';
  return 'SETTLED';
}

export function listedPools() {
  listings.forEach(applyDueClose);
  return listings
    .filter((l) => l.status === 'LISTED' || (isOnChainListing(l) && (l.status === 'CLOSED_SUCCESS' || l.status === 'CLOSED_FAILED')))
    .map((l) => {
      const d = l.dossier;
      const deadline = l.settleAt
        ? new Date(l.settleAt)
        : l.listedAt
          ? new Date(new Date(l.listedAt).getTime() + d.offeringDays * 86400000)
          : new Date();
      const daysRemaining = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000));
      return {
        id: l.id,
        title: `Oferta primaria ${d.tokenTicker} · ${d.legalName}`,
        producerName: `${d.legalName} (CUIT ${d.cuit})`,
        location: d.jurisdiction,
        targetAmount: d.offeringHardCapUsdc,
        raisedAmount: l.raisedUsdc,
        softCap: d.offeringSoftCapUsdc,
        hardCap: d.offeringHardCapUsdc,
        tna: d.tnaUsd,
        durationMonths: Math.max(1, Math.round(d.offeringDays / 30)),
        daysRemaining,
        commodityType: d.sector,
        riskScore: 'AA+',
        isSoftCapReached: l.raisedUsdc >= d.offeringSoftCapUsdc,
        minInvestment: d.minInvestmentUsdc || d.pricePerShareUsdc,
        status: poolStatus(l),
        tokenTicker: d.tokenTicker,
        ticker: d.ticker,
        isin: d.isin,
        paymentKind: d.paymentKind || 'USDC',
        finalizeHash: l.finalizeHash || null,
        onChain: isOnChainListing(l),
        validation: validationPack(l),
      };
    });
}

export function maybeCloseIfMinReached(id: string) {
  const listing = listings.find((l) => l.id === id);
  if (listing) applyDueClose(listing);
  return listing;
}

function applyDueClose(listing: Listing) {
  if (listing.status !== 'LISTED') return;
  // The live Solana program only finalizes on hard cap or deadline.
  if (isOnChainListing(listing)) return;
  const min = listing.dossier.offeringSoftCapUsdc || listing.dossier.minInvestmentUsdc || 0;
  const policy = listing.settlePolicy || 'ON_MIN';
  if (policy === 'ON_MIN' && min > 0 && listing.raisedUsdc >= min) {
    listing.status = 'CLOSED_SUCCESS';
    listing.closedAt = new Date().toISOString();
    payListingProceeds(listing);
    save();
    return;
  }
  if (policy === 'ON_DATE' && listing.settleAt && Date.now() >= new Date(listing.settleAt).getTime()) {
    listing.status = min > 0 && listing.raisedUsdc >= min ? 'CLOSED_SUCCESS' : 'CLOSED_FAILED';
    listing.closedAt = new Date().toISOString();
    if (listing.status === 'CLOSED_SUCCESS') payListingProceeds(listing);
    save();
  }
}

/**
 * Sends the raise to the company's wallet the moment the offering closes.
 *
 * Mirrors `finalize` on the licitación contract, which pays `Fiduciary`
 * automatically. If that wallet belongs to a platform account we credit the
 * sandbox cash too, so the demo UI shows the money arriving without waiting
 * for an RPC round-trip.
 */
function payListingProceeds(listing: Listing) {
  if (listing.proceedsPaidAt) return;
  if (listing.status !== 'CLOSED_SUCCESS') return;
  const wallet = listing.dossier.proceedsWallet?.trim();
  if (!wallet || !isSolanaPublicKey(wallet)) {
    return;
  }
  listing.proceedsPaidTo = wallet;
  listing.proceedsPaidAt = new Date().toISOString();
  // On-chain SOL already moved to the fiduciary in `finalize()`. Crediting
  // sandbox USDC here would invent a second, fake payout.
  if (isOnChainListing(listing)) return;
  const company = findAccountByPublicKey(wallet);
  if (company && listing.raisedUsdc > 0) {
    creditCash(company.id, listing.raisedUsdc);
  }
}

/**
 * True when this listing's stored address is the program's Offering PDA for
 * its listing id. Sandbox fake base58 IDs and on-curve wallet typos do not match.
 *
 * Important: Offering PDAs are off-curve — never use `isSolanaPublicKey`
 * (ed25519 on-curve check) here or mint/contribute/finalize stay in sandbox.
 */
export function isOnChainListing(listing: Listing): boolean {
  const addr = (listing.licitacionContract || listing.stockContract || '').trim();
  if (!addr || !isSolanaAddress(addr)) return false;
  try {
    const [expected] = offeringPda(listing.id);
    return expected.equals(new PublicKey(addr));
  } catch {
    return false;
  }
}

export function bindLicitacionForDemo(
  id: string,
  contractId: string,
  opts?: { factoryProductId?: number | null; paymentKind?: 'SOL' | 'USDC' },
): Listing {
  const listing = listings.find((l) => l.id === id);
  if (!listing) throw new Error('Listing no encontrado');
  if (!isSolanaAddress(contractId)) {
    throw new Error(`Dirección del offering inválida: ${contractId}`);
  }
  listing.licitacionContract = contractId;
  listing.stockContract = listing.stockContract || contractId;
  // Must match the token the contract was initialized with — the contract
  // itself rejects any other asset, so a wrong label just produces bad UX.
  listing.dossier.paymentKind = opts?.paymentKind === 'SOL' ? 'SOL' : 'USDC';
  listing.dossier.pricePerShareUsdc = 10;
  listing.dossier.minInvestmentUsdc = 100;
  listing.dossier.offeringSoftCapUsdc = 100;
  listing.dossier.offeringHardCapUsdc = 100;
  listing.raisedUsdc = 0;
  listing.status = 'LISTED';
  listing.closedAt = undefined;
  listing.proceedsPaidAt = undefined;
  listing.proceedsPaidTo = undefined;
  if (opts?.factoryProductId != null) listing.factoryProductId = opts.factoryProductId;
  save();
  return listing;
}

export function recordOnChainContribution(
  id: string,
  accountId: string,
  input: { amount: number; tokens: number; raised: number },
): Listing {
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  const units = listing.dossier.pricePerShareUsdc > 0
    ? input.amount / listing.dossier.pricePerShareUsdc
    : input.tokens;
  addHolding(accountId, {
    listingId: listing.id,
    tokenTicker: listing.dossier.tokenTicker,
    usdcAmount: input.amount,
    tokens: 0,
    tokensOwed: units,
  });
  listing.raisedUsdc = input.raised;
  save();
  return getListing(id)!;
}

export function markListingClosed(
  id: string,
  status: 'CLOSED_SUCCESS' | 'CLOSED_FAILED',
  raised?: number,
  extra?: { finalizeHash?: string | null; proceedsPaidTo?: string | null },
): Listing {
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  listing.status = status;
  listing.closedAt = new Date().toISOString();
  if (typeof raised === 'number') listing.raisedUsdc = raised;
  if (extra?.finalizeHash) {
    listing.finalizeHash = extra.finalizeHash;
    listing.finalizeAt = new Date().toISOString();
  }
  if (status === 'CLOSED_SUCCESS') payListingProceeds(listing);
  if (extra?.proceedsPaidTo) listing.proceedsPaidTo = extra.proceedsPaidTo;
  save();
  return getListing(id)!;
}

/** Records the Manifest market address once the secondary book exists. */
export function setListingMarket(id: string, marketAddress: string): Listing {
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  if (!isSolanaPublicKey(marketAddress)) {
    throw new Error('Dirección de mercado Manifest inválida');
  }
  listing.manifestMarket = marketAddress;
  save();
  return listing;
}

export function recordFinalizeHash(id: string, hash: string | null | undefined): Listing {
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  if (hash) {
    listing.finalizeHash = hash;
    listing.finalizeAt = new Date().toISOString();
    save();
  }
  return listing;
}

export function closeListing(id: string) {
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  if (listing.status !== 'LISTED') throw new Error('La licitación no está abierta');
  if (isOnChainListing(listing)) {
    throw new Error('Esta licitación cierra on-chain: usá el endpoint async de cierre');
  }
  const min = listing.dossier.offeringSoftCapUsdc || 0;
  listing.status = min > 0 && listing.raisedUsdc >= min ? 'CLOSED_SUCCESS' : 'CLOSED_FAILED';
  listing.closedAt = new Date().toISOString();
  if (listing.status === 'CLOSED_SUCCESS') payListingProceeds(listing);
  save();
  return listing;
}

export function contributeListing(id: string, usdcAmount: number, accountId: string) {
  const investor = getAccount(accountId);
  if (!investor) throw new Error('Inversor no encontrado');
  requireApprovedTrader(investor);
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  if (listing.status !== 'LISTED') throw new Error('La licitación no está abierta');
  const amount = Number(usdcAmount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Monto inválido');
  const price = listing.dossier.pricePerShareUsdc;
  if (price <= 0) throw new Error('Precio por acción inválido');
  const tokenCapacity = listing.tokensMinted * price;
  const remaining = Math.min(
    listing.dossier.offeringHardCapUsdc - listing.raisedUsdc,
    tokenCapacity - listing.raisedUsdc,
  );
  if (remaining <= 0) throw new Error('No queda cupo en esta licitación');
  if (amount > remaining + 1e-9) {
    throw new Error(`Solo quedan ${remaining.toLocaleString('es-AR')} USDC de cupo`);
  }
  const ticket = listing.dossier.minInvestmentUsdc || price;
  const minNow = remaining < ticket ? price : ticket;
  if (amount + 1e-9 < minNow) {
    throw new Error(`El aporte mínimo ahora es ${minNow.toLocaleString('es-AR')} USDC`);
  }
  const next = listing.raisedUsdc + amount;
  const tokens = amount / price;
  debitCash(accountId, amount);
  listing.raisedUsdc = next;
  addHolding(accountId, {
    listingId: listing.id,
    tokenTicker: listing.dossier.tokenTicker,
    usdcAmount: amount,
    tokens: 0,
    tokensOwed: tokens,
  });
  maybeCloseIfMinReached(listing.id);
  save();
  return getListing(id)!;
}

export function tradeableMarkets() {
  return listings
    .filter((l) => l.status === 'LISTED' || l.status === 'CLOSED_SUCCESS' || l.tokensMinted > 0)
    .map((l) => ({
      listingId: l.id,
      tokenTicker: l.dossier.tokenTicker,
      ticker: l.dossier.ticker,
      legalName: l.dossier.legalName,
      pricePerShareUsdc: l.dossier.pricePerShareUsdc,
      status: l.status,
    }));
}
