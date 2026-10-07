#!/usr/bin/env bash
# Inicializa el Platform PDA (admin + fee + horario KYC) llamando al endpoint
# admin del backend — el equivalente al "configure-issuer" de la era Stellar.
# Requiere backend corriendo con SOLANA_ADMIN_SECRET_KEY y SOLANA_USDC_MINT
# (sin mint, open_offering falla con PaymentMintNotAllowed).
# Re-ejecutable: si el PDA ya existe, aplica set_payment_mint cuando hay USDC.
set -euo pipefail

API="${API_URL:-http://localhost:8080}"
TOKEN="${ADMIN_TOKEN:?Falta ADMIN_TOKEN (sesión admin del backend)}"

echo "configure-issuer (init + optional USDC allowlist)…"
curl -s -X POST "$API/api/admin/testnet/configure-issuer" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"feeBps": 25, "enforceKycHours": false}'
echo

echo "set-payment-mint (idempotent allowlist of SOLANA_USDC_MINT)…"
curl -s -X POST "$API/api/admin/testnet/set-payment-mint" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kind":"USDC"}'
echo
