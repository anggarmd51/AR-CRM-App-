# Draf checklist manual sebelum cutover production

**Status: untuk ditinjau pemilik saja — bukan persetujuan, instruksi deploy, atau izin migrasi.** Disusun dari kode dan dokumentasi lokal branch `cue/firebase-stabilization`. Tidak ada akses ke Vercel/Firebase Console, data production, atau perubahan layanan dalam peninjauan ini.

## 1. Verifikasi Vercel dan environment variables — tugas pemilik

- [ ] Pastikan proyek Vercel yang benar dan domain production yang benar-benar terpasang/aktif. `arcrmapp.vercel.app` adalah **kandidat untuk diverifikasi**, bukan domain yang diasumsikan benar. Catat hasilnya sebagai lulus/gagal; jangan ubah domain dalam langkah ini.
- [ ] Di proyek Vercel tersebut, periksa keberadaan dan scope nama variabel berikut untuk **Production**, **Preview**, dan **Development**. Jangan menyalin nilainya ke dokumen, chat, log, atau screenshot.

  ```text
  VITE_FIREBASE_API_KEY
  VITE_FIREBASE_AUTH_DOMAIN
  VITE_FIREBASE_PROJECT_ID
  VITE_FIREBASE_STORAGE_BUCKET
  VITE_FIREBASE_MESSAGING_SENDER_ID
  VITE_FIREBASE_APP_ID
  VITE_FIREBASE_OWNER_UID
  VITE_FIREBASE_WORKSPACE_ID
  ```

- [ ] Untuk **Production**, pastikan `VITE_FIREBASE_PROJECT_ID` menunjuk tepat ke project `ar-crm-73222`. Cocokkan konfigurasi client lainnya secara privat dengan Firebase Web App **AR CRM Web** pada project yang sama; catat hanya “cocok/tidak cocok”, tanpa nilainya.
- [ ] Branch stabilisasi kini memiliki guard fail-closed untuk **Preview**: build ditolak kecuali `VITE_FIREBASE_TARGET=staging` dan `VITE_FIREBASE_PROJECT_ID` bukan project production yang diketahui. Guard hanya memeriksa konfigurasi saat build; ia tidak membuat atau membuktikan bahwa project staging dan Vercel Preview environment benar-benar sudah disiapkan. Project staging dan environment Preview belum diverifikasi. Pastikan keduanya menunjuk ke project staging terpisah sebelum memakai Preview; tanpa target eksplisit, build hosted akan gagal.
- [ ] Untuk **Development**, pastikan alur lokal memakai Firebase Emulator sebagaimana dirancang. Vercel scope sendiri bukan bukti bahwa suatu build memakai emulator.
- [ ] Cocokkan owner binding dan workspace binding melalui tampilan/rujukan yang berwenang. Workspace yang terdokumentasi adalah `ar-crm-owner`; verifikasi owner UID terhadap nilai yang telah disetujui dan Rules tanpa menyalin atau mencatat UID. Catat hasil lulus/gagal saja.
- [ ] Ingat bahwa nilai `VITE_*` masuk ke bundle client. Jangan menaruh service-account key, token admin, password, atau rahasia server di variabel `VITE_*`.
- [ ] Jika nilai/scope diubah setelah disetujui, perubahan baru berlaku pada build/deployment berikutnya: tinjau scope dan target, lalu lakukan build/deployment ulang hanya setelah persetujuan cutover terpisah. Belum ada perubahan atau redeploy yang dilakukan.

## 2. Google Sign-In dan domain — tugas pemilik

- [ ] Di Firebase Console, pilih project `ar-crm-73222` lalu Authentication → Settings → **Authorized domains**. Periksa hostname aplikasi production yang benar-benar akan dipakai, termasuk apakah kandidat `arcrmapp.vercel.app` memang domain aktif, serta domain production lain bila ada.
- [ ] Cocokkan `VITE_FIREBASE_AUTH_DOMAIN` secara privat dengan domain Auth Firebase Web App yang benar. Periksa hostname aktual dengan cermat; jangan menganggap domain Vercel otomatis diotorisasi hanya karena deployment tersedia.
- [ ] Jika hostname yang dibutuhkan belum ada di Authorized domains, **berhenti** dan minta persetujuan khusus sebelum menambahkannya. Checklist ini tidak mengotorisasi perubahan domain, OAuth, atau consent.
- [ ] Login Google live sebagai owner hanya dilakukan setelah domain dan target project disetujui. Jangan gunakan tes tulis pada Firestore production.

