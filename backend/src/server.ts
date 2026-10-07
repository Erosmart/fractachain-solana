import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  getAllKycRecords,
  getKycById,
  registerKyc,
  approveKyc,
  rejectKyc,
  revokeKyc,
  KycStatus,
} from './admin/kyc_review';
import {
  processArsOnRamp,
  processFiatOnRamp,
  processCctpBridge,
  processNearIntentsSwap,
} from './mocks/payment_gateway';
import { getAllCommodityPrices, getCommodityPrice } from './mocks/fiat_oracle';
import { getAllWeatherData, getWeatherData } from './mocks/weather_oracle';
import {
  createStock,
  getMervalStocks,
  getProofOfReserveAudit,
  listStocksAdmin,
  setStockActive,
  updateStockPrice,
} from './custody/stocks';
import {
  bindContract,
  createProduct,
  getPaymentAssets,
  listProducts,
  PaymentKind,
  ProductKind,
  setPaymentAsset,
  updateProductPrice,
} from './admin/issuance';
import {
  contributeListing,
  createListing,
  deployListing,
  assertDeployable,
  assertMintable,
  getListing,
  listListings,
  listedPools,
  mintListingTokens,
  openLicitacion,
  prepareOpenLicitacion,
  closeListing,
  setListingProceedsWallet,
  setListingSettle,
  validationPack,
  isOnChainListing,
  Listing,
  recordOnChainContribution,
  markListingClosed,
  listingCvDepositHash,
} from './admin/listings';
import { buildDemoDossier } from './admin/demo';
import { adminKeypair, adminPublicKey, hasAdminSecret } from './solana/keys';
import {
  createOfferingOnChain,
  mintSupplyOnChain,
  openOfferingOnChain,
  prepareContributeTx,
  prepareRefundTx,
  refundOnChain,
  setFiduciaryOnChain,
  submitContributeTx,
  submitRefundTx,
  withdrawProceedsOnChain,
  contributeOnChain,
} from './solana/offering';
import { fetchOffering, fetchContribution } from './solana/offering_state';
import { snapshotToApi } from './solana/onchain';
import { usdcToUnits, unitsToUsdc, usdcMint, mintDemoUsdc, buildCreateUsdcAtaIx } from './solana/usdc';
import { createMarket, authorizeVault } from './solana/manifest';
import { initializePlatformOnChain } from './solana/platform';
import { ensureInvestorVerifiedForOps, setHolderFrozenOnChain, verifyInvestorOnChain } from './solana/kyc';
import { isKycEnforced, SOLANA_CLUSTER } from './solana/connection';
import { buildUnsignedTx, submitSignedTx } from './solana/tx';
import { PublicKey } from '@solana/web3.js';
import { setListingMarket } from './admin/listings';
import { cancelOrder, getBook, listMarkets, placeOrder } from './market/orderbook';
import {
  autoFinalizeIfDue,
  finalizeListedOffering,
  settleHolders,
  startSettlementSweep,
} from './market/settlement';
import { depositDividends, listDividends } from './market/dividends';
import { buildPortfolio } from './market/prices';
import {
  getSdexBook,
  openCustodialTrustline,
  distributeClaimedTokens,
  cancelCustodialOrder,
  ensureCustodialSetup,
  prepareTraderSetup,
  placeCustodialOrder,
  prepareCancel,
  prepareOrder,
  prepareTrustline,
  sdexAvailable,
} from './market/manifest_book';
import { ensureWalletFunded } from './solana/wallet_funding';
import { loadSolBalance, loadUsdcBalance } from './auth/solana_devnet';
import { custodialSigningKeypair } from './auth/accounts';
import { getTestnetConfig, setTestnetConfig } from './admin/testnet';
import { isProgramDeployed, loadDeployment } from './solana/deployment';
import { getOnChainStatus, listingChainMeta, receiptAfterContribute, explorerTx } from './solana/onchain';
import {
  authenticateWithGoogle,
  getUserByToken,
  revokeSession,
} from './auth/google_auth';
import {
  authenticateWithFirebase,
  getFirebaseUserByToken,
  resolveFirebaseProfile,
} from './auth/firebase_auth';
import { authenticateWithWallet, linkWalletSignature } from './auth/wallet_auth';
import {
  addTrustline,
  claimListingTokens,
  claimPendingDividend,
  markHoldingRefunded,
  getAccountByToken,
  hydrateTestnetWallet,
  isAdminAccount,
  listPendingKyc,
  readSelfie,
  revokeToken,
  setCustody,
  findAccountByPublicKey,
  setKycStatusByKycId,
  submitOnboardingKyc,
  toPublic,
  upsertLogin,
} from './auth/accounts';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 8080;

// CORS_ORIGINS=https://app.example.com,https://other.example — unset reflects any origin.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);
app.use(cors({ origin: CORS_ORIGINS.length ? CORS_ORIGINS : true, credentials: true }));
app.use(express.json({ limit: '8mb' }));

function requireAdmin(req: Request, res: Response) {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) {
    res.status(401).json({ success: false, message: 'Iniciá sesión' });
    return null;
  }
  if (!isAdminAccount(account)) {
    res.status(403).json({ success: false, message: 'Solo el admin puede hacer esto' });
    return null;
  }
  return account;
}

// Health Check
app.get('/health', (_req: Request, res: Response) => {
  const cluster = SOLANA_CLUSTER;
  res.json({
    status: 'online',
    service: 'Fractachain Admin & Mocks Backend',
    protocol: 'Solana (Anchor + Token-2022 + Manifest)',
    network: isProgramDeployed()
      ? `Solana ${cluster} (program loaded)`
      : `Solana ${cluster} (sandbox — programa sin deployar)`,
    cluster,
    onChain: isProgramDeployed(),
    /** false on Devnet/testnet/localnet — KYC is soft; true only on mainnet-beta. */
    kycRequired: isKycEnforced(),
    persistence: process.env.DATABASE_URL ? 'postgres' : 'files (se pierde en cada redeploy)',
    googleLogin: process.env.FIREBASE_API_KEY ? 'verified' : process.env.NODE_ENV === 'production' ? 'disabled' : 'dev-unverified',
    timestamp: new Date().toISOString(),
  });
});

