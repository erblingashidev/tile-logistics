#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="${TURSO_DB_NAME:-tile-logistics-prod}"
SCHEMA_FILE="${ROOT}/scripts/turso-schema.sql"
WIPE_FILE="${ROOT}/scripts/wipe-operational.sql"

if ! command -v turso >/dev/null 2>&1; then
  echo "Turso CLI not found."
  echo "Install with: brew install tursodatabase/tap/turso"
  echo "Then: turso auth login"
  exit 1
fi

print_env_hints() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Turso credentials (for Netlify — NOT for local npm run dev)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "1) Database URL (copy into Netlify → TURSO_DATABASE_URL):"
  echo ""
  turso db show "${DB_NAME}" --url | sed 's/^/   /'
  echo ""
  echo "2) Create a new token (copy into Netlify → TURSO_AUTH_TOKEN):"
  echo ""
  echo "   turso db tokens create ${DB_NAME}"
  echo ""
  echo "   Keep TURSO_* in .env.local only if you use npm run dev:turso."
  echo "   Local testing uses USE_LOCAL_DATABASE=true → data/tile-logistics.db"
  echo ""
  echo "   Do NOT set USE_LOCAL_DATABASE on Netlify."
  echo ""
}

case "${1:-}" in
  --info)
    echo "Database: ${DB_NAME}"
    turso db show "${DB_NAME}" 2>/dev/null || {
      echo "Database not found. Create with: ./scripts/setup-turso.sh --fresh"
      exit 1
    }
    print_env_hints
    exit 0
    ;;
  --wipe)
    echo "Wiping all rows in ${DB_NAME} (schema unchanged)…"
    turso db shell "${DB_NAME}" < "${WIPE_FILE}"
    echo "Done — Turso database is empty."
    exit 0
    ;;
  --fresh)
    echo "Recreating ${DB_NAME} from scratch…"
    turso db destroy "${DB_NAME}" --yes 2>/dev/null || true
    turso db create "${DB_NAME}"
    turso db shell "${DB_NAME}" < "${SCHEMA_FILE}"
    echo "Fresh empty database created."
    print_env_hints
    exit 0
    ;;
esac

echo "Using database name: ${DB_NAME}"

if ! turso db show "${DB_NAME}" >/dev/null 2>&1; then
  echo "Creating database ${DB_NAME}…"
  turso db create "${DB_NAME}"
else
  echo "Database ${DB_NAME} already exists."
fi

echo "Applying schema from ${SCHEMA_FILE}…"
turso db shell "${DB_NAME}" < "${SCHEMA_FILE}"

echo ""
echo "Database ready (empty tables)."
print_env_hints
echo "Commands:"
echo "  ./scripts/setup-turso.sh --info   show URL + how to create token"
echo "  ./scripts/setup-turso.sh --wipe   empty all rows"
echo "  ./scripts/setup-turso.sh --fresh  destroy + recreate database"
