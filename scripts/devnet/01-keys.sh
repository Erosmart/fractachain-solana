#!/usr/bin/env bash
# Genera las keypairs que el backend y el deploy necesitan — NO ejecutar hasta
# tener todo configurado (ver SETUP_SOLANA.md). Las claves quedan en
# deploy-keys/ (gitignored). Nunca commitear.
set -euo pipefail
cd "$(dirname "$0")/../.."

mkdir -p deploy-keys
solana-keygen new --no-bip39-passphrase --outfile deploy-keys/admin.json --force
solana-keygen new --no-bip39-passphrase --outfile deploy-keys/usdc-mint-authority.json --force

echo "admin:  $(solana-keygen pubkey deploy-keys/admin.json)"
echo "usdc-mint-authority: $(solana-keygen pubkey deploy-keys/usdc-mint-authority.json)"
echo
echo "Convertir a base58 para el .env:"
echo "  SOLANA_ADMIN_SECRET_KEY=$(node -e "const k=require('./deploy-keys/admin.json');const b=require('bs58');console.log(b.encode(Uint8Array.from(k)))" 2>/dev/null || echo '<ver SETUP_SOLANA.md paso 3>')"