// --- Google Authentication Routes ---
app.post('/api/auth/google', (req: Request, res: Response) => {
  // Mock login that trusts the posted email — local dev only.
  if (process.env.NODE_ENV === 'production') {
    return res.status(410).json({ success: false, message: 'Usá /api/auth/firebase' });
  }
  const result = authenticateWithGoogle(req.body);
  res.json(result);
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const account = getAccountByToken(authHeader);
  if (account) {
    return res.json({ success: true, user: toPublic(account) });
  }
  const user = getUserByToken(authHeader) || getFirebaseUserByToken(authHeader);
  if (!user) {
    return res.status(401).json({ success: false, message: 'No autenticado' });
  }
  res.json({ success: true, user });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  revokeToken(authHeader);
  const revoked = revokeSession(authHeader);
  res.json({ success: true, revoked, message: 'Sesión finalizada con éxito' });
});

app.post('/api/auth/email', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body as { email: string; password: string; name?: string };
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y contraseña requeridos' });
    }
    const result = upsertLogin({ email, password, name });
    res.json(result);
    void hydrateTestnetWallet(result.user.id).catch(() => undefined);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/wallet', async (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'No autenticado' });
  try {
    const { mode, publicKey } = req.body as { mode: 'CUSTODIAL' | 'SELF'; publicKey?: string };
    if (mode !== 'CUSTODIAL' && mode !== 'SELF') {
      return res.status(400).json({ success: false, message: 'Modo inválido' });
    }
    if (publicKey && mode !== 'SELF') {
      return res.status(400).json({ success: false, message: 'publicKey solo aplica a SELF' });
    }
    const result = setCustody(account.id, mode, publicKey);
    const user = (await hydrateTestnetWallet(account.id)) || result.user;
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.post('/api/kyc/onboard', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'No autenticado' });
  try {
    const user = submitOnboardingKyc(account.id, req.body);
    registerKyc({
      id: user.kycId,
      userId: account.id,
      fullName: user.legalName || user.name,
      documentNumber: user.cuit || '',
      taxId: user.cuit,
      countryCode: 32,
      countryName: 'Argentina',
      address: 'Onboarding in-app',
      investorType: 'National',
      walletAddress: user.publicKey,
      documentFrontUrl: user.selfieUrl || '',
      selfieUrl: `/api/kyc/selfie/${account.id}`,
    });
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/kyc/selfie/:id', (req: Request, res: Response) => {
  const viewer = getAccountByToken(req.headers.authorization);
  if (!viewer || (viewer.id !== req.params.id && !isAdminAccount(viewer))) {
    return res.status(403).json({ success: false, message: 'Solo el admin o el titular' });
  }
  const file = readSelfie(req.params.id);
  if (!file) return res.status(404).end();
  res.sendFile(path.resolve(file));
});

