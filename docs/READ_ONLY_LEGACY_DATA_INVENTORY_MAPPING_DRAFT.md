# Draf Inventaris Read-only dan Mapping Legacy → Firestore

**Status: draf untuk ditinjau; bukan izin membaca sumber aktual atau menjalankan migrasi.** Pemilik menunda cutover. Dokumen ini disusun hanya dari source code, Rules, tipe, tes, dan dokumentasi lokal di repository. Spreadsheet/`localStorage` runtime, Firebase production, Vercel, GAS endpoint, dan layanan live tidak diakses. Tidak ada ekspor, backup, write, migrasi, deployment, atau perubahan data.

## Fakta lokal dan hal yang belum diketahui

- Rules lokal di [`firestore.rules`](../firestore.rules) mengizinkan satu workspace yang dikonfigurasi, koleksi `leads` dan `activities`, serta field payload yang ketat. Kesesuaiannya dengan Rules production belum diverifikasi.
- Tipe UI di [`src/types/crm.ts`](../src/types/crm.ts) mendefinisikan `Lead` dan `Activity`. [`src/firebaseRepository.ts`](../src/firebaseRepository.ts) memetakan data aplikasi ke subkoleksi Firestore; berkas ini tidak dijalankan dalam pekerjaan ini.
- [`src/data/gasCode.ts`](../src/data/gasCode.ts) menyertakan template header untuk tab Sheets `Leads` dan `Activities`. Kode hanya membuat header tersebut ketika tab belum ada; saat membaca, kode memperlakukan baris pertama tab sebagai header yang sedang berlaku. **Maka daftar di bawah adalah kandidat kolom dari kode, bukan verifikasi header spreadsheet aktual.** Akun, file, tab, header nyata, tipe nilai, jumlah baris, rentang tanggal, duplikasi, dan kualitas data belum diketahui.
- [`src/utils/syncQueue.ts`](../src/utils/syncQueue.ts) mendeklarasikan key `personal_crm_leads_v2` dan `personal_crm_activities_v2` dengan bentuk UI `Lead[]`/`Activity[]`; nilai runtime dan perangkat/browser yang memuatnya tidak diperiksa. Helper `CrmStorage.getLeads()` dan `getActivities()` dapat menulis kembali storage ketika membersihkan data dummy. **Jangan gunakan helper itu untuk inventaris read-only.** Perlu metode akuisisi terpisah yang disetujui dan terbukti tidak menulis.
- Tidak ada migrator executable menurut dokumentasi lokal [`FIRESTORE_STAGED_MIGRATION_READINESS.md`](./FIRESTORE_STAGED_MIGRATION_READINESS.md) dan [`FIREBASE_MIGRATION_STATUS.md`](./FIREBASE_MIGRATION_STATUS.md). Struktur dan jumlah data aktual karena itu tetap tidak diketahui.

## Sumber kandidat dan batas tahap awal

| Kandidat | Yang dapat dikonfirmasi dari kode lokal | Status aktual / batas |
|---|---|---|
| Google Sheets tab `Leads` | Template header: `id`, `company_name`, `contact_person`, `phone`, `industry`, `city`, `pipeline_stage`, `deal_value`, `next_followup_date`, `lead_score`, `created_at`, `updated_at`. | Belum membaca spreadsheet. Semua nama kolom template **belum diverifikasi** terhadap tab sebenarnya. |
| Google Sheets tab `Activities` | Template header: `id`, `lead_id`, `activity_type`, `notes`, `ai_summary`, `location_gps`, `created_at`. | Belum membaca spreadsheet. Semua nama kolom template **belum diverifikasi**; data GPS/ringkasan AI bukan target migrasi. |
| `localStorage` browser/perangkat | Kode menyebut key Leads dan Activities di atas; tipe kode UI mencakup `id` dan field CRM, serta timestamp string opsional. `Activity` UI juga punya `ai_summary` opsional. | Kandidat terpisah, bukan sumber otoritatif yang telah dipastikan; isi, jumlah, sinkronisasi, dan kebaruan tidak diketahui. Perangkat/profil harus ditentukan. |
| Queue dan sumber lain | Kode juga menyebut mutation queue, `Global_Leads`, serta `Archive_Logs`. | Di luar cakupan awal. Queue bukan daftar record otoritatif; jangan replay otomatis atau menggabungkannya dengan Leads/Activities. Perlu persetujuan/cakupan tersendiri. |

## Kontrak target Rules lokal

`id` menjadi document ID, bukan field payload. Setiap field payload wajib di bawah harus hadir; field tambahan ditolak Rules lokal. Batas Rules di sini adalah maksimum karakter, kecuali jika disebut lain.

