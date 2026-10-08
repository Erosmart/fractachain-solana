#!/usr/bin/env bash
# Deploy a devnet — SOLO cuando todo lo anterior esté listo
# (SETUP_SOLANA.md pasos 1-5). Actualiza deployments/devnet.json.
set -euo pipefail
cd "$(dirname "$0")/../.."

# --no-idl: Anchor 1.2 sube el IDL vía un programa de metadata que no está en
# devnet ("program not found"). El backend arma las instrucciones a mano y no
# lo necesita. Re-correr este script sobre un programa ya deployado lo upgradea.
anchor program deploy --provider.cluster devnet --provider.wallet deploy-keys/admin.json \
  --upgrade-authority deploy-keys/admin.json --no-idl

PROGRAM_ID=$(solana address -k target/deploy/fractachain-keypair.json)
echo "programId: $PROGRAM_ID"

node - "$PROGRAM_ID" <<'NODE'
const fs = require('fs');
const file = 'deployments/devnet.json';
const dep = JSON.parse(fs.readFileSync(file, 'utf8'));
dep.programId = process.argv[2];
dep.deployedAt = new Date().toISOString();
dep.deployer = 'deploy-keys/admin.json';
fs.writeFileSync(file, JSON.stringify(dep, null, 2));
console.log('deployments/devnet.json actualizado');
NODE
