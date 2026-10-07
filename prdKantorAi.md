# PRD: Kantor AI

| | |
|---|---|
| Versi | 0.1 (draf awal) |
| Tanggal | 7 Oktober 2026 |
| Pemilik produk | Owner tunggal |
| Status | Draf untuk direview |

---

## 1. Ringkasan

Kantor AI adalah aplikasi web yang mensimulasikan kantor virtual berisi beberapa AI agent. Setiap agent punya nama, jobdesk, dan karakter visual sendiri, lalu bekerja mengerjakan tugas nyata (kode, konten, marketing, dukungan pelanggan, dan lainnya) sesuai jam kerja yang diatur owner.

Kantor memiliki ruangan seperti kantor sungguhan: ruang kerja, mushola, toilet, dan lapangan. Posisi dan aktivitas karakter di denah mencerminkan status agent yang sesungguhnya, bukan animasi tempelan. Semua panggilan ke model AI dilakukan lewat **9Router** (gateway AI yang kompatibel dengan format OpenAI), dengan backend **NestJS** dan database **PostgreSQL**.

## 2. Latar belakang dan tujuan

### Masalah
- Mengelola banyak AI agent lewat terminal atau chat biasa sulit dipantau: siapa mengerjakan apa, sudah sampai mana, dan berapa biaya yang terpakai.
- Agent yang jalan terus tanpa jadwal memboroskan kuota dan sulit dikendalikan.

### Tujuan
1. Memberi owner "kantor" yang bisa dilihat dan dikelola secara visual.
2. Membuat agent bekerja dalam ritme yang bisa diatur (jam masuk, pulang, sholat, istirahat).
3. Mengotomatiskan alur kerja lintas peran (project manager, developer, QA, marketing, konten, support).
4. Menjaga biaya dan kuota tetap terkendali.

### Bukan tujuan (versi 1)
- Multi-pengguna atau multi-tenant.
- Marketplace agent atau berbagi kantor dengan orang lain.
- Agent yang menjalankan kode atau mengakses sistem eksternal tanpa persetujuan owner.

## 3. Pengguna

**Owner** (satu orang): membuat dan mengatur kantor, memberi target, memantau hasil. Terbiasa dengan teknologi dasar, menggunakan bahasa Indonesia, zona waktu WIB (Asia/Jakarta).

## 4. Istilah

| Istilah | Arti |
|---|---|
| Agent | Karyawan AI dengan nama, jobdesk, dan system prompt sendiri |
| Jobdesk | Deskripsi peran dan batas tanggung jawab agent |
| Tugas (task) | Satu unit pekerjaan yang diberikan ke satu agent |
| Target (goal) | Permintaan besar dari owner yang dipecah project manager menjadi tugas |
| Jam kerja | Jendela waktu agent boleh bekerja |
| Jeda | Blok waktu agent berhenti (sholat, makan siang, istirahat) |
| Run | Satu panggilan ke model AI untuk sebuah tugas |
| 9Router | Gateway AI yang dijalankan sendiri, menerima format OpenAI dan meneruskannya ke berbagai penyedia model |

## 5. Ruang lingkup fitur

Prioritas memakai MoSCoW: **M** wajib, **S** sebaiknya ada, **C** bisa ditunda, **W** tidak di versi ini.

### 5.1 Manajemen agent

| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-A1 | Owner dapat membuat, mengubah, menonaktifkan, dan menghapus agent | M |
| FR-A2 | Setiap agent punya nama, peran, jobdesk (teks bebas), warna/karakter, dan meja | M |
| FR-A3 | Owner dapat memilih model per agent (nama model atau combo dari 9Router) | M |
| FR-A4 | Template peran siap pakai: Project Manager, Frontend, Backend, QA, Digital Marketing, Content Writer, Customer Support, UI/UX, DevOps | S |
| FR-A5 | Pengaturan perilaku per agent: suhu (temperature), batas token per tugas, bahasa jawaban | S |
| FR-A6 | Duplikasi agent dari agent yang ada | C |

### 5.2 Jam kerja dan jadwal

| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-S1 | Owner mengatur jam masuk dan jam pulang | M |
| FR-S2 | Owner mengatur hari kerja (misalnya Senin sampai Jumat) | M |
| FR-S3 | Owner membuat, mengubah, dan menghapus blok jeda dengan nama, jam mulai, jam selesai, dan jenis (sholat, makan, istirahat, lainnya) | M |
| FR-S4 | Zona waktu bisa diatur, default Asia/Jakarta | M |
| FR-S5 | Jadwal bisa berbeda per agent (override), misalnya customer support bekerja lebih lama | S |
| FR-S6 | Hari libur dan cuti: tanggal tertentu agent tidak bekerja | S |
| FR-S7 | Isi jadwal sholat otomatis berdasarkan kota (sumber data eksternal) | C |
| FR-S8 | Tombol "kantor tutup sekarang" dan "lembur" untuk mengubah jadwal sementara | S |

Aturan perilaku jadwal:
- Saat jeda atau di luar jam kerja, **tidak ada panggilan baru** ke model.
- Panggilan yang sedang berjalan boleh selesai, lalu agent berhenti. Tugas berikutnya menunggu sampai jam kerja kembali.
- Tugas yang menunggu tidak hilang. Ia tetap di antrian dan dilanjutkan di jendela kerja berikutnya.

### 5.3 Tugas dan alur kerja

| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-T1 | Owner memberi target dalam bentuk teks ke project manager | M |
| FR-T2 | Project manager memecah target menjadi tugas dengan penerima (peran) dan urutan/ketergantungan | M |
| FR-T3 | Owner juga dapat membuat tugas langsung untuk agent tertentu | M |
| FR-T4 | Setiap tugas punya status: `PENDING`, `QUEUED`, `RUNNING`, `REVIEW`, `DONE`, `FAILED`, `BLOCKED` | M |
| FR-T5 | Hasil kerja agent disimpan dan bisa dilihat, disalin, serta diunduh | M |
| FR-T6 | Hasil tugas developer dapat diuji oleh QA, dan kalau gagal dikembalikan dengan catatan (maksimal 2 putaran revisi, lalu eskalasi ke owner) | S |
| FR-T7 | Owner dapat menyetujui, menolak, atau meminta revisi pada hasil | M |
| FR-T8 | Prioritas tugas (rendah, normal, tinggi) memengaruhi urutan antrian | S |
| FR-T9 | Tugas berulang (misalnya laporan harian jam 17:00) | S |
| FR-T10 | Komunikasi antar agent tercatat sebagai pesan yang bisa dibaca owner | S |

### 5.4 Tampilan kantor (visual)

| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-V1 | Denah kantor dengan ruangan: ruang kerja, mushola, toilet, lapangan | M |
| FR-V2 | Setiap agent tampil sebagai karakter robot dengan warna dan kode peran | M |
| FR-V3 | Posisi karakter mengikuti status nyata agent dari backend, diperbarui realtime | M |
| FR-V4 | Animasi: berjalan antar ruangan, mengetik di meja, sholat di mushola, tidur saat kantor tutup | M |
| FR-V5 | Klik karakter membuka panel detail: nama, jobdesk, tugas aktif, riwayat, biaya | M |
| FR-V6 | Indikator di atas karakter saat sedang memanggil model (misalnya gelembung "berpikir") | S |
| FR-V7 | Ruangan tambahan yang bisa diatur: kantin, ruang rapat | C |
| FR-V8 | Mode terang dan gelap | S |
| FR-V9 | Tampilan responsif untuk ponsel | M |
| FR-V10 | Dekorasi dan tema kantor (lampu, tanaman, jam dinding sesuai jam kantor) | C |

### 5.5 Monitoring dan biaya

| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-M1 | Log aktivitas: siapa melakukan apa dan kapan | M |
| FR-M2 | Pencatatan token masuk dan keluar, durasi, dan model untuk setiap run | M |
| FR-M3 | Batas harian: maksimal run atau token per hari, dengan penghentian otomatis saat tercapai | M |
| FR-M4 | Dashboard ringkas: tugas selesai hari ini, run gagal, token terpakai | S |
| FR-M5 | Notifikasi ke owner saat ada tugas gagal atau butuh persetujuan | C |

### 5.6 Pengaturan sistem

| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-X1 | Login owner (email dan kata sandi) | M |
| FR-X2 | Pengaturan koneksi 9Router: base URL, API key (tersimpan terenkripsi), model default | M |
| FR-X3 | Tombol uji koneksi ke 9Router | M |
| FR-X4 | Ekspor dan impor konfigurasi kantor (JSON) | C |

## 6. Alur pengguna utama

### 6.1 Menyiapkan kantor
1. Owner login lalu mengisi koneksi 9Router (base URL dan API key) dan menekan uji koneksi.
2. Owner mengatur jam kerja dan jeda.
3. Owner membuat agent dari template, mengubah nama dan jobdesk.
4. Denah kantor menampilkan agent di meja masing-masing.

### 6.2 Memberi target
1. Owner menulis target, misalnya "Buat landing page produk X dan rencana promosinya".
2. Project manager memecahnya menjadi tugas: desain halaman, frontend, backend form, QA, copy, kampanye.
3. Tugas masuk antrian dan dikerjakan saat jam kerja.
4. Owner memantau di denah dan membuka hasil di panel tugas.
5. Owner menyetujui atau meminta revisi.

### 6.3 Hari kerja
1. 08:00 apel pagi, project manager membagi tugas.
2. Agent bekerja di meja. Sesekali ada yang ke toilet.
3. 12:00 sholat Dzuhur di mushola, lanjut istirahat makan siang di lapangan.
4. 15:15 sholat Ashar dan rehat.
5. 17:00 laporan harian ke project manager, 17:30 kantor tutup dan agent masuk mode tidur.

## 7. Kebutuhan non-fungsional

| Aspek | Target |
|---|---|
| Kinerja | Pembaruan status ke tampilan kurang dari 1 detik setelah perubahan terjadi |
| Keandalan | Tugas tidak boleh hilang saat backend restart (antrian persisten) |
| Keamanan | API key tidak pernah dikirim ke browser; data sensitif terenkripsi di database |
| Skalabilitas | Dirancang untuk 1 sampai 20 agent dan 1 owner |
| Kontrol biaya | Ada batas harian dan batas konkurensi yang bisa diatur |
| Ketahanan | Kegagalan 9Router atau penyedia model tidak membuat aplikasi mati; tugas diulang atau ditandai gagal |
| Aksesibilitas | Kontras cukup, navigasi keyboard, dan animasi bisa dimatikan (prefers-reduced-motion) |
| Bahasa | Antarmuka berbahasa Indonesia |

## 8. Arsitektur dan teknologi

```
Browser (React)  <--REST + SSE-->  Backend NestJS  --->  9Router  --->  Penyedia model
                                      |      |
                                 PostgreSQL  Redis (antrian BullMQ)
```

### 8.1 Keputusan teknologi

| Komponen | Pilihan | Alasan |
|---|---|---|
| Backend | **NestJS** (TypeScript) | Struktur modular, dependency injection, dukungan resmi untuk queue, scheduler, dan SSE |
| Database | **PostgreSQL** | Relasional, kuat untuk tugas, ketergantungan, dan log; mendukung JSONB untuk konfigurasi fleksibel; bisa ditambah pgvector untuk memori jangka panjang di fase lanjut |
| ORM | **Prisma** | Skema jelas, migrasi mudah, tipe otomatis. TypeORM juga memungkinkan jika lebih dikenal |
| Antrian | **BullMQ + Redis** (`@nestjs/bullmq`) | Antrian persisten, retry, delay, prioritas, dan batas konkurensi |
| Penjadwal | `@nestjs/schedule` | Cron untuk pengecekan jam kerja tiap menit dan tugas berulang |
| Realtime | **SSE** (`@Sse` di NestJS) | Cukup untuk aliran satu arah server ke browser, lebih sederhana dari WebSocket |
| Frontend | **React + Vite + TypeScript** | Cepat dikembangkan dan cocok untuk antarmuka interaktif |
| Visual denah | SVG dan CSS pada versi awal; PixiJS atau Phaser jika butuh animasi lebih kaya | Mulai sederhana, naik kelas bila perlu |
| Autentikasi | JWT dengan cookie httpOnly | Satu owner, cukup sederhana |
| Penyebaran | Docker Compose: postgres, redis, 9router, backend, frontend | Satu perintah untuk menjalankan semua |

