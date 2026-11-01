# AR CRM — Dokumentasi Teknis Lengkap

**Status dokumen:** 1 November 2026 (WIB)  
**Repository:** `anggarmd51/AR-CRM-App-`  
**Branch:** `cue/production-runtime-repair-20261101`  
**Commit yang diaudit:** `031366eb532d24d1c0370518a666e15b35882607`  
**Tujuan:** panduan kerja harian dan panduan pengembang untuk AR CRM.

> Dokumen ini disusun dari audit source terstruktur, inventory `git ls-files`, dan konteks deployment yang diberikan pemilik tugas. Klaim tentang fungsi kode berarti perilaku yang terlihat pada commit tersebut. Klaim tentang deployment, konfigurasi cloud, data, atau layanan eksternal diberi label terpisah dan tidak dianggap terbukti hanya karena ada kode atau template konfigurasi.

## Cara membaca status bukti

- **Terbukti dari source/tes lokal:** terlihat pada file commit atau direproduksi oleh tes lokal yang disebutkan.
- **Dilaporkan pemilik tugas:** konteks operasional yang diberikan pemilik, bukan hasil pembacaan ulang layanan live dalam audit ini.
- **Belum diverifikasi / unknown:** tidak dapat dipastikan dari source statis, tes lokal, atau audit yang tersedia.
- **Sasaran/desain:** rancangan, dokumentasi, contoh kode, atau gate yang belum berarti fitur tersebut aktif di runtime.

---

## 1. Visi, tujuan, dan target pengguna

AR CRM adalah PWA CRM penjualan B2B untuk penggunaan solo oleh seorang account manager/owner. Alur utamanya adalah menyimpan lead, mengelola pipeline, mencatat aktivitas follow-up, melihat metrik, dan menjaga mutasi yang belum mendapat acknowledgement Firestore melalui antrean durable di browser.

Desain data dan Firestore Rules membatasi akses pada satu designated owner dan satu workspace yang dikonfigurasi. Karena itu aplikasi ini tidak boleh diposisikan sebagai CRM tim multi-user hanya berdasarkan adanya field `role` atau membership di source. Rules dan binding yang diaudit mengarah pada model owner tunggal; perlu pekerjaan desain dan verifikasi terpisah bila kelak membutuhkan banyak sales user.

Target antarmuka adalah browser laptop dan ponsel dengan layout responsif serta opsi canvas/mock device Android. Tidak ada bukti bahwa aplikasi Android native yang dibangun dan dideploy merupakan bagian dari repository ini.

### 1.1 Status deployment per 1 November 2026

**Dilaporkan pemilik tugas:**

