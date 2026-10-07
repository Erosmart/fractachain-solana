#!/usr/bin/env bash
# Genera las keypairs que el backend y el deploy necesitan — NO ejecutar hasta
# tener todo configurado (ver SETUP_SOLANA.md). Las claves quedan en
# deploy-keys/ (gitignored). Nunca commitear.
set -euo pipefail
cd "$(dirname "$0")/../.."

mkdir -p deploy-keys
for k in admin usdc-mint-authority; do
  if [ -f "deploy-keys/$k.json" ]; then
    echo "deploy-keys/$k.json ya existe — no se pisa (borralo a mano si querés regenerarla)"
  else
    solana-keygen new --no-bip39-passphrase --silent --outfile "deploy-keys/$k.json"
  fi
done

echo
echo "admin (deployer, paga fees, admin del programa): $(solana-keygen pubkey deploy-keys/admin.json)"
echo "usdc-mint-authority:                             $(solana-keygen pubkey deploy-keys/usdc-mint-authority.json)"
echo
echo "Para Railway (backend → Variables). Tratalas como contraseñas:"
b58() { node -e "const b=require('./backend/node_modules/bs58').default;console.log(b.encode(Uint8Array.from(require('./deploy-keys/$1.json'))))"; }
echo "  SOLANA_ADMIN_SECRET_KEY=$(b58 admin)"
echo "  SOLANA_USDC_MINT_AUTHORITY=$(b58 usdc-mint-authority)"
