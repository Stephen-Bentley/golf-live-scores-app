#!/bin/sh
set -e

echo "Fairway Live — preparing database..."

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

i=0
until npx prisma db push --accept-data-loss 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "ERROR: could not update database schema after 30 attempts"
    exit 1
  fi
  echo "Database not ready (attempt $i/30) — retrying in 2s..."
  sleep 2
done

echo "Database schema is ready."
echo "Starting Fairway Live on port ${PORT:-3000}..."

exec "$@"
