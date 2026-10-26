# PROJECT STATE & ARCHITECTURAL SPECIFICATION
## AR Personal CRM Enterprise (Solo Account Manager Edition)

> **Document Version:** 2.2.1 (Dynamic PIN Length & Vault Synchronization Edition)  
> **Status:** Hardening lokal dan pemeriksaan yang diminta lulus; project tetap belum siap dirilis/cutover. Empat temuan high pada jalur dependency production belum terselesaikan dan menjadi blocker rilis, selain gate staging, konfigurasi Vercel, App Check Console, backup/restore, migrasi, dan verifikasi live.
> **URL production terakhir tercatat (status live saat ini belum diperiksa):** [https://arcrmapp.vercel.app/](https://arcrmapp.vercel.app/)
> **Author & Architect:** Lead Full-Stack Software Architect & UI/UX State Specialist  
> **Last Updated:** 26 Oktober 2026, 23:56 WIB
> **Target Platform:** Offline-First Progressive Web App (PWA) & Native Android (Jetpack Compose / Room DB)

> **Catatan sumber kebenaran:** bagian arsitektur v2.2.1 di bawah adalah dokumentasi historis. Pembaruan implementasi setelah baseline audit di bawah adalah status terbaru checkout lokal; bagian audit 20:59 WIB diberi label historis dan memuat temuan sebelum hardening ini. Branch `cue/firebase-stabilization` memakai Firebase Auth/Firestore untuk Leads/Activities dan tidak mengimpor data lama secara otomatis. Catatan cloud dan artefak release adalah last-known evidence, bukan verifikasi live baru. Data operasional belum dimigrasikan; jangan memakai spreadsheet lama yang dikosongkan sebagai sumber.

## Pembaruan implementasi setelah audit — 26 Oktober 2026, 23:56 WIB

**Status lokal:** hardening telah diverifikasi dan sedang disiapkan untuk commit lokal di branch `cue/firebase-stabilization`. Tidak ada push, merge, deploy, akses Firebase/Vercel production, atau perubahan Rules/Console. HEAD sebelum commit task ini adalah `de0e164`.

- Outbox antrean IndexedDB menyimpan payload business-only yang di-allowlist dan dienkripsi AES-GCM, dipartisi per owner/workspace; tidak ada fallback `localStorage`. Payload dibersihkan setelah acknowledgement server. UI menunjukkan queued/syncing/acknowledged/failed, retry dan koreksi payload; dependency lead→activity dipertahankan. Create ber-ID tetap memakai rekonsiliasi server yang membandingkan seluruh field bisnis/owner. Batas XSS/origin, metadata, serta pemulihan browser dijelaskan di [`OFFLINE_QUEUE_DESIGN.md`](docs/OFFLINE_QUEUE_DESIGN.md).
- App Check staging melakukan preflight token dan fail-closed sebelum Auth/Firestore; guard memvalidasi target hosted, pola ID staging `ar-crm-staging-<suffix>` dan exact allowlist. Tidak ada project/site key/environment staging yang diprovisikan atau diuji live; production dan Rules/Console tidak diubah.
- **Verifikasi lokal:** `npm test` **74 lulus, 0 gagal**; `npm run lint` **lulus**; `npx tsc --noEmit` **lulus**; `npm run build` **lulus**; Firestore Rules Emulator **12 lulus, 0 gagal**; `git diff --check` **lulus**. Rules suite dijalankan langsung terhadap emulator sintetis lokal yang sudah aktif di `127.0.0.1:8080`; emulator tidak dihentikan. Build menghasilkan warning Vite tentang `__dirname` (rencana config loader native) dan chunk JavaScript **950,41 kB** (ambang warning 500 kB).
- **Triase dependency segar:** `npm audit --json` menunjukkan **10 package terdampak: 5 moderate, 5 high, 0 critical**; `npm audit --omit=dev --json` menunjukkan **4 package high production, 0 moderate**. Paket berbeda pada tabel bisa berbagi advisory transitive yang sama.

| Paket/versi terkunci | Severity / jenis | Path dan rentang upstream terdampak → fixed |
|---|---|---|
| `firebase@12.19.0` | High, direct production | `firebase → @firebase/firestore@4.17.2 → @grpc/grpc-js@1.9.16`; gRPC `<=1.13.5` (juga `1.14.0–1.14.4`) → `1.13.6` atau `1.14.5`; [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j). |
| `@firebase/firestore@4.17.2` | High, transitive production | Path gRPC yang sama; versi gRPC terkunci Firestore `~1.9.0`, sehingga fixed `1.13.6+` di luar rentang. |
| `@firebase/firestore-compat@0.4.14` | High, transitive production | `firebase → firestore-compat → firestore → @grpc/grpc-js@1.9.16`; sama dengan advisory/rentang gRPC di atas. |
| `@grpc/grpc-js@1.9.16` | High, transitive production | `firebase → @firebase/firestore → @grpc/grpc-js`; fixed `1.13.6`/`1.14.5`. Audit juga mengaitkan [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4) (advisory upstream berseverity Low; sanitasi error handler gRPC server). |
| `@firebase/rules-unit-testing@5.0.2` | High, direct dev/test | `rules-unit-testing → firebase@12.19.0 → firestore → @grpc/grpc-js@1.9.16`; inherited gRPC advisory/fixed versions di atas. |
| `firebase-tools@15.34.1` | Moderate, direct dev | Nested path Pub/Sub→OpenTelemetry (`<2.8.0` → `2.8.0`) serta `gaxios@6.7.1 → uuid@9.0.1` (`<11.1.1` → `11.1.1`, `12.0.1`, atau `13.0.1`); lihat GHSA di baris terkait. |
| `@google-cloud/pubsub@5.3.1` | Moderate, transitive dev | `firebase-tools → pubsub → @opentelemetry/core@1.30.1`; affected `<2.8.0`, fixed `2.8.0`; [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf). Pub/Sub 5 membatasi dependency ke `^1.30.1`; Pub/Sub 6.3.1 menggunakan core `^2.8.0` (major). |
| `@opentelemetry/core@1.30.1` | Moderate, transitive dev | `firebase-tools → pubsub → core`; affected `<2.8.0`, fixed `2.8.0`; [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf). |
| `gaxios@6.7.1` | Moderate, nested dev | `firebase-tools → gaxios → uuid@9.0.1`; dipropagasi oleh rentang UUID di advisory [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). |
| `uuid@9.0.1` | Moderate, transitive dev | `firebase-tools → gaxios@6.7.1 → uuid`; audit affected `<11.1.1`, upstream patched `11.1.1`, `12.0.1`, `13.0.1`; [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). gaxios 6 membatasi `uuid ^9.0.1`. |

Tidak ada upgrade aman dalam rentang manifest/lock saat ini yang didukung bukti. `@firebase/firestore@4.19.0` terbaru yang diperiksa masih mendeklarasikan `@grpc/grpc-js ~1.9.0`; Firebase terbaru `13.1.0` adalah major, sedangkan root memakai `^12.19.0`. `npm audit fix --dry-run --json` tidak mengubah dependency (0 added/removed/changed); proposal audit adalah major/downgrade (`firebase@9.14.0`, `firebase-tools@14.23.0`, `@firebase/rules-unit-testing@2.0.7`) dan tidak diterapkan. Tidak ada override/upgrade transitif berisiko atau `--force`.

Empat finding production di atas **blocker rilis yang belum terselesaikan**. Untuk advisory gRPC, upstream menyebut `requireClientCertificate: true` hanya bila server memakai konfigurasi `getAuthContext` terkait, dan top-level error handler untuk menyaring pesan; ini bukan bukti mitigasi untuk transitive dependency di sini. Tindak lanjut: tunggu/periksa pembaruan Firebase/Firestore yang mengizinkan gRPC fixed version, atau rancang override eksplisit dengan uji kompatibilitas penuh; audit ulang sebelum release.

Hasil ini **tidak** membuktikan crash/reload behavior seluruh browser, provisioning staging, metrik/enforcement App Check Console, backup/restore, migrasi data, atau readiness production/cutover. Advisory high production tetap memblokir release sampai terselesaikan dan diverifikasi; jangan klaim project production-safe. Commit lokal hardening akan dicatat setelah hash tersedia; tidak ada push/merge/deploy.

## Baseline audit sebelum hardening — 26 Oktober 2026, 20:59 WIB (historis)

Catatan di bagian ini merekam temuan sebelum perubahan antrean durable, App Check, dan strict staging allowlist pada working tree saat ini. Angka test, daftar file, serta gap yang menyebut queue in-memory atau error startup App Check adalah baseline historis; gunakan pembaruan 23:56 WIB di atas untuk status terbaru.

### Keputusan dan cakupan

**Status baseline: audit lokal lulus; belum siap dinyatakan 100% production/cutover.** Environment Vercel/Firebase live tidak diperiksa ulang, project staging dan App Check belum dibuktikan siap, data lama belum dimigrasikan/di-backup, dan pada baseline ini antrean offline belum tahan reload/penutupan tab.

- Repository: `/workspace/ar-crm`; branch `cue/firebase-stabilization`; HEAD `de0e164a64b2ed1d6514ffbc3197c7a42e55250a`. Local tracking ref `origin/cue/firebase-stabilization` yang tersedia di checkout sama dengan HEAD; tidak dilakukan fetch jaringan.
- Sebelum pembaruan status ini, working tree sudah memuat 14 file tracked yang berubah dan 13 file untracked. Perubahan-perubahan tersebut dipertahankan. Dalam tugas ini hanya `PROJECT_STATE.md` yang diperbarui; tidak ada perubahan kode aplikasi, staging, commit, push, merge, atau deploy.
- Audit memakai source, dokumentasi, test sintetis, emulator lokal, dan build lokal. `.env.local`/nilai secret, data CRM production, serta Firebase/Vercel Console tidak dibaca. Tidak ada operasi terhadap environment production.

### Hasil verifikasi yang dijalankan

| Pemeriksaan | Hasil | Batas bukti |
|---|---|---|
| `npm test` | **64 lulus, 0 gagal** | Unit test lokal pada working tree; bukan uji browser end-to-end atau uji layanan live. |
| Firestore Rules Emulator | **11 lulus, 0 gagal** | Project sintetis `demo-ar-crm-rules`, port Firestore lokal alternatif `18181`; konfigurasi sementara menunjuk Rules repository secara eksplisit. Tidak menyentuh Firebase production. |
| `npm run lint` (`tsc --noEmit`) | **Lulus** | Pemeriksaan TypeScript lokal. |
| Vite production build | **Lulus** di direktori sementara `/tmp` | Peringatan: `__dirname` pada Vite config tidak kompatibel dengan rencana config loader native ke depan; chunk JS **924,72 kB** melewati ambang peringatan 500 kB. Build output tidak mendeteksi pola `BEGIN PRIVATE KEY`, `serviceAccountPrivateKey`, `CRON_SECRET`, atau `GOOGLE_SHEETS_SPREADSHEET_ID`; scan ini bukan pengganti audit semua konfigurasi. `VITE_*` adalah nilai client/public dan tidak boleh memuat secret. |
| `git diff --check` | **Lulus setelah pembaruan status** | Dijalankan ulang setelah edit; tidak ada whitespace error. |

### Temuan terkonfirmasi

- **Pipeline:** `src/utils/crmCalculations.ts:42-72` tetap menghitung jumlah setiap stage, mengecualikan `Closing Lost` dari `totalPipelineValue`, `activeValue`, dan weighted pipeline, serta memasukkan Won/Lost pada denominator win rate. Test pipeline terkait termasuk dalam 64 test lulus. Untuk data dengan stage valid yang diterima Rules, kalkulasi ini konsisten. Dashboard menghitung nilai aktif yang juga mencakup `Meeting`, walaupun label UI `In Prospect / Negot.` di `src/components/DashboardView.tsx:120-130` tidak menyebut Meeting.
- **Antrean offline:** `OfflineWriteQueue` (`src/utils/syncQueue.ts:476-647`) membedakan `pending/syncing/failed`, menahan duplikasi operasi yang sedang in-flight, membolehkan retry manual, tidak memutar ulang penolakan permanen saat reconnect, dan menyamarkan pesan error. Test meliputi offline→online, kegagalan sementara/permanen, retry, dan deduplikasi. Metadata operasi dan closure retry hanya disimpan di `Map` memori halaman; Firestore memakai cache memori default, bukan IndexedDB persisten. UI memperingatkan bahwa pending operation tidak dijamin pulih setelah reload atau tab ditutup.
- **Semantik penyimpanan:** `src/firebaseRepository.ts:27-31,80-114` memasukkan operasi ke antrean dan mengembalikan ID/resolve sebelum acknowledgement server; rejection selanjutnya ditampilkan melalui status antrean, bukan hasil `await` pada caller. Toast menyatakan operasi “masuk antrean”, bukan sudah committed. Karena itu status UI antrean harus diperiksa sampai acknowledged; caller belum dapat memperlakukan `await createLead/createActivity/updateLeadStage` sebagai bukti commit server.
- **Firestore Rules lokal:** `firestore.rules:5-23,29-53,71-121` mengunci owner dan workspace, membership, schema ketat, owner scope, relasi Activity→Lead, update allowlist, larangan delete dan deny-by-default untuk koleksi lain. Rules test sintetis mencakup unauthorized/non-owner, workspace tambahan/keliru, query tanpa filter owner, schema/field tampering, activity orphan/cross-workspace dan delete. Hasil ini membuktikan file lokal di emulator, bukan konfigurasi live.
- **Auth dan emulator:** `FirebaseAuthGate` (`src/components/FirebaseAuthGate.tsx:45-73`) menahan UI sampai Auth siap, menolak workspace/owner mismatch dan UID non-owner; `src/firebaseEmulatorMode.ts` memastikan development memakai Auth/Firestore Emulator. Sign-in Google non-owner masih dapat membuat identitas Firebase Auth sebelum gate menolak akses CRM; Rules tetap membatasi data, tetapi ini bukan allowlist pembuatan akun Auth.
- **Guard Firebase target:** `src/firebaseDeploymentGuard.ts` fail-closed pada hosted build tanpa target; Preview diwajibkan `staging` dan menolak project production yang diketahui; Production hanya diterima pada `VERCEL_ENV=production` dengan project ID production yang ditetapkan. Test guard sintetis lulus. Guard memvalidasi konfigurasi build/runtime client; ia tidak membuktikan environment Vercel, project staging, Rules, Auth domain, atau deployment live. Untuk target `staging`, source menolak project production tetapi belum membatasi ke satu ID staging yang disetujui.
- **App Check:** App Check reCAPTCHA Enterprise baru diinisialisasi untuk target `staging` (`src/firebase.ts:44-55`, `src/firebaseAppCheckPolicy.ts:4-11`), tidak pada `production`. Tidak ada bukti project/site key, metrik, atau enforcement Console staging/live; enforcement produksi belum dibuktikan. Jika site key staging hilang, policy melempar saat Auth dibuat; `FirebaseAuthGate` belum menangkap exception inisialisasi tersebut untuk menampilkan kegagalan yang terkendali.
- **Endpoint ekspor:** `api/cron/export-firestore-to-sheets.ts` mengembalikan 404 di luar `VERCEL_ENV=production`, hanya menerima GET, dan memerlukan bearer `CRON_SECRET`; adapter memeriksa secret ≥32 karakter dengan `timingSafeEqual`. Target project/workspace/owner/collection/spreadsheet tetap dan server-only; tidak mengambil target dari request. Export hanya laporan satu arah dan tidak menghapus baris yang hilang. **Belum ada `vercel.json`/jadwal Cron, spreadsheet, service account/IAM, atau server environment yang diverifikasi atau disiapkan; ekspor bukan backup.**
- **Legacy dan provenance:** `server.ts:31-41` menutup GAS proxy lama dengan 410 dan notes-AI endpoint dengan 403 sebelum body diproses. Scan import lokal tidak menemukan penggunaan runtime `src/data/gasCode.ts`; berkas referensi GAS tetap ada. Helper `CrmStorage`/`CrmSyncEngine` lokal juga masih ada di `src/utils/syncQueue.ts`, tetapi jalur UI utama menggunakan Firebase repository dan antrean tulis Firestore. Perubahan fitur audit/guard/export yang saat ini untracked atau modified belum menjadi bagian dari commit HEAD dan tidak terbukti terpasang pada deployment.

### Risiko dan status cloud yang belum diketahui

| Prioritas | Temuan | Implikasi / tindak lanjut |
|---|---|---|
| **Gate cutover** | Environment Vercel Production/Preview, target build, domain Auth, staging Firebase, dan deployment aktif tidak diperiksa live dalam audit ini. | Jalankan checklist verifikasi Vercel/Firebase secara read-only sebelum cutover; jangan menganggap guard lokal berarti Preview sudah terisolasi. Local code terbaru belum menjadi commit/deployment yang diverifikasi. |
| **Tinggi bila diperlukan offline tanpa kehilangan operasi** | Antrean pending tidak durable saat reload/penutupan tab/terminasi browser. | Tentukan apakah session-only acceptable. Untuk operasional lapangan tanpa risiko kehilangan, rancang persistence eksplisit dan uji crash/reload/recovery sebelum dinyatakan siap; jangan mengandalkan indikator koneksi saja. |
| **Tinggi / keputusan data** | Tidak ada migrasi, backup/restore yang dibuktikan, atau sumber data operasional yang disetujui. | Aplikasi Firebase dapat tampak kosong dari Leads/Activities. Setujui sumber dan scope, backup privat, restore test, mapping, dry-run, rekonsiliasi, lalu approval apply/cutover terpisah. Jangan menggunakan `Personal CRM Data` yang telah dikosongkan sebagai sumber. |
| **Sedang** | API repository menganggap operasi queued berhasil pada level caller sebelum acknowledgement Firestore. | Pertahankan wording “queued”; sebelum operasi bisnis dianggap sukses, pastikan acknowledgement/error terlihat dan tambahkan test repository/UI yang membuktikan jalur success/rejection. |
| **Sedang** | App Check production tidak diinisialisasi; staging/provider/key/metrics/enforcement tidak diverifikasi. | Putuskan kebijakan App Check production; siapkan staging provider dan metrik, tinjau false reject, lalu aktifkan enforcement hanya melalui persetujuan dan langkah Console terpisah. Firestore Rules tetap kontrol akses utama. |
| **Sedang** | Endpoint export tidak dijadwalkan dan IAM/tujuan belum dikonfigurasi. | Jangan menganggap laporan otomatis aktif. Jika diaktifkan kelak, pakai service account least-privilege, satu invocation pada satu waktu, target Sheet terpisah, dan jadwal yang disetujui. |
| **Rendah–sedang** | Sign-in dapat membuat Auth account non-owner sebelum gate menolak CRM; konfigurasi App Check staging yang invalid dapat menimbulkan exception tak tertangani. | Tentukan apakah kebijakan mengharuskan mencegah pembuatan akun non-owner; tambahkan error boundary/try-catch untuk konfigurasi staging. Ini bukan bukti akses Firestore oleh non-owner. |
| **Rendah** | Rules memvalidasi tanggal follow-up lewat pola `YYYY-MM-DD`, bukan validitas kalender; dashboard label active-stage melewatkan Meeting. | Validasi tanggal kalender pada jalur aplikasi tepercaya; perbaiki label UI bila diizinkan pada pekerjaan kode berikutnya. Tidak mengubah source dalam audit ini. |
| **Pemeliharaan/performa** | Build berhasil tetapi memberi warning chunk besar dan `__dirname`; salinan aset gambar di output masing-masing sekitar 1,12 MB. | Pertimbangkan code-splitting, optimasi aset, dan konfigurasi path Vite. Tidak memblokir kompilasi, tetapi perlu evaluasi pengalaman mobile dan kompatibilitas Vite berikutnya. |

Artefak lokal [`ar-crm-release-evidence.md`](../ar-crm-release-evidence.md) mencatat bahwa pada bukti terdahulu deployment Production Vercel berada pada commit `f010c46` dan smoke test tanpa login menerima halaman sign-in; artefak itu juga mencatat Rules aktif pernah memiliki hash yang sama dengan source lokal pada saat pemeriksaan terdahulu. **Audit ini tidak memeriksa ulang apakah deployment/hash tersebut masih aktif saat ini.** Jangan menyamakan bukti terdahulu itu dengan deployment branch/working tree yang sekarang.

### Checklist operasional sebelum Preview dan cutover

**Sebelum Preview:**
1. Siapkan project Firebase staging terpisah yang disetujui, project ID yang akan di-allowlist, Web App/Auth, workspace/owner staging, Rules dan indexes; jangan gunakan project production.
2. Konfigurasikan Vercel Preview `VITE_FIREBASE_TARGET=staging` dan seluruh konfigurasi client yang sesuai; jangan mencatat nilainya. Tambahkan reCAPTCHA Enterprise site key hanya setelah origin/provider staging terdaftar.
3. Verifikasi guard positif/negatif terhadap ID staging yang tepat, lalu uji sign-in, Rules, create/update/read dan App Check di staging dengan fixture sintetis. Pastikan error konfigurasi muncul terkendali.

**Sebelum cutover production:**
1. Dengan akses read-only yang berwenang, konfirmasi proyek/domain/commit deployment dan scope environment Production/Preview di Vercel, serta nilai konfigurasi Firebase secara privat tanpa menyalinnya ke log/dokumen. Pastikan target Production tidak dipakai Preview.
2. Cocokkan Rules dan indexes production, project/workspace/owner, Authorized Domains dan query aplikasi. Catatan parity Rules terdahulu bukan pengganti verifikasi cutover.
3. Tetapkan keputusan App Check production dan bukti monitoring/enforcement. Tentukan apakah rilis menampilkan CRM baru kosong atau menunggu migrasi yang disetujui.
4. Sebelum migrasi, sahkan sumber operasional yang benar; siapkan snapshot read-only, checksum, backup privat dan restore test, schema mapping, dry-run sintetis/offline, rekonsiliasi serta approval apply baru. Sumber legacy tetap tidak diubah.
5. Putuskan kebutuhan offline durability dan acknowledgement: jika kehilangan mutasi pending tidak dapat diterima, tutup gap persistence dan uji reload/crash/reconnect serta rejection Rules sebelum operasi lapangan.
6. Bila ekspor Sheets dibutuhkan, baru setelah approval siapkan spreadsheet khusus, IAM service account minimal, server secrets, dan jadwal Cron; uji adapter sintetis, larang concurrent run, dan jangan menyebutnya backup.
7. Tinjau warning bundle/Vite, lakukan smoke test tanpa data production, tetapkan monitoring/kriteria stop/rollback, lalu minta persetujuan terpisah untuk deploy, Rules, migrasi, dan cutover. Audit ini tidak memberi approval untuk tindakan tersebut.

**Kesimpulan:** pemeriksaan lokal yang dijalankan lulus dan kontrol source lokal tampak ketat, tetapi kesiapan live, pemulihan data, staging, App Check dan daya tahan operasi offline belum terbukti. Jangan mengklaim aplikasi 100% siap untuk tools operasional B2B sampai gate di atas ditutup dengan bukti.

---

## DAFTAR ISI
1. [Visi & Problem Statement](#1-visi--problem-statement)
2. [Arsitektur Sistem & Tech Stack](#2-arsitektur-sistem--tech-stack)
3. [Desain Sistem & Identitas Brand (AR CRM)](#3-desain-sistem--identitas-brand-ar-crm)
4. [Modul & Fitur Utama yang Telah Diimplementasikan](#4-modul--fitur-utama-yang-telah-diimplementasikan)
5. [Skema Database & Spesifikasi REST API](#5-skema-database--spesifikasi-rest-api)
6. [Arsitektur Native Android (Kotlin & Jetpack Compose)](#6-arsitektur-native-android-kotlin--jetpack-compose)
7. [Hasil Code Review, Security Hardening & Refactoring (v2.2.0)](#7-hasil-code-review-security-hardening--refactoring-v220)
8. [Pembersihan Data Dummy & Hardening Integrasi Google Sheets](#8-pembersihan-data-dummy--hardening-integrasi-google-sheets)
9. [Status Deployment & Verifikasi Teknis](#9-status-deployment--verifikasi-teknis)
10. [Roadmap & Langkah Optimalisasi Selanjutnya](#10-roadmap--langkah-optimalisasi-selanjutnya)

---

## 1. VISI & PROBLEM STATEMENT

### 1.1 Visi Produk
**AR Personal CRM Enterprise** adalah sales command center pribadi berkinerja tinggi yang dirancang khusus untuk seorang **Account Manager (AM)** atau Sales Professional B2B independen. Sistem ini menghadirkan kemampuan setara CRM korporat bernilai ribuan dolar, namun dengan **biaya operasional Rp0 (100% gratis selamanya)**, berjalan secara **offline-first**, dan tidak bergantung pada lisensi perangkat lunak per pengguna (*per-seat licensing*).

### 1.2 Problem Statement
Di lapangan, Account Manager B2B menghadapi tantangan operasional krusial:
1. **Konektivitas Tidak Stabil di Lapangan:** Kunjungan ke kawasan industri (KIM Medan, Cikarang, Karawang, Rungkut Surabaya) seringkali mengalami *dead zone* sinyal internet seluler. Aplikasi CRM berbasis cloud murni sering *hang*, gagal menyimpan catatan rapat, atau lambat dimuat.
2. **Follow-Up Tercecer & Kehilangan Momentum:** Kesepakatan bernilai ratusan juta rupiah sering lepas akibat follow-up terlambat karena catatan tersebar di buku saku, WhatsApp pribadi, atau spreadsheet statis.
3. **Biaya Langganan CRM Komersial yang Mahal:** CRM enterprise seperti Salesforce atau HubSpot membebankan biaya $50 – $150 per pengguna per bulan, yang tidak efisien bagi sales individual atau konsultan mandiri.
4. **Beban Administrasi Pencatatan Rapat:** Mengingat dan merangkum poin pembicaraan serta butir tindakan (*action items*) selepas rapat klien menyita waktu berharga.
5. **Keluarnya Aplikasi Akibat Gestur Navigasi Ponsel:** Pada perangkat Android dan browser mobile, gestur *swipe-back* seringkali langsung memicu aksi *browser exit* atau menutup PWA secara tidak sengaja ketika pengguna hanya bermaksud menutup modal popup atau kembali ke Dashboard.
6. **Kerahasiaan Data Klien & Portabilitas Laporan:** AM membutuhkan cara cepat untuk mengekspor rekapitulasi prospek ke spreadsheet Excel/CSV tanpa bergantung pada koneksi internet, serta perlindungan PIN/biometrik saat perangkat dipinjamkan.

### 1.3 Solusi AR CRM
- **Offline-First dengan Optimistic UI:** Data disimpan secara instan di perangkat lokal (*zero-latency write*) dan secara otomatis disinkronkan ke database cloud saat koneksi internet pulih.
- **Biaya Operasional Rp0 (Serverless):** Memanfaatkan kombinasi Google Apps Script (GAS) Web App dan Google Sheets sebagai database cloud tanpa biaya server bulanan.
- **AI-Powered Field Assistant:** Peringkasan otomatis catatan rapat lapangan dan ekstraksi *Action Items* menggunakan Gemini API (`gemini-3.8-flash`) dengan mekanisme *intelligent rule-based fallback* dan timeout guard `AbortController`.
- **Integrated Direct Outreach:** Integrasi satu ketukan untuk panggilan telepon dan perutean WhatsApp (`wa.me`) dengan validasi nomor internasional dan template pesan profesional.
- **Mobile Back Gesture Management (LIFO Order):** Penanganan `popstate` dan `history.pushState` bertingkat (*Last-In, First-Out*) yang menutup sub-modal aktif terlebih dahulu sebelum modal induk atau navigasi tab.
- **Local Security Vault (WebAuthn & Rate-Limiting Lockout):** Otentikasi biometrik riil berbasis WebAuthn (`navigator.credentials.get`), hashing PIN SHA-256 tersalt, dan proteksi *brute-force rate-limiting lockout* (5 percobaan gagal $\rightarrow$ cooldown 30 detik).
- **Sanitized CSV Export Engine:** Ekspor instan data prospek ke format RFC-4180 CSV yang terproteksi penuh dari serangan *CSV Formula Injection* (`=`, `+`, `-`, `@`, `\t`, `\r`).
- **Complete PWA Service Worker:** Registrasi Service Worker mandiri (`sw.js`) dengan strategi cache cerdas *NetworkFirst* untuk dokumen HTML dan *CacheFirst* untuk aset statis.
- **Zero-Mock Production State:** Seluruh data mock/dummy bawaan telah dibersihkan secara tuntas. Aplikasi beroperasi murni pada data nyata dari Google Sheets dan input pengguna.

---

## 2. ARSITEKTUR SISTEM & TECH STACK

Arsitektur AR CRM dibangun dengan prinsip pemisahan tanggung jawab (*Separation of Concerns*), ketahanan terhadap kegagalan jaringan, dan portabilitas tinggi.

```
+-----------------------------------------------------------------------------------+
|                            AR CRM CLIENT LAYER                                    |
|                                                                                   |
|   +------------------------------------+    +---------------------------------+   |
|   |   Progressive Web App (React 19)   |    |  Native Android (Kotlin/Room)   |   |
|   |   - Tailwind CSS v4 (AR Editorial) |    |  - Jetpack Compose Material 3   |   |
|   |   - Vite SPA Engine                |    |  - Retrofit 2 + Gson            |   |
|   |   - Popstate LIFO Back Shield      |    |  - WorkManager SyncWorker       |   |
|   |   - WebAuthn + Salted PIN Vault    |    |  - FusedLocationProviderClient  |   |
|   |   - Sanitized CSV Export Engine    |    |  - OnBackPressedDispatcher      |   |
|   |   - Dynamic FK Sync Queue Engine   |    |  - Type-safe Remote DTO Mappers |   |
|   |   - Auto-Purge Mock Sanitizer      |    |                                 |   |
|   |   - Service Worker Offline Caching |    |                                 |   |
|   +-----------------+------------------+    +----------------+----------------+   |
+---------------------|----------------------------------------|--------------------+
                      |                                        |
                      | HTTP / REST (JSON)                     | HTTP / REST (JSON)
                      v                                        v
+-----------------------------------------------------------------------------------+
|                        AR CRM BACKEND & MIDDLEWARE LAYER                          |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   | Production Edge Gateway (Vercel) / Express Proxy Server (server.ts)       |   |
|   | - /api/gas-proxy: Menangani CORS bypass & HTTP 302 Redirect Follow        |   |
|   |   dengan 12s AbortController timeout guard                                |   |
|   | - Configurable GAS_API_URL via process.env.GAS_API_URL                    |   |
|   | - /api/ai/summarize-notes: Google GenAI SDK (gemini-3.8-flash)             |   |
|   |   dengan AbortController 4s timeout & intelligent fallback               |   |
|   +-------------------------------------+-------------------------------------+   |
+-----------------------------------------|-----------------------------------------+
                                          |
                                          | Google Apps Script Web App Deployment
                                          v
+-----------------------------------------------------------------------------------+
|                       AR CLOUD SYNC & DATABASE ENGINE                             |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   | Google Apps Script Web App (Code.gs v2.2.0)                               |   |
|   | - Action Router: getLeads, addLead, updateLeadStage, addActivity, dll.    |   |
|   | - Auto-Archive Router: archiveClosingWon, getArchiveLogs                  |   |
|   | - Global Leads Router: getGlobalLeads, importGlobalLead                   |   |
|   | - Atomic ID Generator: LEAD-xxx, ACT-xxx, ARCHIVE-xxx                      |   |
|   +-------------------------------------+-------------------------------------+   |
|                                         | SpreadsheetApp API                      |
|                                         v                                         |
|   +---------------------------------------------------------------------------+   |
|   | Google Sheets Database ("Personal CRM Data")                              |   |
|   | - Sheet [Leads]: Master data prospek & tahapan pipeline                   |   |
|   | - Sheet [Activities]: Log check-in GPS, catatan, dan ringkasan AI         |   |
|   | - Sheet [Global_Leads]: Direktori target prospek korporat B2B             |   |
|   | - Sheet [Archive_Logs]: Arsip permanen closing won & rekap performa       |   |
|   +---------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------+
```

---

## 3. DESAIN SISTEM & IDENTITAS BRAND (AR CRM)

- **Palette Warna Utama:**
  - **Navy Blue (`#1A2E40`):** Simbol otoritas korporat, stabilitas finansial, dan kedewasaan enterprise.
  - **Hub Orange (`#FF4800`):** Titik fokus energi, node jaringan koneksi bisnis, dan indikator status proaktif.
  - **Editorial Cream Paper (`#FCFCFA` / `#F8F5EE`):** Latar belakang bertekstur kertas premium editorial (*high-contrast readability*).
  - **Batas Presisi:** Hairline border 1px (`border-[#1F1F1F]`) dengan radius 8px seragam (zero-pill discipline).

---

## 4. MODUL & FITUR UTAMA YANG TELAH DIIMPLEMENTASIKAN

### 4.1 Dashboard & Financial Forecast
- **KPI Real-Time:** Total Pipeline Value, Deals Closed Won, Active Pipeline Deals, dan Weighted Forecast (probabilitas tertimbang berdasarkan bobot stage: Prospect 20%, Meeting 40%, Negotiation 70%, Closing Won 100%, Closing Lost 0%).
- **Follow-Up Categorization:** Klasifikasi otomatis prospek berstatus `Overdue`, `Today`, `This Week`, dan `Upcoming`.
- **Top Deals & Industry Distribution:** Ringkasan kesepakatan bernilai tertinggi dan sebaran industri prospek.

### 4.2 Sales Pipeline (Kanban & List View)
- **5 Tahapan Standar Penjualan:** Prospect $\rightarrow$ Meeting $\rightarrow$ Negotiation $\rightarrow$ Closing Won $\rightarrow$ Closing Lost.
- **Drag & Drop / Quick Advance:** Perubahan tahapan pipeline dengan pembaruan tanggal follow-up otomatis dan penulisan antrean mutasi instan (*optimistic write*).
- **Auto-Archive Closing Won:** Deal yang berpindah ke Closing Won otomatis diarsipkan ke sheet `Archive_Logs` dan disimpan di arsip lokal.

### 4.3 AI Lead Finder & Enrichment
- **Pencarian Relevan B2B:** Mesin pencarian cerdas berbasis token industri, skoring relevansi geografis (Medan, Jakarta, Cikarang, Surabaya), dan sintesis data prospek korporat dinamis.
- **AI Match Score:** Skoring kecocokan prospek (Hot/Warm) dengan informasi pengambil keputusan (*decision makers*).
- **1-Click Import:** Konversi instan prospek global menjadi prospek aktif di sheet `Leads`.

### 4.4 Field Activities, GPS Check-In & AI Summarizer
- **GPS Check-In:** Pengambilan koordinat lintang/bujur presisi via browser Geolocation API / FusedLocationProviderClient.
- **AI Meeting Summarizer:** Peringkasan transkrip rapat lapangan menggunakan Gemini API (`gemini-3.8-flash`) dengan batas waktu protektif 4 detik melalui `AbortController` dan *Intelligent Local Fallback* jika koneksi terputus.

### 4.5 WhatsApp Quick Reach
- **Normalisasi Nomor Telepon:** Format nomor telepon otomatis ke standar internasional (+62/E.164).
- **Template Pesan Profesional:** Pilihan template salam formal B2B, penjadwalan demo produk, pengiriman proposal penawaran, dan ucapan apresiasi pasca rapat.

### 4.6 Offline Sync Engine & Local Security Vault
- **Dynamic Foreign Key Resolution:** Mutasi lokal yang menggunakan ID sementara (`TEMP-LEAD-xxx`) secara otomatis diperbarui dengan ID server riil (`LEAD-xxx`) saat proses sinkronisasi berhasil.
- **Local Security Lockout:** Proteksi keamanan PIN SHA-256 tersalt dan autentikasi biometrik WebAuthn sesungguhnya dengan mekanisme lockout 30 detik setelah 5 kali salah input.

---

## 5. SKEMA DATABASE & SPESIFIKASI REST API

### 5.1 Skema Tabel Google Sheets

#### 1. Sheet `Leads`
| Kolom | Tipe Data | Deskripsi |
|---|---|---|
| `id` | String | ID unik (`LEAD-xxx`, `TEMP-LEAD-xxx`) |
| `company_name` | String | Nama perusahaan klien |
| `contact_person` | String | Nama pengambil keputusan (PIC) |
| `phone` | String | Nomor telepon format internasional (+62...) |
| `industry` | String | Sektor industri klien |
| `city` | String | Kota domisili klien |
| `pipeline_stage` | String | Tahap pipeline (Prospect, Meeting, Negotiation, Closing Won, Closing Lost) |
| `deal_value` | Number | Nilai transaksi (Rupiah) |
| `next_followup_date`| String | Tanggal tindak lanjut (YYYY-MM-DD) |
| `lead_score` | String | `Hot`, `Warm`, atau `Cold` |
| `created_at` | String | Timestamp pembuatan (ISO 8601) |
| `updated_at` | String | Timestamp pembaruan terakhir (ISO 8601) |

#### 2. Sheet `Activities`
| Kolom | Tipe Data | Deskripsi |
|---|---|---|
| `id` | String | ID aktivitas unik (`ACT-xxx`) |
| `lead_id` | String | ID relasi prospek |
| `activity_type` | String | `Meeting Check-In`, `Call`, `WhatsApp` |
| `notes` | String | Catatan lapangan |
| `ai_summary` | String | Ringkasan dan poin tindakan AI |
| `location_gps` | String | Koordinat lintang dan bujur |
| `created_at` | String | Timestamp aktivitas (ISO 8601) |

#### 3. Sheet `Global_Leads`
| Kolom | Tipe Data | Deskripsi |
|---|---|---|
| `id` | String | ID direktori prospek (`GLOB-xxx`) |
| `company_name` | String | Nama target perusahaan |
| `contact_person` | String | PIC dan jabatan |
| `phone` | String | Kontak target |
| `industry` | String | Sektor bisnis target |
| `city` | String | Lokasi kantor target |
| `estimated_value` | Number | Estimasi nilai potensi proyek |
| `tags` | String / Array | Kategori tag industri |

#### 4. Sheet `Archive_Logs`
| Kolom | Tipe Data | Deskripsi |
|---|---|---|
| `id` | String | ID arsip transaksi (`ARCHIVE-xxx`) |
| `lead_id` | String | ID prospek pemenang |
| `company_name` | String | Nama perusahaan klien yang dimenangkan |
| `contact_person` | String | Nama pengambil keputusan |
| `phone` | String | Nomor telepon |
| `deal_value` | Number | Nilai closing deal (IDR) |
| `industry` | String | Sektor industri |
| `city` | String | Kota transaksi |
| `won_date` | String | Tanggal status Closing Won |
| `archived_at` | String | Timestamp pengarsipan |

---

## 6. ARSITEKTUR NATIVE ANDROID (KOTLIN & JETPACK COMPOSE)

Modul `src/data/androidKotlinCode.ts` menyertakan implementasi native Android lengkap:
1. **Data Transfer Objects (DTO):** `RemoteLeadDto`, `RemoteActivityDto`, dan `RemoteGlobalLeadDto` dengan mapper `.toEntity()` yang aman secara tipe ke entitas Room SQLite.
2. **Room Database & DAO:** `LeadEntity.kt`, `ActivityEntity.kt`, dan `CrmDao.kt` yang mengekspos Coroutines Flow.
3. **Retrofit REST Client:** `CrmApiService.kt` untuk komunikasi dengan Google Apps Script Web App.
4. **WorkManager Background Sync:** `SyncWorker.kt` yang melakukan sinkronisasi otomatis saat jaringan tersedia.
5. **UI Layer:** `PipelineKanbanScreen.kt` menggunakan Jetpack Compose dengan `BackHandler` native.

---

## 7. HASIL CODE REVIEW, SECURITY HARDENING & REFACTORING (v2.2.0)

| Kode Temuan | File Target | Kategori | Tindakan Perbaikan yang Telah Dieksekusi |
|---|---|---|---|
| **SEC-01** | `src/utils/securityLock.ts` | Keamanan WebAuthn | Menghapus implementasi *mock* biometrik instan. Mengimplementasikan autentikasi biometrik riil menggunakan `navigator.credentials.get({ publicKey: ... })` dengan penanganan pengecualian `NotAllowedError` yang aman. |
| **SEC-03** | `src/utils/securityLock.ts` | Brute-force Protection | Menambahkan salt kriptografis pada hash PIN SHA-256 dan menerapkan mekanisme *rate-limiting lockout* (5 kali percobaan salah $\rightarrow$ penguncian otomatis 30 detik) lengkap dengan visualisasi hitung mundur. |
| **BUG-01** | `src/App.tsx` | Navigasi Mobile | Memperbaiki urutan LIFO (*Last-In, First-Out*) pada `handlePopState`. Sub-modal (`ActivityLogger`, `WhatsAppModal`, `SecuritySettings`) kini ditutup bertingkat sebelum modal detail induk atau perpindahan tab. |
| **BUG-02** | `src/utils/syncQueue.ts` | Konsistensi Data | Mencegah *dangling foreign key*: antrean mutasi `addActivity` dan `archiveClosingWon` yang terkait dengan `TEMP-LEAD-xxx` secara otomatis diperbarui ke ID server riil (`LEAD-xxx`) setelah `addLead` sukses tersinkronisasi. |
| **DATA-01**| `src/utils/syncQueue.ts` | Data Fetching | Menambahkan penarikan data arsip transaksi dari sheet `Archive_Logs` ke penyimpanan lokal pada pemanggilan fungsi `pullRemoteData()`. |
| **SEC-02** | `src/utils/exportCsv.ts` | Keamanan CSV | Mencegah serangan *CSV Formula Injection*. Karakter pemicu formula spreadsheet (`=`, `+`, `-`, `@`, `\t`, `\r`) pada sel otomatis diawali dengan tanda petik tunggal (`'`). |
| **PERF-01**| `server.ts` | Konfigurasi Server | Menjadikan endpoint Google Apps Script dapat dikonfigurasi secara fleksibel melalui `process.env.GAS_API_URL` dengan fallback ke URL produksi aktif. |
| **PWA-01** | `public/sw.js` & `src/main.tsx` | PWA & Offline Cache | Menambahkan Service Worker mandiri (`sw.js`) dengan strategi *NetworkFirst* untuk navigasi dan *CacheFirst* untuk aset statis shell aplikasi, serta registrasi otomatis saat mode produksi. |
| **AI-01**  | `server.ts` | Keandalan AI | Memasang `AbortController` dengan timeout 4 detik pada pemanggilan API Gemini (`gemini-3.8-flash`) pada rute `/api/ai/summarize-notes` untuk memastikan fallback lokal selalu merespons tepat waktu. |
| **DEAD-01**| `src/components/ArcrmLogo.tsx` | Dead Code | Menghapus komponen `ArcrmLogo.tsx` yang tidak lagi digunakan dan redundan dengan aset gambar brandmark di `TopAppBar.tsx`. |
| **DEAD-02**| `package.json` | Dependency Hygiene | Menghapus dependensi paket `motion` yang tidak terpakai dari `dependencies` guna merampingkan bundle size. |
| **DEAD-03**| Workspace Root | Asset Cleanup | Menghapus 6 file screenshot mockup usang (`mobile_*.png`) dari direktori root proyek. |
| **TYPE-01**| `src/data/androidKotlinCode.ts`| Type Safety | Menambahkan deklarasi data class `RemoteLeadDto`, `RemoteActivityDto`, `RemoteGlobalLeadDto` serta fungsi mapper ekstensi `.toEntity()` yang memetakan DTO ke Room Entity. |
| **SEC-04** | `src/utils/securityLock.ts` & `src/components/SecurityLockScreen.tsx` | Dynamic PIN Length & UI Sync | Memperbaiki inkonsistensi panjang PIN antara form pengaturan (4-6 digit) dan layar kunci. Menyimpan panjang digit PIN (`STORAGE_KEY_PIN_LENGTH`) secara dinamis, menyesuaikan jumlah bulatan indikator PIN, dan mengeksekusi verifikasi saat input pengguna mencapai panjang PIN yang dikonfigurasi (4, 5, atau 6 digit). Menambahkan dukungan input keyboard desktop. |

---

## 8. PEMBERSIHAN DATA DUMMY & HARDENING INTEGRASI GOOGLE SHEETS

Pada pembaruan v2.2.0 ini, sistem telah dibersihkan secara menyeluruh dari seluruh residu data tiruan/mock:

1. **Penghapusan Total Mock Seeds (`SEED_LEADS`, `SEED_ACTIVITIES`, `GLOBAL_LEADS_CATALOG`):**
   - Array data dummy statis telah dihapus dari kode sumber `src/utils/syncQueue.ts`.
   - `CrmStorage.getLeads()` dan `CrmStorage.getActivities()` kini mengembalikan array kosong `[]` pada inisialisasi awal murni tanpa menyuntikkan data dummy ke dalam `localStorage`.
2. **Auto-Purge Sanitizer untuk Residu LocalStorage:**
   - Ditambahkan filter sanitasi otomatis pada `CrmStorage` yang mendeteksi dan menghapus ID dummy lama (`LEAD-101` s/d `LEAD-104`, `ACT-201` s/d `ACT-202`, `GL-1` s/d `GL-5`) dari penyimpanan browser pengguna lama secara instan saat aplikasi dimuat.
3. **Sinkronisasi Penuh Database Cloud Google Sheets:**
   - Aplikasi menarik data live dari 4 sheet utama: `Leads`, `Activities`, `Global_Leads`, dan `Archive_Logs` melalui Google Apps Script Web App.
   - Normalisasi nomor telepon: Format nomor telepon tanpa tanda plus (misal: `62812...` atau `0812...`) otomatis dinormalisasi menjadi standar internasional `+62...`.
   - Normalisasi tanggal tindak lanjut: Serialisasi tanggal dari Google Sheets otomatis dipotong menjadi format standar `YYYY-MM-DD` untuk kompatibilitas input HTML5.
   - Konversi tipe data numerik: Properti `deal_value` dan `estimated_value` selalu dikonversi melalui `Number() || 0`.
4. **Hardening Proxy Gateway Server (`server.ts`):**
   - Rute `/api/gas-proxy` kini dilengkapi `AbortController` dengan batas waktu 12 detik, mencegah koneksi menggantung jika backend Google Apps Script mengalami latensi tinggi atau cold start.
5. **Pembaruan Kode Referensi Google Apps Script (`Code.gs` v2.2.0):**
   - Skrip backend referensi di `src/data/gasCode.ts` diperbarui ke versi 2.2.0 dengan pemetaan dinamis untuk seluruh operasi baca dan tulis.

---

## 9. STATUS DEPLOYMENT & VERIFIKASI TEKNIS

### 9.1 Status Deployment Aktif
- **Live Production URL (Vercel):**  
  [https://arcrmapp.vercel.app/](https://arcrmapp.vercel.app/)  
  *(Aplikasi telah ter-deploy secara live, dapat diinstal sebagai PWA di smartphone Android/iOS, dan mendukung penuh operasional offline)*.
- **GAS Web App URL (Live Backend):**  
  `https://script.google.com/macros/s/AKfycbx5SNAUvM2MOW9X62M9uzs2bw6bM19-us57r0X10GZYEU5wBd_ajXDDPCAm6M82wkzO/exec`
- **Express Proxy Gateway & AI Summarizer:**  
  Rute `/api/gas-proxy` dan `/api/ai/summarize-notes` berjalan di server port 3000.

### 9.2 Hasil Verifikasi Pengujian (Unit Tests)
Pengujian otomatis menggunakan test runner native `node:test` (`npm run test`):
- `syncQueue.test.ts`: **PASSED** (Inisialisasi clean state 0 records, verifikasi auto-purge residu dummy, mutasi optimistik, pembaruan tahapan, dan auto-archive Closing Won).
- `exportCsv.test.ts`: **PASSED** (Validasi format CSV RFC-4180, sanitasi formula injection untuk `=`, `+`, `-`, `@`, dan *escaping* karakter khusus).
- `securityLock.test.ts`: **PASSED** (Validasi hashing PIN SHA-256 tersalt, verifikasi PIN dinamis 4, 5, dan 6 digit, verifikasi lockout rate-limiting setelah 5 kali gagal, status timeout, dan reset).
- `crmCalculations.test.ts`: **PASSED** (Kalkulasi Total Pipeline, Closed Won, Weighted Probability, win rate, kategorisasi tanggal follow-up, serta pembersihan nomor telepon WhatsApp internasional).
- `aiLeadEnrichment.test.ts`: **PASSED** (Pencarian token industri, boost relevansi geografis, dan sintesis prospek dinamis).
- **Hasil Akhir:** **20 dari 20 Unit Tests Lulus 100% (Green)**.

---

## 10. ROADMAP & LANGKAH OPTIMALISASI SELANJUTNYA

1. **Batching Mutation Queue pada Google Apps Script:**
   - Menggabungkan beberapa mutasi lokal menjadi satu request payload (`action: "batchSync"`) guna menghemat kuota eksekusi Google Apps Script (maksimum 6 menit per eksekusi).
2. **Push Notifications & Google Calendar Sync:**
   - Menghubungkan pengingat jadwal follow-up ke Google Calendar AM atau Web Push Notification API untuk mengirim notifikasi peringatan pagi hari (pukul 08:00).
3. **Pencadangan Otomatis Cadangan Database:**
   - Menambahkan rutinitas berkala di Google Sheets untuk membuat snapshot salinan cadangan (*versioned backup sheet*) setiap akhir pekan secara otomatis.

---
*Dokumen ini merupakan catatan arsitektur resmi proyek AR Personal CRM Enterprise v2.2.0. Seluruh spesifikasi bersumber langsung dari implementasi kode sumber aktif.*

> **Koreksi footer historis:** kalimat penutup di atas berasal dari versi dokumen lama dan tidak berlaku untuk branch Firebase saat ini. Uraian v2.2.0 di atas bersifat historis; gunakan ringkasan audit dan source branch `cue/firebase-stabilization` sebagai status implementasi.
