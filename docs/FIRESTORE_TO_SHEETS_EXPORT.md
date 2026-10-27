# Ekspor Firestore ke Google Sheets (satu arah)

## Yang diekspor

Endpoint server-only `GET /api/cron/export-firestore-to-sheets` membaca hanya `workspaces/ar-crm-owner/leads` pada project `ar-crm-73222`, dengan filter `ownerId` yang terikat ke owner di Firestore Rules. Endpoint tidak menerima project, workspace, collection, owner, spreadsheet, atau tab dari request. Tidak ada jalur impor/sinkronisasi dari Sheets kembali ke Firestore.

Tab tujuan harus khusus untuk laporan ini. Kolomnya tetap dan berurutan: `source_key` (ID dokumen Firestore yang stabil, dipakai hanya untuk upsert), `company_name`, `pipeline_stage`, `deal_value`, `lead_score`, `next_followup_date`, `created_at`, dan `updated_at`. Nomor telepon, email, nama kontak, catatan aktivitas, field lain, serta credential tidak diekspor. Google Sheets ditulis dengan `RAW`, sehingga teks yang diawali `=`, `+`, `-`, atau `@` tidak ditafsirkan sebagai formula.

Setiap pelaksanaan memperbarui baris dengan `source_key` yang sama dan menambahkan key yang belum ada. Header yang salah, key ganda, baris data tanpa key, dokumen di luar owner, atau konfigurasi target yang tidak cocok menghentikan ekspor. Bila request gagal setelah sebagian update, pelaksanaan berikutnya membaca key yang sudah tersimpan lalu memperbarui baris itu alih-alih menambahkan salinan. Ekspor tidak menghapus baris ketika sebuah dokumen hilang dari hasil baca; penghapusan/rekonsiliasi data di Sheet tidak termasuk fitur ini. Jangan jalankan dua invocation bersamaan: Google Sheets tidak menyediakan compare-and-swap untuk upsert key; endpoint dimaksudkan untuk satu cron harian.

Cron tidak memiliki sesi login Firebase milik owner; backend memakai service account. Akses IAM service account tidak dibatasi oleh Firestore Security Rules. Karena itu adapter memeriksa root workspace (`ownerId` harus cocok) dan `workspaces/{workspaceId}/members/{ownerUid}` (`role` harus `owner`) sebelum query leads dengan filter owner yang sama. Pemeriksaan kode ini adalah lapisan tambahan, bukan pengganti pemberian IAM paling minimal dan read-only.

## Konfigurasi yang dibutuhkan nanti

Belum ada credential atau spreadsheet ID yang disediakan, dan tidak dibuat dalam pekerjaan lokal ini. Sebelum ekspor dapat berjalan, admin perlu mengatur variabel server-only berikut pada lingkungan Vercel; jangan beri awalan `VITE_` pada secret:

- `CRON_SECRET`: secret acak kuat minimal 32 karakter; Vercel Cron mengirimnya sebagai `Authorization: Bearer ...`.
- `FIRESTORE_EXPORT_PROJECT_ID`: harus tepat `ar-crm-73222`.
- `FIRESTORE_EXPORT_WORKSPACE_ID`: harus tepat `ar-crm-owner`.
- `FIRESTORE_EXPORT_OWNER_UID`: harus tepat sama dengan binding owner di kode dan Firestore Rules.
- `GOOGLE_SHEETS_SPREADSHEET_ID`: ID spreadsheet khusus tujuan; tidak dapat dikirim melalui query/body.
- `GOOGLE_SHEETS_TAB_NAME`: nama tab khusus tujuan, dengan kolom A:H diserahkan untuk ekspor.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` dan `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: credential service account; private key hanya sebagai environment secret server-side.

Service account memerlukan akses baca Firestore minimal/read-only pada project yang tepat serta akses edit pada spreadsheet tujuan; Google Sheets API perlu tersedia untuk credential tersebut. Beri akses ke project/spreadsheet yang tepat saja, jangan beri role IAM yang dapat menulis Firestore. Pekerjaan ini tidak membuat service account, memberi IAM/share access, membuat sheet/tab, atau mengubah Firebase, Google, maupun Vercel.

File `vercel.json`/jadwal Vercel Cron belum ditambahkan karena itu mengubah konfigurasi Vercel. Saat administrasi disetujui, jadwalkan route sekali per hari, misalnya pukul 02:00 UTC; pada paket Hobby jadwal hanya harian dan ketepatan waktunya dapat bergeser sekitar ±59 menit. Endpoint belum akan berjalan otomatis sampai jadwal dan environment Vercel disiapkan. Implementasi ini menghindari Cloud Functions, yang deployment-nya memerlukan Firebase Blaze; tidak ada upgrade billing yang dilakukan.

## Verifikasi lokal

Unit test menggunakan adapter Firestore dan Sheets tiruan. Tidak ada koneksi jaringan, pembacaan data Firestore, atau penulisan Google Sheets dalam test maupun pekerjaan implementasi lokal ini. Endpoint akan menolak konfigurasi yang hilang/tidak cocok sebelum membuat panggilan provider.

Referensi kontrak REST resmi: [Firestore `documents.runQuery`](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/runQuery), [Sheets `values.append`](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append), dan [Sheets `values.batchUpdate`](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate).
