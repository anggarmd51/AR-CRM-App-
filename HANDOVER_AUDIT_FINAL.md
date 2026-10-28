# AR CRM — Audit Final & Handover Package

**Tanggal:** 28 Oktober 2026 (WIB)
**Branch lokal:** `cue/firebase-stabilization`
**Status singkat:** **Belum Staging Ready; Production Gate tertutup.** Tes lokal lulus, tetapi pemeriksaan kode menemukan blocker runtime dan aturan keamanan yang belum layak dilepas.

## 1. Executive Summary

Kandidat lokal AR CRM memiliki fondasi fitur dan tes yang cukup luas: 152 unit test lulus, 17 tes Firestore Rules Emulator lulus, lint/type-check dan build juga lulus. Namun, hasil tersebut **tidak** membuktikan kesiapan hosted Preview atau Production. Review statis menemukan tiga handler Account PIN memakai identifier response yang tidak didefinisikan, aturan pembuatan arsip Deal Won tidak mengharuskan transisi status pada transaksi yang sama, dan service worker menerapkan cache ke hampir semua GET same-origin. Ada pula mismatch gate AI antara UI dan endpoint Production.

Karena ada blocker tersebut dan working tree berisi perubahan kode yang belum dikunci, saya **tidak membuat commit** atas kandidat ini. Tidak ada push, merge, deploy, perubahan cloud Firebase/Vercel, atau penulisan data CRM. Working tree dipertahankan agar pekerjaan lokal tidak hilang; laporan ini sendiri juga belum di-commit.

**Penilaian kesiapan:**

- **Staging:** Belum siap untuk uji hosted sign-in/CRUD. Belum ada verifikasi hosted; bug handler PIN dapat menggagalkan alur endpoint.
- **Production:** Tidak siap. Perbaiki blocker di bawah, jalankan ulang tes pada snapshot yang sama, lalu selesaikan backup/restore dan validasi hosted yang disetujui sebelum membuka gate.

## 2. Repo & Commit History State

- Branch aktif: `cue/firebase-stabilization`.
- HEAD: `849887855a9fbe8ee6b514dbee6a0795496b3648` — `feat(export): add gated Firestore-to-Sheets export and migration readiness docs`.
- Lima commit terakhir: `8498878` (Sheets export/readiness), `9b93538` (state/hardening docs), `ac90bd6` (modal history/calendar/outbox fixes), `a6670b8` (hardening state), `d7c8bcc` (durable encrypted offline outbox).
- Sebelum laporan ini dibuat: 31 file tracked berubah, 40 file untracked, dan tidak ada staged changes. Laporan ini menambah satu file untracked. Working tree **tidak bersih**.
- Tidak ada commit baru karena review menemukan defect High pada endpoint PIN dan blocker lain. Jangan menafsirkan HEAD sebagai snapshot dari seluruh kode yang dites; perubahan working tree belum ada di Git history.
- `.env.local` dan `.env.staging.local` tetap terabaikan dan tidak tracked. Nilai env tidak dicetak atau disalin ke laporan; untuk sanitasi, nilai template dibandingkan secara equality-only dengan konfigurasi lokal guna memastikan contoh tidak mengulang konfigurasi staging.
- `.env.staging.example` telah disanitasi: tujuh nilai konfigurasi Firebase diganti placeholder eksplisit. `.firebaserc.example` memakai placeholder dan JSON valid. Konfigurasi contoh tidak berisi nilai asli yang dibutuhkan untuk menjalankan staging.
- Pemindaian pola credential pada working tree dan 14 commit terjangkau tidak menemukan token/private key aktual yang cocok dengan pola umum. Dua kecocokan yang ditinjau adalah marker `PRIVATE KEY` dalam validator PEM di `src/server/firestoreSheetsExport.ts` dan URL kredensial sengaja sebagai fixture penolakan di `src/server/leadFinderService.test.ts`; bukan credential. Pemindaian ini berbasis pola, bukan jaminan terhadap semua format secret.
- Rules Emulator mengubah `firestore-debug.log` yang diabaikan Git: ukurannya tercatat 308.353 byte sebelum tes dan 301.991 byte sesudahnya. File tidak dipulihkan atau ditimpa karena tidak ada salinan awal yang tersedia; jangan masukkan log itu ke Git.

## 3. Fitur Terverifikasi & Hardened (Completed)

Fitur berikut tersedia pada kode lokal dan memiliki pengujian/implementasi terkait. Keterangan ini **bukan** klaim bahwa fitur sudah teruji live di Preview atau Production.