// --- Wallet (Solana) auth: firma del mensaje "fractachain-login:<ts>" ---
app.post('/api/auth/wallet-login', async (req: Request, res: Response) => {
  try {
    const result = authenticateWithWallet(req.body);
    if (result.success && result.user?.id) {
      const hydrated = await hydrateTestnetWallet(result.user.id).catch(() => undefined);
      if (hydrated) result.user = hydrated;
    }
    res.status(result.success ? 200 : 400).json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Vincula la wallet Solana a una cuenta ya autenticada: firma "fractachain-link:<ts>".
app.post('/api/auth/wallet/link', async (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'No autenticado' });
  try {
    const result = linkWalletSignature(account.id, req.body);
    const hydrated = await hydrateTestnetWallet(account.id).catch(() => undefined);
    res.json({ ...result, user: hydrated || result.user });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Wallet balances + testnet USDC faucet ---

/** Balances the wallet page shows: native SOL plus devnet USDC. */
app.get('/api/wallet/state', async (req: Request, res: Response) => {
  try {
    const publicKey = String(req.query.account || '').trim();
    if (!publicKey) return res.status(400).json({ success: false, message: 'Falta account' });
    const owned = findAccountByPublicKey(publicKey);
    if (owned) {
      try {
        await ensureWalletFunded(publicKey);
      } catch (err: any) {
        console.warn('[wallet-heal]', err?.message || err);
      }
    }
    res.json({
      success: true,
      data: {
        publicKey,
        sol: await loadSolBalance(publicKey),
        usdc: await loadUsdcBalance(publicKey),
        usdcMint: usdcMint()?.toBase58() || null,
        cluster: process.env.SOLANA_CLUSTER || 'devnet',
      },
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * Devnet USDC faucet: the platform's mint authority tops up the wallet.
 *
 * Wallets without a USDC ATA get an unsigned create-ATA transaction for their
 * wallet to sign, then retry for the grant (mintDemoUsdc covers both cases
 * once the account exists).
 */
app.post('/api/wallet/usdc/fund', async (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  try {
    if (!account.publicKey) throw new Error('La cuenta no tiene wallet Solana asociada');
    const wallet = new PublicKey(account.publicKey);
    try {
      const result = await mintDemoUsdc(wallet, 5_000);
      return res.json({ success: true, data: { status: 'FUNDED', hash: result } });
    } catch {
      const transaction = await buildUnsignedTx(wallet, [buildCreateUsdcAtaIx(wallet)]);
      return res.json({
        success: true,
        data: { status: 'NEED_TRUSTLINE', transaction, publicKey: account.publicKey },
      });
    }
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Firebase Authentication Routes ---
app.post('/api/auth/firebase', async (req: Request, res: Response) => {
  try {
    const profile = await resolveFirebaseProfile(req.body || {});
    const result = authenticateWithFirebase(profile);
    res.json(result);
    if (result.user?.id) void hydrateTestnetWallet(result.user.id).catch(() => undefined);
  } catch (err: any) {
    res.status(401).json({ success: false, message: err.message });
  }
});

app.get('/api/auth/firebase/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const user = getFirebaseUserByToken(authHeader);
  if (!user) {
    return res.status(401).json({ success: false, message: 'No autenticado con Firebase' });
  }
  res.json({ success: true, user });
});

// --- KYC Admin Routes ---
app.get('/api/kyc', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const status = (req.query.status as string | undefined)?.toUpperCase();
  const fromAccounts = listPendingKyc()
    .filter((u) => u.kycStatus !== 'UNREGISTERED')
    .map((u) => ({
      id: u.kycId || u.id,
      fullName: u.legalName || u.name,
      docType: 'CUIT' as const,
      docNumber: u.cuit || '',
      country: 'Argentina',
      walletAddress: u.publicKey,
      userType: 'INVESTOR' as const,
      status: u.kycStatus === 'APPROVED' ? 'APPROVED' : u.kycStatus === 'REJECTED' ? 'REJECTED' : 'PENDING',
      isGafiHighRisk: false,
      createdAt: u.createdAt,
      selfieUrl: u.selfieUrl,
      userId: u.id,
      email: u.email,
    }));
  const fromLegacy = getAllKycRecords()
    .filter((r) => r.userId)
    .filter((r) => !fromAccounts.some((a) => a.id === r.id || a.userId === r.userId))
    .map((r) => ({
      id: r.id,
      fullName: r.fullName,
      docType: r.taxId ? 'CUIT' : 'DNI',
      docNumber: r.taxId || r.documentNumber,
      country: r.countryName,
      walletAddress: r.walletAddress,
      userType: 'INVESTOR' as const,
      status: r.status === 'APROBADO' ? 'APPROVED' : r.status === 'RECHAZADO' ? 'REJECTED' : r.status === 'REVOCADO' ? 'REVOKED' : 'PENDING',
      isGafiHighRisk: false,
      createdAt: r.createdAt,
      selfieUrl: r.selfieUrl,
      userId: r.userId,
      email: '',
    }));
  let data = [...fromAccounts, ...fromLegacy];
  if (status && status !== 'ALL') data = data.filter((r) => r.status === status);
  data.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  res.json({ success: true, count: data.length, data });
});

app.get('/api/kyc/:id', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const record = getKycById(req.params.id);
  if (!record) return res.status(404).json({ success: false, error: 'KYC no encontrado' });
  res.json({ success: true, data: record });
});

app.post('/api/kyc/register', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const result = registerKyc(req.body);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.status(201).json(result);
});

app.post('/api/kyc/:id/approve', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const result = approveKyc(req.params.id);
  try {
    const user = setKycStatusByKycId(req.params.id, 'APPROVED');
    return res.json({ success: true, user, record: result.record });
  } catch {
    if (!result.success) return res.status(400).json({ success: false, message: result.error });
    return res.json(result);
  }
});

app.post('/api/kyc/:id/reject', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { reason } = req.body;
  const result = rejectKyc(req.params.id, reason || 'Documentación ilegible o inconsistente');
  try {
    const user = setKycStatusByKycId(req.params.id, 'REJECTED');
    return res.json({ success: true, user, record: result.record });
  } catch {
    if (!result.success) return res.status(400).json({ success: false, message: result.error });
    return res.json(result);
  }
});

app.post('/api/kyc/:id/revoke', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { reason } = req.body;
  const result = revokeKyc(req.params.id, reason || 'Revocación preventiva por compliance');
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// --- Mock Payment Gateways ---
app.post('/api/mocks/onramp/ars', (req: Request, res: Response) => {
  const { arsAmount, destinationWallet } = req.body;
  if (!arsAmount || !destinationWallet) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros arsAmount y destinationWallet' });
  }
  const result = processArsOnRamp(Number(arsAmount), destinationWallet);
  res.json(result);
});

app.post('/api/mocks/onramp/fiat', (req: Request, res: Response) => {
  const { fiatAmount, fiatCurrency, destinationWallet } = req.body;
  if (!fiatAmount || !destinationWallet) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros fiatAmount y destinationWallet' });
  }
  const result = processFiatOnRamp(Number(fiatAmount), fiatCurrency || 'USD', destinationWallet);
  res.json(result);
});

app.post('/api/mocks/bridge/cctp', (req: Request, res: Response) => {
  const { originChain, usdcAmount, destinationWallet } = req.body;
  if (!originChain || !usdcAmount || !destinationWallet) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros de bridge CCTP' });
  }
  const result = processCctpBridge(originChain, Number(usdcAmount), destinationWallet);
  res.json(result);
});

app.post('/api/mocks/bridge/near-intents', (req: Request, res: Response) => {
  const { depositAsset, depositAmount, destinationWallet } = req.body;
  if (!depositAsset || !depositAmount || !destinationWallet) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros de swap NEAR Intents' });
  }
  const result = processNearIntentsSwap(depositAsset, Number(depositAmount), destinationWallet);
  res.json(result);
});

// --- Oracles ---
app.get('/api/mocks/oracles/commodities', (_req: Request, res: Response) => {
  res.json({ success: true, data: getAllCommodityPrices() });
});

app.get('/api/mocks/oracles/commodities/:crop', (req: Request, res: Response) => {
  const item = getCommodityPrice(req.params.crop);
  if (!item) return res.status(404).json({ success: false, error: 'Cultivo no encontrado' });
  res.json({ success: true, data: item });
});

app.get('/api/mocks/oracles/weather', (_req: Request, res: Response) => {
  res.json({ success: true, data: getAllWeatherData() });
});

// --- Merval Stocks Custody ---
app.get('/api/custody/stocks', (_req: Request, res: Response) => {
  res.json({ success: true, data: getMervalStocks() });
});

app.get('/api/custody/por', (_req: Request, res: Response) => {
  res.json({ success: true, data: getProofOfReserveAudit() });
});

/** Admin sees the whole catalog, including stocks hidden from the market. */
app.get('/api/admin/stocks', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => listStocksAdmin(), res);
});

/** "Emitir acción": a new tokenized stock appears in the market right away. */
app.post('/api/admin/stocks', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(
    () =>
      createStock({
        ticker: String(req.body?.ticker || ''),
        tokenTicker: req.body?.tokenTicker ? String(req.body.tokenTicker) : undefined,
        companyName: String(req.body?.companyName || ''),
        isin: String(req.body?.isin || ''),
        sector: req.body?.sector ? String(req.body.sector) : undefined,
        priceUsdc: Number(req.body?.priceUsdc),
        custodiedShares: Number(req.body?.custodiedShares),
        custodianCuit: req.body?.custodianCuit ? String(req.body.custodianCuit) : undefined,
      }),
    res,
    201,
  );
});

