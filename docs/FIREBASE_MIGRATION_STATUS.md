# AR CRM — Status Integrasi Firebase

Diperbarui pada 26 Oktober 2026 untuk branch `cue/firebase-stabilization`.

## Ringkasan

Cabang ini mengintegrasikan Firebase Authentication dengan Google Sign-In dan Firestore untuk operasi Leads/Activities. Aplikasi hanya membuka CRM jika konfigurasi client cocok dengan binding owner dan workspace pada `firestore.rules`; Rules memvalidasi schema, membership, kepemilikan, dan relasi activity ke lead dalam workspace yang sama. Implementasi sengaja tidak membaca atau mengimpor data lama dari `localStorage`, Sheets, atau GAS.

Konstanta owner/workspace client dicocokkan dengan Rules lewat unit test. Rules lokal kini membatasi akses ke workspace `ar-crm-owner`; tes emulator menolak workspace tambahan sekalipun root dan membership di fixture sintetis cocok. Perubahan Rules lokal belum dideploy oleh pekerjaan ini.

Dalam mode development, aplikasi menghubungkan Auth dan Firestore ke emulator lokal secara default; mode live hanya mungkin lewat opt-out eksplisit `VITE_FIREBASE_USE_EMULATOR=false`. Build production tidak menggunakan emulator.

## Status Firebase dan autentikasi

Project target adalah **AR CRM** (`ar-crm-73222`), dengan Firestore Standard di `asia-southeast1`, Web App AR CRM Web, dan Google provider. Berdasarkan konteks yang disampaikan pemilik, Rules production sudah dideploy dan dokumen workspace serta membership owner sudah dibuat dan diverifikasi sebelumnya. Pada pekerjaan ini tidak ada sesi admin Firebase yang dipakai untuk membaca ulang dokumen production; tidak ada record CRM yang dibaca.

Konfigurasi `.env.local` lokal cocok dengan project dan binding owner/workspace Rules, berizin file `600`, dan tetap diabaikan Git. Nilai konfigurasi tidak dicantumkan di dokumen. Login Google live sebagai owner tidak dilakukan. Karena itu alur popup diperiksa melalui kode dan guard, tetapi belum ada verifikasi E2E login nyata. Authorized domain untuk `arcrmapp.vercel.app` belum diverifikasi dalam pekerjaan ini; tidak ada domain yang ditambahkan ke Firebase Auth.

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

Vercel project `arcrm-app` mempunyai deployment production terbaru dari branch `main`, commit `0f519e4552a07fc5fa5620c23b83a55f621d424c`. Branch `cue/firebase-stabilization` belum dipromosikan. Rilis production memerlukan perubahan masuk ke `main` atau promosi deployment yang setara; tindakan tersebut tidak dilakukan di sini. Jalur itu akan mengganti UI lama yang membaca sumber legacy. Karena data lama belum dipindahkan, pemilik perlu memilih menunda cutover sampai migrasi disetujui, atau menerima bahwa data lama tetap di sumber legacy dan tidak tampil pada aplikasi Firebase baru.

Penyamaan environment variables Vercel dengan konfigurasi lokal tidak dapat diverifikasi pada pekerjaan ini. Production Rules yang aktif juga tidak dibaca ulang. Karena Rules lokal branch sekarang membatasi workspace secara eksplisit, kesamaan versi Rules production dengan branch harus dipastikan sebelum cutover. Jangan menambah `arcrmapp.vercel.app` atau domain lain ke Authorized Domains tanpa persetujuan pemilik jika domain itu belum diizinkan.

## Hasil verifikasi lokal

- `npm test`: **32/32 lulus**, termasuk pemeriksaan kecocokan owner/workspace UI–Rules dan guard mode emulator.
- `npm run test:firestore`: **10/10 lulus** di emulator, termasuk akses owner valid, penolakan non-owner/anonim, schema Leads/Activities, relasi activity, dan penolakan workspace lain.
- `npm run lint` (`tsc --noEmit`): lulus.
- `npm run build`: lulus. Peringatan yang tersisa: Vite config-loader memakai `__dirname` dan bundle JS melebihi batas chunk 500 kB.
- `git diff --check`: lulus.

Tes ini tidak menggantikan Google Sign-In live atau verifikasi read-only dokumen production. Build memvalidasi aplikasi statis; tidak ada data production yang digunakan.

## Gate sebelum production

1. Pemilik menentukan apakah rilis ditunda sampai migrasi operasional yang disetujui, atau dirilis dengan data lama tetap di sumber legacy namun tidak terlihat pada UI baru.
2. Persetujuan eksplisit dibutuhkan sebelum merge/promosi ke `main`; nama branch yang diminta untuk commit/push adalah `cue/firebase-stabilization`.
3. Verifikasi domain Google Auth production dan environment variables Vercel tanpa membocorkan nilainya. Jangan ubah Authorized Domains tanpa persetujuan.
4. Pastikan Rules production sudah cocok dengan branch (khususnya binding workspace tunggal) sebelum mengaktifkan aplikasi baru. Jika perlu memperbarui Rules, deployment Rules memerlukan jalur/otorisasi tersendiri.
5. Migrasi perlu scope, backup/recovery, pemetaan schema, dry-run sintetis, manifest/checksum, rekonsiliasi, approval apply, dan cutover tersendiri sesuai runbook.
