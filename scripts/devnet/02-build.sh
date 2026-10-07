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

echo
echo "Program id: $(solana address -k target/deploy/fractachain-keypair.json 2>/dev/null || grep -o 'declare_id!("[^"]*")' programs/fractachain/src/lib.rs)"
echo "Verificar que deployments/devnet.json use el mismo ID antes de deployar."
