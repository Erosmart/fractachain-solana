#!/usr/bin/env bash
# Compila el programa Anchor a BPF — NO ejecutar hasta tener el toolchain
# instalado (ver DEPLOY_DEVNET_PASO_A_PASO.md paso 0).
#
# Windows nativo: platform-tools con build propio empiezan en v1.52; anchor a
# secas pide la de la release activa (3.0.0 → v1.51.1 → 404). Por eso fijamos
# v1.57, la que viene con Agave 4.3.0.
set -euo pipefail
cd "$(dirname "$0")/../.."

TOOLS_VERSION="${TOOLS_VERSION:-v1.57}"

anchor keys sync    # declare_id! + Anchor.toml ← pubkey real de target/deploy/fractachain-keypair.json
anchor build --tools-version "$TOOLS_VERSION"   # compila ya con el Program ID correcto

PROGRAM_ID=$(solana address -k target/deploy/fractachain-keypair.json 2>/dev/null || true)
if [[ -z "${PROGRAM_ID}" ]]; then
  PROGRAM_ID=$(grep -oP 'declare_id!\("\K[^"]+' programs/fractachain/src/lib.rs || true)
fi
echo
echo "Program id: ${PROGRAM_ID}"
# Stamp programId into deployments/devnet.json (keep deployedAt null until 03-deploy).
if [[ -n "${PROGRAM_ID}" && -f deployments/devnet.json ]]; then
  node - "$PROGRAM_ID" <<'NODE'
const fs = require('fs');
const file = 'deployments/devnet.json';
const dep = JSON.parse(fs.readFileSync(file, 'utf8'));
dep.programId = process.argv[2];
fs.writeFileSync(file, JSON.stringify(dep, null, 2));
console.log('deployments/devnet.json programId sync OK (deployedAt still null until 03-deploy)');
NODE
fi
echo "Siguiente: ./scripts/devnet/03-deploy.sh (no crear wallets aquí)."
