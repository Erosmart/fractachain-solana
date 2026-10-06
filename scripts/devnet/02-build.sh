#!/usr/bin/env bash
# Compila el programa Anchor a BPF — NO ejecutar hasta tener el toolchain
# instalado (ver SETUP_SOLANA.md paso 1).
set -euo pipefail
cd "$(dirname "$0")/../.."

anchor build
echo
echo "Program id en declare_id!: $(grep -o 'declare_id!("[^"]*")' programs/fractachain/src/lib.rs)"
echo "Actualizar Anchor.toml + declare_id! con la pubkey real ANTES de deployar."