- **Dashboard, Pipeline, Lead Finder, dan Activity:** UI dan alur inti tersedia. Pengujian lokal mencakup kalkulasi CRM, identitas saat impor lead, optimistic stage update, aktivitas, dan service terkait. Lead Finder AI masih gated; grounding/citation dan pemakaian hosted belum diverifikasi end-to-end.
- **Offline outbox:** menggunakan IndexedDB dan payload tertunda dienkripsi AES-GCM. Allowlist/validasi payload serta alur pemulihan dan sinkronisasi manual diuji. Ini bukan bukti bahwa seluruh data CRM lokal atau Firestore terenkripsi oleh aplikasi.
- **Modal history:** mekanisme navigasi modal LIFO tersedia dan tercakup tes.
- **Validasi kalender:** validasi tanggal nyata, termasuk kasus kalender/tahun kabisat, tersedia pada jalur client/rules dan tercakup tes.
- **Firestore owner/workspace dan Account PIN:** aturan serta alur server-side tersedia dan Rules Emulator lulus 17/17, tetapi defect arsip dan bug endpoint PIN di bawah masih harus ditutup. Jangan anggap autentikasi/PIN sudah siap operasi.
- **Sheets export dan AI:** memiliki gate/default-off atau pembatasan target. Keberadaan gate tidak membuktikan konfigurasi IAM, scheduler, kuota, atau operasi hosted telah benar.

## 4. Hasil Verifikasi Teknis (Test Metrics)

Semua hasil berikut dijalankan lokal terhadap working tree pada 28 Oktober 2026.

| Pemeriksaan | Hasil aktual |
|---|---:|
| `npm test` | 153 total; 152 lulus, 0 gagal, 1 dilewati |
| `npm run test:firestore` | 17/17 lulus |
| `npm run lint` | Lulus (`tsc --noEmit`) |
| `npx --no-install tsc --noEmit` | Lulus |
| `npm run build` | Lulus; Vite JS 984,63 kB (gzip 288,23 kB), peringatan chunk >500 kB |
| `git diff --check` | Lulus |
| `npm audit` | 5 Moderate, 0 High, 0 Critical |
| `npm audit --omit=dev` | 0 advisori |

Lima advisori saat ini Moderate berada pada dependency/tooling, termasuk `firebase-tools`, `@google-cloud/pubsub`, `@opentelemetry/core`, `gaxios`, dan `uuid`. `@grpc/grpc-js` terpasang sebagai dependency transitif, tetapi tidak muncul dalam daftar paket rentan saat pemeriksaan ini. Ini adalah snapshot audit, bukan jaminan advisori tidak berubah. Type-check yang lulus juga tidak menangkap identifier runtime tak terdefinisi karena konfigurasi TypeScript yang digunakan; handler API perlu tes langsung.

## 5. Temuan Audit & Pending Checklist for Next AI

### Blocker yang harus dibereskan sebelum staging

1. **High — endpoint Account PIN memakai `response` yang tidak didefinisikan.** `api/account-pin/enroll.ts`, `status.ts`, dan `verify.ts` menerima parameter bernama `resp` tetapi memanggil helper dengan `response`, termasuk di jalur error. Ini dapat melempar `ReferenceError` alih-alih mengembalikan respons. Perbaiki konsistensi nama, lalu tambah handler-level tests untuk metode/content-type salah, sukses, dan error layanan.
2. **Medium — arsip Deal Won tidak diwajibkan terjadi bersama transisi stage.** Aturan `firestore.rules` mengizinkan pembuatan `wonDealArchives/{leadId}` selama lead sudah `Closing Won` setelah operasi; aturan tidak membuktikan bahwa status berubah dari bukan `Closing Won` pada transaksi yang sama. Perketat pemeriksaan keadaan sebelum/sesudah dan tambah tes untuk create langsung/duplikat setelah lead telah Won.
3. **Medium — cache service worker terlalu luas.** `public/sw.js` menerapkan cache-first/background refresh pada hampir semua GET same-origin kecuali navigasi dan `/api/`. Batasi cache ke aset statis yang dikenal dan bypass route/data yang dapat berisi informasi khusus pengguna.
4. **Medium — AI UI dapat terlihat aktif di Production sementara endpoint menolak Production.** Feature flag client dapat menampilkan kontrol, tetapi kedua endpoint AI masih Preview/staging-only dan mengembalikan 404 pada target Production. Sembunyikan kontrol pada target yang tidak didukung, atau implementasikan jalur Production yang sengaja diizinkan dan diuji; jangan mengaktifkan AI di Production sebelum keputusan privasi/biaya.
5. **Medium — prompt injection/data trust pada AI.** Kriteria Lead Finder dan catatan rapat diinterpolasi langsung ke instruksi model. Pisahkan data pengguna sebagai input tak tepercaya, validasi keterkaitan klaim dengan sumber/cuplikan, dan pertahankan tinjauan manusia sebelum menyimpan hasil.
6. **Medium — kuota AI dapat habis oleh request yang gagal.** Pemakaian harian direservasi sebelum panggilan provider dan tidak dikembalikan pada kegagalan. Tetapkan kebijakan retry/refund atau pisahkan penghitung attempt dan pemakaian provider, lalu uji timeout/error.
7. **Medium — runtime Node belum dipatok.** Dependency server baru memerlukan Node >=22 (`firebase-admin`) dan >=20 (`@vercel/oidc`), tetapi `package.json` tidak mendeklarasikan engine. Tetapkan dan verifikasi runtime deployment yang kompatibel sebelum hosted release.