/** Toggle whether a stock trades in the public market. */
app.post('/api/admin/stocks/:ticker/active', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => setStockActive(req.params.ticker, Boolean(req.body?.active)), res);
});

/** Admin-set quote for the demo market. */
app.post('/api/admin/stocks/:ticker/price', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(
    () =>
      updateStockPrice(
        req.params.ticker,
        Number(req.body?.priceUsdc),
        req.body?.change24hPct !== undefined ? Number(req.body.change24hPct) : undefined,
      ),
    res,
  );
});

app.get('/api/admin/issuance/assets', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  res.json({ success: true, data: getPaymentAssets() });
});

app.post('/api/admin/issuance/assets', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { kind, address } = req.body as { kind: PaymentKind; address: string };
  if (!kind || !address) {
    return res.status(400).json({ success: false, error: 'kind y address requeridos' });
  }
  const saved = setPaymentAsset(kind, address);
  res.json({ success: true, kind, address: saved });
});

app.get('/api/admin/issuance/products', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  res.json({ success: true, data: listProducts() });
});

app.post('/api/admin/issuance/products', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { kind, name, paymentKind, pricePerUnit, contractAddress, notes } = req.body as {
    kind: ProductKind;
    name: string;
    paymentKind: PaymentKind;
    pricePerUnit?: string;
    contractAddress?: string;
    notes?: string;
  };
  if (!kind || !name || !paymentKind) {
    return res.status(400).json({ success: false, error: 'kind, name y paymentKind requeridos' });
  }
  const product = createProduct({ kind, name, paymentKind, pricePerUnit: pricePerUnit || '0', contractAddress, notes });
  res.status(201).json({ success: true, data: product });
});

app.post('/api/admin/issuance/products/:id/price', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { pricePerUnit } = req.body as { pricePerUnit: string };
  const product = updateProductPrice(req.params.id, String(pricePerUnit));
  if (!product) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
  res.json({ success: true, data: product });
});

app.post('/api/admin/issuance/products/:id/bind', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { contractAddress } = req.body as { contractAddress: string };
  if (!contractAddress) {
    return res.status(400).json({ success: false, error: 'contractAddress requerido' });
  }
  const product = bindContract(req.params.id, contractAddress);
  if (!product) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
  res.json({ success: true, data: product });
});