### 8.2 Struktur modul NestJS

| Modul | Tanggung jawab |
|---|---|
| `auth` | Login owner, guard JWT |
| `settings` | Koneksi 9Router, jam kerja, batas harian |
| `schedule` | Perhitungan status kantor (kerja, jeda, tutup) dan jadwal per agent |
| `agents` | CRUD agent, template peran |
| `tasks` | CRUD tugas, status, ketergantungan |
| `orchestrator` | Pemecahan target, penugasan, loop revisi |
| `llm` | Klien 9Router, penghitungan token, retry |
| `queue` | Producer dan worker BullMQ |
| `presence` | Status dan lokasi agent, penerbit event SSE |
| `logs` | Log aktivitas dan statistik biaya |

## 9. Model data (ringkas)

| Tabel | Kolom utama |
|---|---|
| `users` | id, email, password_hash |
| `office_settings` | id, timezone, work_days, work_start, work_end, router_base_url, router_api_key_enc, default_model, daily_run_limit, daily_token_limit, max_concurrency |
| `schedule_blocks` | id, name, type (`PRAYER`, `MEAL`, `BREAK`, `OTHER`), start_time, end_time, agent_id (null = semua agent) |
| `holidays` | id, date, name, agent_id (null = semua agent) |
| `agents` | id, name, role, job_description, system_prompt, model, temperature, max_tokens, color, desk_index, active |
| `goals` | id, text, status, created_by, created_at |
| `tasks` | id, goal_id, agent_id, title, description, priority, status, depends_on (array id), result, revision_count, due_at, created_at, finished_at |
| `task_runs` | id, task_id, agent_id, model, prompt_tokens, completion_tokens, latency_ms, status, error, created_at |
| `messages` | id, task_id, from_agent_id, to_agent_id, role, content, created_at |
| `agent_presence` | agent_id, status, location, current_task_id, updated_at |
| `activity_logs` | id, agent_id, type, payload (JSONB), created_at |

Catatan:
- `agent_presence` adalah sumber kebenaran untuk tampilan denah.
- Kunci API 9Router disimpan terenkripsi (misalnya AES-256-GCM dengan kunci dari variabel lingkungan).

## 10. Rancangan API

### REST

| Metode | Rute | Fungsi |
|---|---|---|
| POST | `/auth/login` | Login |
| GET, PUT | `/settings` | Baca dan ubah pengaturan kantor |
| POST | `/settings/test-router` | Uji koneksi ke 9Router |
| GET, POST, PUT, DELETE | `/schedule-blocks` | Kelola jeda |
| GET, POST, DELETE | `/holidays` | Kelola hari libur |
| GET, POST, PUT, DELETE | `/agents` | Kelola agent |
| POST | `/goals` | Kirim target ke project manager |
| GET, POST, PUT | `/tasks` | Kelola tugas |
| POST | `/tasks/:id/approve` | Setujui hasil |
| POST | `/tasks/:id/revise` | Minta revisi dengan catatan |
| GET | `/office/state` | Status kantor dan semua agent saat ini |
| POST | `/office/pause`, `/office/resume` | Hentikan atau lanjutkan semua kerja |
| GET | `/logs`, `/stats` | Log aktivitas dan statistik biaya |

### Realtime

`GET /office/stream` (SSE) mengirim event:
- `office.status` (kerja, jeda, tutup, nama blok jeda)
- `agent.presence` (agent_id, status, lokasi, tugas aktif)
- `task.updated` (id, status)
- `run.finished` (agent_id, token, durasi)

## 11. Orkestrasi agent

### 11.1 Status dan lokasi

| Status agent | Lokasi di denah | Kondisi |
|---|---|---|
| `WORKING` | Meja di ruang kerja | Jam kerja, ada tugas berjalan |
| `IDLE` | Meja di ruang kerja | Jam kerja, tidak ada tugas |
| `STANDUP` | Area apel di ruang kerja | Blok apel pagi |
| `PRAYING` | Mushola | Blok jeda jenis sholat |
| `RESTING` | Lapangan | Blok jeda makan atau istirahat |
| `TOILET` | Toilet | Kunjungan singkat acak saat jam kerja |
| `OFFLINE` | Meja, tampilan redup | Di luar jam kerja atau hari libur |

