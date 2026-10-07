#!/usr/bin/env bash
# Crea el mint USDC de devnet (mock — NO es el USDC de Circle) con la mint
# authority de deploy-keys/. Registra el mint en deployments/devnet.json.
# Requiere: spl-token CLI + keypair fondeada (solana airdrop 2).
set -euo pipefail
cd "$(dirname "$0")/../.."

MINT=$(spl-token create-token --decimals 6 \
  --fee-payer deploy-keys/admin.json \
  --mint-authority deploy-keys/usdc-mint-authority.json \
  --output json-compact | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).mint))")

echo "USDC devnet mint: $MINT"

node - "$MINT" <<'NODE'
const fs = require('fs');
const file = 'deployments/devnet.json';
const dep = JSON.parse(fs.readFileSync(file, 'utf8'));
dep.usdcMint = process.argv[2];
fs.writeFileSync(file, JSON.stringify(dep, null, 2));
console.log('deployments/devnet.json → usdcMint registrado');
NODE

echo "Poner el mismo valor en backend/.env → SOLANA_USDC_MINT"
