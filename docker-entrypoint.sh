#!/bin/sh
set -e

echo "=========================================="
echo "🚀 Memulai Kantor AI Backend di Railway..."
echo "=========================================="

# 1. Jalankan migrasi Prisma jika DATABASE_URL tersedia
if [ -n "$DATABASE_URL" ]; then
  echo "==> Memeriksa & menjalankan migrasi database Prisma..."
  MAX_RETRIES=5
  RETRY_COUNT=0
  MIGRATION_SUCCESS=0

  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if npx prisma migrate deploy --config prisma7.config.ts; then
      echo "✅ Migrasi Prisma berhasil diterapkan."
      MIGRATION_SUCCESS=1
      break
    else
      RETRY_COUNT=$((RETRY_COUNT + 1))
      echo "⚠️ Database belum siap. Mencoba lagi dalam 3 detik ($RETRY_COUNT/$MAX_RETRIES)..."
      sleep 3
    fi
  done

  if [ $MIGRATION_SUCCESS -eq 0 ]; then
    echo "⚠️ PERINGATAN: Migrasi database gagal setelah $MAX_RETRIES percobaan. Melanjutkan startup..."
  fi
else
  echo "⚠️ PERINGATAN: DATABASE_URL tidak ditemukan. Melewati migrasi Prisma."
fi

# 2. Jalankan aplikasi NestJS production
echo "==> Menjalankan aplikasi NestJS di port ${PORT:-3000}..."
exec node dist/main.js