| Koleksi | Field yang diwajibkan, tipe dan batas lokal |
|---|---|
| `workspaces/{workspaceId}/leads/{leadDocId}` | `company_name`: string 1–200; `contact_person`: string 1–200; `phone`: string; `industry` dan `city`: string ≤120; `pipeline_stage`: salah satu `Prospect`, `Meeting`, `Negotiation`, `Closing Won`, `Closing Lost`; `deal_value`: angka ≥0; `next_followup_date`: string kosong atau pola `YYYY-MM-DD` (Rules tidak memastikan tanggal kalender valid); `lead_score`: `Hot`, `Warm`, `Cold`, atau `Unrated`; `ownerId`: string sama dengan UID owner yang terotorisasi; `role`: `owner`; `created_at` dan `updated_at`: Firestore Timestamp. |
| `workspaces/{workspaceId}/activities/{activityDocId}` | `lead_id`: string 1–150, harus merujuk Lead valid milik owner yang sama di workspace yang sama; `activity_type`: string 1–80; `notes`: string ≤12.000; `ownerId`: string sama dengan UID owner yang terotorisasi; `role`: `owner`; `created_at`: Firestore Timestamp. |

Rules hanya menerima `phone` sebagai string agar nol awal tidak hilang. Nilai sumber numerik harus ditinjau dan dikarantina bila nol awal mungkin sudah hilang; jangan mengubahnya secara otomatis. `ai_summary`, `location_gps`, `_syncStatus`, `id` sebagai field, dan kolom lain yang tidak ada di whitelist bukan bagian payload target. UID/workspace tidak boleh ditebak dari data legacy; nilai identitas harus berasal dari konfigurasi yang telah disetujui.

## Format rencana mapping — kolom sumber masih kandidat

`[belum diverifikasi]` menandai nama kolom yang hanya terlihat sebagai template di source GAS, bukan header aktual. Sebelum persetujuan mapping final, cocokkan header dan representasi nilai dari snapshot/ekspor yang secara khusus diizinkan. Jangan membuat default data untuk memenuhi field wajib.

| Target Firestore | Kandidat sumber `Leads` | Kandidat sumber `Activities` | Aturan mapping yang diusulkan |
|---|---|---|---|
| Lead document ID (bukan payload) | `id` **[belum diverifikasi]** | — | Pilih strategi ID deterministik setelah format/keunikan ID disetujui. Simpan source-ID → target-ID hanya pada manifest privat; benturan berbeda-konten menghentikan proses. |
| `company_name` | `company_name` **[belum diverifikasi]** | — | String; validasi wajib 1–200. Jangan mengisi nama contoh/default. |
| `contact_person` | `contact_person` **[belum diverifikasi]** | — | String ≤200; jangan mengarang nilai yang hilang. |
| `phone` | `phone` **[belum diverifikasi]** | — | Kanonisasi ke string tanpa menambah kode negara. Angka sumber yang mungkin kehilangan nol awal dikarantina untuk pemeriksaan. |
| `industry`, `city` | Kolom bernama sama **[belum diverifikasi]** | — | String ≤120; nilai kosong hanya diterima bila memang terwakili sebagai string kosong dan kebijakannya disetujui. |
| `pipeline_stage` | `pipeline_stage` **[belum diverifikasi]** | — | Terima enum target tepat atau gunakan kamus alias yang disetujui; nilai lain dikarantina, bukan diubah ke `Prospect` otomatis. |
| `deal_value` | `deal_value` **[belum diverifikasi]** | — | Parse hanya bila format angka/mata uang dan pemisah ribuan/desimal sudah disepakati; wajib angka non-negatif. Format ambigu, null, atau nilai gagal parse dikarantina; jangan gunakan default GAS. |
| `next_followup_date` | `next_followup_date` **[belum diverifikasi]** | — | String kosong atau tanggal kalender valid `YYYY-MM-DD`; tanggal ambigu/tidak valid dikarantina, tidak ditebak. |
| `lead_score` | `lead_score` **[belum diverifikasi]** | — | Enum tepat `Hot`/`Warm`/`Cold`/`Unrated`; nilai lain perlu keputusan manusia, bukan default. |
| `created_at`, `updated_at` | Kolom bernama sama **[belum diverifikasi]** | — | Konversi ke Firestore Timestamp hanya dengan format dan timezone sumber yang dikonfirmasi. Timestamp hilang/ambigu dikarantina; jangan menggantinya dengan waktu migrasi. |
| Activity document ID (bukan payload) | — | `id` **[belum diverifikasi]** | Tetapkan ID deterministik dan lintas-walk manifest privat, dengan aturan konflik yang sama seperti Lead. |
| `lead_id` | — | `lead_id` **[belum diverifikasi]** | Remap lewat crosswalk ke ID Lead target. Activity tanpa Lead valid di workspace sama dikarantina. |
| `activity_type`, `notes` | — | Kolom bernama sama **[belum diverifikasi]** | Validasi batas Rules. `notes` berisi teks bebas/berpotensi PII: pindahkan hanya jika disetujui eksplisit; selain itu kecualikan/karantina sesuai keputusan pemilik. |
| `created_at` Activity | — | `created_at` **[belum diverifikasi]** | Konversi Timestamp dengan timezone terkonfirmasi; nilai hilang/ambigu dikarantina. |
| Field sumber tanpa target | — | `ai_summary`, `location_gps` **[belum diverifikasi]**; kolom tambahan belum diketahui | Jangan masukkan ke Firestore. Laporkan kategori dan jumlah agregat bila inventaris telah diotorisasi; jangan tampilkan isi. `ai_summary`/GPS dikecualikan, bukan dikirim ke AI atau ditulis ke payload. |
| Field sistem | Tidak berasal dari sumber | Tidak berasal dari sumber | Isi `ownerId` dan `role: owner` hanya dari konteks target yang sudah disetujui; bukan nilai sumber. Jangan menyalin `_syncStatus` atau metadata queue. |

