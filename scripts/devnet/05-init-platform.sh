#!/usr/bin/env bash
# Inicializa el Platform PDA (admin + fee + horario KYC) llamando al endpoint
# admin del backend — el equivalente al "configure-issuer" de la era Stellar.
# Requiere backend corriendo con SOLANA_ADMIN_SECRET_KEY configurada.
set -euo pipefail

API="${API_URL:-http://localhost:8080}"
TOKEN="${ADMIN_TOKEN:?Falta ADMIN_TOKEN (sesión admin del backend)}"

curl -s -X POST "$API/api/admin/testnet/configure-issuer" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"feeBps": 25, "enforceKycHours": false}'
echo
