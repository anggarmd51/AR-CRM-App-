# Make Webhook → AR CRM

## Status

Receiver lokal sudah dibuat di `POST /api/webhooks/make/leads`. Pada 30 Oktober 2026, 17/17 tes webhook dan satu smoke HTTP pada demo Firestore Emulator loopback lulus: create 201, retry 200 dengan ID sama, tepat satu Lead, lalu seluruh fixture Lead/root/member dibersihkan. Ini belum menjadi URL hosted yang aktif. Secret receiver dan Admin staging tersedia melalui penyimpanan secret yang disetujui, bukan source/client env; belum ada skenario Make atau deployment Preview branch ini. Endpoint tetap fail-closed dan tidak menulis ke Production. Jangan mengirim data nyata sebelum Preview staging diprovisikan dan diuji dengan persetujuan pemilik.

Persiapan env hanya untuk Preview branch `cue/ar-crm-operational-features`, dengan seluruh flag runtime dimatikan, ditolak API Vercel (HTTP 400 seluruh batch). Readback memastikan nol variabel branch dibuat dan scope lain tidak berubah. Branch tersebut belum ada di remote; tidak dilakukan commit/push/deploy untuk memaksa provisioning karena general Preview masih berbagi binding Production. Config client dan kandidat Rules staging privat mode `0600` telah dipulihkan/disiapkan lokal; Rules kandidat lulus 25/25 pada demo Emulator, tetapi belum dipublikasikan.

Rules staging live masih versi lama tanpa gate sesi PIN/schema fitur terbaru; kandidat juga mengubah kebijakan delete non-Won dan arsip. Review/persetujuan Rules staging, ketersediaan pepper PIN staging lama (tanpa rotasi/reset diam-diam), publikasi branch yang mencegah auto-deploy tidak aman, domain Auth/reCAPTCHA, serta uji hosted tetap merupakan gate terpisah.

## Mapping satu prospek

Kirim satu objek JSON per request. Field berbahasa Indonesia berikut dikenali langsung:

| Field Make | Field Lead AR CRM | Catatan |
|---|---|---|
| `Nama Usaha/Orang` | `contact_person`; juga `company_name` bila `Perusahaan` tidak dikirim | Bila perusahaan terisi, nilai ini dipakai sebagai nama PIC. Jika hanya nama umum yang dikirim, nilai yang sama dipakai untuk perusahaan dan PIC—kirim nilai perusahaan dan PIC terpisah bila berbeda. |
| `Perusahaan` | `company_name` | Alias Inggris yang diterima: `company_name`, `company`, `business_name`. |
| `Kontak/WhatsApp` | `phone` | Alias yang diterima: `phone`, `phone_number`, `mobile`, `whatsapp`, `kontak`, `telepon`. Kirim sebagai teks agar angka nol/prefix tidak hilang. |
| `Email` | `email` | Opsional; dinormalisasi menjadi huruf kecil dan divalidasi format dasar. Harus ada nomor kontak atau email. |
| `Alamat` | `address` | Disimpan terpisah dari `city`, maksimal 500 karakter; tidak menebak kota dari teks alamat. |
| `city` / `Kota` | `city` | Opsional. |
| `industry` / `Industri` | `industry` | Opsional. |
| `event_id` | ID idempotensi (bukan field Lead) | Sangat disarankan: gunakan ID unik dan stabil dari record/event sumber. ID dokumen CRM adalah hash; event ID asli tidak disimpan di Lead. |

Contoh body:

```json
{
  "event_id": "lead-source-123",
  "Nama Usaha/Orang": "Siti Rahma",
  "Perusahaan": "PT Contoh Niaga",
  "Kontak/WhatsApp": "+62 812-3456-7890",
  "Email": "sales@contoh.id",
  "Alamat": "Jl. Melati No. 7, Jakarta Selatan",
  "Kota": "Jakarta Selatan",
  "Industri": "Retail"
}
```

Lead baru masuk ke tahap `Prospect`, dengan nilai deal `0`, follow-up kosong, dan skor `Unrated`; Make tidak dapat menetapkan owner/workspace/tahap atau mengirim field database arbitrer. Bentuk `{ "lead": { ... } }` atau `{ "data": { ... } }` juga didukung.

## Koneksi Make

Pada skenario Make, tambahkan modul **HTTP → Make a request** setelah sumber prospek:

- Method: `POST`
- URL: `https://<host-Preview-staging-yang-disetujui>/api/webhooks/make/leads`
- Header: `Content-Type: application/json`
- Header: `Authorization: Bearer <MAKE_WEBHOOK_SECRET>`
- Body type: JSON; petakan field sesuai contoh di atas, terutama ID sumber stabil pada `event_id`.

URL Preview sebenarnya harus diisi setelah deployment staging disetujui. Jangan menaruh secret pada URL, body, atau variabel `VITE_*`; simpan hanya sebagai secret server-side di environment Preview dan gunakan header Authorization di Make.

## Perlindungan dan perilaku retry

Receiver hanya dapat aktif dengan flag server-side eksplisit pada Vercel Preview, branch `cue/ar-crm-operational-features`, project Firebase staging tetap `ar-crm-staging-angga-20261027`, workspace `ar-crm-staging-owner`, serta UID staging yang sama dengan binding client. Production, project/workspace lain, deployment branch lain, dan local server tanpa Firestore Emulator loopback ditolak. Di local, target demo Emulator harus tepat `demo-ar-crm-make-webhook` dan flag emulator diaktifkan terpisah.

Admin writer memverifikasi dokumen workspace dan membership owner sebelum menulis, memakai path workspace tetap, validasi field aplikasi, dan transaksi create-only. Tidak ada update/overwrite. Request sukses pertama mengembalikan `201`; retry dengan data yang sama `200` dan ID yang sama; ID event sama dengan isi berbeda `409`. Request maksimum 32 KiB. Error tidak mengembalikan isi prospek atau detail credential. Rules lokal juga mengenali `address` sebagai field opsional dengan panjang maksimum 500 karakter.

Rules staging yang berjalan belum diubah. Webhook Admin dapat menyimpan `address` tanpa melewati validasi mapper, tetapi sebelum fitur alamat di Quick Lead atau koreksi alamat dipakai pada Preview, binding Rules staging harus menerima field opsional tersebut (maksimum 500 karakter). Field alamat kosong/yang tidak berubah tidak ikut dikirim client agar operasi lama tetap kompatibel; rollout Rules staging tetap merupakan gate terpisah.

## Konfigurasi yang belum tersedia

Aktivasi staging nantinya memerlukan `MAKE_WEBHOOK_ENABLED=true`, `MAKE_WEBHOOK_SECRET` acak minimal 32 byte, `MAKE_WEBHOOK_OWNER_UID`, `FIREBASE_ADMIN_PROJECT_ID`, dan `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` yang hanya milik project staging—selain binding `VITE_FIREBASE_*` staging yang sudah disetujui. Seluruh credential Admin tetap server-only. Local Emulator memerlukan `MAKE_WEBHOOK_LOCAL_EMULATOR_ENABLED=true`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, project demo yang tetap, dan workspace/member sintetis di Emulator. Contoh/template tidak mengisi secret atau kredensial.

Belum ada URL webhook hosted atau koneksi skenario Make, dan belum ada deployment Preview branch operasional. Receiver hosted belum diaktifkan. Satu Lead hanya dibuat pada demo Emulator lalu dibersihkan; tidak ada Lead cloud, perubahan Rules cloud, atau perubahan Production pada persiapan ini. Pemeriksaan Console/API bersifat baca-saja, selain percobaan env Vercel yang ditolak seluruhnya tanpa perubahan.