- Commit target sudah dipush ke branch `cue/production-runtime-repair-20261101`.
- Deployment Vercel Production `dpl_HtsnH3Vt6ykiGdCPJoWEYNPm4Jsr` berstatus `READY`.
- Alias yang dilaporkan adalah [https://arcrmapp.vercel.app/](https://arcrmapp.vercel.app/).
- HTTP GET ke alias dan asset JavaScript utama dilaporkan mengembalikan `200`.
- Pemilik melaporkan Google login, PIN, dan dashboard berfungsi normal pada 1 November 2026.
- Project Firebase Production yang dilaporkan adalah `ar-crm-73222`.
- Rules SHA yang dilaporkan adalah `597528b95e593ec9fdc4157e11128084ba115fa6bb1f2044a60585b51344dc4d`; Rules tidak dibaca ulang sebagai layanan live dan tidak diubah pada deployment tersebut.
- Tes lokal terakhir yang dilaporkan: 187 passed, 1 skipped; Rules Emulator 20/20; TypeScript dan build lulus; bundle JavaScript sekitar 996 kB.

**Batas verifikasi:** audit ini tidak melakukan login hosted, CRUD production, pembacaan Vercel/Firebase Console, pengecekan Rules yang sedang aktif, pemeriksaan App Check live, pemanggilan Gemini live, cloud backup/restore/PITR, migrasi, uji offline/multi-tab/storage eviction, atau device matrix. Status `READY` dan HTTP `200` hanya membuktikan deployment/asset dapat dilayani; tidak membuktikan seluruh workflow CRM berfungsi.

### 1.2 Tujuan operasional harian

1. Masuk melalui Google Sign-In dan, pada hosted flow yang mewajibkannya, menyelesaikan sesi PIN akun server.
2. Memeriksa dashboard: nilai pipeline, forecast berbobot, follow-up, distribusi stage, dan aktivitas terbaru.
3. Membuat lead baru dengan identitas perusahaan dan kontak yang wajib.
4. Memindahkan lead melalui lima stage pipeline.
5. Mencatat meeting, telepon, pesan WhatsApp, proposal, atau site visit.
6. Menggunakan GPS sekali saat pengguna memilih check-in/lokasi.
7. Meninjau antrean mutasi yang pending atau gagal, lalu melakukan replay/koreksi manual bila diperlukan.
8. Mengekspor snapshot lead aktif ke CSV dari browser bila diperlukan.

---

## 2. Arsitektur dan stack yang terbukti

### 2.1 Komponen runtime

| Lapisan | Teknologi/perilaku | Status bukti |
|---|---|---|
| UI | React 19, TypeScript, React DOM | Terlihat pada dependency dan source `src/` |
| Bundler | Vite 8 dengan plugin React dan Tailwind Vite | Terlihat pada `package.json`/`vite.config.ts` |
| Styling | Tailwind CSS serta `src/index.css`; font body Inter/system dan heading serif | Terlihat dari audit UI dan dependency |
| Ikon | `lucide-react`; dependency Font Awesome tidak ditemukan pada manifest yang diaudit | Terlihat pada `package.json` |
| Auth | Firebase Web Auth, Google Sign-In; sesi PIN account server melalui endpoint terpisah | Alur ada di source; keberhasilan live dilaporkan pemilik |
| Data utama | Firebase Firestore dengan subscription owner-scoped | Terlihat pada `src/firebaseRepository.ts` dan `src/App.tsx` |
| Rules | Firestore Rules v2, default-deny, owner/workspace/session binding | Terlihat pada `firestore.rules`; enforcement live unknown |
| API serverless | Handler di `api/account-pin`, `api/ai`, dan `api/cron` | Terlihat dari source; konfigurasi platform live sebagian unknown |
| Server development | Express di `server.ts`, Vite middleware saat development, static `dist` saat production server | Terlihat dari source |
| AI | `@google/genai`, model terpusat `gemini-3.8-flash`, Lead Finder dengan Google Search grounding, summarizer tanpa web search | Wiring dan gate terlihat; akses/quota live unknown |
| Offline mutasi | IndexedDB + payload AES-GCM; queue scope owner/workspace | Terlihat pada `offlineOutbox.ts`/`offlineWriteQueue.ts` |
| PWA | Manifest, service worker production-only, ikon dan asset public | Terlihat pada `main.tsx` dan `public/` |
| Export | CSV browser-side; endpoint Firestore→Google Sheets satu arah | Implementasi source ada; Sheets/IAM/Cron live unknown |
| Native Android | Tidak ada build native pada repo; `androidKotlinCode.ts` adalah contoh yang dibaca explorer | Bukan runtime native yang terbukti |
| Google Apps Script | `gasCode.ts` hanya menyimpan contoh router sebagai string | Bukan backend live yang terbukti |

### 2.2 Alur startup

`src/main.tsx` mendaftarkan service worker hanya pada production build, mengimpor CSS, lalu merender `FirebaseAuthGate`. `FirebaseAuthGate` menangani lifecycle Firebase Auth, pemeriksaan owner/workspace, optional server-issued PIN session, dan blocking state. `App` hanya dirender setelah gate mengizinkan akses.

Target runtime dibedakan menjadi local/development, Preview/staging, dan Production melalui deployment guard. Development diarahkan ke emulator Auth/Firestore. Hosted build harus memakai target yang eksplisit dan konfigurasi yang cocok; guard fail-closed menolak konfigurasi yang tidak memenuhi binding. Staging memakai preflight App Check pada source client; production tidak dibuktikan memiliki enforcement App Check dari source yang diaudit.

### 2.3 Sumber data dan batas cakupan

Lead dan Activity aktif diambil melalui `subscribeToLeads` dan `subscribeToActivities` setelah ada Firebase user. Firestore adalah sumber persistensi utama. Stage/profile yang terlihat lebih cepat pada UI adalah optimistic overlay dan harus direkonsiliasi terhadap snapshot server.

`globalLeads` di-reset ke array kosong pada efek data leads/activities yang diaudit; tidak terlihat subscription Firestore global-lead. Hasil Global Lead Finder berasal dari respons endpoint atau props lokal, diberi label belum diverifikasi, dan tidak otomatis menjadi data pipeline sebelum pengguna melakukan import.

---

## 3. Model domain dan pipeline

### 3.1 Lima stage yang resmi

Source `src/types/crm.ts`, `firestore.rules`, dan komponen pipeline mendefinisikan tepat lima stage:

1. **Prospect** — lead awal yang belum masuk tahap percakapan terstruktur.
2. **Meeting** — lead yang sudah mencapai tahap pertemuan/meeting.
3. **Negotiation** — pembicaraan nilai/ketentuan sudah berjalan.
4. **Closing Won** — deal berhasil; stage final.
5. **Closing Lost** — deal hilang; stage penutupan negatif.

Probabilitas forecast yang terlihat pada `STAGE_CONFIG` adalah masing-masing `0.2`, `0.5`, `0.8`, `1.0`, dan `0`. Nilai ini dipakai untuk weighted probability/forecast; tidak boleh dibaca sebagai probabilitas statistik yang telah dikalibrasi dari histori perusahaan.

### 3.2 Aturan finalitas Closing Won

- Lead baru tidak boleh dibuat langsung pada `Closing Won`.
- Perpindahan menuju `Closing Won` harus membuat archive Won secara atomik bila belum ada.
- Lead Won dianggap final oleh UI dan Rules; stage tidak dapat dipindahkan keluar dari Won.
- Field identitas/profil tertentu pada Won dikunci di detail UI. Audit menyebut `contact`, `phone`, dan `deal value` read-only pada kondisi ini.
- Archive harus cocok dengan lead setelah transaksi, termasuk identitas, nilai deal, owner, dan tanggal Won.
- Delete lead, activity, archive, workspace, dan membership ditolak oleh Rules yang diaudit.

`Closing Lost` bukan berarti dokumen dihapus. Ia tetap merupakan stage pipeline yang dapat dibaca sesuai scope owner dan memiliki probability nol.

### 3.3 Bentuk data yang relevan

`Lead` mencakup identitas perusahaan/kontak, phone, industry, city, pipeline stage, deal value, next follow-up date, lead score, timestamp, owner/role, dan status sinkronisasi internal.

`Activity` mencakup lead ID, activity type, notes, timestamp, optional `ai_summary` dan sumbernya (`gemini` atau `local`), optional GPS (`latitude`, `longitude`, `accuracy_m`), owner/role, dan status sinkronisasi.

`GlobalLead`, metric, follow-up, queued mutation, dan tipe archive didefinisikan pada [src/types/crm.ts](src/types/crm.ts). Tipe-tipe itu adalah kontrak aplikasi, bukan data pelanggan aktual.

---

## 4. Panduan kerja harian pengguna

### 4.1 Masuk dan akses

1. Buka alias deployment yang telah disetujui pemilik.
2. Gunakan Google Sign-In sebagai owner yang telah dikonfigurasi.
3. Bila hosted flow menampilkan Account PIN Gate, lakukan verify/enrollment sesuai kebijakan akun. PIN account server berbeda dari PIN lock lokal browser.
4. Tunggu Firebase Auth/Firestore gate selesai. Jangan menganggap layar online atau login Google saja sebagai bukti write Firestore berhasil.
5. Jika gate memblokir akses, jangan mencoba mengganti konfigurasi client atau memasukkan secret ke browser. Catat pesan generik dan eskalasi pemeriksaan environment/runtime.

### 4.2 Dashboard

`DashboardView` menampilkan hero forecast, total pipeline, Won, active, weighted probability, win rate, distribusi lima stage, follow-up overdue/due today, hingga empat aktivitas terbaru. Quick action yang terlihat mencakup quick lead, check-in, call, dan WhatsApp.

Gunakan dashboard untuk prioritas hari itu, bukan sebagai pengganti rekonsiliasi server. Angka UI dapat dipengaruhi optimistic overlay atau status snapshot cache/pending write sampai Firestore mengakui mutasi.

### 4.3 Membuat lead

Buka Quick Lead dari dashboard, pipeline, atau FAB. Company dan contact wajib; phone, city, industry, stage awal selain Closing Won, deal value, follow-up date, dan score tersedia sebagai input. App menormalisasi payload lalu mengirim melalui repository/queue.

Receipt lokal/queued bukan bukti commit server. Bila offline atau antrean menahan mutasi, lead dapat terlihat sebagai state optimistis. Tunggu status acknowledged atau periksa panel queue. Jangan membuat duplikat hanya karena UI belum segera berubah setelah jaringan pulih.

### 4.4 Mengelola pipeline

`PipelineKanbanView` mendukung Kanban/list toggle, pencarian company/contact/city/industry, filter score Hot/Warm/Cold/Unrated, dan lima kolom stage. Kartu menyediakan call/WhatsApp dan pergerakan stage maju/mundur/dropdown, tunduk pada aturan stage authoritative.

Saat sebuah lead sudah Won, perlakukan sebagai final. Jika perubahan profil diperlukan sebelum Won, lakukan sebelum transaksi penutupan. Perubahan stage dan profile menggunakan optimistic overlay; kegagalan akan me-rollback intent terhadap snapshot Firestore terbaru.

### 4.5 Mencatat aktivitas dan check-in

`ActivityLoggerModal` mewajibkan lead dan notes. Lima tipe UI adalah Meeting Check-In, Phone Call, WhatsApp Message, Proposal Sent, dan Site Visit.

GPS tidak otomatis aktif. Pengguna harus menekan aksi pengambilan lokasi; browser meminta geolocation sekali dengan high accuracy, timeout 15 detik, dan `maximumAge: 0`. Tidak ada background tracking atau histori lokasi otomatis.

Ringkasan lokal adalah ekstraktif dari notes yang sudah ada. Ringkasan Gemini hanya dijalankan bila feature flag client/server aktif, sesi owner valid, dan pengguna memberi consent untuk notes tersebut. Notes yang dikirim ke provider dapat memuat informasi sensitif yang dimasukkan pengguna; source tidak menunjukkan redaksi PII atau retention policy provider. Bila panggilan AI sudah dimulai lalu gagal, notes dapat sudah terkirim; UI mengingatkan kondisi tersebut.

### 4.6 Detail lead dan komunikasi

`LeadDetailModal` menampilkan profile, stage, score, nilai deal, industry/city, sync state, dan timeline aktivitas. Quick contact actions mencakup call dan WhatsApp.

`WhatsAppModal` memilih template, mengizinkan edit/copy pesan, menormalkan nomor, lalu membuka `wa.me`. Aplikasi tidak mengirim WhatsApp secara otomatis dan tidak membuktikan status delivery.

### 4.7 AI Lead Finder

Lead Finder menerima kategori industri, kota, dan customer profile pada UI. Client mengirim Firebase ID token ke `POST /api/ai/lead-finder`. Endpoint membatasi input, menolak key tambahan serta email/nomor telepon pada input yang diaudit, dan mengembalikan maksimal lima hasil dengan sumber HTTPS yang dinormalisasi.

Hasil diberi label belum diverifikasi. Prompt meminta Google Search grounding, tetapi grounding tidak membuktikan fakta, freshness, kepemilikan sumber, atau bebas hallucination. Tinjau provenance dan lakukan verifikasi manusia sebelum import. Deduplication terhadap pipeline tersedia; import ke pipeline adalah tindakan terpisah dan tidak boleh dianggap sebagai validasi eksternal.

Quota Lead Finder dan summarizer berbagi limit lima request per owner per UTC day. Reservasi dibuat sebelum provider call; malformed response atau provider failure tetap dapat mengonsumsi slot karena tidak ada refund yang terlihat.

### 4.8 Export CSV

Top bar menyediakan export CSV dari array lead aktif yang sedang tersedia di UI. Kolom yang disebut audit meliputi Lead ID, company/contact/phone/industry/city, stage, deal value, follow-up, score, sync status, dan timestamp. CSV tidak mencakup activities, GPS, AI summary, archive, atau queue yang belum tampil sebagai lead aktif.

Generator memakai RFC-4180 quoting, BOM UTF-8, nama file tanggal lokal, serta mitigasi formula injection untuk prefix `=`, `+`, `-`, `@`, tab, dan CR. CSV ini adalah snapshot browser, bukan backup/restore.

---

## 5. Antrean offline dan persistensi browser

### 5.1 Operasi yang didukung

Jalur aktif menggunakan `offlineOutbox.ts` dan `offlineWriteQueue.ts`. Audit source menyebut dukungan untuk create-lead, update-lead-stage, update-lead-profile, dan create-activity; dokumentasi desain lama hanya menyebut tiga operasi utama dan tidak sepenuhnya mutakhir pada profile update. Kode commit menjadi rujukan utama.

Payload business-only di-allowlist dan disimpan sebagai ciphertext AES-GCM pada IndexedDB. Kunci `CryptoKey` non-extractable disimpan pada partisi owner/workspace yang sama; associated data mengikat tipe operasi, ID, owner, workspace, label, dan dependency. Token, credential, ID token, dan field arbitrer tidak disimpan dalam payload queue.

### 5.2 Status dan acknowledgement

Status yang dapat terlihat mencakup queued locally, syncing, acknowledged, dan failed/manual action. `navigator.onLine` bukan bukti internet end-to-end dan bukan bukti Firestore commit. Acknowledgement membutuhkan write Promise sukses atau rekonsiliasi server terhadap document ID yang sama; data cache saja tidak cukup.

Mutasi baru sengaja dapat ditolak ketika connectivity source menyatakan offline. Mutasi yang sudah diterima tetap pending dan dapat dicoba ulang saat koneksi pulih. Retry transient memakai backoff; error permanen seperti permission-denied, invalid-argument, failed-precondition, unauthenticated, not-found, already-exists, dan out-of-range tidak diputar otomatis.

Dependency activity/update terhadap lead baru menunggu create-lead yang sama acknowledged. Stable operation/document ID mencegah duplikasi ketika hasil write ambigu.

### 5.3 Storage eviction dan batas keamanan

Payload pending/failed dapat tetap berada di profil browser sampai acknowledged atau diselesaikan. Menghapus site data/IndexedDB dapat menghilangkan kemampuan recovery queue. IndexedDB terenkripsi bukan backup lintas perangkat, bukan perlindungan XSS/kode jahat pada origin, dan bukan perlindungan takeover profil OS/browser.

Tidak ditemukan guard eksplisit untuk meminta persistensi browser atau mencegah storage eviction, seperti pemanggilan `navigator.storage.persist()`. Perlakukan eviction sebagai risiko yang belum dimitigasi/diuji, bukan sebagai kemampuan yang sudah tersedia.

SDK Firestore memakai cache default; durable outbox tidak berarti seluruh snapshot CRM tersedia offline. Multi-tab, crash di semua browser, eviction storage, dan pemulihan perangkat nyata belum diverifikasi secara menyeluruh. Saat logout dengan queue pending, UI meminta konfirmasi dan mempertahankan partisi untuk owner/workspace yang sama.

`syncQueue.ts`/`CrmStorage` adalah jalur legacy localStorage untuk kompatibilitas/tes. `processQueue` legacy adalah no-op dan bukan sinkronisasi Firebase. Jangan menganggap data localStorage lama otomatis masuk ke Firestore.

---

## 6. Keamanan dan boundary akses

### 6.1 Google Sign-In, owner, workspace, dan PIN

Firebase ID token diverifikasi server-side pada endpoint account PIN dengan issuer/audience project dan check-revoked; UID harus cocok dengan owner terkonfigurasi. Endpoint memeriksa method, HTTPS, same-origin berbasis Origin/Host dan proxy header, serta body ketat.

PIN account server memiliki kebijakan 6–12 digit, verifier scrypt dengan salt acak dan pepper server-only, timing-safe comparison, lima percobaan per 15 menit, lockout 15 menit, dan sesi server TTL delapan jam. Enrollment membutuhkan recent re-authentication, konfirmasi PIN, create-if-absent atomik, target/branch/environment yang sesuai, dan default-off policy.

Sukses verify menerbitkan Firebase custom token dengan claim session. Client menukar token tersebut dan memeriksa claim sebelum menganggap sesi aktif. Source yang diaudit tidak menunjukkan endpoint logout/revoke server khusus yang dipanggil client; sesi berakhir melalui expiry atau revoke/delete pada jalur error penerbitan.

`SecurityVault`, `SecuritySettingsModal`, dan `SecurityLockScreen` adalah kunci lokal opsional untuk browser/device: PIN lokal, biometrik capability/WebAuthn, timeout, lockout, dan lock-now. Ia bukan login akun, bukan pengganti Account PIN, dan UI menyatakan tidak mengenkripsi seluruh data browser.

### 6.2 Firestore Rules

Rules lokal bersifat default-deny. CRM membutuhkan authenticated owner, designated owner, workspace yang tepat, membership role owner, dan custom claim `pinSessionId` yang menunjuk dokumen sesi aktif yang masih berlaku. Rules memvalidasi schema, tipe, panjang field, tanggal kalender, stage, score, owner scope, relasi activity→lead, GPS, AI summary, dan archive Won.

Rules menolak browser membaca/menulis koleksi PIN. Rules tidak memverifikasi PIN dan tidak menerbitkan custom token; itu tanggung jawab Admin/runtime endpoint. `firebase.staging.json` merujuk Rules staging yang tidak ada di checkout ini; staging Rules live tidak dapat dipastikan dari repository.

### 6.3 App Check dan boundary environment

Source client menyiapkan App Check Enterprise untuk staging sebelum Auth/Firestore dan memblokir akses bila token startup tidak valid. Production tidak dinyatakan memakai App Check secara eksplisit oleh source ini. App Check enforcement provider live, metrics, dan parity Production belum diverifikasi.

Server runtime dispatch fail-closed: Production memerlukan target, project, service-account/WIF, branch, owner, dan workspace binding yang cocok; Preview dibatasi staging/branch yang disetujui; AI hanya Preview dengan flag server; cron hanya Production.

### 6.4 Privasi

Jangan memasukkan secret, token, PIN, service-account JSON, pepper, atau password ke `VITE_*`; semua `VITE_*` dapat masuk bundle browser. Notes aktivitas dapat mengandung PII dan dapat dikirim ke Gemini setelah consent. Source tidak memberikan jaminan redaksi atau retention provider.

Export Sheets hanya memakai delapan kolom laporan terbatas: source key, company name, pipeline stage, deal value, lead score, follow-up date, created_at, dan updated_at. Phone, email, contact name, notes, GPS, dan credential tidak diekspor oleh adapter yang diaudit.

---

## 7. API dan integrasi server

| Route | Method | Fungsi dan gate |
|---|---|---|
| `/api/account-pin/verify` | POST | Verifikasi PIN account; auth owner, same-origin HTTPS, policy, rate limit, runtime target |
| `/api/account-pin/status` | GET | Memeriksa credential/session aktif dan expiry; status boleh memakai fetch metadata same-origin sesuai adapter |
| `/api/account-pin/enroll` | POST | Enrollment pertama; recent re-auth, confirmation, policy enrollment, create-if-absent |
| `/api/ai/lead-finder` | POST | Lead suggestions; Preview-only/flagged, active PIN session, quota, Gemini Search grounding |
| `/api/ai/summarize-notes` | POST | Summary notes; Preview-only/flagged, consent di client, active PIN session, shared quota |
| `/api/cron/export-firestore-to-sheets` | GET | Production-only, `CRON_SECRET` bearer, fixed Firestore/Sheets target, server-only adapter |

### 7.1 Perbedaan Express dan serverless

`server.ts` adalah Express entrypoint yang dipakai untuk development dan static production server bila dijalankan sebagai aplikasi Express. Ia mengembalikan 410 untuk legacy `/api/gas-proxy` dan, pada jalur yang diaudit, 403 untuk `/api/ai/summarize-notes` sebelum membaca body. Handler serverless `api/ai/summarize-notes.ts` memiliki implementasi berbeda dan default-off.

Karena itu hasil lokal/dev Express tidak boleh disamakan dengan routing Vercel Functions. Uji hosted harus memastikan request benar-benar mencapai handler platform yang dimaksud.

### 7.2 Firestore→Sheets

Export adalah satu arah, bukan backup dan bukan import. Endpoint membaca collection leads fixed dengan filter owner, memvalidasi root workspace/membership, header Sheet, duplicate source key, dan schema. Upsert memakai source key dan `RAW`; orphan rows tidak dihapus. Invocation bersamaan tidak dilindungi compare-and-swap.

Belum ada bukti `vercel.json`, Cron schedule, service account, IAM minimum, spreadsheet tujuan, atau environment server aktif. Jangan menyatakan export terjadwal berfungsi sebelum semua itu diverifikasi.

---

## 8. Struktur direktori final commit

Inventory berikut diambil dari `git ls-files` pada commit target. Semua path tracked dimasukkan; `dist/` dan `build/` tidak muncul sebagai tracked path pada inventory ini. Jika suatu path hanya metadata/template/fixture, status tersebut disebutkan agar tidak disalahartikan sebagai runtime aktif.

```text
.
├── .env.example                         # Template env local; placeholder, bukan secret aktif
├── .env.staging.example                 # Template staging; tidak aktif dan tidak berisi nilai rahasia
├── .firebaserc.example                  # Template alias Firebase; bukan project binding live
├── .gitignore                            # Exclusion Git untuk env, dependency, build, log, dan file lokal
├── .vercelignore                         # Exclusion artefak/deployment Vercel sesuai konfigurasi repo
├── HANDOVER_AUDIT_FINAL.md               # Audit/handover historis; konteks, bukan status live baru
├── PROJECT_STATE.md                      # Spesifikasi/status historis dan gate operasional
├── firebase.json                          # Rules/indexes dan emulator Firebase lokal
├── firebase.staging.json                 # Konfigurasi staging yang merujuk Rules staging eksternal/tidak tracked
├── firestore.indexes.json                # Composite indexes owner/created_at untuk query CRM
├── firestore.rules                       # Rules Production/local yang fail-closed dan owner-scoped
├── firestore.rules.test.ts               # Tes Rules Emulator sintetis
├── index.html                             # Shell HTML Vite/PWA
├── metadata.json                          # Metadata proyek; fungsi runtime tidak diasumsikan lebih dari isi file
├── package-lock.json                      # Lock dependency npm
├── package.json                           # Manifest, scripts, dependency runtime/dev
├── server.ts                              # Express dev/static server dan legacy route guards
├── tsconfig.json                           # Konfigurasi TypeScript
├── vite.config.ts                         # Konfigurasi Vite/React/Tailwind/bundling
├── api/
│   ├── account-pin/
│   │   ├── enroll.ts                      # HTTP handler enrollment PIN
│   │   ├── http.ts                        # Adapter request/header/response account PIN
│   │   ├── status.ts                       # HTTP handler status sesi PIN
│   │   └── verify.ts                       # HTTP handler verify PIN
│   ├── ai/
│   │   ├── lead-finder.ts                 # HTTP handler AI Lead Finder
│   │   └── summarize-notes.ts             # HTTP handler AI meeting/notes summary
│   └── cron/
│       └── export-firestore-to-sheets.ts  # HTTP handler export production Firestore→Sheets
├── docs/
│   ├── ACCOUNT_PIN_CROSS_DEVICE_READINESS.md       # Gate readiness PIN lintas perangkat
│   ├── AI_LEAD_FINDER_READINESS.md                  # Gate AI, consent, quota, target
│   ├── FIREBASE_MIGRATION_STATUS.md                 # Status migrasi/staging historis
│   ├── FIREBASE_STAGING_BACKUP_APPCHECK.md          # Catatan staging, backup, App Check
│   ├── FIRESTORE_STAGED_MIGRATION_READINESS.md     # Kontrak kesiapan migrasi staged
│   ├── FIRESTORE_TO_SHEETS_EXPORT.md                # Kontrak export satu arah dan prasyarat
│   ├── OFFLINE_QUEUE_DESIGN.md                      # Desain queue, enkripsi, retry, batas
│   ├── OWNER_BOOTSTRAP_AND_DATA_MIGRATION_RUNBOOK.md  # Runbook bootstrap/migrasi read-only
│   ├── PRODUCTION_CUTOVER_MANUAL_CHECKLIST_DRAFT.md  # Checklist manual cutover; bukan approval
│   └── READ_ONLY_LEGACY_DATA_INVENTORY_MAPPING_DRAFT.md # Draft mapping sumber legacy
├── ops/
│   └── production/
│       └── 2026-11-01/
│           ├── README.md                     # Catatan checkpoint Rules/operasi
│           ├── firestore.approved.rules      # Snapshot Rules approved pada paket ops
│           ├── firestore.prepublish-backup.rules # Snapshot prepublish backup
│           └── rules-checkpoint.json         # Metadata checkpoint/hash Rules
├── public/
│   ├── assets/aistudio/Logo_AR_CRM_dengan_Hub_Oranye_ce6dcc6a.png # Asset branding
│   ├── favicon.png                           # Favicon
│   ├── icon-192.png                          # Ikon PWA 192 px
│   ├── icon-512.png                          # Ikon PWA 512 px
│   ├── manifest.json                         # Manifest PWA
│   └── sw.js                                 # Service worker PWA
├── scripts/
│   ├── migrate_crm.py                        # Planner migrasi CSV offline/read-only; --apply ditolak
│   ├── patch-jwks-rsa-esm.cjs                # Patch compatibility postinstall yang guarded
│   └── run-firestore-staging.mjs             # Generator Rules staging sementara/emulator runner
├── src/
│   ├── App.tsx                               # Orkestrator state, subscription, operasi, shell, tab, modal
│   ├── accountPinClient.test.ts              # Tes client exchange/status/enrollment PIN
│   ├── accountPinClient.ts                   # Client endpoint PIN, ID token, custom-token exchange
│   ├── accountPinPolicy.test.ts             # Tes policy target server PIN
│   ├── accountPinPolicy.ts                  # Penentuan target yang memerlukan sesi PIN
│   ├── firebase.ts                           # Firebase Web, target guard, App Check, emulator, Auth/Firestore
│   ├── firebaseAppCheckPolicy.ts             # Policy site key dan error App Check staging
│   ├── firebaseDeploymentGuard.test.ts       # Tes fail-closed deployment target
│   ├── firebaseDeploymentGuard.ts            # Guard local/Preview/Production
│   ├── firebaseEmulatorMode.test.ts         # Tes emulator-only development
│   ├── firebaseEmulatorMode.ts              # Resolusi mode emulator
│   ├── firebaseRepository.ts                 # CRUD, transaksi, subscription, queue, reconciliation
│   ├── firebaseRulesBinding.test.ts          # Tes binding owner/workspace
│   ├── firebaseRulesBinding.ts              # Binding Rules environment
│   ├── index.css                             # Import Tailwind, palette, typography, scrollbar
│   ├── leadFinderAi.ts                       # Helper/client-side AI lead finder terkait UI
│   ├── localSecurityPolicy.test.ts           # Tes policy lock lokal
│   ├── localSecurityPolicy.ts                # Policy kapan SecurityVault lokal aktif
│   ├── main.tsx                              # Entry React, service worker production-only, AuthGate
│   ├── meetingSummary.ts                     # Generator/fallback summary lokal dan bounded parsing
│   ├── types/crm.ts                          # Kontrak Lead, Activity, GlobalLead, stage, metrics, queue
│   ├── components/
│   │   ├── AccountPinGate.tsx                # Form verify/enroll PIN account server
│   │   ├── ActivitiesListView.tsx            # Daftar/filter activity, summary, GPS link, acknowledgement
│   │   ├── ActivityLoggerModal.tsx            # Create/edit activity, GPS, consent, summary
│   │   ├── AndroidCodeExplorer.tsx            # Explorer/download contoh kode Kotlin
│   │   ├── AndroidFrame.tsx                   # Mock device/full canvas frame
│   │   ├── BottomNavBar.tsx                  # Navigasi Dashboard/Pipeline/Finder/Activities
│   │   ├── DashboardView.tsx                 # Metric, follow-up, stage distribution, quick actions
│   │   ├── FirebaseAuthGate.tsx              # Auth/startup/owner/PIN/queue blocking state
│   │   ├── GlobalLeadsView.tsx               # AI Finder, provenance, dedup, import
│   │   ├── LeadDetailModal.tsx                # Detail/edit lead, stage, actions, timeline
│   │   ├── PipelineKanbanView.tsx             # Kanban/list, filter, stage transitions, export
│   │   ├── QuickLeadModal.tsx                 # Form create lead dan normalisasi payload
│   │   ├── SecurityLockScreen.tsx             # Lock screen PIN/biometric lokal
│   │   ├── SecuritySettingsModal.tsx          # Konfigurasi/reset/lock SecurityVault lokal
│   │   ├── TopAppBar.tsx                      # Header, queue, retry, export, security, frame toggle
│   │   └── WhatsAppModal.tsx                  # Template, edit/copy, wa.me opener
│   ├── data/
│   │   ├── androidKotlinCode.ts               # String contoh proyek Android/Kotlin; referensi saja
│   │   └── gasCode.ts                          # String contoh Google Apps Script; tidak dieksekusi UI
│   ├── server/
│   │   ├── accountPinEnrollmentPolicy.ts      # Gate enrollment target/branch/flag
│   │   ├── accountPinEsmCompatibility.test.ts # Tes compatibility dependency
│   │   ├── accountPinFirebaseAdmin.ts         # Firebase Admin staging/Production WIF factory
│   │   ├── accountPinFirebaseDiagnostics.test.ts # Tes sanitasi diagnostics
│   │   ├── accountPinFirebaseDiagnostics.ts  # Diagnostics tanpa kebocoran detail sensitif
│   │   ├── accountPinFirestoreStore.ts        # Store credential/rate-limit/session server-only
│   │   ├── accountPinProductionFirebaseAdmin.test.ts # Tes binding Admin Production
│   │   ├── accountPinRuntimeDispatch.test.ts # Tes fail-closed runtime dispatch
│   │   ├── accountPinRuntimeDispatch.ts      # Pemilihan runtime target-specific
│   │   ├── accountPinVerification.test.ts    # Tes alur verify/enroll/session/rate limit
│   │   ├── accountPinVerification.ts         # Verifikasi token, PIN, session, custom token
│   │   ├── aiModel.ts                         # Model AI server terpusat dan invocation policy
│   │   ├── exportRoute.test.ts                # Tes HTTP route export
│   │   ├── firestoreSheetsExport.test.ts      # Tes service export Firestore→Sheets
│   │   ├── firestoreSheetsExport.ts           # Validasi fixed target/schema/upsert export
│   │   ├── googleExportAdapters.ts            # REST Firestore/Sheets dan service-account auth
│   │   ├── leadFinderQuota.test.ts            # Tes quota concurrency/reset
│   │   ├── leadFinderQuota.ts                 # Quota owner/UTC day berbasis transaksi
│   │   ├── leadFinderService.test.ts          # Tes parser/prompt/grounding contract
│   │   ├── leadFinderService.ts               # Service Lead Finder Gemini Search
│   │   ├── meetingSummarizer.test.ts          # Tes bounded summary/fallback
│   │   ├── meetingSummarizer.ts               # Service summarizer JSON tanpa web search
│   │   └── meetingSummarizerHttp.ts           # HTTP validation/gate summarizer
│   └── utils/
│       ├── aiLeadEnrichment.test.ts           # Tes helper enrichment AI
│       ├── aiLeadEnrichment.ts               # Helper enrichment/provenance UI
│       ├── appHistory.test.ts                # Tes parser/history modal/tab
│       ├── appHistory.ts                     # Browser history state allowlist/LIFO modal
│       ├── crmCalculations.test.ts           # Tes perhitungan metric/forecast/follow-up
│       ├── crmCalculations.ts                # Perhitungan dashboard CRM
│       ├── exportCsv.test.ts                # Tes quoting/formula injection CSV
│       ├── exportCsv.ts                      # Generator/download CSV browser
│       ├── idempotentFirestoreCreate.ts     # Create Firestore dengan reconciliation/idempotensi
│       ├── leadImportIdentity.test.ts        # Tes identitas import/dedup
│       ├── leadImportIdentity.ts             # Deterministic import identity
│       ├── leadProfileEdit.test.ts           # Tes profile edit allowlist/Won lock
│       ├── leadProfileEdit.ts                # Normalisasi/profile edit
│       ├── offlineOutbox.ts                  # IndexedDB AES-GCM durable outbox
│       ├── offlineWriteQueue.ts              # Lifecycle, replay, retry, correction, acknowledgement
│       ├── optimisticLeadProfiles.test.ts    # Tes optimistic profile overlay
│       ├── optimisticLeadProfiles.ts         # Overlay/reconcile profile
│       ├── optimisticLeadStages.test.ts      # Tes optimistic stage overlay
│       ├── optimisticLeadStages.ts           # Overlay/reconcile stage/follow-up
│       ├── ownerBootstrap.test.ts            # Tes origin/target bootstrap
│       ├── ownerBootstrap.ts                 # Guard bootstrap owner identity-only
│       ├── privacyBoundaries.test.ts         # Tes GPS/AI consent/privacy boundaries
│       ├── salesSafety.test.ts               # Tes stage finality/batas input
│       ├── salesSafety.ts                    # Validasi create/stage/Won safety
│       ├── securityLock.test.ts              # Tes PIN lokal/timeout/lockout
│       ├── securityLock.ts                   # SecurityVault browser-local
│       ├── syncQueue.test.ts                 # Tes legacy queue dan queue aktif terkait
│       └── syncQueue.ts                      # Legacy localStorage queue; processQueue no-op
├── tests/
│   └── accountPinFirestore.emulator.test.ts  # Tes Admin store/session/rate limit emulator
└── FULL_PROJECT_DOCUMENTATION.md             # Dokumen ini; dibuat setelah inventory commit
```

`FULL_PROJECT_DOCUMENTATION.md` adalah berkas baru yang diminta dan karenanya belum termasuk dalam inventory tracked commit saat inventory awal diambil. Setelah dokumen ini ditambahkan, status Git perlu diperiksa ulang sebelum commit/push apa pun.

### 8.1 Artefak yang tidak ada pada inventory

- Tidak ada `dist/` atau `build/` tracked. Keduanya adalah keluaran build yang seharusnya dibuat lokal/CI/deployment, bukan sumber yang dapat dijelaskan per file dari commit.
- Tidak ada `vercel.json`; jadwal Vercel Cron belum terbukti dikonfigurasi dari repo.
- Tidak ada `.github/` atau workflow CI tracked.
- `firestore.staging.rules` tidak tersedia meskipun `firebase.staging.json` merujuknya.
- Tidak ada dataset prospek statis pada `src/data/`; data prospek live berasal dari props/respons/runtime Firestore, bukan file data yang diaudit.

---

## 9. Konfigurasi dan environment

### 9.1 Prinsip umum

`.env.example` dan `.env.staging.example` adalah template. Nilai placeholder bukan bukti konfigurasi aktif. File lokal `.env.local`, `.env.staging.local`, Vercel environment, dan secret manager tidak boleh disalin ke dokumen, commit, screenshot, atau log.

Semua variabel `VITE_*` berpotensi masuk bundle browser. Jangan taruh private key, service-account JSON, token, PIN, pepper, password, atau credential admin pada variabel tersebut.

### 9.2 Kelompok client Firebase

Template mendefinisikan `VITE_FIREBASE_TARGET`, client Firebase Web config, `VITE_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY`, `VITE_FIREBASE_WORKSPACE_ID`, dan `VITE_FIREBASE_OWNER_UID`. Production client project yang dilaporkan pemilik adalah `ar-crm-73222`, tetapi nilai environment live tidak dibaca ulang dalam audit ini.

Local development diarahkan ke emulator. Staging memerlukan project non-production terpisah, site key staging, owner/workspace binding yang disetujui, dan App Check sebelum Auth/Firestore. Preview tidak boleh memakai project production.

### 9.3 Feature flags AI

Staging template memuat `VITE_AI_LEAD_FINDER_ENABLED` dan `VITE_AI_MEETING_SUMMARIZER_ENABLED`, default `false`. Server memakai flag counterpart yang tidak boleh diekspos sebagai `VITE_*`; keduanya harus cocok dengan target/approval. `GEMINI_API_KEY` server-only dan tidak boleh masuk bundle.

### 9.4 Account PIN server

Template staging mendokumentasikan flag enrollment, Admin project/service-account JSON, owner binding, dan pepper sebagai server-only. Tidak ada verifier PIN di environment; source menyebut verifier scrypt dibuat sekali pada dokumen Firestore Admin-only. Tidak ada reset endpoint yang terlihat.

Jangan menyalin nama/isi saved secret, PIN, token, UID, private key, atau reference rahasia ke dokumentasi ini.

### 9.5 Export Sheets

Kelompok server-only yang dibutuhkan secara desain mencakup project/workspace/owner fixed target, spreadsheet ID, tab name, service-account email/private key, dan cron bearer secret. Semua perlu scope server-only dan least privilege. Belum ada bukti jadwal, IAM, share access, atau target Sheet live aktif.

---

## 10. Scripts, development, dan build

| Perintah | Fungsi | Bukti/interpretasi |
|---|---|---|
| `npm run dev` | Menjalankan `tsx server.ts` | Server Express development; routing tidak identik dengan Vercel Functions |
| `npm run build` | `vite build` | Menghasilkan artefak `dist/`; build lokal dilaporkan lulus dengan warning bundle besar |
| `npm run preview` | `vite preview` | Preview hasil build Vite |
| `npm run clean` | Menghapus `dist` dan `server.js` | Operasi lokal, hati-hati dengan artefak yang belum diarsipkan |
| `npm install` / postinstall | Menjalankan patch guarded `scripts/patch-jwks-rsa-esm.cjs` | Compatibility patch dependency |
| `npm run lint` | `tsc --noEmit` | Pemeriksaan TypeScript; bukan lint style penuh |
| `npm test` | Menjalankan tes `src/*.test.ts` dan `src/**/*.test.ts` | Suite unit/integration lokal |
| `npm run test:firestore` | Firebase Emulator + Rules/Admin tests | Suite emulator terpisah |
| `npm run test:firestore:staging` | Wrapper staging/emulator | Membutuhkan environment/artefak staging privat; tidak otomatis berarti live test |
| `python scripts/migrate_crm.py` | Planner CSV offline/read-only | Schema, hash deterministik, quarantine/reconciliation; `--apply` ditolak |

Dependency utama mencakup React, Firebase Web/Admin/CLI, Vite, Express, `@google/genai`, `google-auth-library`, Vercel OIDC, Tailwind, TypeScript, `fake-indexeddb`, dan `tsx`. Tidak ada `engines` Node yang dideklarasikan pada `package.json`; runtime platform harus diverifikasi terpisah.

Tes dijalankan memakai Node.js built-in test runner (`node:test`) melalui `tsx --test`; tidak terdeteksi Vitest atau Jest pada manifest yang diaudit. Tidak ada GitHub Actions workflow terlacak di repo ini.

### 10.1 Hasil pengujian yang digunakan

Konteks pemilik melaporkan:

- `npm test`: 187 passed, 0 failed, 1 skipped.
- `npm run test:firestore`: Rules Emulator 20/20.
- TypeScript/lint lulus.
- Production build lulus.
- Bundle JavaScript sekitar 996 kB dan gzip sekitar 290 kB; melewati warning ambang Vite 500 kB.

Tes unit dan emulator memverifikasi kontrak sintetis: parser AI, quota, PIN, Rules, queue encryption/retry/dependency, optimistic overlay, finality Won, GPS/consent, history, CSV, deployment guard, dan client exchange. Itu bukan browser E2E, provider live, Vercel smoke test, Google Auth production, Firestore production CRUD, Sheets live, device matrix, atau backup/restore.

---

## 11. Deployment dan release practice

### 11.1 Local

Local development diarahkan ke emulator Auth/Firestore dan tidak boleh diam-diam berpindah ke project live. Owner bootstrap dibatasi ke loopback dan target yang diizinkan. Gunakan data sintetis pada emulator.

### 11.2 Preview/staging

Preview harus memakai target staging, project non-production, binding owner/workspace staging, App Check staging, dan server PIN/AI yang telah disetujui. Jangan menyamakan URL Preview, status Vercel READY, atau Google Sign-In dengan CRUD dan Rules staging yang telah terverifikasi.

`firebase.staging.json` merujuk file Rules staging yang tidak tracked. Wrapper dapat membuat Rules sementara untuk pengujian, tetapi itu bukan bukti Rules staging live telah diterbitkan.

### 11.3 Production

Production yang dilaporkan pemilik telah dideploy pada commit target dan alias `arcrmapp.vercel.app`. Tetap lakukan verifikasi terpisah untuk:

1. Vercel project, alias, commit, environment scope, dan build output.
2. Firebase Web config dan Authorized domains.
3. Rules aktif versus source/checkpoint yang disetujui.
4. Google Sign-In owner dan Account PIN session.
5. Lead create/read/update, activity create/read, stage Won/archive, dan reload.
6. App Check policy/enforcement bila diwajibkan.
7. Queue replay, logout dengan pending operation, multi-tab, storage eviction, dan device behavior.
8. Backup/restore/PITR dan rollback.
9. AI flags/quota/consent serta provider timeout handling.
10. Export Sheets, IAM, spreadsheet header, Cron, dan non-concurrency.

Jangan mengubah Rules, environment, domain, data Production, atau deployment hanya karena checklist lokal lulus. Setiap tindakan tersebut memerlukan approval terpisah.

---

## 12. Technical debt, unfinished gates, dan risiko prioritas

### P0 — Risiko akses/data yang harus ditutup sebelum mengandalkan CRM sebagai catatan tunggal

1. **Hosted CRUD penuh belum diverifikasi.** Pemilik melaporkan Google login, PIN, dan dashboard normal, tetapi audit tidak menguji create/update Lead, Activity, Won archive, reload, atau Rules acknowledgement di Production.
2. **Backup/restore/PITR belum dibuktikan.** Export Sheets satu arah bukan backup dan tidak menghapus orphan rows. Siapkan backup privat, checksum, restore drill, dan kriteria rollback.
3. **Parity Rules/App Check live belum dibaca ulang.** SHA Rules dilaporkan pemilik, bukan hasil pembacaan ulang layanan live dalam audit ini. Cocokkan source/checkpoint/Rules aktif secara read-only.
4. **Offline/storage recovery belum diuji pada perangkat nyata.** IndexedDB encrypted outbox bukan backup; storage eviction, crash, multi-tab, dan network transitions perlu uji terkontrol.
5. **PIN session dan environment target harus terus dipantau.** Pastikan endpoint Production benar-benar memakai runtime Production yang tepat, bukan guard Preview/Express yang berbeda.

### P1 — Risiko integrasi dan operasional

1. **AI live belum diverifikasi.** Search grounding, source freshness, provider quota, malformed response, prompt injection, dan timeout perlu smoke test dengan input non-sensitif.
2. **Notes dapat berisi PII saat dikirim ke provider.** Perlu kebijakan data, redaction bila diperlukan, retention review, dan komunikasi consent yang jelas.
3. **Export Sheets belum terjadwal/di-IAM-kan berdasarkan bukti repo.** `vercel.json` tidak ada; endpoint tidak boleh dianggap cron aktif.
4. **Express dan serverless memiliki perbedaan route summarizer.** Uji routing deployment aktual agar tidak terjadi false confidence dari `npm run dev`.
5. **Tidak ada CI workflow tracked.** Test, lint, build, dan audit harus dijadikan gate otomatis atau prosedur release terdokumentasi.
6. **Issue staging reCAPTCHA Enterprise HTTP 403 (Issue #2, laporan pada brief tugas).** Tidak ditemukan tiket atau catatan yang cocok pada dokumen repo yang diaudit; reproduksi, penyebab, dan status perbaikannya unknown. Verifikasi ulang pada Preview staging sebelum menganggapnya masih terjadi atau telah selesai. App Check staging enforcement juga belum diverifikasi live.

### P2 — Maintainability dan performance

1. Bundle utama sekitar 996 kB, melewati warning Vite; evaluasi code splitting, lazy modal/tab, dan asset budget.
2. Legacy `syncQueue`/`CrmStorage` masih ada dan processQueue no-op; dokumentasikan owner migrasi atau hapus setelah bukti tidak ada dependensi.
3. Dokumentasi offline menyebut tiga operasi durable, sedangkan kode mendukung profile update; selaraskan kontrak docs dan tests.
4. Staging Rules file tidak tracked; perjelas sumber generator dan lifecycle artefak privat.
5. History, Android mock, contoh GAS, dan contoh Kotlin perlu label UI yang konsisten sebagai reference/demo agar tidak disalahartikan sebagai runtime.
6. Review dependency/tooling dan Node runtime tetap diperlukan; hasil audit ini tidak mengklaim advisories live atau compatibility seluruh platform.

---

## 13. Roadmap pengembangan yang aman

Roadmap berikut adalah rekomendasi, bukan klaim bahwa pekerjaan telah dilakukan.

1. **Production smoke gate:** verifikasi read-only konfigurasi, login owner, PIN session, create/read/update Lead sintetis yang disetujui, Activity, stage Won/archive, dan cleanup yang sesuai Rules.
2. **Recovery gate:** jalankan backup dan restore drill pada project/salinan yang disetujui; dokumentasikan RPO/RTO, checksum, retention, dan rollback.
3. **Queue/device gate:** uji Chrome/Android/iOS/Safari yang relevan untuk reconnect, reload, crash, multi-tab, storage eviction, logout, dan replay manual tanpa duplikasi.
4. **Security gate:** parity Rules, App Check, Authorized domains, CSP/origin/proxy header, rate-limit multi-instance, session expiry/revoke, dan audit IAM least privilege.
5. **AI governance:** confirm flag per environment, quota/error/refund policy, provider data handling, PII redaction decision, provenance review, dan prompt-injection test.
6. **Export operations:** buat spreadsheet khusus, service account read-only Firestore/edit-only Sheet, header contract, Cron schedule harian, no-concurrent-run policy, monitoring, dan orphan-row reconciliation manual.
7. **CI/release:** tambahkan workflow yang menjalankan unit test, Rules Emulator, TypeScript, build, bundle budget, secret scan, dan artifact provenance sebelum deployment.
8. **Performance:** lazy-load views/modal, review bundle, PWA cache policy, dan observability untuk queue/latency/error tanpa menyimpan payload sensitif.
9. **Data migration:** jangan apply tanpa source legacy yang disetujui. Jalankan inventory read-only, dry-run, deterministic mapping, quarantine, reconciliation, approval terikat checksum, dan rollback plan.
10. **Multi-user decision:** bila kebutuhan berubah dari solo owner ke tim, desain ulang workspace/member roles, Rules, query/index, audit log, conflict resolution, dan UI sebelum memperluas scope.

### 13.1 Fitur produk masa depan (belum diimplementasikan)

- **WhatsApp Gateway** untuk follow-up otomatis; fitur saat ini hanya membuka `wa.me` atau menyiapkan pesan, bukan mengirim otomatis.
- **Analytics Dashboard** untuk performa sales mingguan dan bulanan di atas metrik dashboard saat ini.
- **Multi-workspace support** untuk tim sales, setelah model owner tunggal dan Firestore Rules dirancang ulang.
- **Sinkronisasi kalender** untuk agenda dan pengingat follow-up.

---

## 14. Checklist verifikasi berurutan untuk pengembang/operator

1. Pastikan branch/commit yang akan diverifikasi tepat dan working tree bersih.
2. Jalankan `npm test`, `npm run lint`, `npm run build`, dan `npm run test:firestore`; simpan hanya hasil/status, bukan env/secret.
3. Pastikan build tidak mengandung marker private key, service-account JSON, pepper, token, atau API key.
4. Cocokkan Vercel deployment dengan commit target dan periksa scope environment tanpa menyalin nilai.
5. Cocokkan Firebase project, Auth Authorized domains, Web App config, workspace, owner binding, Rules aktif, dan indexes secara privat.
6. Uji Google Sign-In dan PIN account sesuai prosedur owner, tanpa mencoba brute force atau mengubah policy.
7. Uji CRUD minimal pada data yang memang disetujui untuk Production: create Lead bukan Won, update stage/profile, create Activity, GPS opsional, dan reconciliation setelah reload.
8. Uji transaksi menuju Closing Won dan pastikan archive matching, finality, serta tidak ada delete yang tidak disengaja.
9. Periksa queue: queued versus acknowledged, transient/permanent failure, manual replay, dependency Lead→Activity, logout pending, dan pemulihan scope.
10. Uji AI hanya dengan data non-sensitif; pastikan consent, flags, quota, source provenance, malformed/error handling, dan jalur serverless yang benar.
11. Jika export diperlukan, verifikasi service account/IAM/Sheet/header/Cron dan lakukan satu run non-concurrent yang dapat direkonsiliasi.
12. Lakukan backup/restore drill dan dokumentasikan hasil sebelum menjadikan Firestore satu-satunya catatan operasional.
13. Tinjau warning bundle dan lakukan release review; jangan menganggap HTTP 200 atau Vercel READY sebagai bukti fitur bisnis lengkap.
14. Catat hasil `pass/fail/unknown`, waktu WIB, commit, environment, dan artefak checksum tanpa menyimpan secret, token, PIN, email, phone, atau data pelanggan.

---

## 15. Referensi repository

- [App orchestrator](src/App.tsx)
- [Firebase startup](src/firebase.ts)
- [Firebase repository](src/firebaseRepository.ts)
- [CRM types](src/types/crm.ts)
- [Firestore Rules](firestore.rules)
- [Package scripts](package.json)
- [Offline queue design](docs/OFFLINE_QUEUE_DESIGN.md)
- [Firestore→Sheets export contract](docs/FIRESTORE_TO_SHEETS_EXPORT.md)
- [Production cutover checklist](docs/PRODUCTION_CUTOVER_MANUAL_CHECKLIST_DRAFT.md)
- [AI readiness](docs/AI_LEAD_FINDER_READINESS.md)
- [PIN readiness](docs/ACCOUNT_PIN_CROSS_DEVICE_READINESS.md)
- [Migration runbook](docs/OWNER_BOOTSTRAP_AND_DATA_MIGRATION_RUNBOOK.md)
- [Rules checkpoint package](ops/production/2026-11-01/README.md)

## Kesimpulan

AR CRM pada commit `031366eb532d24d1c0370518a666e15b35882607` memiliki UI React yang substantif, Firestore/Auth dengan boundary owner/workspace, Account PIN server, AI yang digate, optimistic CRM workflow, durable encrypted outbox, export CSV, dan desain export Sheets satu arah. Pemilik melaporkan deployment Production READY serta login/PIN/dashboard normal pada 1 November 2026.

Namun source dan tes lokal tidak membuktikan seluruh runtime cloud. Hosted CRUD penuh, Rules/App Check live parity, backup/restore/PITR, offline/device/storage behavior, AI provider behavior, Cron/IAM Sheets, dan rollback tetap harus diperlakukan sebagai gate verifikasi. Untuk pemakaian harian yang aman, ikuti checklist berurutan di atas dan pertahankan pemisahan antara fakta source, laporan deployment, dan status yang masih unknown.
