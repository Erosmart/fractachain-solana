#!/usr/bin/env node
/**
 * Agentes demo: fondean una licitación (Las Lilas II) y operan el orderbook.
 *
 *   HACKATHON_DEMO=true npm run dev   (backend en :8080)
 *   node scripts/agents_lilas.mjs
 *
 * Escribe agents_secrets.json en la raíz del repo con las claves privadas
 * (SECRET KEYS — no commitear). Cada agente es una cuenta real con custodia
 * SELF: su secret viene de secretOnce del backend.
 */
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.API_URL || 'http://localhost:8080';
const N_AGENTS = Number(process.env.AGENTS || 6);
const TRADE_ROUNDS = Number(process.env.ROUNDS || 12);
const OUT = path.join(process.cwd(), '..', 'agents_secrets.json');
const OUT_REPO = path.resolve(process.cwd(), '..', 'agents_secrets.json');

const rnd = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, url, body, token) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(`${method} ${url} → ${res.status}: ${data.message || data.error || 'error'}`);
  }
  return data;
}

async function login(email, name) {
  const r = await call('POST', '/api/auth/email', { email, password: 'agente-demo-1', name });
  return { token: r.token, user: r.user };
}

async function main() {
  // --- admin local: ADMIN_EMAILS default incluye este mail ---
  const admin = await login('erosnahuelp85@gmail.com', 'Admin');
  console.log('admin ok:', admin.user.id, 'isAdmin:', admin.user.isAdmin);

  // --- listing nuevo "Las Lilas II" (la de LILAS original ya llegó al hardCap) ---
  let listingId = process.env.LISTING_ID || '';
  if (!listingId) {
    const tick = `LL${String(Date.now()).slice(-4)}`;
    const created = await call('POST', '/api/listings', {
      legalName: 'Agropecuaria Las Lilas S.A.',
      tradeName: `Las Lilas ${tick}`,
      cuit: '30681920149',
      jurisdiction: 'Pergamino, Buenos Aires',
      sector: 'Soja',
      ticker: tick,
      tokenTicker: tick,
      isin: `AR${tick}DEMO1`,
      authorizedShares: 50000,
      sharesToTokenize: 4000,
      pricePerShareUsdc: 5,
      cajaSubaccount: 'CV-84920-LL2',
      custodianCuit: '30700000000',
      cnvRecordId: 'CNV-SANDBOX-1151',
      bymaRequestId: 'BYMA-DEMO-2',
      legalTermsUri: 'https://example.com/las-lilas-2/terms',
      estatutoHash: 'agentsdemo',
      auditor: 'Pistrelli',
      issuerPublicKey: 'GAGPWEIFYS54Y5WY3WJ6IWXK4YAPSNRVOEWEGBL7W3BKR6YL4VUYE653',
      proceedsWallet: 'GDUA6DQZJXBPTAQANQXEKXV3VXCPUIP5XQEHDAKJLRAVTXK35ZX2YORW',
      paymentKind: 'USDC',
      offeringSoftCapUsdc: 1000,
      offeringHardCapUsdc: 20000,
      offeringDays: 21,
      tnaUsd: 14.5,
      useOfProceeds: 'Campaña soja — segunda ventana (demo de agentes)',
      minInvestmentUsdc: 10,
    }, admin.token);
    listingId = created.data?.id || created.id;
    await call('POST', `/api/listings/${listingId}/deploy`, {}, admin.token);
    await call('POST', `/api/listings/${listingId}/mint`, { amount: 4000 }, admin.token);
    await call('POST', `/api/listings/${listingId}/licitacion`, { settlePolicy: 'ON_DATE', settleAt: new Date(Date.now() + 86400e3).toISOString() }, admin.token);
    console.log('listing creado+listed:', listingId);
  }

  // --- agentes ---
  const agents = [];
  for (let i = 1; i <= N_AGENTS; i++) {
    const email = `agente${i}@fractachain.demo`;
    const { token, user } = await login(email, `Agente ${i}`);
    const custody = await call('POST', '/api/auth/wallet', { mode: 'SELF' }, token);
    const a = { email, token, id: user.id, publicKey: custody.user.publicKey, secret: custody.secretOnce };
    agents.push(a);
    console.log(`agente${i}:`, a.publicKey, '| kyc:', custody.user.kycStatus);
  }

  // --- trustline + fondeo + claim ---
  for (const a of agents) {
    await call('POST', `/api/listings/${listingId}/trustline`, {}, a.token).catch(() => {});
    // también aprueban LILAS para poder comprarla en el libro
    await call('POST', `/api/listings/IPO-SOJA-PERGAMINO-2026/trustline`, {}, a.token).catch(() => {});
    const amt = Math.round(rnd(150, 600));
    try {
      await call('POST', `/api/listings/${listingId}/contribute`, { usdcAmount: amt }, a.token);
      console.log(`${a.email} fondeó $${amt}`);
    } catch (e) {
      console.log(`${a.email} contribute: ${e.message}`);
    }
  }

  // --- cierra la licitación (admin) y los agentes reclaman los tokens ---
  await call('POST', `/api/listings/${listingId}/close`, {}, admin.token)
    .then(() => console.log('licitación cerrada → tokens reclamables'))
    .catch((e) => console.log('close:', e.message));
  for (const a of agents) {
    await call('POST', `/api/listings/${listingId}/claim`, {}, a.token)
      .then((u) => console.log(`${a.email} reclamó tokens`))
      .catch((e) => console.log(`${a.email} claim: ${e.message}`));
  }

  // --- loop de trading: compras y ventas cruzadas ---
  let trades = 0;
  for (let round = 0; round < TRADE_ROUNDS; round++) {
    for (const a of agents) {
      const side = Math.random() < 0.5 ? 'BUY' : 'SELL';
      const price = Math.round(rnd(4, 6.5) * 100) / 100;
      const amount = Math.round(rnd(1, 15) * 100) / 100;
      try {
        const r = await call('POST', `/api/orderbook/${listingId}/orders`, { side, price, amount }, a.token);
        const mine = r.order?.status;
        if (mine === 'FILLED' || mine === 'PARTIAL') trades++;
        if (Math.random() < 0.2) {
          await call('POST', `/api/orderbook/IPO-SOJA-PERGAMINO-2026/orders`, { side: 'BUY', price: 10, amount: 1 }, a.token).catch(() => {});
        }
      } catch { /* saldo/tokens insuficientes — el loop sigue */ }
      await sleep(60);
    }
    console.log(`ronda ${round + 1}/${TRADE_ROUNDS}`);
  }

  // --- guardar claves (NO commitear) ---
  const out = {
    generatedAt: new Date().toISOString(),
    listingId,
    note: 'Claves privadas Stellar (testnet) de los agentes — custodia SELF. NO commitear este archivo.',
    agents: agents.map(({ email, id, publicKey, secret }) => ({ email, id, publicKey, secret })),
  };
  fs.writeFileSync(OUT_REPO, JSON.stringify(out, null, 2));
  console.log(`\nClaves guardadas en ${OUT_REPO} — ${trades} órdenes matcheadas (aprox).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
