# AR CRM — Runbook Bootstrap Owner dan Migrasi Aman

## Status dan batas aman

Dokumen ini adalah prosedur persiapan, bukan otorisasi untuk menjalankan migrasi. Menurut verifikasi terdahulu, Firestore Rules production telah dideploy dan root workspace serta membership owner sudah dibuat dan diverifikasi; paritas SHA Rules production dengan file lokal juga pernah dikonfirmasi. Status cloud tersebut tidak diperiksa ulang pada pembaruan dokumentasi ini. Tidak ada record CRM operasional yang dibaca, diekspor, ditulis, atau dimigrasikan. Jangan mengubah Google Sheets/GAS maupun sumber data lama.

Aplikasi memiliki layar bootstrap Google Sign-In yang hanya menampilkan email akun dan Firebase Auth UID. Owner UID sudah dikonfirmasi menurut konteks pemilik; konfigurasi lokal cocok dengan owner/workspace binding di Rules. Jika konfigurasi tidak ada atau berbeda, aplikasi tetap tertutup dan tidak memilih owner secara otomatis.

Bootstrap hanya tersedia pada development loopback (`localhost`, `127.0.0.1`, atau IPv6 loopback); tidak ada hostname preview/publik yang diizinkan dan build production tidak menyediakan bootstrap. Pengecualian hostname preview lama sudah dihapus dari kode karena domain tersebut dicabut dari Firebase Auth. Tidak ada alur registrasi workspace/member. Pemilik sebelumnya melaporkan login live owner berhasil dan domain `arcrmapp.vercel.app` telah diotorisasi; status cloud itu tidak diperiksa ulang pada pembaruan dokumentasi ini. Perlu dibedakan: [Google Sign-In membuat entri Firebase Auth pada login pertama](https://firebase.google.com/docs/auth/web/google-signin#next_steps); Firestore Rules mengunci data CRM, bukan pembuatan Auth user. Larangan mutlak pembuatan Auth user selain owner memerlukan keputusan konfigurasi/arsitektur terpisah; [blocking functions memerlukan Firebase Authentication with Identity Platform](https://firebase.google.com/docs/auth/extend-with-blocking-functions). Tidak ada perubahan Authorized Domains, OAuth consent, plan, atau konfigurasi tersebut yang dilakukan di sini.

## 1. Verifikasi Google Sign-In (tanpa login live pada task ini)

Login live owner sebelumnya berhasil menurut laporan pemilik. Pemeriksaan kode memastikan client memakai `signInWithPopup` dan tidak membuka CRM untuk UID yang tidak cocok. Uji CRUD owner di production belum selesai diverifikasi; login live, domain, dan data production tidak diperiksa ulang dalam pembaruan dokumentasi ini.

1. Untuk uji UI lokal, jalankan Auth dan Firestore Emulator lalu buka preview localhost. Aplikasi development selalu menghubungkan Firebase ke emulator; tidak tersedia opt-out environment ke project live.
2. Uji lokal dengan akun/fixture sintetis di Auth Emulator. Ini menguji gate aplikasi, bukan konfigurasi Google OAuth live.
3. Login Google live hanya dilakukan bila pemilik sendiri memilihnya pada domain yang sudah diotorisasi. Jangan menambah domain atau mengubah consent tanpa persetujuan terpisah; jangan jalankan tes tulis menggunakan Firestore production.
4. Jangan menyalin token, cookie, kode verifikasi, atau kata sandi. UID adalah pengenal konfigurasi, bukan token akses.

## 2. Pengikatan owner dan validasi lokal

1. Owner/workspace binding lokal saat ini sudah cocok dengan Rules, dan tes unit mengunci konsistensi tersebut. Jangan mengganti UID atau membaca isi `.env.local` ke log. File itu harus tetap diabaikan Git dan permission-nya tetap terbatas.
2. Workspace yang disetujui adalah `ar-crm-owner`. Menurut konteks pemilik, root workspace dan membership owner di production sudah dibuat dan diverifikasi; jangan membuat duplikat. Bila dibutuhkan, verifikasi ulang hanya secara read-only melalui jalur admin yang berwenang.
3. Jalankan tes Firestore Emulator. Tes menggunakan UID/workspace sintetis; jangan mengganti fixture emulator dengan record nyata. Uji unauthenticated, akun lain, owner sah, workspace tambahan yang memiliki membership sekalipun, workspace tanpa membership/ownership, perubahan owner/role, penulisan membership, relasi activity lintas workspace, schema/tipenya, GPS/field tak dikenal, serta Rules sumber yang belum dikonfigurasi.
4. Untuk menguji aplikasi setelah binding tanpa menyentuh database produksi, jalankan Auth dan Firestore Emulator sebelum membuka layar CRM. Development tersambung ke `127.0.0.1:9099` dan `127.0.0.1:8080`; pengaturan environment tidak dapat mengalihkan koneksi development ke layanan live.
5. Untuk workspace baru di masa depan, administrator harus membuat root `workspaces/{workspaceId}` dan membership `{role: 'owner'}` melalui jalur administratif tepercaya. Client tidak boleh membuat atau memperbarui workspace, membership, maupun role. Provisioning baru dan deployment Rules memerlukan persetujuan terpisah; tidak dilakukan oleh runbook ini.

## 3. Sumber dan pemetaan data yang direncanakan

Migrasi pertama sebaiknya dibatasi pada data operasional yang secara eksplisit disetujui:

| Sumber lama | Tujuan | Catatan keselamatan |
|---|---|---|
| `Leads` di Google Sheets | `workspaces/{workspaceId}/leads/{docId}` | Pertahankan ID sumber dalam manifest migrasi lokal, bukan sebagai field tambahan yang tidak diizinkan Rules. Normalisasi stage, nilai transaksi, tanggal, dan phone tanpa menebak nilai yang hilang. |
| `Activities` di Google Sheets | `workspaces/{workspaceId}/activities/{docId}` | Remap `lead_id` ke dokumen lead hasil migrasi; jangan masukkan activity jika lead induknya tidak lolos validasi. |
| `localStorage` CRM pada perangkat | Data sumber kandidat, bukan auto-import | Ekspor hanya dengan persetujuan dan dari perangkat yang ditentukan. Bandingkan berdasarkan ID sumber; jangan menganggap cache lokal sebagai sumber terbaru. |
| `Global_Leads`, `Archive_Logs`, atau sumber lain | Di luar tahap awal | Perlu cakupan dan persetujuan tersendiri. Jangan panggil endpoint GAS lama atau menjalankan sinkronisasi dua arah. |

Field GPS/koordinat harus dikeluarkan dan dilaporkan sebagai jumlah yang dikecualikan; jangan migrasikan GPS. Catatan dan ringkasan AI tidak dikirim ke layanan AI. `ai_summary` tidak termasuk schema penulisan client saat ini; pertahankan hanya dalam backup sumber bila memang diperlukan, lalu minta keputusan/consent terpisah sebelum menentukan penanganannya. Jangan menghapus/menimpa salinan sumber.

### Schema dan canonicalization v1

Lead wajib berisi `company_name` string 1–200 karakter; `contact_person` string 1–200; `industry`/`city` string maksimal 120; `phone` dinormalisasi sebagai string tanpa mengarang kode negara; `pipeline_stage` salah satu Prospect/Meeting/Negotiation/Closing Won/Closing Lost; `deal_value` angka non-negatif; `next_followup_date` kosong atau `YYYY-MM-DD`; `lead_score` Hot/Warm/Cold/Unrated; `ownerId` UID owner terverifikasi; `role` bernilai `owner`; dan `created_at`/`updated_at` Firestore Timestamp. Activity wajib berisi `lead_id` hasil remap, `activity_type` string 1–80, `notes` string maksimal 12.000, `ownerId`, `role: owner`, dan `created_at` Timestamp. Field lain dikeluarkan ke laporan karantina, bukan disisipkan diam-diam.

Nilai `null`, kolom hilang, tanggal ambigu/tidak valid, timezone tak diketahui, nomor telepon numerik yang kehilangan nol awal, atau ID bentrok masuk karantina untuk resolusi manusia; jangan menebak nilai. Tanggal historis harus dikonversi dari timezone sumber yang disetujui ke Timestamp. Manifest menyimpan versi mapper/schema/canonicalization, encoding UTF-8, urutan key stabil, hash SHA-256 konten ternormalisasi, checksum input, serta pemetaan ID sumber ke ID target. Benturan ID berbeda-konten selalu menghentikan apply. Rerun/resume memakai manifest yang sama: dokumen identik di-skip; dokumen berbeda tidak ditimpa.

## 4. Tahap migrasi setelah persetujuan terpisah

1. **Persetujuan dan inventaris:** setujui sumber, akun/Sheet yang tepat, periode data, pemilik data, field yang boleh dipindah, kebijakan catatan/AI/GPS, target project/workspace, serta jendela migrasi. Pastikan otorisasi akses baca ke sumber dan tulis ke target.
2. **Backup read-only:** ekspor sumber yang disetujui ke arsip terenkripsi/akses terbatas, simpan checksum SHA-256, waktu, cakupan, dan jumlah record. Sebelum ekspor, tetapkan pengelola kunci, lokasi penyimpanan privat, pihak yang boleh mengakses, audit akses, masa retensi, uji restore, dan cara pemusnahan arsip setelah masa retensi. Jangan mengubah spreadsheet, GAS, localStorage sumber, atau record lama.
3. **Normalisasi offline:** transformasikan salinan ekspor menjadi JSON/NDJSON lokal. Validasi tipe dan ukuran, enum pipeline/score, tanggal ISO, nilai deal non-negatif, ID unik, serta referensi activity ke lead. Buat laporan valid/ditolak/duplikat tanpa mencetak isi PII ke log.
4. **Dry-run sintetis:** jalankan mapper terhadap fixture sintetis pada Firestore Emulator atau project staging terpisah. Dry-run adalah default; tidak ada operasi `set`, `update`, atau koneksi ke project produksi. Hasilkan manifest jumlah per koleksi, ID yang akan dibuat, konflik, dan field yang dikecualikan.
5. **Deduplikasi/idempotensi:** gunakan ID sumber stabil yang di-encode secara aman sebagai doc ID atau pemetaan deterministik yang dicatat dalam manifest privat. Jika ID target belum ada, rencanakan create-only. Jika sudah ada dengan konten sama, tandai `skip-identical`; jika isinya berbeda, hentikan dan minta resolusi manusia. Jangan memakai upsert/merge yang menimpa data tanpa audit.
6. **Rekonsiliasi pra-apply:** bandingkan hitungan sumber, tujuan yang direncanakan, lead tanpa activity, activity tanpa lead, duplicate, invalid, dan record yang dikecualikan. Sampel pengecekan dilakukan dari salinan terotorisasi, bukan dari log umum. Pemilik menyetujui manifest dan checksum sebelum mode apply.
7. **Apply bertahap:** hanya setelah persetujuan khusus, gunakan batch kecil yang idempotent dengan batas laju, retry terbatas, checkpoint per batch, dan audit log tanpa isi PII. Manifest per batch mencatat tepat ID target yang dibuat/di-skip, hash, hasil commit, dan checkpoint terakhir; resume memeriksa dokumen target sebelum create-only. Pertahankan sumber lama read-only dan jangan menulis balik ke Sheets/GAS/localStorage. Hentikan otomatis bila ada conflict, permission denial, perubahan jumlah tak terduga, atau error validasi.
8. **Validasi pascamigrasi:** hitung kembali lead/activity, cek relasi, owner/workspace, stage/score, rentang nilai/tanggal, field terlarang, dan hasil sampling. Jalankan semua tes Rules terhadap target/staging; verifikasi query aplikasi tanpa melakukan mutasi uji pada record nyata.
9. **Cutover:** lakukan hanya setelah persetujuan terpisah terhadap deployment Rules/indexes, pembuatan membership oleh administrator, backup/recovery, monitoring, dan rencana komunikasi. Pertahankan akses sumber lama sebagai read-only sampai masa penerimaan selesai.

## 5. Draf perilaku skrip migrasi

Skrip masa depan harus default ke dry-run dan menerima file ekspor eksplisit; jangan otomatis membaca Google Sheets, `localStorage`, atau memanggil GAS.

Hard guard wajib: dry-run tidak menginisialisasi koneksi Firestore tulis sama sekali. Mode apply menolak `ar-crm-73222` sampai ada approval cutover terpisah yang terikat pada project, workspace, checksum manifest, operasi, pemberi persetujuan, dan masa berlaku. Pada apply pertama, abort bila ada record operasional target atau dokumen tak dikenal; hanya bootstrap root/membership yang secara eksplisit disetujui boleh ada. Pada resume, hanya ID identik yang tercantum dalam manifest run tersebut boleh sudah ada. Jika kelak memakai Admin SDK, ingat bahwa SDK administratif melewati Security Rules: IAM, allowlist target, validasi schema, dan create-only precondition wajib ditegakkan di skrip juga.

```text
parse --input <authorized-export.ndjson> --target-project <explicit-project-id>
      --workspace <approved-workspace-id> [--apply]

if --apply is absent:
    do not initialize a Firestore write client or contact production
    validate source checksum, schema, duplicate keys, and lead/activity references
    emit redacted plan + counts + conflicts; perform zero Firestore writes
else:
    require unexpired approval bound to project, workspace and manifest checksum
    refuse ar-crm-73222 unless an explicit later cutover approval permits it
    assert target project and workspace match the approved allowlist
    abort on any unexpected existing target document
    for each record in deterministic order:
        validate and sanitize against the reviewed mapping
        if document absent: create-only in bounded batch
        if document exists and normalized hash matches: skip-identical
        if document exists and hash differs: stop; never overwrite
        checkpoint batch result without recording PII
    emit final counts and reconciliation report
```

Mode apply tidak boleh dibangun/diaktifkan sampai target Rules, backup, account authorization, mapping final, dan persetujuan tertulis spesifik tersedia. Skrip tidak boleh menghapus atau mengubah sumber lama.

## 6. Rollback dan kriteria penerimaan

Jika validasi gagal atau hasil berbeda dari manifest, hentikan job, nonaktifkan akses aplikasi ke workspace hasil migrasi, dan pertahankan snapshot/checkpoint untuk investigasi. Jangan mencoba “memperbaiki” dengan menulis balik ke sumber lama. Bila perlu membatalkan data tujuan, lakukan tindakan administratif terpisah setelah ekspor/audit dan persetujuan pemilik; jangan menghapus sumber lama.

Menonaktifkan akses hanya containment, bukan rollback data. Sebelum apply produksi, uji rollback partial-batch di emulator/staging menggunakan manifest ID yang tepat. Prosedur compensating delete harus admin-only, mendapat persetujuan terpisah, dan hanya menghapus dokumen yang dibuat run tersebut serta masih memiliki hash yang sama; perubahan sejak migrasi adalah konflik yang harus dihentikan dan ditinjau. Jangan menghapus dokumen `skip-identical`, dokumen di luar manifest, atau sumber lama. Pemulihan dari backup harus diuji sebelum cutover.

Migrasi baru dapat diterima jika jumlah sumber yang disetujui sama dengan jumlah hasil valid + ditolak + duplikat + dikecualikan; semua activity memiliki lead yang benar dalam workspace sama; tidak ada owner/role menyimpang, GPS, atau field tak dikenal; tidak ada konflik yang ditimpa; Rules menolak akses anonim/non-owner; dan owner menyetujui rekonsiliasi serta hasil sampling.

Acceptance test juga wajib membuktikan: rerun menghasilkan `skip-identical` tanpa duplikasi; crash/resume tidak overwrite; dry-run tidak membuka jalur tulis/produksi; input hanya file ekspor eksplisit; tidak ada pembacaan otomatis localStorage/Sheets/GAS atau sinkronisasi balik; geolocation tidak diminta, disimpan, atau dikirim; `ai_summary` tidak masuk payload client; pemrosesan AI atas notes tetap diblokir tanpa consent eksplisit; dan rollback batch serta restore backup dapat diselesaikan. Bukti persetujuan scope/backup/manifest/apply/rollback disimpan privat bersama manifest. Pemisahan operator dan approver dipakai bila tersedia; persetujuan owner tidak boleh diasumsikan dari diam atau dari approval tahap sebelumnya.

## Belum dieksekusi

Menurut konteks pemilik, owner UID sudah dikonfirmasi, Firestore production Rules telah dideploy, dan dokumen workspace/membership owner sudah dibuat serta diverifikasi sebelumnya. Agent tidak melakukan live login sebagai owner atau pembacaan ulang dokumen production. Pada pekerjaan ini tidak ada Rules/indexes/hosting yang dideploy, tidak ada domain Auth yang diubah, tidak ada ekspor data operasional, dan tidak ada migrasi. Rilis aplikasi production tetap memerlukan keputusan cutover karena sumber legacy belum dimigrasikan dan dapat tidak terlihat pada UI Firebase baru.