### Gate operasi dan pekerjaan lanjutan

- [ ] **Hosted auth/CRUD:** uji Google Sign-In dan CRUD Lead/Activity dengan data sintetis pada Preview terisolasi; Production hanya setelah gate dan otorisasi terpisah. Periksa PIN, logout/login ulang, sesi kedaluwarsa, reload, offline/reconnect, dan pencegahan duplikasi.
- [ ] **Backup/restore Firestore:** dokumentasikan backup, retensi, kontrol akses, checksum, dan kunci pemulihan; lakukan restore drill pada project terpisah sebelum migrasi/cutover. Ekspor Sheets bukan backup/restore.
- [ ] **Dependency triage:** saat audit ini tidak ada High dan `@grpc/grpc-js` tidak dilaporkan rentan; tinjau lima Moderate tooling satu per satu dan ulangi audit sebelum rilis. Hindari upgrade major otomatis tanpa tes.
- [ ] **App Check Production:** pastikan konfigurasi dan metrik monitor, lalu lakukan enforcement bertahap hanya setelah pemulihan login owner terbukti.
- [ ] **Sheets export:** pertahankan gate sampai IAM, spreadsheet, cron, concurrency/idempotency, dan perilaku stale rows diuji. Jangan menganggap source code sebagai bukti konfigurasi hosted.
- [ ] **AI:** tetapkan consent, data yang boleh dikirim, retensi/provider, redaksi, kuota/biaya, serta target environment; pertahankan default-off sampai seluruh alur diperbaiki.
- [ ] **Staging runner/config:** `firebase.staging.json` menunjuk rules file yang dibuat sementara oleh wrapper dan diabaikan Git. Jalankan melalui wrapper yang diperiksa; jangan memakai file staging config langsung dengan fallback rules yang tidak diverifikasi.
- [ ] **Dokumentasi/CI/performa:** rekonsiliasi angka tes dan status advisory lama pada dokumen readiness, sertakan tanggal/commit/command; tambah CI untuk tes, Rules Emulator, type-check, lint, build, audit; pecah bundle yang saat ini >500 kB.

## 6. Panduan Memulai untuk AI Selanjutnya (Next AI Instructions)

1. Mulai di `/workspace/ar-crm`; pastikan branch `cue/firebase-stabilization` dan baca `HANDOVER_AUDIT_FINAL.md` serta dokumen readiness terkait. Perubahan working tree adalah konteks kerja yang belum di-commit—jangan reset, checkout, stash, atau hapus secara massal.
2. Perbaiki blocker dengan diff kecil dan tes regresi terlebih dahulu. Jangan deploy, push, mengubah Firebase/Vercel, menulis data Production, atau mengaktifkan AI/App Check/Sheets tanpa otorisasi yang sesuai.
3. Sebelum dan sesudah perubahan, jalankan:

   ```bash
   git status --short --branch
   git log -5 --oneline
   npm test
   npm run test:firestore
   npm run lint
   npx --no-install tsc --noEmit
   npm run build
   npm audit
   npm audit --omit=dev
   git diff --check
   ```

4. `npm run test:firestore` memakai emulator lokal dan dapat mengubah `firestore-debug.log`; file itu adalah log lokal yang diabaikan Git, jangan stage atau pulihkan tanpa salinan yang diketahui. Jangan gunakan `git add .`; review dan stage daftar file yang eksplisit, jalankan scan secret lagi, lalu commit hanya jika blocker tertutup dan snapshot tes/commit sama.
5. Jangan menyebut staging/Production siap berdasarkan emulator atau build lokal. Hosted Google Sign-In, CRUD, backup/restore, App Check, dan gate Sheets tetap perlu bukti terpisah.

---

**Batas bukti:** audit ini memeriksa source/working tree lokal dan menjalankan suite lokal. Tidak dilakukan browser test hosted, verifikasi Firestore cloud, backup/restore, deploy, push, merge, atau CRUD Production. File konfigurasi env lokal tidak ditampilkan atau disalin ke laporan; pemeriksaan dibatasi pada status Git dan perbandingan equality-only untuk sanitasi template.
