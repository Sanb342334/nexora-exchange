#!/bin/sh
set -e
cd "$(dirname "$0")/.." || exit 1

if [ -z "$DATABASE_URL" ]; then
  echo ""
  echo "============================================================"
  echo "FATAL: DATABASE_URL is not set on this Railway service."
  echo ""
  echo "Fix in Railway UI:"
  echo "  1) Open service: nexora-exchange (NOT Postgres)"
  echo "  2) Variables → + New Variable → Add Variable Reference"
  echo "  3) Pick your Postgres service → DATABASE_URL"
  echo "  4) Redeploy"
  echo "============================================================"
  echo ""
  exit 1
fi

echo "Running prisma migrate deploy..."
npx prisma migrate deploy
echo "Starting API..."
exec node dist/main.js