function wrap(fn: () => unknown, res: Response, code = 200) {
  try {
    const data = fn();
    res.status(code).json({ success: true, data });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * Async sibling of `wrap`. Anything that talks to Horizon needs this: passing
 * a promise to `wrap` would serialize it as `{}` and report success.
 */
async function wrapAsync(fn: () => Promise<unknown>, res: Response, code = 200) {
  try {
    const data = await fn();
    res.status(code).json({ success: true, data });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
}

function onChainListingOr404(listingId: string) {
  const listing = getListing(listingId);
  if (!listing) throw new Error('Listing no encontrado');
  if (!isOnChainListing(listing)) {
    throw new Error('Esta operación on-chain solo existe en licitaciones con Offering PDA');
  }
  return listing;
}

/** `refund()` only exists once `finalize()` left the offering in Failed. */
async function requireFailedOffering(listing: Listing, investor?: string) {
  const snap = await fetchOffering(listing.id);
  const apiSnap = snap ? snapshotToApi(snap) : null;
  if (snap?.state !== 'Failed' && listing.status !== 'CLOSED_FAILED') {
    throw new Error('refund() solo corre si finalize() dejó la emisión en Failed');
  }
  return apiSnap || { state: 'Failed' };
}

async function listingPayload(listingId: string, investor?: string) {
  const listing = getListing(listingId);
  if (!listing) return null;
  const snap = isOnChainListing(listing) ? await fetchOffering(listing.id).catch(() => null) : null;
  let current = listing;
  if (snap && (snap.state === 'Successful' || snap.state === 'Failed') && listing.status === 'LISTED') {
    current = markListingClosed(
      listing.id,
      snap.state === 'Successful' ? 'CLOSED_SUCCESS' : 'CLOSED_FAILED',
      unitsToUsdc(snap.totalRaised),
      { proceedsPaidTo: snap.fiduciary.toBase58() },
    );
    await settleHolders(current).catch(() => []);
  }
  return {
    listing: current,
    validation: validationPack(current),
    onChain: {
      ...listingChainMeta(current),
      ...(snap ? snapshotToApi(snap) : {}),
      hash: current.finalizeHash || null,
      explorer: current.finalizeHash ? explorerTx(current.finalizeHash) : listingChainMeta(current).explorer,
      finalizeExplorer: explorerTx(current.finalizeHash),
    },
  };
}

app.get('/api/listings', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => listListings(), res);
});

app.get('/api/listings/:id', async (req: Request, res: Response) => {
  try {
    const account = getAccountByToken(req.headers.authorization);
    const payload = await listingPayload(req.params.id, account?.publicKey);
    if (!payload) return res.status(404).json({ success: false, message: 'Listing no encontrado' });
    res.json({
      success: true,
      data: { ...payload.listing, onChain: payload.onChain },
      validation: payload.validation,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/listings/:id/validation', (req: Request, res: Response) => {
  const listing = getListing(req.params.id);
  if (!listing) return res.status(404).json({ success: false, message: 'Listing no encontrado' });
  res.json({ success: true, data: validationPack(listing) });
});

/**
 * Fully-filled demo dossier for the issuance form. Generates a friendbot-
 * funded treasury wallet so the licitación payout lands on a real account.
 */
app.post('/api/admin/demo-dossier', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(() => buildDemoDossier(), res);
});

app.post('/api/listings', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(async () => {
    const body = { ...(req.body || {}) };
    // Without an issuer the platform can sign for, the token can never be
    // distributed to holders — default the field to whichever issuer key is
    // configured (or provision a friendbot-funded one on the spot).
    if (!String(body.issuerPublicKey || '').trim()) {
      body.issuerPublicKey = adminPublicKey() || '';
    }
    return createListing(body);
  }, res, 201);
});

app.post('/api/listings/:id/deploy', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(async () => {
    const listing = assertDeployable(req.params.id);
    // The CdV slip hash must exist *before* the vault deploy so the PoR
    // attestation and every mint proof reference the same deposit.
    listing.cvDepositHash = listingCvDepositHash(listing);
    // Each listing gets its own vault instance + fresh PoR attestation; a
    // failed on-chain deploy leaves the listing in DRAFT with the real error.
    // On-chain: creates the Offering PDA + Token-2022 RWA mint + treasury ATA.
    const created =
      isProgramDeployed() && hasAdminSecret()
        ? await createOfferingOnChain(
            listing.id,
            {
              fideicomisoHash: Buffer.from(listing.cvDepositHash, 'hex').subarray(0, 32),
              cnvRecordId: listing.dossier.cnvRecordId,
              legalTermsUri: listing.dossier.legalTermsUri,
            },
            {
              name: `${listing.dossier.legalName} (${listing.dossier.tokenTicker})`,
              symbol: listing.dossier.tokenTicker.slice(0, 10),
              uri: listing.dossier.legalTermsUri,
            },
          )
        : null;
    const updated = deployListing(
      req.params.id,
      created ? { contractId: created.offering.toBase58() } : undefined,
    );
    return {
      ...updated,
      onChain: created
        ? {
            hash: created.signature,
            offering: created.offering.toBase58(),
            rwaMint: created.rwaMint.toBase58(),
            explorer: explorerTx(created.signature),
          }
        : null,
    };
  }, res);
});

app.post('/api/listings/:id/mint', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(async () => {
    const amount = Number(req.body.amount);
    const listing = assertMintable(req.params.id, amount);
    // On-chain mint into the treasury ATA happens first; if it fails the DB
    // counter is left untouched and the real error surfaces.
    const hash = isOnChainListing(listing)
      ? await mintSupplyOnChain(listing.id, BigInt(amount), Buffer.from(listing.cvDepositHash, 'hex').subarray(0, 32))
      : null;
    // The deposit hash is fixed at deploy time — accepting one here would let
    // the ledger diverge from the hash the on-chain mint actually recorded.
    const updated = mintListingTokens(req.params.id, amount);
    return {
      ...updated,
      onChain: hash ? { hash, explorer: explorerTx(hash) } : null,
    };
  }, res);
});

app.post('/api/listings/:id/licitacion', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(async () => {
    const opts = req.body || {};
    const { listing: draft, deadlineMs } = prepareOpenLicitacion(req.params.id, opts);
    // Opening on-chain sets caps/price/deadline and the company wallet as
    // fiduciary inside the same Offering PDA — nothing left to repoint.
    let onChain: { contractId: string } | undefined;
    let openHash: string | undefined;
    if (isProgramDeployed() && hasAdminSecret() && isOnChainListing({ licitacionContract: draft.stockContract } as any)) {
      openHash = await openOfferingOnChain({
        listingId: draft.id,
        fiduciary: new PublicKey(draft.dossier.proceedsWallet),
        softCap: usdcToUnits(draft.dossier.offeringSoftCapUsdc),
        hardCap: usdcToUnits(draft.dossier.offeringHardCapUsdc),
        deadline: BigInt(Math.floor(deadlineMs / 1000)),
        pricePerUnit: usdcToUnits(draft.dossier.pricePerShareUsdc),
      });
      onChain = { contractId: draft.stockContract };
    }
    const listing = openLicitacion(req.params.id, opts, onChain);
    return {
      ...listing,
      fiduciary: openHash
        ? {
            hash: openHash,
            fiduciary: listing.dossier.proceedsWallet,
            paymentUnit: 'USDC',
            note: null,
          }
        : null,
    };
  }, res);
});

app.post('/api/listings/:id/settle', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => setListingSettle(req.params.id, req.body || {}), res);
});

app.post('/api/listings/:id/close', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(() => finalizeListedOffering(req.params.id), res);
});

/**
 * Same on-chain `finalize()` as /close, but any logged-in user can trigger it.
 * The contract itself is permissionless; the gate is hard cap or deadline.
 */
app.post('/api/listings/:id/finalize', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrapAsync(async () => {
    const listing = getListing(req.params.id);
    if (!listing) throw new Error('Listing no encontrado');
    if (!isOnChainListing(listing)) {
      throw new Error('Esta licitación sandbox cierra con el endpoint admin /close');
    }
    return finalizeListedOffering(listing.id);
  }, res);
});

