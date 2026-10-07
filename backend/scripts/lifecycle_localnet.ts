/**
 * Localnet lifecycle test — the full licitación flow against a local
 * solana-test-validator with the program deployed at FRACTACHAIN_PROGRAM_ID.
 *
 * Covers:
 *   SUCCESS  contribute×2 → escrow only → finalize (hard cap) → distribute×2
 *            → units land in holder ATAs, proceeds to fiduciary
 *   FAILURE  contribute → deadline passes → finalize → refund×2 → escrow back
 *   GATE     authorize_market_vault rejected before a successful close
 *   MANIFEST create market + empty book (only if the validator cloned the
 *            Manifest + wrapper programs from devnet)
 *
 * Run (from backend/):
 *   npx ts-node scripts/lifecycle_localnet.ts
 *
 * Env injected by this script: admin keypair + USDC mint are generated and
 * funded locally — nothing here needs real keys or devnet.
 */
import { Keypair, PublicKey } from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';

const PROGRAM_ID = process.env.FRACTACHAIN_PROGRAM_ID || '';
if (!PROGRAM_ID || PROGRAM_ID.startsWith('Fractachain1111')) {
  console.error('Pasar FRACTACHAIN_PROGRAM_ID del programa deployado en el validador');
  process.exit(1);
}
process.env.SOLANA_CLUSTER = 'localnet';
process.env.SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899';

