# Lead Finder Lokal & AI Meeting Summarizer — Status

## Status Lead Finder

Lead Finder kini berjalan sebagai **Direktori Prospek Lokal** berbasis sampel fiktif. Eksperimen pemanggilan Gemini untuk fitur ini dihentikan; antarmuka tidak mengirim request ke layanan eksternal. Rute API lama `/api/ai/lead-finder` dipertahankan hanya sebagai endpoint pensiun dan selalu mengembalikan HTTP 410, tanpa membaca input atau menginisialisasi Gemini, Firebase, sesi akun, maupun kuota.

Direktori memuat contoh dengan nama fiktif yang diberi label **Sampel fiktif**. Pencarian, tambah, edit, dan hapus bekerja pada direktori lokal; seluruh record selalu berstatus **Perlu Verifikasi Manual**. Fitur ini tidak menyatakan sampel atau catatan pengguna sebagai bisnis nyata, prospek terverifikasi, atau data siap operasional. Tidak ada tombol impor ke Sales Pipeline dan tidak ada write ke Firebase/CRM.

Penyimpanan memakai satu key `localStorage` khusus untuk direktori. Data hanya tersimpan pada browser ini, tidak disinkronkan, dan dapat hilang saat penyimpanan browser dibersihkan. Bila penyimpanan browser tidak tersedia, perubahan hanya bertahan selama halaman terbuka dan UI menampilkan peringatan. Karena tidak ada request provider, biaya eksternal Lead Finder adalah **Rp0**.

## Batas dengan fitur AI lain

Meeting Summarizer tetap merupakan fitur terpisah; perubahannya tidak termasuk mode lokal Lead Finder ini. Konfigurasi model/kunci AI yang mungkin dipakai fitur lain tidak mengaktifkan kembali endpoint Lead Finder. Batas provider, consent, sesi PIN, serta fallback Meeting Summarizer tetap mengikuti implementasi dan persetujuan terpisahnya.

## Catatan audit environment sebelumnya

- Audit baca-saja terdahulu mencatat `GEMINI_API_KEY` pada Preview branch tertentu dan tidak terdaftar untuk Production; nilai secret tidak didekripsi atau diubah. Informasi itu tidak digunakan oleh Direktori Prospek Lokal.
- `VITE_FIREBASE_TARGET=production` tidak terdaftar untuk Production pada audit tersebut. Startup hosted memerlukan target Firebase yang benar.
- Audit terdahulu juga mencatat konfigurasi server PIN Production belum tersedia. Ini tetap menjadi perhatian untuk penggunaan CRM hosted dan terpisah dari fitur direktori lokal.
- Konversi Lead Finder lokal tidak mengubah environment Vercel/Firebase, data CRM, deployment, alias, atau Production.

## Verifikasi lokal

- Tes fokus baru: **8/8 lulus** untuk sampel fiktif, status verifikasi, pencarian, tambah/edit/hapus, penyimpanan browser terisolasi, dan endpoint eksternal yang dipensiunkan.
- `npm test`: **181 lulus, 0 gagal, 1 dilewati** (182 total).
- `npm run lint` (TypeScript): **lulus**.
- `npm run build`: **lulus**.
- `git diff --check`: **lulus**.
- Tidak dilakukan request Gemini, write Firebase/Firestore, deployment, commit, push, atau merge.

## Batas rilis CRM

Mode direktori lokal tidak mengubah kesiapan deployment CRM. Jangan menganggap mode ini sebagai jalur untuk memasukkan prospek nyata atau sebagai verifikasi kesiapan Production. Periksa konfigurasi hosted, akses PIN, dan pemulihan data secara terpisah sebelum perubahan operasional CRM.