app.post('/api/listings/:id/refund', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrapAsync(async () => {
    const listing = onChainListingOr404(req.params.id);
    const live = await requireFailedOffering(listing, account.publicKey);
    const before = account.publicKey
      ? await fetchContribution(listing.id, new PublicKey(account.publicKey)).catch(() => null)
      : null;
    const wallet = new PublicKey(account.publicKey!);
    const hash = await refundOnChain(adminKeypair(), listing.id, wallet);
    const user = markHoldingRefunded(account.id, listing.id, { hash });
    return {
      user,
      refunded: before ? unitsToUsdc(before.amount) : 0,
      rwa: before ? Number(before.units) : 0,
      onChain: {
        ...listingChainMeta(listing),
        ...live,
        hash,
        explorer: explorerTx(hash),
        note: `refund() devolvió tus USDC de devnet a tu wallet.`,
      },
    };
  }, res);
});

app.post('/api/listings/:id/withdraw-proceeds', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(async () => {
    const listing = getListing(req.params.id);
    if (!listing) throw new Error('Listing no encontrado');
    if (!isOnChainListing(listing)) {
      throw new Error('withdraw_proceeds es el reintento on-chain; esta licitación no tiene Offering PDA');
    }
    const hash = await withdrawProceedsOnChain(listing.id);
    return {
      ...listing,
      onChain: {
        ...listingChainMeta(listing),
        hash,
        explorer: explorerTx(hash),
        note: 'Reintento de pago a la wallet fiduciaria. En el camino feliz finalize() ya pagó.',
      },
    };
  }, res);
});

app.post('/api/listings/:id/trustline', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrapAsync(async () => {
    const user = addTrustline(account.id, req.params.id);
    const listing = getListing(req.params.id);
    if (listing && sdexAvailable(listing) && account.custodyMode === 'CUSTODIAL') {
      await openCustodialTrustline({ listingId: listing.id, accountId: account.id });
    }
    // Thaw the holder's ATA so transfers accept it — admin-signed compliance.
    // Devnet: allow without form KYC (Investor PDA is auto-verified when needed).
    if (
      listing &&
      isOnChainListing(listing) &&
      account.publicKey &&
      (!isKycEnforced() || account.kycStatus === 'APPROVED')
    ) {
      const wallet = new PublicKey(account.publicKey);
      await ensureInvestorVerifiedForOps(wallet).catch((e) =>
        console.warn('[kyc-auto]', e?.message || e),
      );
      await setHolderFrozenOnChain(listing.id, wallet, false).catch(
        (e) => console.warn('[thaw]', e?.message || e),
      );
    }
    return user;
  }, res);
});

app.post('/api/listings/:id/claim', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrapAsync(async () => {
    const listing = getListing(req.params.id);
    const user = claimListingTokens(account.id, req.params.id, listing?.status === 'CLOSED_SUCCESS');
    const snap = listing && isOnChainListing(listing) ? await fetchOffering(listing.id).catch(() => null) : null;
    // For on-chain listings the units already sit in the holder's ATA; the
    // distribution check just verifies the balance matches.
    const distribution =
      listing && sdexAvailable(listing)
        ? await distributeClaimedTokens({ listingId: listing.id, accountId: account.id }).catch(
            (e: any) => ({ error: e?.message || 'error' }),
          )
        : null;
    return {
      ...user,
      distribution,
      onChain: listing
        ? {
            ...listingChainMeta(listing),
            ...(snap ? snapshotToApi(snap) : {}),
            note: 'Las unidades RWA se entregan en tu ATA al cierre exitoso con distribute(); finalize() pagó a la empresa.',
          }
        : undefined,
    };
  }, res);
});

/**
 * Retries the on-chain payout for already-claimed tokens.
 *
 * Self-custody holders need their trustline on the ledger first (they sign it
 * themselves), so the initial claim may not reach the wallet. This endpoint
 * pays whatever `tokens - tokensOnChain` remains — idempotent.
 */
app.post('/api/listings/:id/distribute', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrapAsync(
    () => distributeClaimedTokens({ listingId: req.params.id, accountId: account.id }),
    res,
  );
});

app.get('/api/admin/testnet', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(async () => {
    const deployment = loadDeployment();
    return {
      ...getTestnetConfig(),
      onChain: isProgramDeployed(),
      deployment,
      /**
       * The admin account the backend can sign for right now. New listings
       * should default issuerPublicKey to this.
       */
      activeIssuer: adminPublicKey(),
    };
  }, res);
});

app.post('/api/admin/testnet', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => setTestnetConfig(req.body || {}), res);
});

app.post('/api/admin/testnet/configure-issuer', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(async () => {
    // Solana equivalent of issuer flags config: initialize_platform records
    // fee + KYC-hour enforcement on the platform PDA (one-time).
    const hash = await initializePlatformOnChain({
      feeBps: Number(req.body?.feeBps ?? 0),
      // Devnet default: do not gate verify_investor on ART business hours.
      enforceKycHours:
        req.body?.enforceKycHours != null ? Boolean(req.body.enforceKycHours) : isKycEnforced(),
    });
    return { hash };
  }, res);
});

/**
 * Creates the Manifest market for a listing and thaws its vault — only after
 * a successful close (the program enforces the same gate on-chain).
 */
app.post('/api/listings/:id/market', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(async () => {
    const listing = getListing(req.params.id);
    if (!listing) throw new Error('Listing no encontrado');
    const snap = await fetchOffering(listing.id);
    if (!snap) throw new Error('La licitación no tiene Offering PDA on-chain');
    if (snap.state !== 'Successful') {
      throw new Error('El mercado secundario abre solo si la licitación cerró con éxito');
    }
    const market = await createMarket(snap.rwaMint, snap.paymentMint);
    await authorizeVault(listing.id, new PublicKey(market.baseVault));
    return setListingMarket(listing.id, market.market);
  }, res);
});

