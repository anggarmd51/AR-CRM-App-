# Lead Finder & AI Meeting Summarizer — Status dan Gerbang Rilis

## Yang sudah dibuat secara lokal

Lead Finder dan AI Meeting Summarizer menggunakan model server-side `gemini-3.8-flash`, sesuai [dokumentasi resmi model Gemini](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) yang tercatat pada project. Kunci Gemini tidak dikirim ke browser atau variabel `VITE_*`.

Lead Finder menerima kriteria bisnis/kota, membatasi jumlah hasil, menampilkan fit score 0–100, menandai setiap prospek sebagai belum diverifikasi, dan mewajibkan sumber HTTPS yang bisa diperiksa. Jika generator/sumber tidak tersedia, aplikasi menampilkan error—bukan mengarang prospek lokal. Meeting Summarizer mengirim hanya catatan yang secara eksplisit disetujui untuk saat itu; ID lead, nama kontak, nomor telepon, dan field CRM lain tidak disertakan. Server membatasi input, memerlukan sesi PIN owner, memakai kuota harian bersama, dan memvalidasi JSON hasil.

Pengguna harus menekan “Kirim ke Gemini” dan menyetujui catatan. Jika model tidak tersedia, fallback lokal hanya mengekstrak maksimal tiga kalimat yang sudah ada; ia tidak menambah fakta atau memanggil layanan luar. Ringkasan bisa diedit/dihapus sebelum disimpan. GPS juga hanya diminta sekali saat pengguna menekan tombol dan memberi izin; tidak ada pelacakan latar belakang.

Kedua fitur tetap default-off dan belum ada request Gemini live. Verifikasi memakai mock serta teks sintetis, bukan catatan rapat atau CRM nyata; Search grounding tidak dijalankan karena dapat menimbulkan biaya.

## Environment yang diperiksa

- Audit baca-saja Vercel menunjukkan `GEMINI_API_KEY` hanya terpasang untuk Preview branch `cue/firebase-stabilization`; tidak terdaftar untuk Production. Nilai secret tidak didekripsi atau diubah.
- `VITE_FIREBASE_TARGET=production` tidak terdaftar untuk Production. Karena itu build hosted baru gagal-closed sampai target Firebase Production yang tepat diset.
- Environment Production tidak mendaftarkan variabel server `ACCOUNT_PIN_*`/`FIREBASE_ADMIN_*` yang dibutuhkan alur PIN. Source mengharuskan sesi PIN server-issued untuk mengakses Firestore; Rules juga menolak akses tanpa sesi aktif, sementara endpoint PIN yang ditinjau hanya mengizinkan Preview.
- Tidak ada variabel Vercel, Firebase Production, deployment, alias, ataupun data CRM nyata yang diubah.

## Bukti verifikasi lokal

- `npm test`: 135 lulus, 0 gagal, 1 skip. Test binding staging privat yang skip di suite umum dijalankan oleh emulator staging.
- Firestore Rules/Admin Emulator: production-target 17/17; staging-target 20/20. Bundle Rules staging dibangkitkan sementara dari `.env.staging.local`, UID tidak disimpan di source control, dan file sementara dibersihkan setelah test.
- `npm run lint`, sanitized Production/Preview builds, dan `git diff --check` lulus. `npm audit --omit=dev` melaporkan 0 advisory runtime setelah patch ke `@grpc/grpc-js` 1.14.6; audit penuh memiliki 0 High dan 5 Moderate pada development/tooling dependencies saja.
- Bundle JavaScript masih sekitar 987 kB (gzip sekitar 289 kB), melewati peringatan Vite 500 kB. Scan bundle tidak menemukan marker Gemini API key, Firebase Admin service-account JSON, PIN pepper, atau private key.
- Belum ada uji browser/e2e pada kandidat lokal terbaru, Google Sign-In/CRUD hosted Preview atau Production, maupun request Gemini live.

## Gerbang sebelum penggunaan live

**Jangan commit, push, atau deploy Production dengan konfigurasi saat ini.** Kombinasi target Firebase Production yang hilang dan belum tersedianya endpoint/credential server PIN Production berisiko mengunci owner dari CRM. Deployment Production READY saat ini masih pada commit sebelumnya; Vercel mencatatnya sebagai kandidat rollback.

Sebelum rilis, siapkan dan verifikasi konfigurasi Firebase Production yang benar, jalur PIN server yang aman untuk Production dengan credential service account berhak minimum, dan rollback yang teruji. Konfigurasikan `GEMINI_API_KEY` di Production hanya jika fitur AI live memang hendak diaktifkan. Lakukan uji login serta smoke test read-only terlebih dahulu; jangan mengirim notes nyata ke Gemini atau menulis data Production saat pengujian tanpa persetujuan yang sesuai.
