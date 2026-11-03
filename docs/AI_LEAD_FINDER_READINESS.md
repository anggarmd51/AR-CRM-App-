# Direktori Prospek Lokal, Gemini PIC, dan Penyimpanan Foto

## Riset PIC dan LinkedIn

Direktori tetap berbasis browser dan berisi sampel fiktif/catatan lokal; hasilnya tidak menjadi Lead operasional dan tidak disinkronkan ke Firebase/CRM. Rute Vercel `/api/ai/lead-finder` telah dihapus. Meeting Summarizer adalah fitur terpisah dan tetap memiliki alur server-side sendiri.

Pengguna dapat memasukkan sendiri kunci Gemini API pada bagian pengaturan riset. Kunci hanya berada di state memori halaman ini: tidak ditulis ke source, localStorage, sessionStorage, server, atau log. Riset hanya berjalan setelah tombol ditekan dan persetujuan eksplisit dicentang; yang dikirim langsung dari browser ke Google hanyalah nama perusahaan dan industri. Tidak ada scraping, pencarian web otomatis, atau pengumpulan profil.

Keluaran dibatasi ke daftar jabatan yang diizinkan, template pola email generik, dan confidence konservatif. Seluruh teks bebas dari respons model dibuang sebelum hasil ditampilkan, sehingga nama orang/alamat email yang mungkin dihalusinasikan tidak diteruskan ke UI. Hasil tidak memiliki verifikasi sumber dan wajib diperiksa manual; jangan pakai sebagai identitas PIC/alamat publik yang benar. Kunci client-side dapat dilihat pengguna/perangkat dan skrip pada origin yang sama; dokumentasi Google menyarankan agar API key tidak diekspos di web production. Gunakan kunci khusus yang dibatasi ke Gemini API dan jangan memasukkan data rahasia/pribadi.

Harga resmi saat ini mencantumkan tier gratis untuk Gemini 2.5 Flash, tetapi kuota, kelayakan, dan model dapat berubah. Bila proyek/kunci pengguna menggunakan tier berbayar, pemakaian dapat dikenai biaya. Google menyatakan data pada tier gratis dapat dipakai untuk peningkatan produk. Karena itu aplikasi tidak menjamin pemakaian Gemini selalu Rp0; pengguna harus memeriksa tier/kuota dan kebijakan datanya sendiri.

## Foto Activity dan batas Firebase Storage

Foto kamera dikompres menjadi JPEG di browser dengan batas maksimum **500.000 byte**, dan kompresi akan mencoba mengecilkan dimensi lebih lanjut sebelum gagal tertutup. Tombol Save Activity dinonaktifkan selama kompresi berlangsung. Setelah Activity diterima oleh antrean durable, Blob foto disimpan di IndexedDB lokal dengan ID Activity. Foto tetap lokal pada browser/perangkat tersebut; foto tidak diunggah ke cloud atau disinkronkan.

Cleanup hanya membuang foto orphan berumur lebih dari 30 hari setelah ada snapshot Activity non-cache dari server dan outbox selesai dipulihkan; ID Activity yang masih ada di Firestore atau antrean (termasuk mutasi gagal/tertunda) tetap dipertahankan. Jika browser tidak dapat mengompres/menyimpan foto, Activity tetap dapat disimpan dan UI memberi tahu foto tidak tersedia.

Firebase Storage sengaja tidak diaktifkan. Dokumentasi resmi Firebase menyatakan Cloud Storage for Firebase mensyaratkan paket Blaze untuk akses bucket; proyek Spark tidak dapat memakai bucket, meskipun ada tingkat penggunaan tanpa biaya pada beberapa konfigurasi Blaze. Mengaktifkannya berarti menautkan billing account dan memperkenalkan potensi biaya—tidak dilakukan. Tidak ada Storage bucket, Rules, billing, Firestore Rules, atau data cloud yang diubah.

## Sumber resmi

- [Keamanan Gemini API key](https://ai.google.dev/gemini-api/docs/api-key) — Google memperingatkan agar kunci tidak diekspos dalam aplikasi web produksi.
- [Harga Gemini API](https://ai.google.dev/gemini-api/docs/pricing) — harga dan tier gratis per model; ketersediaan dapat berubah. Halaman ini juga membedakan perlakuan data tier gratis dan berbayar.
- [Batas permintaan Gemini](https://ai.google.dev/gemini-api/docs/rate-limits) — kuota ditentukan per proyek/tier dan dapat berubah.
- [Perubahan paket Cloud Storage for Firebase](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024) dan [panduan mulai Web](https://firebase.google.com/docs/storage/web/start) — bucket memerlukan Blaze; penggunaan tanpa biaya yang mungkin tersedia tetap berada di dalam paket billing.

## Verifikasi dan rilis

Verifikasi lokal terakhir: `npm test` **254/254 lulus**; `npm run test:firestore` **22/22 lulus** di Firestore Emulator; `npm run lint` (`tsc --noEmit`) lulus; `npm run build` lulus; `git diff --check` lulus. Tidak ada panggilan Gemini live.

Pemeriksaan read-only menunjukkan alias Production `https://arcrmapp.vercel.app/` menjawab HTTP 200; route lama `/api/ai/lead-finder` menjawab HTTP 410; deployment yang melayani Production berstatus **READY** pada commit `b39ff3f566a3b277d6558a561b58259a93ba0cd7`. Status tersebut untuk deployment lama, bukan perubahan lokal di branch `cue/firebase-stabilization`; commit lokal belum di-merge, dipush, atau dideploy.