Kunjungan toilet bersifat kosmetik. Agent hanya berpindah tempat 2 sampai 5 menit simulasi, dan tidak boleh memotong run yang sedang berjalan.

### 11.2 Siklus tugas

```
PENDING -> QUEUED -> RUNNING -> REVIEW -> DONE
                        |          |
                        v          v
                     FAILED    (revisi, maks 2x) -> QUEUED
BLOCKED = menunggu tugas lain atau persetujuan owner
```

### 11.3 Langkah eksekusi satu tugas

1. **Penjaga jadwal**: worker memeriksa apakah agent sedang boleh bekerja. Jika tidak, job ditunda (delayed) sampai jendela kerja berikutnya.
2. **Penjaga kuota**: periksa batas harian run dan token. Jika tercapai, semua job ditunda ke hari berikutnya dan owner diberi tahu.
3. **Penyusunan konteks**: system prompt agent (nama dan jobdesk), deskripsi tugas, hasil tugas yang menjadi dependensi, dan beberapa pesan terakhir yang relevan.
4. **Panggilan ke 9Router**: `POST {base_url}/chat/completions` dengan header `Authorization: Bearer <API key>`.
5. **Pencatatan**: simpan hasil, token, dan durasi di `task_runs`.
6. **Transisi status**: tugas pindah ke `REVIEW` (jika butuh QA atau persetujuan) atau `DONE`.
7. **Siaran**: kirim event SSE agar tampilan diperbarui.

### 11.4 Peran project manager
- Menerima target dan menghasilkan daftar tugas dalam format JSON terstruktur (judul, deskripsi, peran penerima, dependensi, prioritas).
- Hasil JSON divalidasi di backend. Jika tidak valid, diulang satu kali dengan pesan perbaikan.
- Menyusun laporan harian dari status semua tugas.

### 11.5 Penanganan galat
- Retry otomatis maksimal 3 kali dengan jeda bertambah (exponential backoff) untuk galat jaringan, 429, dan 5xx.
- Setelah itu tugas berstatus `FAILED` dan owner diberi tahu.
- Pembatasan konkurensi global (default 3 run bersamaan) agar kuota penyedia tidak habis.
- Fallback antar penyedia diatur di sisi 9Router; backend hanya memanggil satu endpoint.

### 11.6 Memori
- **Versi 1**: riwayat pesan per tugas dan ringkasan hasil tugas sebelumnya yang relevan.
- **Versi lanjut**: memori jangka panjang per agent memakai pgvector (preferensi owner, keputusan sebelumnya).

## 12. Integrasi 9Router

| Item | Nilai |
|---|---|
| Format | Kompatibel OpenAI: `POST /v1/chat/completions` |
| Alamat bawaan | `http://localhost:20128/v1` (sesuaikan jika berjalan di server lain) |
| Autentikasi | Header `Authorization: Bearer <API key dari dashboard 9Router>` |
| Model | Diisi dengan nama model atau combo yang tersedia di dashboard 9Router |