app.post('/api/listings/:id/contribute', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión para suscribir' });
  wrapAsync(async () => {
    const listing = getListing(req.params.id);
    if (!listing) throw new Error('Listing no encontrado');
    const amount = Number(req.body.usdcAmount);
    if (isOnChainListing(listing)) {
      const hash = await contributeOnChain(
        listing.id,
        custodialSigningKeypair(account.id),
        usdcToUnits(amount),
      );
      const snap = await fetchOffering(listing.id).catch(() => null);
      recordOnChainContribution(listing.id, account.id, {
        amount,
        tokens: listing.dossier.pricePerShareUsdc > 0 ? amount / listing.dossier.pricePerShareUsdc : 0,
        raised: snap ? unitsToUsdc(snap.totalRaised) : amount,
      });
      const onChain = await receiptAfterContribute(listing.id, account.id, {
        contributeHash: hash,
      });
      // Hitting the hard cap is what the contract waits for; closing here is
      // what keeps the company from having to ask someone to press a button.
      const closed = await autoFinalizeIfDue(listing.id);
      const updated = getListing(listing.id)!;
      return { ...updated, onChain: { ...onChain, autoFinalized: Boolean(closed) } };
    }
    contributeListing(listing.id, amount, account.id);
    const onChain = await receiptAfterContribute(listing.id, account.id);
    const closed = await autoFinalizeIfDue(listing.id);
    const updated = getListing(listing.id)!;
    return { ...updated, onChain: { ...onChain, autoFinalized: Boolean(closed) } };
  }, res);
});

/* ---------------------------------------------------------------- *
 * Self-custody (Phantom/Solflare/Backpack) path for the Anchor program
 *
 * `contribute` and `refund` need the investor as transaction signer, so the
 * wallet signs. `/prepare` returns a serialized unsigned transaction and
 * `/submit` relays the signed one: the backend never holds the key.
 * ---------------------------------------------------------------- */

app.post('/api/listings/:id/contribute/prepare', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión para suscribir' });
  wrapAsync(async () => {
    const listing = onChainListingOr404(req.params.id);
    if (!account.publicKey) throw new Error('La cuenta no tiene wallet Solana asociada');
    const transaction = await prepareContributeTx(
      listing.id,
      new PublicKey(account.publicKey),
      usdcToUnits(Number(req.body?.usdcAmount)),
    );
    return { transaction };
  }, res);
});

app.post('/api/listings/:id/contribute/submit', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión para suscribir' });
  const signedTx = String(req.body?.transaction || req.body?.xdr || '');
  if (!signedTx) return res.status(400).json({ success: false, message: 'Falta la transacción firmada' });
  wrapAsync(async () => {
    const listing = onChainListingOr404(req.params.id);
    const amount = Number(req.body?.usdcAmount);
    const hash = await submitContributeTx(signedTx);
    const snap = await fetchOffering(listing.id).catch(() => null);
    recordOnChainContribution(listing.id, account.id, {
      amount,
      tokens: listing.dossier.pricePerShareUsdc > 0 ? amount / listing.dossier.pricePerShareUsdc : 0,
      raised: snap ? unitsToUsdc(snap.totalRaised) : amount,
    });
    const onChain = await receiptAfterContribute(listing.id, account.id, {
      contributeHash: hash,
    });
    const closed = await autoFinalizeIfDue(listing.id);
    const updated = getListing(listing.id)!;
    return { ...updated, onChain: { ...onChain, autoFinalized: Boolean(closed) } };
  }, res);
});

app.post('/api/listings/:id/refund/prepare', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrapAsync(async () => {
    const listing = onChainListingOr404(req.params.id);
    await requireFailedOffering(listing, account.publicKey);
    if (!account.publicKey) throw new Error('La cuenta no tiene wallet Solana asociada');
    const transaction = await prepareRefundTx(listing.id, new PublicKey(account.publicKey));
    return { transaction };
  }, res);
});

app.post('/api/listings/:id/refund/submit', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  const signedTx = String(req.body?.transaction || req.body?.xdr || '');
  if (!signedTx) return res.status(400).json({ success: false, message: 'Falta la transacción firmada' });
  wrapAsync(async () => {
    const listing = onChainListingOr404(req.params.id);
    const live = await requireFailedOffering(listing, account.publicKey);
    const before = account.publicKey
      ? await fetchContribution(listing.id, new PublicKey(account.publicKey)).catch(() => null)
      : null;
    const hash = await submitRefundTx(signedTx);
    const user = markHoldingRefunded(account.id, listing.id, { hash });
    return {
      user,
      refunded: before ? unitsToUsdc(before.amount) : 0,
      rwa: before ? Number(before.units) : 0,
      onChain: {
        ...listingChainMeta(listing),
        ...live,
        hash,
        explorer: explorerTx(hash),
        note: 'refund() devolvió tus USDC de devnet a tu wallet.',
      },
    };
  }, res);
});

app.get('/api/onchain/status', (_req: Request, res: Response) => {
  wrapAsync(() => getOnChainStatus(), res);
});

app.get('/api/market/pools', (_req: Request, res: Response) => {
  wrap(() => listedPools(), res);
});

app.get('/api/orderbook/markets', (_req: Request, res: Response) => {
  wrap(() => listMarkets(), res);
});

app.get('/api/orderbook/:listingId', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  wrap(() => getBook(req.params.listingId, account?.id), res);
});

app.post('/api/orderbook/:listingId/orders', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión para operar' });
  const { side, price, amount } = req.body as { side: 'BUY' | 'SELL'; price: number; amount: number };
  wrap(() => placeOrder(req.params.listingId, account.id, side, Number(price), Number(amount)), res);
});

app.post('/api/orderbook/orders/:id/cancel', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrap(() => cancelOrder(req.params.id, account.id), res);
});

