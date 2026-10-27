# AR CRM — Status Integrasi Firebase

Diperbarui pada 27 Oktober 2026, 02:01 WIB setelah verifikasi lokal dan triase dependency lanjutan di branch `cue/firebase-stabilization`.

## Ringkasan

Cabang ini mengintegrasikan Firebase Authentication dengan Google Sign-In dan Firestore untuk operasi Leads/Activities. Aplikasi hanya membuka CRM jika konfigurasi client cocok dengan binding owner dan workspace pada `firestore.rules`; Rules memvalidasi schema, membership, kepemilikan, dan relasi activity ke lead dalam workspace yang sama. Implementasi sengaja tidak membaca atau mengimpor data lama dari `localStorage`, Sheets, atau GAS.

Konstanta owner/workspace client dicocokkan dengan Rules lewat unit test. Rules lokal kini membatasi akses ke workspace `ar-crm-owner`; tes emulator menolak workspace tambahan sekalipun root dan membership di fixture sintetis cocok. Perubahan Rules lokal belum dideploy oleh pekerjaan ini.

Dalam mode development, aplikasi selalu menghubungkan Auth dan Firestore ke emulator lokal; tidak ada opt-out environment untuk mengarahkannya ke Firebase live. Build production tidak menggunakan emulator.

## Status Firebase dan autentikasi

Project target adalah **AR CRM** (`ar-crm-73222`), dengan Firestore Standard di `asia-southeast1`, Web App AR CRM Web, dan Google provider. Berdasarkan verifikasi terdahulu, Rules production telah dideploy dan dokumen workspace serta membership owner sudah diprovisikan. Status cloud itu tidak dibaca ulang dalam pembaruan dokumentasi ini; tidak ada record CRM yang diakses.

Pada pemeriksaan lokal terdahulu, konfigurasi `.env.local` cocok dengan project dan binding owner/workspace Rules, berizin file `600`, dan diabaikan Git. Nilai konfigurasi tidak dicantumkan. Pemilik sebelumnya melaporkan login Google live sebagai owner berhasil; masalah query index yang muncul setelah login telah ditangani dengan indeks Firestore. CRUD owner live belum selesai diverifikasi. Authorized domain `arcrmapp.vercel.app` sebelumnya dilaporkan sudah ditambahkan. Tak satu pun status cloud tersebut diperiksa ulang dalam pembaruan ini.

Google Sign-In dapat membuat entri Firebase Auth saat login pertama, sedangkan Firestore Rules membatasi data CRM dan tidak mencegah pembuatan Auth user itu sendiri. Tidak ada alur registrasi workspace/member dari client.

## Data dan batas keselamatan

- Semua uji Rules memakai Firestore Emulator dengan project `demo-ar-crm-rules` dan fixture sintetis.
- Uji UI development memakai Auth Emulator (`127.0.0.1:9099`) dan Firestore Emulator (`127.0.0.1:8080`) secara default; ini tidak memverifikasi Google OAuth live.
- Tidak ada test Lead/Activity yang ditulis ke Firestore production.
- Tidak ada data CRM nyata yang dibaca, diekspor, dipindahkan, atau dihapus.
- Tidak ada migrator executable; [runbook bootstrap dan migrasi](OWNER_BOOTSTRAP_AND_DATA_MIGRATION_RUNBOOK.md) adalah prosedur/draf, bukan izin apply.
- Berdasarkan konteks pemilik, data operasional lama belum dimigrasikan ke Firestore. Rilis aplikasi baru akan menampilkan CRM Firebase yang kosong dari Leads/Activities sampai migrasi disetujui dan dilakukan; sumber lama tidak otomatis dihapus, tetapi dapat tidak terlihat di UI baru.
- Firestore Rules tidak mengizinkan client menghapus record atau mengubah membership. Activity immutable; Lead hanya dapat diubah pada stage, follow-up, dan `updated_at`.
- Notes tidak dikirim ke AI; GPS tidak ditangkap atau disimpan oleh jalur aplikasi baru.

## Status deployment

Deployment production terakhir yang diketahui adalah Vercel project `arcrm-app`, dari branch `cue/firebase-stabilization`, commit `f010c46f6358fa57fe2b0957e8f049058acb0b7d`. Status deployment tersebut tidak diperiksa ulang pada pembaruan ini. HEAD checkout lokal saat pemeriksaan adalah `a6670b8`; working tree berisi perubahan lokal yang sudah ada dan perubahan dokumentasi task ini, tanpa membandingkan remote ref. Tidak ada perubahan tersebut yang dipromosikan atau di-deploy. Cutover penuh dan migrasi data operasional tetap terpisah. Data lama belum dimigrasikan dan tidak otomatis tampil pada aplikasi Firebase.

