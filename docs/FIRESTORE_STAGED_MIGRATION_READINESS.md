# Draf Kesiapan Migrasi Bertahap ke Firestore

**Status: draf saja — belum menjadi izin untuk membaca, mengekspor, menulis, atau memigrasikan data.** Pemilik memilih menunda cutover. Pada pemeriksaan lokal 27 Oktober 2026, branch `cue/firebase-stabilization` berada di HEAD `a6670b8`; working tree berisi perubahan lokal yang sudah ada dan tetap dipertahankan. Tidak dilakukan perbandingan remote ref. Deployment production terakhir yang diketahui berasal dari branch stabilisasi pada commit `f010c46`; statusnya tidak diperiksa ulang saat pembaruan ini. Tidak ada push, promosi, atau deployment dalam pekerjaan ini. Draf ini disusun dari schema dan kode lokal, tanpa membuka data operasional.

## Ringkasan yang perlu diketahui

- Target aplikasi lokal adalah `workspaces/ar-crm-owner`, dengan subkoleksi `leads` dan `activities`.
- Kandidat sumber awal di runbook adalah Google Sheets `Leads` dan `Activities`. Spreadsheet, tab, akun, jumlah record, rentang tanggal, dan otoritas sumber belum dikonfirmasi atau diperiksa.
- `localStorage` hanya kandidat sumber jika pemilik secara khusus menyetujuinya; cache tidak dianggap sebagai sumber terbaru. `Global_Leads`, `Archive_Logs`, GAS, GPS, dan ringkasan AI berada di luar cakupan awal.
- Repository ini belum memiliki migrator executable. Belum ada ekspor, backup, dry-run dari record nyata, write, atau migrasi.
- Rules lokal menetapkan satu workspace dan kontrak schema. Paritas SHA dengan Rules production pernah dikonfirmasi pada pemeriksaan terdahulu; tidak diperiksa ulang pada pembaruan dokumen ini.
- Guard deployment lokal sekarang mensyaratkan target staging yang eksplisit dan project Firebase terpisah untuk Preview. Belum ada project Firebase staging atau environment Preview yang dikonfigurasi; jangan menganggap Preview sudah terisolasi.
- Backup/restore belum disiapkan atau diuji. Pada paket Spark, Firestore scheduled backups dan managed export/import tidak tersedia; keduanya memerlukan Blaze. Ekspor ke Google Sheets adalah jalur laporan dan bukan backup.
- App Check baru dipersiapkan di kode lokal untuk staging dengan enforcement nonaktif. Belum ada provider/site key staging atau metrik Console yang diperiksa.

## Kontrak target lokal

Payload harus berisi **field yang diizinkan saja**. `id` adalah document ID, bukan field payload. Sumber lapangan yang tidak sesuai tidak boleh disisipkan sebagai field tambahan.

| Collection | Field payload yang diwajibkan | Aturan utama |
|---|---|---|
| `workspaces/{workspaceId}/leads/{leadId}` | `company_name`, `contact_person`, `phone`, `industry`, `city`, `pipeline_stage`, `deal_value`, `next_followup_date`, `lead_score`, `ownerId`, `role`, `created_at`, `updated_at` | `company_name` wajib 1–200 karakter, `contact_person` 1–200, dan `phone` string; stage: `Prospect`, `Meeting`, `Negotiation`, `Closing Won`, `Closing Lost`; score: `Hot`, `Warm`, `Cold`, `Unrated`; nilai transaksi non-negatif; tanggal follow-up `''` atau `YYYY-MM-DD`; timestamp Firestore untuk `created_at`/`updated_at`; `role` harus `owner`. |
| `workspaces/{workspaceId}/activities/{activityId}` | `lead_id`, `activity_type`, `notes`, `ownerId`, `role`, `created_at` | `lead_id` harus menunjuk Lead valid di workspace yang sama; `activity_type` 1–80 karakter; `notes` maksimal 12.000 karakter; `created_at` Timestamp Firestore; `role` harus `owner`. |

