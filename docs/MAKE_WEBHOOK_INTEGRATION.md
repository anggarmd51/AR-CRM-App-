# Make Webhook → AR CRM

## Status

Receiver tersedia di `POST /api/webhooks/make/leads`. Pada 30 Oktober 2026, seluruh 202 unit test, lint TypeScript, build Vite, serta 22 tes Firestore Emulator lulus. Tes webhook mencakup pemetaan field, otorisasi, idempotensi, validasi, dan target staging/emulator.

Guard receiver menyetujui hanya Preview branch `cue/firebase-stabilization`. Tiga variabel `MAKE_WEBHOOK_*` telah dibuat khusus untuk Preview branch tersebut. Receiver hanya dapat aktif pada build Preview yang menggunakan variabel ini. Preview dilindungi Vercel SSO; akses HTTP anonim hanya menampilkan halaman SSO, sehingga handler belum mendapat smoke test hosted. Jangan menganggap webhook hosted aktif sebelum deployment terbaru dan pengujian berwenang berhasil.

Project Vercel sudah memiliki binding Firebase staging dan konfigurasi server Account PIN khusus branch Preview. Namun Rules staging live, domain Auth, dan konfigurasi App Check di Firebase Console belum diverifikasi ulang dalam pemeriksaan ini. Kandidat `firestore.staging.rules` tetap lokal/diabaikan Git dan belum dipublikasikan. Production tidak diubah; alias `arcrmapp.vercel.app` masih menunjuk deployment lama, dan `/api/account-pin/status` di production merespons 404. Tidak ada skenario Make yang dibuat atau diuji.

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

URL Preview harus berasal dari deployment branch `cue/firebase-stabilization` yang sudah disetujui. Jangan menaruh secret pada URL, body, atau variabel `VITE_*`; simpan hanya sebagai secret server-side pada environment Preview branch tersebut dan gunakan header Authorization di Make.

## Perlindungan dan perilaku retry

Receiver hanya dapat aktif dengan flag server-side eksplisit pada Vercel Preview branch `cue/firebase-stabilization`, project Firebase staging tetap `ar-crm-staging-angga-20261027`, workspace `ar-crm-staging-owner`, serta UID staging yang sama dengan binding client. Production, project/workspace lain, deployment branch lain, dan local server tanpa Firestore Emulator loopback ditolak. Di local, target demo Emulator harus tepat `demo-ar-crm-make-webhook` dan flag emulator diaktifkan terpisah.

Admin writer memverifikasi dokumen workspace dan membership owner sebelum menulis, memakai path workspace tetap, validasi field aplikasi, dan transaksi create-only. Tidak ada update/overwrite. Request sukses pertama mengembalikan `201`; retry dengan data yang sama `200` dan ID yang sama; ID event sama dengan isi berbeda `409`. Request maksimum 32 KiB. Error tidak mengembalikan isi prospek atau detail credential. Rules lokal juga mengenali `address` sebagai field opsional dengan panjang maksimum 500 karakter.

Rules staging live belum dipublikasikan dari kandidat lokal. Sebelum fitur alamat pada Quick Lead atau koreksi alamat dipakai pada Preview, binding Rules staging harus menerima field opsional tersebut (maksimum 500 karakter). Field alamat kosong/yang tidak berubah tidak ikut dikirim client agar operasi lama tetap kompatibel; rollout Rules staging tetap merupakan gate terpisah.

## Konfigurasi yang dibutuhkan

Untuk Preview branch yang disetujui, receiver memerlukan `MAKE_WEBHOOK_ENABLED=true`, `MAKE_WEBHOOK_SECRET` acak minimal 32 byte, `MAKE_WEBHOOK_OWNER_UID`, `FIREBASE_ADMIN_PROJECT_ID`, dan `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` khusus project staging—selain binding `VITE_FIREBASE_*` staging. Tiga variabel `MAKE_WEBHOOK_*` kini tersetel khusus untuk Preview branch `cue/firebase-stabilization`; konfigurasi server Admin staging juga telah tersedia untuk branch tersebut. Local Emulator memerlukan `MAKE_WEBHOOK_LOCAL_EMULATOR_ENABLED=true`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, project demo yang tetap, dan workspace/member sintetis di Emulator.

Pemeriksaan ini belum memperoleh respons handler dari hosted Preview karena Vercel SSO membatasi akses anonim. Belum ada URL webhook hosted yang diuji atau skenario Make yang dikonfigurasi. Tidak ada Lead cloud yang dibuat, Rules cloud yang diubah, atau perubahan Production yang dilakukan.
