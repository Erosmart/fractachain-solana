#!/usr/bin/env bash
# Deploy a devnet — SOLO cuando todo lo anterior esté listo
# (SETUP_SOLANA.md pasos 1-5). Actualiza deployments/devnet.json.
set -euo pipefail
cd "$(dirname "$0")/../.."

anchor deploy --provider.cluster devnet --provider.wallet deploy-keys/admin.json

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
