FROM node:22-slim

WORKDIR /app

# Install openssl & ca-certificates (wajib untuk Prisma engine di Linux)
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package manifests & install dependensi
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy source code & konfigurasi
COPY . .

# Pastikan script startup executable & format LF
RUN chmod +x docker-entrypoint.sh

# Dummy DATABASE_URL untuk generate Prisma Client saat build image
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate --config prisma7.config.ts && npm run build

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