const admin = Keypair.generate();
process.env.SOLANA_ADMIN_SECRET_KEY = bs58.encode(admin.secretKey);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${name} ${extra}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { getConnection } = await import('../src/solana/connection');
  const { initializePlatformOnChain } = await import('../src/solana/platform');
  const { verifyInvestorOnChain } = await import('../src/solana/kyc');
  const {
    createOfferingOnChain,
    mintSupplyOnChain,
    openOfferingOnChain,
    contributeOnChain,
    finalizeOnChain,
    distributeOnChain,
    refundOnChain,
  } = await import('../src/solana/offering');
  const { fetchOffering, fetchContribution } = await import('../src/solana/offering_state');
  const { offeringPda, rwaMintPda } = await import('../src/solana/pda');
  const { ataOf } = await import('../src/solana/program');
  const { ixAuthorizeMarketVault, TOKEN_2022_PROGRAM_ID } = await import('../src/solana/program');
  const { sendIxs } = await import('../src/solana/tx');

  const conn = getConnection();
  const usdc = (n: number) => BigInt(Math.round(n * 1e6));

  /* ------------------------------------------------------------ bootstrap */

  console.log('\n[0] Bootstrap: admin + USDC mock + platform');
  const airdrop = async (pk: PublicKey, sol: number) => {
    const sig = await conn.requestAirdrop(pk, sol * 1e9);
    await conn.confirmTransaction(sig, 'confirmed');
  };
  await airdrop(admin.publicKey, 5);

  const usdcMint = await createMint(conn, admin, admin.publicKey, null, 6);
  process.env.SOLANA_USDC_MINT = usdcMint.toBase58();
  process.env.SOLANA_USDC_MINT_AUTHORITY = process.env.SOLANA_ADMIN_SECRET_KEY;
  console.log('  USDC mint:', usdcMint.toBase58());

  await initializePlatformOnChain({ feeBps: 0, enforceKycHours: false });
  check('initialize_platform', true);

  // Two investors: funded, USDC-loaded, KYC-verified on-chain.
  const investors = await Promise.all(
    [0, 1].map(async () => {
      const kp = Keypair.generate();
      await airdrop(kp.publicKey, 0.5);
      const ata = await getOrCreateAssociatedTokenAccount(conn, admin, usdcMint, kp.publicKey);
      await mintTo(conn, admin, usdcMint, ata.address, admin, 1_000e6);
      await verifyInvestorOnChain(kp.publicKey);
      return { kp, usdcAta: ata.address };
    }),
  );
  check('2 inversores KYC-verificados on-chain', true);

  const listingOk = `lct-${Date.now()}-ok`;
  const listingFail = `lct-${Date.now()}-fail`;
  const legal = {
    fideicomisoHash: Buffer.alloc(32, 1),
    cnvRecordId: 'CNV-TEST-1',
    legalTermsUri: 'https://example.test/legal',
  };

  /* ------------------------------------------------- SUCCESS: hard-cap close */

  console.log('\n[1] Licitación exitosa (cierra por hard cap)');
  await createOfferingOnChain(listingOk, legal, { name: 'Bono Test', symbol: 'BTEST', uri: '' });
  await mintSupplyOnChain(listingOk, 1_000n, Buffer.alloc(32, 2));
  // price 1 USDC, soft 150, hard 200 → two 100-USDC contributions hit the cap.
  await openOfferingOnChain({
    listingId: listingOk,
    fiduciary: admin.publicKey,
    softCap: usdc(150),
    hardCap: usdc(200),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    pricePerUnit: usdc(1),
  });
  const snap0 = await fetchOffering(listingOk);
  check('oferta abierta', snap0?.state === 'Open');

  const treasury0 = await getAccount(conn, snap0!.treasuryAta);
  check('float custodiado = 1000', Number(treasury0.amount) === 1000);

  await contributeOnChain(listingOk, investors[0].kp, usdc(100));
  await contributeOnChain(listingOk, investors[1].kp, usdc(100));

  const snap1 = await fetchOffering(listingOk);
  check('total_raised = hard cap', snap1?.totalRaised === usdc(200), String(snap1?.totalRaised));

  // The core invariant: escrow only, no units delivered yet.
  const [offeringOk] = offeringPda(listingOk);
  const [rwaMintOk] = rwaMintPda(offeringOk);
  const inv0RwaAta = ataOf(investors[0].kp.publicKey, rwaMintOk, TOKEN_2022_PROGRAM_ID);
  const inv0RwaInfo = await conn.getAccountInfo(inv0RwaAta);
  check('comprador NO recibió tokens al suscribir', !inv0RwaInfo);

  // Duplicate contribution from the same wallet tops up the same PDA.
  const contrib0 = await fetchContribution(listingOk, investors[0].kp.publicKey);
  check('contribution PDA registrada (100 units)', contrib0?.units === 100n);

  const fidAtaOk = (await getOrCreateAssociatedTokenAccount(conn, admin, usdcMint, admin.publicKey)).address;
  const fidBefore = Number((await getAccount(conn, fidAtaOk)).amount);
  await finalizeOnChain(listingOk, admin);
  const snap2 = await fetchOffering(listingOk);
  check('finalize → Successful', snap2?.state === 'Successful');
  const fidAfter = Number((await getAccount(conn, fidAtaOk)).amount);
  check('proceeds a la fiduciaria', fidAfter - fidBefore === 200e6, `${fidAfter - fidBefore}`);

  // Market gate: must NOT work before this point — verify it works after.
  const marketGate = await sendIxs(admin, [], [
    ixAuthorizeMarketVault(admin.publicKey, listingOk, snap2!.treasuryAta),
  ]).then(() => true).catch(() => false);
  check('authorize_market_vault tras éxito', marketGate);

  // distribute×2 — crank pays, holders sign nothing.
  const d0 = await distributeOnChain(admin, listingOk, investors[0].kp.publicKey);
  const d1 = await distributeOnChain(admin, listingOk, investors[1].kp.publicKey);
  check('distribute×2 firma ok', Boolean(d0 && d1));

  const inv0Bal = Number((await getAccount(conn, inv0RwaAta)).amount);
  const inv1RwaAta = ataOf(investors[1].kp.publicKey, rwaMintOk, TOKEN_2022_PROGRAM_ID);
  const inv1Bal = Number((await getAccount(conn, inv1RwaAta)).amount);
  check('inv0 recibió 100 unidades', inv0Bal === 100, String(inv0Bal));
  check('inv1 recibió 100 unidades', inv1Bal === 100, String(inv1Bal));

  const treasury1 = await getAccount(conn, snap0!.treasuryAta);
  check('float residual = 800 (unsold float queda)', Number(treasury1.amount) === 800);

  // Idempotency: a second distribute for inv0 must fail cleanly.
  const dup = await distributeOnChain(admin, listingOk, investors[0].kp.publicKey)
    .then(() => 'delivered-twice')
    .catch((e: any) => String(e?.message || e));
  check('doble distribute rechazado', /Nothing|settled|0x/i.test(dup), dup);

  /* ------------------------------------------------ FAILURE: deadline close */

  console.log('\n[2] Licitación fallida (cierra por deadline, no llega al soft cap)');
  await createOfferingOnChain(listingFail, legal, { name: 'Bono Fail', symbol: 'BFAIL', uri: '' });
  await mintSupplyOnChain(listingFail, 1_000n, Buffer.alloc(32, 3));
  await openOfferingOnChain({
    listingId: listingFail,
    fiduciary: admin.publicKey,
    softCap: usdc(300),
    hardCap: usdc(400),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 12), // short demo window
    pricePerUnit: usdc(1),
  });

  const usdcBefore = Number((await getAccount(conn, investors[0].usdcAta)).amount);
  await contributeOnChain(listingFail, investors[0].kp, usdc(100));
  await contributeOnChain(listingFail, investors[1].kp, usdc(50));

  // Market gate must reject while the offering is still Open.
  const snapF0 = await fetchOffering(listingFail);
  const gateErr = await sendIxs(admin, [], [
    ixAuthorizeMarketVault(admin.publicKey, listingFail, snapF0!.treasuryAta),
  ]).then(() => 'thawed').catch((e: any) => String(e?.message || e));
  check('authorize_market_vault bloqueado pre-cierre', gateErr !== 'thawed', gateErr);

  // Early finalize must fail too.
  const earlyFin = await finalizeOnChain(listingFail, admin)
    .then(() => 'finalized')
    .catch((e: any) => String(e?.message || e));
  check('finalize temprano rechazado', earlyFin !== 'finalized', earlyFin);

  console.log('  esperando deadline (12s)…');
  await sleep(13_000);
  // A late contribution must be rejected.
  const late = await contributeOnChain(listingFail, investors[1].kp, usdc(10))
    .then(() => 'accepted')
    .catch((e: any) => String(e?.message || e));
  check('contribute post-deadline rechazado', late !== 'accepted', late);

  await finalizeOnChain(listingFail, admin);
  const snapF = await fetchOffering(listingFail);
  check('finalize → Failed (soft cap no alcanzado)', snapF?.state === 'Failed');

  // distribute on a failed offering must be rejected.
  const badDist = await distributeOnChain(admin, listingFail, investors[0].kp.publicKey)
    .then(() => 'delivered')
    .catch((e: any) => String(e?.message || e));
  check('distribute en fallida rechazado', badDist !== 'delivered', badDist);

  // Crank refunds both contributors — no signatures from them.
  const r0 = await refundOnChain(admin, listingFail, investors[0].kp.publicKey);
  const r1 = await refundOnChain(admin, listingFail, investors[1].kp.publicKey);
  check('refund×2 firma ok', Boolean(r0 && r1));

  const usdcAfter = Number((await getAccount(conn, investors[0].usdcAta)).amount);
  check('inv0 recuperó sus 100 USDC', usdcAfter === usdcBefore, `${usdcBefore}→${usdcAfter}`);

  const escrowF = snapF!.escrowAta;
  const escrowBal = Number((await getAccount(conn, escrowF)).amount);
  check('escrow vacío tras refunds', escrowBal === 0, String(escrowBal));

  // Second refund: contribution PDA closed → clean failure.
  const dupRefund = await refundOnChain(admin, listingFail, investors[0].kp.publicKey)
    .then(() => 'refunded-twice')
    .catch((e: any) => String(e?.message || e));
  check('doble refund rechazado', dupRefund !== 'refunded-twice', dupRefund);

  /* ----------------------------------------------------------- MANIFEST */

  console.log('\n[3] Manifest (si el validador clonó el programa)');
  try {
    const { createMarket, authorizeVault, vaultAddress, getBook } = await import('../src/solana/manifest');
    const market = await createMarket(rwaMintOk, usdcMint);
    check('createMarket', Boolean(market.market), market.market);
    const baseVault = await vaultAddress(new PublicKey(market.market), rwaMintOk);
    await authorizeVault(listingOk, baseVault);
    check('authorizeVault (base vault thawed)', true);
    const book = await getBook(market.market);
    check('libro vacío legible', book.bids.length === 0 && book.asks.length === 0);
  } catch (e: any) {
    console.log(`  ⚠ Manifest skip/error: ${e?.message || e}`);
  }

  console.log(`\n=== RESULTADO: ${passed} ok, ${failed} fallidos ===`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('ERROR FATAL:', e);
  process.exit(1);
});