/* ---------------------------------------------------------------- *
 * Manifest CLOB — the real on-chain central limit order book
 *
 * The `/api/orderbook/*` routes above remain the sandbox book for demos
 * without a deployed program. These routes trade on-chain, and the backend
 * never holds the investor's keys: order endpoints return a serialized
 * unsigned transaction the wallet signs, `/submit` relays it.
 * ---------------------------------------------------------------- */

app.get('/api/manifest/:listingId', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  wrapAsync(() => getSdexBook(req.params.listingId, account?.id), res);
});

/**
 * First-contact Manifest setup — creates the trader's wrapper + seat.
 * Self-custody gets a partially-signed tx to co-sign; custodial executes it.
 */
app.post('/api/manifest/:listingId/setup', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión para operar' });
  wrapAsync(async () => {
    const params = { listingId: req.params.listingId, accountId: account.id };
    if (account.custodyMode === 'CUSTODIAL') {
      const hash = await ensureCustodialSetup(params);
      return { ready: !hash, hash };
    }
    const prepared = await prepareTraderSetup(params);
    return prepared ? { transaction: prepared.transaction, ready: false } : { ready: true };
  }, res);
});

app.post('/api/manifest/:listingId/orders/prepare', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión para operar' });
  const { side, price, quantity, clientOrderId } = req.body as {
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    clientOrderId?: string;
  };
  wrapAsync(
    () =>
      prepareOrder({
        listingId: req.params.listingId,
        accountId: account.id,
        side,
        price: Number(price),
        quantity: Number(quantity),
        clientOrderId: clientOrderId ? BigInt(clientOrderId) : undefined,
      }),
    res,
  );
});

/** One-shot path for platform-custodied wallets: build, sign and submit. */
app.post('/api/manifest/:listingId/orders', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión para operar' });
  const { side, price, quantity } = req.body as {
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
  };
  wrapAsync(
    () =>
      placeCustodialOrder({
        listingId: req.params.listingId,
        accountId: account.id,
        side,
        price: Number(price),
        quantity: Number(quantity),
      }),
    res,
  );
});

app.post('/api/manifest/:listingId/orders/cancel', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  const { clientOrderId } = req.body as { clientOrderId: string };
  if (!clientOrderId) return res.status(400).json({ success: false, message: 'Falta clientOrderId' });
  const params = {
    listingId: req.params.listingId,
    accountId: account.id,
    clientOrderId: BigInt(clientOrderId),
  };
  wrapAsync(
    () => (account.custodyMode === 'CUSTODIAL' ? cancelCustodialOrder(params) : prepareCancel(params)),
    res,
  );
});

app.post('/api/manifest/:listingId/trustline/prepare', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrapAsync(
    () =>
      prepareTrustline({
        listingId: req.params.listingId,
        accountId: account.id,
      }),
    res,
  );
});

/** Relays any wallet-signed transaction (orders, ATA creation, contribute…). */
app.post('/api/solana/submit', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  const tx = String(req.body?.transaction || req.body?.xdr || '');
  if (!tx) return res.status(400).json({ success: false, message: 'Falta la transacción firmada' });
  wrapAsync(async () => ({ hash: await submitSignedTx(tx) }), res);
});

/** Repoints the wallet the company receives the raise in. */
app.post('/api/listings/:id/proceeds-wallet', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrapAsync(async () => {
    const listing = setListingProceedsWallet(req.params.id, String(req.body?.wallet || ''));
    // Before the offering opens the wallet goes straight into `open_offering`.
    const fiduciary =
      listing.status === 'LISTED' && isOnChainListing(listing)
        ? await setFiduciaryOnChain(listing.id, new PublicKey(listing.dossier.proceedsWallet))
        : null;
    return { ...listing, fiduciary };
  }, res);
});

app.post('/api/listings/:id/dividends', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  wrap(() => depositDividends(req.params.id, Number(req.body?.amountUsdc ?? req.body?.amount)), res, 201);
});

app.get('/api/listings/:id/dividends', (req: Request, res: Response) => {
  wrap(() => listDividends(req.params.id), res);
});

app.post('/api/listings/:id/dividends/claim', (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  wrap(() => claimPendingDividend(account.id, req.params.id), res);
});

app.get('/api/portfolio', async (req: Request, res: Response) => {
  const account = getAccountByToken(req.headers.authorization);
  if (!account) return res.status(401).json({ success: false, message: 'Iniciá sesión' });
  // Any registered wallet heals on dashboard load: devnet SOL top-up plus
  // the USDC grant for wallets that already have their ATA.
  if (account.publicKey) {
    try {
      await ensureWalletFunded(account.publicKey);
    } catch (err: any) {
      console.warn('[wallet-heal]', err?.message || err);
    }
  }
  wrapAsync(() => buildPortfolio(account.id), res);
});

/**
 * Reconciles one holder's on-chain state with their KYC status: verify or
 * revoke the Investor PDA (platform-wide), then thaw/freeze the holder ATA
 * per listing. Needed because the two drift in normal operation — an
 * investor approved before they created their ATA, or an RPC call that
 * failed during the approval sweep.
 */
app.post('/api/admin/compliance/sync', (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { address, approved, listingId } = req.body as {
    address: string;
    approved: boolean;
    listingId?: string;
  };
  if (!address) return res.status(400).json({ success: false, message: 'Falta la dirección' });
  wrapAsync(async () => {
    const wallet = new PublicKey(address);
    const kycHash = approved
      ? await verifyInvestorOnChain(wallet)
      : null;
    const results: Record<string, unknown> = { kycHash };
    if (listingId) {
      const listing = getListing(listingId);
      if (listing && isOnChainListing(listing)) {
        results.holderHash = await setHolderFrozenOnChain(listing.id, wallet, !approved);
      }
    }
    return results;
  }, res);
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[Fractachain Backend] API Server corriendo en puerto ${PORT}`);
  startSettlementSweep();
});
