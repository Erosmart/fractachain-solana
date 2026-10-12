# Fractachain

[![Solana](https://img.shields.io/badge/Solana-9945FF?style=flat&logo=solana&logoColor=white)](https://solana.com)
[![Next.js](https://img.shields.io/badge/Next.js_14-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

We want to be Argentina's first regulated Real-World-Asset (RWA) marketplace, on **Solana**: primary offerings (licitaciones) of equity and debt for companies and producers, with on-chain secondary trading.

- Regulated tokens on **Token-2022** (native compliance: accounts frozen until KYC)
- On-chain order book with **Manifest** (CLOB, no AMM)
- **Phantom** / Solflare / Backpack wallets (Wallet Standard)
- `frontend/` — Next.js 14 · `backend/` — Node API · `programs/fractachain/` — Anchor program

---

## The problem

Argentine producers and SMEs need dollars against the season (seed, fertilizer, freight) and investors want yield with real backing. The traditional circuit — bank / warrant / Caja de Valores — is slow, expensive, and has almost no secondary market where an investor can resell what they subscribed.

The market fails on both sides:

- **The money is there, but outside the system**: Argentines hold an estimated **~US$200 billion (USD, not pesos)** in savings outside the formal financial system — mattress cash, safe-deposit boxes and offshore accounts ([La Nación](https://www.lanacion.com.ar/editoriales/existe-un-rigi-para-el-conurbano-nid16082026/) · [BCG via Forbes Argentina](https://www.forbesargentina.com/money/bancos-argentina-mercado-mayor-potencial-bcg-n95342)).
- **The companies are there, but cut off**: SMEs are 98% of the country's business fabric, yet only **~4% of SME financing** comes through capital markets ([Ministerio de Producción — PAcP](https://www.argentina.gob.ar/sites/default/files/3.1_pacp-politica_de_acceso_al_credito_productivo_vf_0.pdf)).

Issuing an Obligación Negociable (ON) today means guarantee fees + placement commissions + legal and accounting fees + market charges on top of the interest rate, with a practical floor around USD 1.4M (low-impact regime) or ~USD 27M (fully-guaranteed PyME regime). Going public on BYMA is even further out of reach.

## The solution

Fractachain puts that offering on Solana:

1. An issuer creates a dossier (company, legal docs, caps, price, deadline).
2. The Anchor program opens an **Offering PDA** that escrows investor USDC.
3. Investors pass KYC, contribute USDC, and receive **Token-2022 units** — frozen until compliance clears them.
4. At hard-cap or deadline the offering **finalizes**: funds go to the fiduciary wallet if the soft cap was met, otherwise every investor calls `refund`.
5. A **Manifest CLOB** market provides secondary trading once the offering succeeds.

## How we use Solana

| Piece | Implementation |
|---|---|
| RWA asset | **Token-2022** mint per offering, ATAs frozen/thawed by the program |
| Escrow + offering | Single **Anchor program** `fractachain` — Offering PDA acts as vault + licitación |
| Compliance | **Investor PDA** (platform-wide KYC) + `verify_investor` / `revoke_investor` + ATA thaw |
| Secondary market | **Manifest CLOB** (`MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms`, already deployed by its authors) |
| Self-custody | `wallet-adapter` + Wallet Standard (Phantom, Solflare, Backpack); backend returns unsigned base64 txs, wallet signs |
| Custodial mode | Backend-generated keypair, AES-256-GCM encrypted with `WALLET_PEPPER`, stored in Postgres |
| Payments | USDC — on devnet, our own mock mint (see table below) |
| OPA / squeeze-out | `launch_opa` · `accept_opa` · `execute_squeeze_out` · `claim_squeeze_out` instructions on-chain |

Program instructions (all in `programs/fractachain/src/instructions/`):
`initialize_platform` · `set_payment_mint` · `verify_investor` · `create_offering` ·
`mint_supply` · `open_offering` · `contribute` · `finalize` · `refund` ·
`withdraw_proceeds` · `launch_opa` · `accept_opa` · `execute_squeeze_out` ·
`freeze_holder` · `thaw_holder` · `authorize_market_vault` …

---

## How we compare

| | Fractachain | Ripio | Agrotoken | CNV crowdfunding (Alix) |
|---|---|---|---|---|
| Tokenized SMEs & mid-caps | ✅ | — | — | — |
| Agro & RWA assets | ✅ | — | Grains only | — |
| Retail investors (KYC only) | ✅ | Partial | Closed: producers/suppliers | — |
| On-chain settlement | ✅ | Partial | Partial | — |
| Secondary market, 24/7 | ✅ | — | — | — |
| Global investors | ✅ | — | Argentina only | — |
| Self or managed custody | ✅ | — | — | — |

Ripio tokenizes sovereign bonds and large-cap debt — SMEs and mid-caps are out. Agrotoken is a closed grains circuit for producers and suppliers, Argentina only. Alix and CNV crowdfunding target large companies/IPOs, off-chain, no retail access.

## The regulated path — our own registrations

We do not borrow anyone's license — a figurehead (prestanombre) arrangement would be illegal. The roadmap is to register **ourselves**:

1. **PSAV** (Virtual Asset Service Provider) at the CNV — Law 27.739, RG 1058. It covers custody of investors' assets, which can't be outsourced to a borrowed registration.
2. **Our own fideicomiso** (financial trust) under Law 26.831 + CNV sandbox, as a Global Program with independent Series.

## Commercial pipeline — under NDA

We are in active conversations with companies and producers, but they are all under **non-disclosure agreements**: we cannot share names, details, or letters of intent. Confidentiality is strict on their side — until formal announcements are made we cannot reveal more. The conversations exist and are moving forward.

---

## What's live vs mock

| Area | Status | Detail |
|---|---|---|
| Anchor program on **devnet** | ✅ Live | Deployed + platform initialized (tx `3PQ4Sf9W…`) |
| Primary offering — escrow, contribute, finalize, refund | ✅ Live | On-chain, devnet |
| Token-2022 RWA units + freeze/thaw KYC | ✅ Live | On-chain, devnet |
| Secondary market — Manifest CLOB orders | ✅ Live | Real market/orders; **trade tape (fill history) is empty** — needs an indexer |
| Self-custody login (Phantom/Solflare/Backpack) | ✅ Live | ed25519 message signature → JWT |
| Custodial wallets | ✅ Live | Encrypted keypairs in Postgres |
| Google / email auth | ✅ Live | Firebase on Railway |
| Devnet faucet — SOL + 5,000 USDC | ✅ Live | `SOLANA_AUTO_FAUCET` on login + manual button on dashboard |
| OPA / squeeze-out | 🟡 Program only | Instructions live on-chain; no UI/REST wiring yet |
| KYC hours enforcement (Mon–Fri 08–16 ART) | ⚪ Off | `KYC_ENFORCE_HOURS` flag exists, disabled for devnet |
| **USDC** | 🔴 Mock | Devnet mint `HpT3wX…5T58` — **not** Circle USDC, no value |
| SOL / USDC investor balances | 🔴 Mock | Devnet/faucet funds only |
| Portfolio P&L vs market price | 🟡 Partial | Holdings real; price discovery limited by CLOB indexer gap |

Mainnet is hard-blocked: the faucet and every testnet-only endpoint refuse `mainnet-beta`.

---

## Deployed program

| | |
|---|---|
| **Program ID** | `2d6JqnHjvAL1935Y6CXGnx2VB2Ff8L3Yi9tkApaHbJzd` |
| Cluster | Solana **devnet** |
| Explorer | https://explorer.solana.com/address/2d6JqnHjvAL1935Y6CXGnx2VB2Ff8L3Yi9tkApaHbJzd?cluster=devnet |
| Devnet USDC mint | `HpT3wXPec3JRnust7KYSEG7bYQ3WHehVqyzuMYxm5T58` |
| Upgrade authority | `7zezSd4D6QgATXSLnemHJ45PTc4qGtCNsCqfxLi3qefK` |

## Live app

| | |
|---|---|
| **Frontend** | https://fractachain.up.railway.app |
| Backend | https://backend-production-410a3.up.railway.app (`/health` → `onChain: true`) |

---

## Run it locally

```bash
# 1. Backend
cd backend
cp .env.example .env          # fill in: ADMIN_EMAILS, peppers, SOLANA_* keys
npm ci && npm run dev          # → http://localhost:8080/health

# 2. Frontend
cd frontend
cp .env.example .env.local     # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SOLANA_*
npm ci && npm run dev          # → http://localhost:3000
```

Program + tests:

```bash
anchor build --tools-version v1.57           # Windows needs the pinned tools version
cd programs/fractachain && cargo test --lib  # 8 pure-logic tests
```

Full devnet deploy guide (keys → airdrop → build → deploy → USDC mint → init → first offering): **[DEPLOY_DEVNET_PASO_A_PASO.md](DEPLOY_DEVNET_PASO_A_PASO.md)**. Stack/backend config: **[SETUP_SOLANA.md](SETUP_SOLANA.md)**. Railway: **[RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md)**.

## Repo layout

```
programs/fractachain/   Anchor program (offerings, escrow, KYC, OPA, market auth)
backend/                Express API — auth, KYC, listings, Solana tx building, Manifest, Postgres
frontend/               Next.js 14 — landing, /mercado, /orderbook, /dashboard, /admin, i18n en/es
scripts/devnet/         Keys, build, deploy, USDC mint, platform init (numbered 01–05)
deployments/            Public devnet IDs (no secrets)
contracts/              Original Soroban contracts — kept for reference only, not built
```

## Docs

- [HACKATHON.md](HACKATHON.md) — pitch + demo script
- [SETUP_SOLANA.md](SETUP_SOLANA.md) — full backend/frontend/env reference
- [DEPLOY_DEVNET_PASO_A_PASO.md](DEPLOY_DEVNET_PASO_A_PASO.md) — devnet deploy, step by step
- [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md) — Docker → Railway (backend + Postgres + frontend)
- [RUNBOOK_DEMO_P0.md](RUNBOOK_DEMO_P0.md) · [RUNBOOK_FINALIZE.md](RUNBOOK_FINALIZE.md) — demo runbooks
- [PLAN_IMPLEMENTACION.md](PLAN_IMPLEMENTACION.md) · [PLAN_LICITACION_MERCADO.md](PLAN_LICITACION_MERCADO.md) — internal plans (Spanish)

Built on Solana · devnet.