Delapan `VITE_FIREBASE_*` awal sebelumnya dilaporkan tersedia di Vercel Production dan Preview, tetapi environment cloud tidak dibaca ulang. Guard lokal mensyaratkan `VITE_FIREBASE_TARGET=production` hanya pada Production dengan exact project ID production, serta target `staging` dan project ID berprefix `ar-crm-staging-` yang cocok persis dengan `VITE_FIREBASE_STAGING_PROJECT_ID_ALLOWLIST` pada Preview. Penambahan nilai ini ke Vercel belum dilakukan atau diverifikasi. Tanpa target eksplisit, hosted build akan ditolak oleh guard. Paritas SHA Rules production dengan file lokal pernah dikonfirmasi sebelumnya; tidak diperiksa ulang dalam pembaruan ini. Jangan mengubah Authorized Domains atau environment cloud tanpa persetujuan terpisah.

## Hasil verifikasi lokal

- Pada 27 Oktober 2026, `npm test`: **74/74 lulus**; `npm run lint`: **lulus**; `npx tsc --noEmit`: **lulus**; dan `npm run build`: **lulus**.
- Rules Emulator: **12/12 lulus** pada project demo sintetis, termasuk commit-then-retry reconciliation untuk lead dan activity. Suite dijalankan langsung ke emulator lokal yang sudah aktif di `127.0.0.1:8080`; proses emulator tidak dihentikan.
- Build masih menampilkan warning Vite terkait `__dirname` dan chunk JavaScript **950,41 kB** (ambang warning 500 kB). `git diff --check` lulus setelah pembaruan dokumentasi.

Tes lokal tidak menggantikan pemeriksaan live. Verifikasi ini tidak membuka Firebase/Vercel cloud, tidak membaca `.env.local`, dan tidak menggunakan data production.

## Perkembangan stabilisasi lokal

- Guard `src/firebaseDeploymentGuard.ts` menolak hosted Preview tanpa target `staging`, exact allowlist, dan project ID berprefix `ar-crm-staging-`; development tetap menggunakan emulator; target `production` hanya diterima pada Vercel Production dengan exact project ID production.
- App Check dengan reCAPTCHA Enterprise hanya diinisialisasi pada staging. Site key/provider/token preflight yang hilang atau gagal ditangkap sebagai startup error; Auth/Firestore ditahan. Belum ada project staging, provider/site key, environment Preview, atau status enforcement Console yang diverifikasi. Enforcement tetap menjadi pengaturan Firebase Console dan tidak diubah oleh kode.
- Antrean create Lead, update stage, dan create Activity memakai IndexedDB outbox dengan payload AES-GCM allowlisted, partisi owner/workspace, pemulihan saat startup, retry transient saat reconnect, deduplikasi stable document ID, dependency lead→activity, UI server acknowledgement, serta koreksi manual untuk payload failed. Data pending tidak dihapus saat logout; UI memperingatkan dan antrean dipulihkan hanya untuk scope owner/workspace yang sama.
- Ekspor Firestore → Sheets tersedia sebagai kode lokal saja. Belum ada spreadsheet pelaporan, service account/IAM, server environment variable, atau Cron yang dikonfigurasi; Sheets bukan backup.
- Working tree berisi perubahan lokal yang belum di-stage/commit; tidak ada commit, push, merge, atau deploy pada pembaruan ini. `npm audit --json` melaporkan 10 entri paket rentan (5 moderate, 5 high, 0 critical), bukan 10 advisory unik. `npm audit --omit=dev --json` melaporkan empat entri paket production yang berasal dari satu advisory unik High (GHSA-m9gg-hp2v-232j, CVSS 7,4) dan satu Low (GHSA-f596-whhp-79r4, CVSS 3,7) melalui `@grpc/grpc-js@1.9.16`. Tidak ada upgrade dependency yang diterapkan; detail patch, paparan browser, dan blocker dicatat di [`PROJECT_STATE.md`](../PROJECT_STATE.md).

## Gate sebelum production

1. Pemilik menentukan apakah rilis ditunda sampai migrasi operasional yang disetujui, atau dirilis dengan data lama tetap di sumber legacy namun tidak terlihat pada UI baru.
2. Persetujuan eksplisit dibutuhkan sebelum merge/promosi ke `main`; nama branch yang diminta untuk commit/push adalah `cue/firebase-stabilization`.
3. Verifikasi domain Google Auth production dan environment variables Vercel tanpa membocorkan nilainya. Jangan ubah Authorized Domains tanpa persetujuan.
4. Pastikan Rules production sudah cocok dengan branch (khususnya binding workspace tunggal) sebelum mengaktifkan aplikasi baru. Jika perlu memperbarui Rules, deployment Rules memerlukan jalur/otorisasi tersendiri.
5. Migrasi perlu scope, backup/recovery, pemetaan schema, dry-run sintetis, manifest/checksum, rekonsiliasi, approval apply, dan cutover tersendiri sesuai runbook.
