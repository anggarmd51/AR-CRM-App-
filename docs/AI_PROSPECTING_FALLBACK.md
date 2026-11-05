# Live Prospecting Engine — free-only preparation

## Status implementasi

Halaman Direktori Prospek memakai satu kotak pencarian, tautan pencarian orang LinkedIn di sisi browser, dan tombol riset server-side. Hasil AI dirender sebagai tiga field tervalidasi: `target_roles`, `email_pattern`, dan `google_dorks`. Sistem menandai hasil sebagai saran yang belum diverifikasi; pola email dibuat generik tanpa domain/alamat aktual, dan kueri dork dibatasi ke profil LinkedIn publik. Tombol “Simpan ke Pipeline” membuka formulir Lead biasa agar pemilik meninjau dan melengkapi data terlebih dahulu.

Data prospek lokal lama tidak dibaca untuk tampilan, tidak disemai ulang, dan tidak dihapus. Jika ada nilai storage lama, pengguna dapat mengunduh salinannya secara eksplisit. Rules Firestore dan schema Lead tidak berubah. Karena schema/rules saat ini tidak memiliki field sumber/hasil riset, saran AI tidak disalin ke dokumen Lead; hanya data yang pemilik lengkapi di formulir standar yang dapat disimpan melalui repository CRM.

Rute `/api/ai/prospecting` tetap **mati secara default**. Selain flag review yang sudah ada, route Production hanya lolos pemeriksaan konfigurasi jika ketiga kunci provider yang diizinkan tersedia: `GROQ_API_KEY`, `GEMINI_API_KEY`, dan `OPENROUTER_API_KEY`. Urutannya dikunci menjadi Groq → Gemini → OpenRouter; DeepSeek dan Cohere bukan provider aktif, dan kunci legacy-nya diabaikan. Model yang dipakai dikunci ke `openai/gpt-oss-20b`, `gemini-3.8-flash`, dan `openrouter/free`. Nilai `GROQ_MODEL`, `GEMINI_MODEL`, atau `OPENROUTER_MODEL` hanya diterima jika persis sama dengan model yang diizinkan; override lain menghentikan permintaan sebelum jaringan dipanggil.

Kuota harian Lead Finder tetap 30 permintaan per owner. Setiap provider memiliki timeout 2,5 detik dan total deadline 7,5 detik; satu pencarian dapat mencoba paling banyak tiga provider yang diizinkan. Hanya HTTP 429, 5xx, timeout, atau kegagalan jaringan yang melanjutkan waterfall. Auth, 4xx lain, konfigurasi model yang tidak diizinkan, dan JSON/skema tidak valid berhenti dengan aman. Jika seluruh provider habis kuota atau tidak tersedia, endpoint mengembalikan 503 generik dan UI menampilkan pemberitahuan singkat untuk mencoba lagi; prompt, respons, token, dan API key tidak ditampilkan atau dicatat.

## Batas klaim gratis dan kesiapan produksi

Kode membatasi provider dan identifier model/router, tetapi tidak dapat memeriksa atau mengubah tier penagihan akun provider. Karena itu kode saja tidak dapat menjamin Rp0 bila kunci terkait akun/project berbayar. Kuota, harga, kelayakan Free Tier, dan model dapat berubah; pemilik perlu memeriksa tier, billing, limit, dan kebijakan data tiap akun sebelum aktivasi.

- [Groq model](https://console.groq.com/docs/models) dan [rate limits](https://console.groq.com/docs/rate-limits): `openai/gpt-oss-20b` tercantum di tabel Free Plan dengan batas penggunaan. Halaman model juga mencantumkan tarif Developer Plan; penggunaan melalui organisasi/paket berbayar tidak bisa dijamin gratis oleh aplikasi.
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing): `gemini-3.8-flash` saat ini tercantum gratis pada Free Tier Standard, tetapi halaman yang sama mencantumkan tarif Paid Tier. [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) menyatakan limit mengikuti project/tier dan dapat berubah. Ketentuan Google menyebut data Free Tier dapat digunakan untuk peningkatan produk; jangan kirim data sensitif.
- [OpenRouter Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-router) menyatakan `openrouter/free` memilih model gratis yang tersedia dan tidak mengenakan biaya untuk router/model gratis. Ketersediaan dan rate limit dapat berubah. [Dokumentasi free variant](https://openrouter.ai/docs/guides/routing/model-variants/free) memperingatkan bahwa fallback array yang berisi model berbayar dapat menimbulkan tagihan; konfigurasi aplikasi memakai router gratis saja dan tidak menerima override model.

Fitur tidak boleh diaktifkan/deploy untuk penggunaan operasional sampai pemilik meninjau provider, tier billing, kuota, kebijakan data, dan batas biaya tiap kunci. Tidak ada kunci provider yang ditambahkan atau dipakai; `.env.example` hanya memberi daftar nama dan tidak berisi nilai. Pengujian provider memakai mock dan tidak membuat panggilan AI live.

## Verifikasi lokal

Tes perlu membuktikan urutan/model yang dikunci, penolakan model override, kegagalan aman saat semua provider rate-limit/timeout, dan tidak adanya panggilan DeepSeek/Cohere. Pemeriksaan Firestore tidak diperlukan untuk patch ini karena kode kuota 30/hari dan Rules Firestore tidak diubah.