Variabel lingkungan backend:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/kantor_ai
REDIS_URL=redis://localhost:6379
ROUTER_BASE_URL=http://localhost:20128/v1
ROUTER_API_KEY=isi_dari_dashboard_9router
ROUTER_DEFAULT_MODEL=isi_nama_model_atau_combo
JWT_SECRET=ganti_dengan_rahasia_panjang
ENCRYPTION_KEY=kunci_32_byte_untuk_enkripsi_api_key
TZ=Asia/Jakarta
```

Aturan integrasi:
- Seluruh panggilan dilakukan dari backend. Browser tidak pernah mengetahui API key.
- Klien LLM dibungkus satu layanan (`llm.service`) supaya penyedia atau format bisa diganti tanpa mengubah modul lain.
- Streaming jawaban bersifat opsional pada versi lanjut untuk menampilkan teks yang sedang ditulis agent.

## 13. Desain antarmuka

### 13.1 Halaman

| Halaman | Isi |
|---|---|
| Kantor | Denah dengan karakter, jam kantor, status fase, kontrol jeda dan lanjut |
| Agent | Daftar agent, formulir nama dan jobdesk, pilihan template dan model |
| Tugas | Papan tugas (kanban), pembuatan target, hasil, tombol setujui dan revisi |
| Jadwal | Editor jam kerja, blok jeda, hari libur, dan override per agent |
| Log dan biaya | Aktivitas, token, galat, batas harian |
| Pengaturan | Koneksi 9Router, keamanan, ekspor dan impor konfigurasi |

### 13.2 Prinsip visual
- Denah dilihat dari atas (top-down) dengan ruangan berbatas jelas dan label.
- Karakter robot kecil dengan antena, warna sesuai peran, dan kode dua huruf. Ini membedakan mereka sebagai AI agent.
- Gerak dipakai untuk menyampaikan makna: berjalan saat berpindah, mengetik saat bekerja, merunduk saat sholat, mata tertutup saat tidur.
- Palet menggunakan warna terang yang tenang di siang hari dan versi gelap yang nyaman; hindari tampilan generik berbasis kartu seragam.
- Animasi dapat dimatikan dan menghormati `prefers-reduced-motion`.
- Pada ponsel, denah berformat persegi dan daftar agent berada di bawah denah.

### 13.3 Interaksi
- Klik karakter: panel detail dengan tugas aktif, riwayat, dan biaya.
- Pengatur kecepatan waktu simulasi hanya untuk mode demo. Mode produksi selalu memakai waktu nyata.
- Slider jam hanya tersedia di mode demo.

## 14. Keamanan dan privasi

- API key 9Router dan kunci lain hanya ada di server, tersimpan terenkripsi atau di variabel lingkungan.
- Kata sandi owner di-hash dengan argon2 atau bcrypt.
- Cookie sesi `httpOnly`, `secure`, dan `sameSite`.
- Pembatasan laju (rate limit) pada endpoint login dan endpoint yang memicu panggilan model.
- Validasi semua input dengan class-validator dan DTO.
- Isi tugas dapat mengandung data sensitif. Log tidak menyimpan header autentikasi dan menyamarkan data rahasia.
- Jika dibuka ke internet: gunakan HTTPS, dan aktifkan kewajiban API key pada 9Router.
- Agent versi 1 hanya menghasilkan teks. Tidak ada eksekusi kode atau akses sistem luar tanpa persetujuan owner.

## 15. Metrik keberhasilan

| Metrik | Target awal |
|---|---|
| Tugas selesai tanpa intervensi owner | 70% atau lebih |
| Tugas gagal karena galat teknis | di bawah 5% |
| Waktu dari perubahan status ke tampilan | di bawah 1 detik |
| Pelanggaran jadwal (run dimulai saat jeda atau tutup) | 0 |
| Pelampauan batas harian | 0 |
| Owner dapat membuat agent baru dan mengubah jam kerja tanpa menyentuh kode | Ya |

## 16. Rencana rilis

| Fase | Isi | Hasil |
|---|---|---|
| 0. Fondasi | Repo, Docker Compose, NestJS, Prisma, PostgreSQL, Redis, tes panggilan 9Router | Satu agent bisa menjawab lewat API |
| 1. Inti agent | CRUD agent dan tugas, antrian BullMQ, klien LLM, log run | Tugas dikerjakan dan hasil tersimpan |
| 2. Jadwal | Jam kerja, jeda, hari libur, penjaga jadwal, penundaan job | Agent berhenti dan lanjut sesuai jam |
| 3. Realtime dan denah | Presence, SSE, denah React dengan karakter bergerak | Tampilan mengikuti status nyata |
| 4. Orkestrasi | Project manager memecah target, ketergantungan, loop QA | Target besar berjalan lintas peran |
| 5. Kontrol dan biaya | Batas harian, dashboard biaya, notifikasi galat | Penggunaan terkendali |
| 6. Poles visual | Tema, dekorasi, ruangan tambahan, suara opsional, responsif penuh | Tampilan matang |
| 7. Lanjutan | Memori jangka panjang, jadwal sholat otomatis, streaming jawaban | Perbaikan kualitas |

## 17. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kuota atau biaya penyedia cepat habis | Kerja berhenti atau tagihan naik | Batas harian, batas konkurensi, pemilihan model hemat untuk peran sederhana |
| Agent menghasilkan keluaran salah atau halusinasi | Hasil tidak bisa dipakai | Loop QA, persetujuan owner, prompt yang spesifik per peran |
| Keluaran project manager tidak valid JSON | Pemecahan target gagal | Validasi skema, satu kali perbaikan otomatis, jatuh ke penugasan manual |
| 9Router atau penyedia tidak tersedia | Tugas macet | Retry, status `FAILED` jelas, fallback diatur di 9Router |
| Konteks terlalu panjang | Biaya naik, kualitas turun | Ringkasan hasil, batas panjang riwayat |
| Kebocoran API key | Penyalahgunaan kuota | Kunci hanya di backend, terenkripsi, tidak masuk log |
| Kompleksitas animasi memperlambat perangkat murah | Tampilan patah-patah | Mulai dengan SVG dan CSS, mode animasi dikurangi |

## 18. Pertanyaan terbuka

1. Model apa yang dipakai untuk tiap peran, dan apakah perlu model hemat untuk peran seperti support?
2. Apakah agent perlu mengakses alat luar (repositori Git, media sosial, email), dan dengan persetujuan seperti apa?
3. Apakah jadwal sholat cukup diisi manual, atau perlu otomatis berdasarkan kota di fase awal?
4. Apakah dibutuhkan lebih dari satu kantor atau proyek terpisah?
5. Di mana aplikasi akan dijalankan (komputer lokal atau VPS)?
6. Apakah perlu notifikasi ke ponsel (Telegram atau WhatsApp) saat ada tugas selesai atau gagal?

## Lampiran A: contoh konfigurasi awal

```json
{
  "jamKerja": {
    "zona": "Asia/Jakarta",
    "hari": ["senin", "selasa", "rabu", "kamis", "jumat"],
    "masuk": "08:00",
    "pulang": "17:00",
    "jeda": [
      { "nama": "Apel pagi", "jenis": "OTHER", "mulai": "08:00", "selesai": "08:15" },
      { "nama": "Sholat Dzuhur", "jenis": "PRAYER", "mulai": "12:00", "selesai": "12:30" },
      { "nama": "Makan siang", "jenis": "MEAL", "mulai": "12:30", "selesai": "13:00" },
      { "nama": "Sholat Ashar", "jenis": "PRAYER", "mulai": "15:15", "selesai": "15:45" }
    ]
  },
  "agents": [
    { "nama": "Dewi", "peran": "Project manager", "jobdesk": "Memecah target menjadi tugas, membagi ke tim, memantau progres, dan menulis laporan harian." },
    { "nama": "Raka", "peran": "Frontend developer", "jobdesk": "Membuat halaman dan komponen UI dari tugas yang diberikan." },
    { "nama": "Bima", "peran": "Backend developer", "jobdesk": "Membuat endpoint, skema database, dan dokumentasi API." },
    { "nama": "Sinta", "peran": "QA tester", "jobdesk": "Menulis test case dan memeriksa hasil kerja developer." },
    { "nama": "Naya", "peran": "Digital marketing", "jobdesk": "Riset kata kunci, merencanakan kampanye, dan menganalisis performa." },
    { "nama": "Laras", "peran": "Content writer", "jobdesk": "Menulis artikel, caption, dan materi promosi." },
    { "nama": "Dimas", "peran": "Customer support", "jobdesk": "Menjawab pertanyaan pelanggan dan meneruskan masalah ke tim terkait." }
  ]
}
```

## Lampiran B: contoh panggilan ke 9Router (NestJS)

```ts
@Injectable()
export class LlmService {
  constructor(private readonly config: ConfigService) {}

  async chat(system: string, user: string, model?: string) {
    const res = await fetch(`${this.config.get('ROUTER_BASE_URL')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.get('ROUTER_API_KEY')}`,
      },
      body: JSON.stringify({
        model: model ?? this.config.get('ROUTER_DEFAULT_MODEL'),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Router ${res.status}`);
    const data = await res.json();
    return {
      text: data.choices[0].message.content as string,
      usage: data.usage,
    };
  }
}
