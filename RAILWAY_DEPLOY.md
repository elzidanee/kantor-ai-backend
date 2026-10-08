# 🚀 Panduan Deploy Kantor AI Backend ke Railway

Panduan lengkap untuk men-deploy backend **Kantor AI** ke [Railway.app](https://railway.app/) menggunakan Dockerfile, PostgreSQL, Redis, dan integrasi AI LLM Router.

---

## 📋 Fitur & Kesiapan Container
- **Multi-stage & Linux Ready**: Menggunakan `node:22-slim` dengan `openssl` dan `ca-certificates` untuk Prisma engine.
- **Otomatis Migrasi Database**: Script `docker-entrypoint.sh` otomatis menjalankan `prisma migrate deploy` setiap kali container dinyalakan (dengan retry 5x jika database PostgreSQL sedang booting).
- **Railway Redis Support**: Otomatis mendeteksi `REDIS_URL`, `REDIS_PRIVATE_URL`, maupun variabel `REDISHOST`/`REDISPORT`/`REDISPASSWORD`.
- **Healthcheck Ready**: Konfigurasi `railway.json` mengarah ke endpoint `/health` untuk zero-downtime deployment.
- **0.0.0.0 Binding**: Server mendengarkan `0.0.0.0:$PORT` sesuai standar Railway networking.

---

## 🛠️ Langkah-Langkah Deploy ke Railway

### 1. Push Kode ke GitHub
Pastikan seluruh file (`Dockerfile`, `docker-entrypoint.sh`, `railway.json`, `.dockerignore`) sudah di-commit dan di-push ke repository GitHub:
```bash
git add .
git commit -m "feat: setup docker and railway deployment"
git push origin main
```

---

### 2. Buat Project Baru di Railway
1. Buka [Railway Dashboard](https://railway.com/dashboard).
2. Klik tombol **"New Project"**.
3. Pilih **"Deploy from GitHub repo"**.
4. Pilih repository `kantor-ai-backend`.
5. Railway akan mendeteksi [railway.json](file:///d:/KANTOR%20AI%20ZIDANE/kantor-ai-backend/railway.json) dan menggunakan `Dockerfile` sebagai builder.

---

### 3. Tambahkan Database PostgreSQL & Redis di Railway
Di dalam kanvas/canvas project Railway Anda:
1. Klik **"+ Create"** atau **"New"** -> Pilih **"Database"** -> **"Add PostgreSQL"**.
2. Klik **"+ Create"** atau **"New"** -> Pilih **"Database"** -> **"Add Redis"**.

---

### 4. Hubungkan Environment Variables ke Backend Service
Klik pada service backend Anda di Railway, masuk ke tab **"Variables"**, lalu tambahkan / sambungkan variabel berikut:

#### A. Database (PostgreSQL)
Jika Anda menggunakan fitur Reference Variable di Railway:
- `DATABASE_URL`: `${{Postgres.DATABASE_URL}}` *(atau Railway otomatis mengisi variabel ini jika di-link)*

#### B. Cache & Queue (Redis)
- `REDIS_URL`: `${{Redis.REDIS_URL}}` *(atau `${{Redis.REDIS_PRIVATE_URL}}`)*

#### C. LLM AI Router (OpenRouter / Model Eksternal)
- `ROUTER_BASE_URL`: `https://openrouter.ai/api/v1` *(atau provider AI Anda)*
- `ROUTER_API_KEY`: *(Masukkan API Key OpenRouter/OpenAI Anda)*
- `ROUTER_MODEL`: `google/gemini-2.5-flash` *(atau model pilihan Anda)*

#### D. Port & Environment
- `NODE_ENV`: `production`
*(Variabel `PORT` diatur otomatis oleh Railway)*

---

### 5. Generate Domain Publik
1. Klik service backend Anda di Railway.
2. Masuk ke tab **"Settings"**.
3. Pada bagian **"Networking"** -> **"Public Networking"**, klik **"Generate Domain"** (misal: `kantor-ai-backend-production.up.railway.app`).
4. Uji endpoint:
   - `https://your-railway-domain.up.railway.app/health`
   - Response sukses:
     ```json
     {
       "status": "ok",
       "info": {
         "database": { "status": "up" },
         "redis": { "status": "up" },
         "router": { "status": "up", "model": "google/gemini-2.5-flash" }
       }
     }
     ```

---

### 6. Hubungkan Frontend ke Backend Railway
Pada project frontend Anda (`kantor-ai-frontend`), perbarui variabel `NEXT_PUBLIC_API_URL` atau `VITE_API_URL`:
```env
NEXT_PUBLIC_API_URL=https://your-railway-domain.up.railway.app
```

---

## 🔍 Troubleshooting
1. **Health Check Timeout**:
   - Jika PostgreSQL atau Redis butuh waktu saat pertama kali deploy, `healthcheckTimeout` di `railway.json` sudah diset ke `300` detik dan `docker-entrypoint.sh` akan melakukan retry hingga 5x.
2. **Prisma Client Missing**:
   - Dockerfile sudah menyertakan `RUN npx prisma generate --config prisma7.config.ts` sebelum `npm run build`, sehingga client selalu ter-generate.
3. **Database SSL Warning**:
   - Prisma 7 di Linux container sudah dipasangi pustaka `openssl` dan `ca-certificates` sehingga koneksi SSL ke managed PostgreSQL Railway berjalan lancar.
