#!/usr/bin/env bash
# scripts/bootstrap-dev.sh
#
# Clean-bootstrap the local dev environment with Tailscale TLS.
# Run this instead of `docker compose up` for a fresh start.
#
# What it does:
#   1. Auto-detects your Tailscale FQDN
#   2. Generates (or renews) the Tailscale TLS cert into certs/
#   3. Updates ZITADEL_DOMAIN and CORS_ALLOWED_ORIGINS in .env
#   4. Clears stale ZITADEL credential files from .zitadel-data/
#   5. Runs `docker compose down -v` (wipes volumes for a clean slate)
#   6. Runs `docker compose up -d`
#
# Usage:
#   ./scripts/bootstrap-dev.sh              # full clean bootstrap
#   ./scripts/bootstrap-dev.sh --no-wipe   # skip down -v (keep volumes)

set -euo pipefail
cd "$(dirname "$0")/.."

WIPE=true
for arg in "$@"; do
  [[ "$arg" == "--no-wipe" ]] && WIPE=false
done

# ---------------------------------------------------------------------------
# 1. Detect Tailscale FQDN
# ---------------------------------------------------------------------------
if ! command -v tailscale &>/dev/null; then
  echo "ERROR: tailscale CLI not found. Install Tailscale and ensure it is running." >&2
  exit 1
fi

FQDN=$(tailscale status --json | uv run python -c \
  "import sys, json; d=json.load(sys.stdin); print(d['Self']['DNSName'].rstrip('.'))")

if [[ -z "$FQDN" ]]; then
  echo "ERROR: Could not detect Tailscale FQDN. Is Tailscale connected?" >&2
  exit 1
fi
echo "==> Tailscale FQDN: $FQDN"

# ---------------------------------------------------------------------------
# 2. Generate / renew Tailscale TLS cert
# ---------------------------------------------------------------------------
mkdir -p certs
echo "==> Generating Tailscale cert for $FQDN..."
sudo tailscale cert \
  --cert-file "certs/${FQDN}.crt" \
  --key-file  "certs/${FQDN}.key" \
  "$FQDN"
echo "    Cert written to certs/${FQDN}.crt"

# ---------------------------------------------------------------------------
# 3. Update .env with the detected FQDN (idempotent sed-in-place)
# ---------------------------------------------------------------------------
echo "==> Updating .env..."

WEB_PORT=$(grep -E '^WEB_HOST_PORT=' .env | cut -d= -f2 || echo "37822")

# Replace ZITADEL_DOMAIN line (or append if missing)
if grep -qE '^ZITADEL_DOMAIN=' .env; then
  sed -i "s|^ZITADEL_DOMAIN=.*|ZITADEL_DOMAIN=${FQDN}|" .env
else
  echo "ZITADEL_DOMAIN=${FQDN}" >> .env
fi

# Replace CORS_ALLOWED_ORIGINS (allow Tailscale HTTPS + localhost fallback)
CORS_VALUE="'[\"https://${FQDN}:${WEB_PORT}\",\"http://localhost:${WEB_PORT}\"]'"
if grep -qE '^CORS_ALLOWED_ORIGINS=' .env; then
  sed -i "s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=${CORS_VALUE}|" .env
else
  echo "CORS_ALLOWED_ORIGINS=${CORS_VALUE}" >> .env
fi

echo "    ZITADEL_DOMAIN=${FQDN}"
echo "    CORS_ALLOWED_ORIGINS=${CORS_VALUE}"

# ---------------------------------------------------------------------------
# 4. Validate ZITADEL SMTP config so auth mail does not silently boot broken
# ---------------------------------------------------------------------------
echo "==> Validating ZITADEL SMTP config..."
required_smtp_vars=(
  ZITADEL_SMTP_HOST
  ZITADEL_SMTP_USER
  ZITADEL_SMTP_PASSWORD
  ZITADEL_SMTP_FROM
  ZITADEL_SMTP_REPLY_TO
)

missing_smtp_vars=()
for var_name in "${required_smtp_vars[@]}"; do
  if ! grep -qE "^${var_name}=.+" .env; then
    missing_smtp_vars+=("${var_name}")
  fi
done

if (( ${#missing_smtp_vars[@]} > 0 )); then
  echo "ERROR: Missing required ZITADEL SMTP settings in .env:" >&2
  printf '  - %s\n' "${missing_smtp_vars[@]}" >&2
  echo "Refusing to start because ZITADEL auth mail will fail without SMTP config." >&2
  exit 1
fi

echo "    ZITADEL SMTP config present"

# ---------------------------------------------------------------------------
# 5. Clear stale ZITADEL credential files (both the shared volume path and the
#    project-root copy written by bootstrap-zitadel.py's OUTPUT_PATH)
# ---------------------------------------------------------------------------
echo "==> Clearing stale ZITADEL data..."
rm -f .zitadel-data/env.zitadel .zitadel-data/pat.txt .env.zitadel

# ---------------------------------------------------------------------------
# 6. Wipe volumes (unless --no-wipe)
# ---------------------------------------------------------------------------
if [[ "$WIPE" == "true" ]]; then
  echo "==> Running docker compose down -v..."
  docker compose down -v
else
  echo "==> Skipping volume wipe (--no-wipe)"
fi

# ---------------------------------------------------------------------------
# 7. Bring up all services
# ---------------------------------------------------------------------------
echo "==> Starting services..."
docker compose up -d

# ---------------------------------------------------------------------------
# 8. Wait for API readiness, then seed
# ---------------------------------------------------------------------------
API_PORT=$(grep -E '^API_HOST_PORT=' .env | cut -d= -f2 || echo "37821")
HEALTH_URL="http://localhost:${API_PORT}/health/ready"
MAX_ATTEMPTS=60
ATTEMPT=0

echo "==> Waiting for API to be ready (polling ${HEALTH_URL})..."
until curl -sf "${HEALTH_URL}" >/dev/null 2>&1; do
  ATTEMPT=$((ATTEMPT + 1))
  if [[ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]]; then
    echo "ERROR: API did not become ready after ${MAX_ATTEMPTS} attempts." >&2
    echo "       Check logs with: docker compose logs api --tail=50" >&2
    exit 1
  fi
  printf "    Attempt %d/%d — not ready yet, retrying in 3s...\n" "$ATTEMPT" "$MAX_ATTEMPTS"
  sleep 3
done
echo "    API is ready!"

echo "==> Loading seed data..."
docker compose exec api bash -c "PYTHONPATH=/home/app python /home/app/scripts/seed.py"

# ---------------------------------------------------------------------------
# 9. Summary
# ---------------------------------------------------------------------------
ADMIN_PASSWORD=$(grep -E '^ZITADEL_ADMIN_PASSWORD=' .env | cut -d= -f2 || echo "Admin1234!")
ZITADEL_PORT=$(grep -E '^ZITADEL_EXTERNAL_PORT=' .env | cut -d= -f2 || echo "37823")

echo ""
echo "============================================================"
echo "Bootstrap complete!"
echo ""
echo "  Frontend: https://${FQDN}:${WEB_PORT}"
echo "  ZITADEL:  http://${FQDN}:${ZITADEL_PORT}"
echo "  API:      http://localhost:${API_PORT}"
echo ""
echo "  Admin login:"
echo "    Username: admin@localhost"
echo "    Password: ${ADMIN_PASSWORD}"
echo "============================================================"
