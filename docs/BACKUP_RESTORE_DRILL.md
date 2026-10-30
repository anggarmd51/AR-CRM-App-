# CRM backup–restore drill lokal

## Yang diekspor aplikasi saat ini

Aplikasi menyediakan snapshot JSON skema v1 yang memuat Lead, Activity, arsip Won, ringkasan, status kelengkapan, serta hitungan celah relasi. JSON itu adalah snapshot klien, bukan backup otomatis Firestore; aplikasi belum menyediakan tombol impor atau pemulihan operasional.

CSV yang tersedia hanya rekap Lead dengan 13 kolom: ID, nama perusahaan, PIC, email, telepon, industri, kota, tahap, nilai, tanggal follow-up, skor, status sinkronisasi, dan waktu dibuat. CSV tidak mencakup Activity maupun arsip Won, serta tidak menyertakan alamat, `updated_at`, owner, atau workspace. Drill menguji serialisasi dan baca-ulang CSV dari Lead sintetis yang dibaca dari Emulator, lalu membandingkan semua 13 kolom per baris. Ini bukan restore ke Firestore: aplikasi tidak memiliki parser atau jalur impor CSV, sehingga CSV tidak dapat memulihkan keseluruhan Lead secara akurat tanpa metadata dan field yang hilang.

## Jalankan drill

Dari root repo, jalankan:

```sh
npm run test:backup-restore
```

Perintah ini memulai Firestore Emulator lokal dengan project ID eksplisit `demo-ar-crm-rules`. Utilitas menolak berjalan jika project tidak diawali `demo-`, `GCLOUD_PROJECT` tidak sama persis dengan argumen project, atau `FIRESTORE_EMULATOR_HOST` bukan alamat loopback. Ia tidak memakai kredensial Firebase, kredensial Admin cloud, staging, atau Production.

Drill membuat workspace dan owner sintetis acak, lalu menulis 3 Lead, 1 Activity, dan 1 arsip Won ke namespace yang sebelumnya harus kosong. Ia membaca kembali dokumen dari Emulator, membangun JSON memakai pembuat ekspor aplikasi, menulis dan membaca ulang file sementara, serta memvalidasi skema v1, kelengkapan snapshot, ID, owner/workspace, field, timestamp, hubungan Activity→Lead, serta pasangan Lead Won↔arsip. CSV Lead ditulis ke file sementara dan dibaca ulang untuk membandingkan 39 nilai (3 baris × 13 kolom); hasil ini hanya memvalidasi format ekspor/readback, bukan pemulihan CSV ke Firestore.

Sebelum restore, drill menghapus hanya dokumen fixture yang isinya cocok persis dengan data sintetis yang dibuatnya dan memastikan namespace kosong. Utilitas kemudian membuktikan bahwa dokumen sentinel yang sudah ada membuat restore ditolak tanpa perubahan. Restore memakai operasi `create` atomik—bukan `set` yang dapat menimpa—ke namespace kosong yang sama. Hasil dibaca kembali dan dibandingkan dengan ekspor, termasuk ID, field, timestamp, relasi, total, dan hitungan integritas. Akhirnya fixture dan sentinel dibersihkan dan namespace diverifikasi kosong.

Bundle yang rusak, versi selain v1, snapshot cache/tertunda/gagal, workspace atau owner yang tidak cocok, ID tidak aman, record malformed, activity/arsip yatim, atau arsip yang tidak cocok dengan Lead Won akan ditolak sebelum penulisan. Timestamp mengikuti presisi milidetik yang sudah dipakai ekspor klien (`toISOString`).

## Batas penggunaan

Utilitas ini sengaja hanya merupakan harness pengujian lokal untuk data sintetis. Ia bukan jalur restore pengguna dan tidak boleh diarahkan ke project nyata. Tidak ada restore CSV. Keberhasilan drill lokal tidak mengesahkan hosted staging ataupun Production, dan tidak mengubah status NO-GO Production.
