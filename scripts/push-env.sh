#!/usr/bin/env bash
# Sube las variables de .env al proyecto de Vercel (production, preview, development).
# Requisitos: `vercel login` (ya hecho) + `vercel link` (linkear este repo al proyecto).
# Uso:  bash scripts/push-env.sh
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.npm-global/bin:$PATH"

# OJO: NO incluimos DATABASE_URL* ni POSTGRES_* — los maneja la integración de Neon.
KEYS=(
  RESEND_API_KEY RESEND_FROM CRON_SECRET
  STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET PUBLIC_STRIPE_PUBLISHABLE_KEY
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
  APPLE_CLIENT_ID APPLE_TEAM_ID APPLE_KEY_ID APPLE_PRIVATE_KEY
  OPS_SECRET SITE
)

for k in "${KEYS[@]}"; do
  # valor desde .env: todo lo que sigue al primer '=', sin comillas envolventes
  val=$(grep -m1 "^$k=" .env | cut -d= -f2- | sed 's/^"//; s/"$//')
  if [ -z "$val" ]; then echo "·  $k  (vacía, omito)"; continue; fi
  for target in production preview; do
    vercel env rm "$k" "$target" -y >/dev/null 2>&1 || true
    printf '%s' "$val" | vercel env add "$k" "$target" --yes >/dev/null 2>&1 \
      && echo "✓  $k → $target" || echo "✗  $k → $target (falló)"
  done
done
echo "Listo. Haz un redeploy para que tomen efecto: vercel --prod"