## Hasil inventaris yang aman untuk dibagikan

Setelah ada izin baca yang terbatas, laporan umum sebaiknya hanya berisi nama sumber yang disamarkan, waktu/scope snapshot, versi schema/mapping, checksum, jumlah record per sumber/kategori, jumlah header yang cocok/tidak cocok, duplikat, field wajib kosong/tidak valid, Activity yatim, tipe/tanggal/nilai ambigu, serta jumlah field yang dikecualikan. Jangan masukkan nama kontak/perusahaan, telepon, notes, email, isi baris, atau source ID ke laporan umum/log. Header aktual boleh dilaporkan sebagai schema setelah pemeriksaan privasi; simpan crosswalk dan rincian per record hanya di manifest privat dengan akses terbatas. **Draf ini tidak memuat jumlah, checksum sumber, maupun data record aktual.**

## Validasi dan karantina yang diusulkan

- Validasi payload terhadap whitelist, tipe, batas karakter, enum, tanggal kalender, nilai non-negatif, dan timestamp; jangan mengandalkan konversi Rules untuk menormalkan data.
- Tempatkan baris dengan field wajib hilang/null, format tidak dikenal, nomor telepon numerik berisiko kehilangan nol, stage/score di luar enum, tanggal/timezone ambigu, ID duplikat atau bentrok, dan Activity tanpa Lead yang lolos ke karantina untuk keputusan manusia. Jangan mengarang, menggabungkan, atau overwrite.
- Setiap record pada inventaris/migrasi mendatang harus dihitung tepat pada satu kategori: valid-direncanakan, identik/skip (hanya pada tahap yang diizinkan), karantina/ditolak, atau dikecualikan. Rekonsiliasi kategori dan checksum sebelum minta persetujuan apply.
- Semua pemrosesan persiapan setelah snapshot harus offline dari ekspor yang disetujui dan dry-run; tidak boleh menginisialisasi writer atau menghubungi project production. Ini adalah rancangan perilaku, bukan skrip atau perintah yang dijalankan.

## Persetujuan terpisah sebelum tahap berikutnya

1. **Sebelum membaca sumber aktual:** persetujuan tertulis yang menyebut sumber persis (akun/file/tab atau perangkat/profil), periode/scope, kategori dan field yang boleh diperiksa, tujuan inventaris, operator, serta batas data yang boleh keluar. Persetujuan ini hanya mengizinkan inventaris read-only yang ditentukan; bukan ekspor, backup, atau akses Firestore production. Untuk `localStorage`, tentukan perangkat/profil dan metode non-mutating; jangan panggil helper yang dapat menulis.
2. **Sebelum backup/ekspor:** persetujuan baru untuk cakupan ekspor, lokasi penyimpanan privat terenkripsi, pengelola akses/kunci, retensi dan pemusnahan, checksum, serta uji restore. Membaca/inventaris tidak otomatis mengizinkan backup atau ekspor.
3. **Sebelum apply:** persetujuan eksplisit baru yang terikat ke project, workspace, checksum snapshot/manifest, versi mapping, jumlah dan exception, jendela pelaksanaan, serta prosedur pemulihan. Backup dan restore harus lolos verifikasi. Apply draf ini belum diotorisasi dan tidak boleh menyentuh production.
4. **Sebelum cutover/deployment:** persetujuan terpisah untuk rilis aplikasi, Rules/indexes, konfigurasi domain/provisioning yang relevan, monitoring, komunikasi, dan keputusan kapan sumber lama menjadi read-only/nonaktif. Persetujuan apply tidak mencakup cutover.

Hingga persetujuan tahap yang sesuai diberikan, tidak ada pembacaan data sumber aktual, ekspor/backup, koneksi project production, penulisan, migrasi, atau cutover. Lihat pula [runbook owner dan migrasi](./OWNER_BOOTSTRAP_AND_DATA_MIGRATION_RUNBOOK.md) dan [draf readiness](./FIRESTORE_STAGED_MIGRATION_READINESS.md).