Batas tambahan Rules: nama perusahaan dan kontak wajib string 1–200 karakter; industri/kota string maksimal 120; nomor telepon harus string agar nol awal dapat dipertahankan. Angka telepon sumber yang mungkin sudah kehilangan nol awal masuk karantina. Tanggal harus divalidasi sebagai tanggal kalender nyata—pemeriksaan Rules lokal hanya memastikan format teks `YYYY-MM-DD`.

Owner harus cocok dengan owner yang disetujui dan dokumen root/membership untuk workspace harus sudah diprovisikan melalui jalur administratif. Client tidak boleh membuat atau mengubah root workspace maupun membership. Activity yang tidak memiliki Lead induk valid harus dikarantina. Rules client menolak field tambahan; `ai_summary` ada pada tipe UI tetapi tidak termasuk payload Firestore yang diizinkan. GPS/koordinat juga tidak boleh dimigrasikan.

Rujukan kontrak: [Firestore Rules lokal](../firestore.rules), [repository Firestore](../src/firebaseRepository.ts), [tipe CRM](../src/types/crm.ts), dan [runbook bootstrap/migrasi yang ada](./OWNER_BOOTSTRAP_AND_DATA_MIGRATION_RUNBOOK.md).

## Tahap dan gerbang kesiapan

| Tahap | Pekerjaan yang direncanakan | Syarat untuk lanjut |
|---|---|---|
| 0. Tetapkan cakupan | Pemilik menentukan sumber persis, akun/file/sheet/tab, kategori record, rentang tanggal, field yang boleh dipindah, sumber otoritatif, dan pengecualian. Tetapkan operator, approver, dan reviewer. | Persetujuan eksplisit untuk sumber dan ruang lingkup; jangan mengakses data sebelum ada. |
| 1. Inventaris dan snapshot | Setelah izin terpisah, lakukan inventaris read-only. Catat waktu snapshot, jumlah record, checksum input, perubahan sumber, dan rencana freeze atau menangkap delta. | Sumber dan akses baca yang tepat disetujui; drift sejak snapshot dapat diketahui. |
| 2. Backup dan pemulihan | Buat backup read-only yang terenkripsi dan aksesnya terbatas. Catat checksum, cakupan, jumlah, retensi, pengelola akses, dan bukti uji restore. Sumber lama tetap tidak berubah. | Backup utuh dan restore berhasil diuji sebelum apply; tanpa ini tidak ada write production. |
| 3. Mapping dan validasi offline | Tetapkan versi mapper/schema, normalisasi timestamp/timezone, aturan nilai kosong, telepon, tanggal, deduplikasi, karantina, serta strategi document ID deterministik. Simpan pemetaan source-ID → target-ID pada manifest privat, bukan sebagai field Firestore. | Semua aturan mapping disetujui; nilai ambigu tidak ditebak; PII tidak dicetak ke log. |
| 4. Dry-run | Saat ini hanya fixture sintetis di Emulator. Setelah snapshot nyata disetujui, dry-run boleh membaca file ekspor yang disetujui dan menghasilkan rencana tanpa koneksi tulis production. | Tidak ada `set`, `update`, atau `delete`; hasil berisi jumlah per kategori, ID target, konflik, orphan, dan field yang dikecualikan. |
| 5. Persetujuan apply | Pemilik meninjau manifest redacted, checksum snapshot, mapping version, jumlah target, exception/karantina, project/workspace, waktu pelaksanaan, dan rencana pemulihan. | Persetujuan apply baru, eksplisit, belum kedaluwarsa, terikat pada checksum dan target yang sama. Persetujuan cutover atau deployment bukan pengganti persetujuan apply. |
| 6. Apply terbatas | Hanya setelah gerbang sebelumnya: gunakan writer administratif dengan akses minimum dan allowlist project/workspace. Admin SDK melewati Firestore Rules, jadi validasi harus diterapkan ulang pada migrator. Buat secara create-only dengan batch/checkpoint terbatas. | Konflik, dokumen target tak terduga, mismatch checksum, perubahan jumlah, kegagalan izin, atau error schema menghentikan run; jangan overwrite otomatis. |
| 7. Rekonsiliasi dan penerimaan | Cocokkan sumber dengan hasil; verifikasi owner/workspace, schema, hubungan Activity→Lead, jumlah, hash, field terlarang, serta sampel yang disetujui. Jalankan smoke test read-only dan uji restore/rollback. | Tidak ada selisih tak terjelaskan; pemilik menandatangani hasil. Cutover aplikasi tetap gerbang persetujuan terpisah. |

