#!/bin/sh
set -e

echo "🚀 Starting Al-Falah Traders..."

# Create data directory if not exists
mkdir -p /data/db

# Push Prisma schema to create/update database
echo "📊 Setting up database..."
npx prisma db push --skip-generate 2>/dev/null || echo "⚠️ DB push warning (may already exist)"

echo "✅ Database ready!"
echo "🌐 Starting server on port ${PORT:-3000}..."

exec "$@"