## 3. Rules, sumber data, backup, dan migrasi — tugas pemilik

- [ ] Bandingkan Firestore Rules production yang aktif dengan `firestore.rules` pada branch stabilisasi, terutama pembatasan workspace tunggal, owner/membership, schema, dan relasi Activity→Lead. Status lokal atau tes emulator tidak membuktikan Rules production sama. Bila perlu ada perubahan Rules, perlakukan deploy Rules sebagai tindakan terpisah dengan persetujuan tersendiri.
- [ ] Putuskan secara eksplisit apakah cutover ditunda sampai migrasi disetujui, atau aplikasi baru diluncurkan tanpa data Leads/Activities lama yang akan tetap berada di sumber legacy dan tidak tampil di UI baru.
- [ ] Jangan memakai Google Sheet yang sudah dikosongkan atau menganggapnya sebagai sumber sah. Tunggu sumber operasional yang benar-benar tersedia; sebelum inventaris atau ekspor, setujui file/akun/tab yang tepat, periode, record, field, pemilik data, dan otorisasi baca.
- [ ] Sebelum migrasi apa pun, siapkan backup privat read-only beserta checksum, akses/retensi, dan bukti restore yang berhasil. Setujui mapping dan kebijakan nilai ambigu/karantina; dry-run harus memakai salinan yang disetujui dan/atau data sintetis, tanpa koneksi tulis production.
- [ ] Tinjau manifest redacted, checksum, jumlah valid/ditolak/duplikat/dikecualikan, konflik, relasi Lead–Activity, serta rencana rekonsiliasi dan rollback. Persetujuan apply harus baru dan terikat pada sumber, project/workspace, checksum, operasi, dan jendela waktu yang tepat.
- [ ] Pertahankan sumber lama tanpa perubahan. Jangan lakukan apply, overwrite, sinkronisasi balik, atau penghapusan sebagai bagian dari cutover tanpa persetujuan spesifik terpisah.

## 4. Keputusan akhir cutover — wajib dari pemilik

Sebelum production diizinkan, pemilik perlu menyetujui atau menunda setiap keputusan berikut secara eksplisit:

- [ ] Domain production dan hostname yang akan dipakai.
- [ ] Target Firebase untuk Production dan Preview, serta hasil pemeriksaan environment scopes.
- [ ] Hasil verifikasi Authorized domains dan apakah ada perubahan domain yang diminta.
- [ ] Hasil parity-check Rules production terhadap branch.
- [ ] Pilihan data: cutover dengan CRM baru kosong, atau migrasi yang telah melalui persetujuan dan rekonsiliasi tersendiri.
- [ ] Target deployment/commit yang tepat, promosi dari branch stabilisasi ke jalur production, dan waktu cutover.
- [ ] Rencana monitoring, kriteria berhenti/rollback, backup/restore, serta masa akses read-only ke sumber lama.

Persetujuan migrasi **bukan** persetujuan deploy; persetujuan deploy **bukan** persetujuan perubahan Rules/domain; dan persetujuan pada satu tahap tidak mencakup tahap lainnya. Branch stabilisasi tetap terisolasi sampai ada persetujuan eksplisit untuk tindakan berikutnya.

## Yang dapat dibantu agen kemudian

Setelah ada instruksi dan otorisasi yang jelas, agen dapat membantu pemeriksaan lokal, perbandingan konfigurasi yang telah disediakan melalui jalur berwenang tanpa mencatat nilainya, dan verifikasi dokumentasi. Pemeriksaan cloud read-only memerlukan scope dan akses yang secara khusus disetujui. Perubahan Authorized domains, environment Vercel, Rules, deployment/promosi branch, penulisan production, dan migrasi masing-masing memerlukan persetujuan spesifik; tidak ada yang dijalankan dalam peninjauan ini.