Dry-run dan semua tes saat ini memakai data sintetis saja. Dokumen ini tidak menyertakan kode migrasi atau perintah apply. Jangan menambahkan `--apply`, kredensial service account, atau koneksi ke project production dalam pekerjaan persiapan ini.

## Aturan idempotensi, rekonsiliasi, dan berhenti

Gunakan document ID deterministik hanya setelah strategi dan kunci sumber disetujui. Catat source-to-target mapping dan hash konten ternormalisasi di manifest privat. Jika target belum ada, rencanakan create-only; jika dokumen identik sudah ada, tandai `skip-identical`; jika berbeda, hentikan dan minta resolusi manusia. Rerun harus memakai snapshot dan manifest yang sama serta tidak boleh menimpa perubahan sesudah migrasi.

Setiap baris sumber harus masuk tepat satu kategori yang disetujui, misalnya dibuat, sudah identik, dikarantina/ditolak, atau dikecualikan. Hentikan proses bila ada konflik ID/hash, Activity yatim, owner/workspace salah, field tak dikenal, backup/checksum berbeda, perubahan sumber yang tidak tercakup snapshot, atau dokumen target di luar daftar yang disetujui. Jangan menyembunyikan exception dengan menebak, menggabungkan, atau menghapus record.

## Pemulihan dan cutover

Nonaktifkan akses aplikasi atau hentikan migrasi untuk containment; ini **bukan** rollback data. Sumber legacy tidak boleh diubah atau dihapus. Jika penghapusan kompensasi benar-benar diperlukan, itu harus menjadi prosedur administratif dan persetujuan tersendiri, terbatas pada ID yang dibuat run tersebut dan hash yang masih sama. Dokumen yang berubah sejak migrasi adalah konflik dan tidak boleh dihapus otomatis. Uji restore backup dan rollback partial-batch di Emulator/staging sebelum persetujuan apply production.

Cutover Firebase tetap ditunda sesuai keputusan pemilik. Deployment aplikasi, Rules, indexes, perubahan Authorized Domains, provisioning workspace, penulisan production, migrasi, dan penonaktifan sumber legacy adalah tindakan yang berbeda; masing-masing memerlukan pemeriksaan dan persetujuan yang sesuai. Tidak ada satu persetujuan sebelumnya yang boleh dianggap mencakup semuanya.

## Informasi yang masih perlu diputuskan nanti

1. Sumber otoritatif dan identitas spreadsheet/file/tab atau ekspor yang tepat.
2. Jenis record dan rentang waktu yang masuk—termasuk apakah Activities ikut dipindahkan.
3. Kunci unik sumber, format ID, aturan duplikasi, dan cara mempertahankan relasi Lead–Activity.
4. Kebijakan untuk nilai kosong/ambigu, tanggal dan timezone, timestamp historis, dan telepon numerik.
5. Apakah notes disimpan, berapa lama, serta field legacy mana yang dikecualikan atau perlu keputusan privasi khusus.
6. Lokasi backup privat, retensi, pemegang akses/kunci, dan bukti restore.
7. Konfigurasi live Rules, indexes, project/workspace, Authorized Domain, dan prosedur rollback yang akan diperiksa melalui jalur berwenang sebelum cutover.

**Langkah berikutnya setelah pemilik siap:** minta persetujuan tertulis untuk sumber dan backup terlebih dahulu, lalu lengkapi inventaris dan mapping. Sampai keputusan itu diberikan, tidak ada pembacaan/ekspor data operasional atau perubahan production.
