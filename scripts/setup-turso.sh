#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${TURSO_DB_NAME:-tile-logistics-prod}"
SCHEMA_FILE="$(cd "$(dirname "$0")/.." && pwd)/scripts/turso-schema.sql"

if ! command -v turso >/dev/null 2>&1; then
  echo "Turso CLI not found."
  echo "Install with: brew install tursodatabase/tap/turso"
  exit 1
fi

echo "Using database name: ${DB_NAME}"

if ! turso db show "${DB_NAME}" >/dev/null 2>&1; then
  echo "Creating database ${DB_NAME}..."
  turso db create "${DB_NAME}"
else
  echo "Database ${DB_NAME} already exists."
fi

echo "Applying schema from ${SCHEMA_FILE}..."
turso db shell "${DB_NAME}" < "${SCHEMA_FILE}"

echo ""
echo "Database ready."
echo ""
echo "Set these environment variables in production (e.g. Netlify):"
echo ""
turso db show "${DB_NAME}" --url
echo ""
echo "TURSO_AUTH_TOKEN=<create with: turso db tokens create ${DB_NAME}>"
echo ""
echo "Reminder: create an auth token if you have not already:"
echo "  turso db tokens create ${DB_NAME}"
