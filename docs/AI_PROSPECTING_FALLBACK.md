# Live Prospecting Engine — status aman lokal

## Status implementasi

Halaman Direktori Prospek memakai satu kotak pencarian, tautan pencarian orang LinkedIn di sisi browser, dan tombol riset server-side. Hasil AI dirender sebagai tiga field tervalidasi: `target_roles`, `email_pattern`, dan `google_dorks`. Sistem menandai hasil sebagai saran yang belum diverifikasi; pola email dibuat generik tanpa domain/alamat aktual, dan kueri dork dibatasi ke profil LinkedIn publik. Tombol “Simpan ke Pipeline” membuka formulir Lead biasa agar pemilik meninjau dan melengkapi data terlebih dahulu.

Data prospek lokal lama tidak dibaca untuk tampilan, tidak disemai ulang, dan tidak dihapus. Jika ada nilai storage lama, pengguna dapat mengunduh salinannya secara eksplisit. Rules Firestore dan schema Lead tidak berubah. Karena schema/rules saat ini tidak memiliki field sumber/hasil riset, saran AI tidak disalin ke dokumen Lead; hanya data yang pemilik lengkapi di formulir standar yang dapat disimpan melalui repository CRM.

Rute `/api/ai/prospecting` **mati secara default**. Rute baru dapat memanggil provider hanya bila semua kondisi berikut dipenuhi: `PROSPECTING_AI_ENABLED=true`, `PROSPECTING_AI_COST_AND_DATA_REVIEWED=true`, Vercel Production dengan Firebase target Production dan branch yang diizinkan, kelima API key tersedia, dan sesi Firebase ID token owner lolos verifikasi server. Rute memakai same-origin HTTPS, kuota owner yang ada (maksimum lima permintaan AI per hari), satu permintaan per provider, timeout maksimum 2,5 detik per provider serta deadline total 7,5 detik. Hanya HTTP 429, 5xx, timeout, atau kegagalan jaringan yang mencoba provider berikutnya. Auth, 4xx lain, dan JSON/skema tidak valid berhenti dengan aman. Log hanya mencatat nama provider, kategori hasil, dan alasan—tidak mencatat prompt, token, respons, atau API key.

## Batas klaim gratis dan kesiapan produksi

Tidak ada jaminan “gratis mutlak” atau “tanpa downtime”. Kebijakan, harga, model, dan kuota bisa berubah; waterfall juga tetap bisa membuat sampai lima panggilan provider untuk satu pencarian. Dokumen resmi yang diperiksa menunjukkan:

- [Groq pricing dan model](https://console.groq.com/docs/models), [rate limits](https://console.groq.com/docs/rate-limits), dan [data handling](https://console.groq.com/docs/your-data): beberapa model punya batas Free Plan, tetapi harga/model bergantung pilihan dan organisasi; tidak ada jaminan gratis permanen. Default retensi inference biasa berbeda dari fitur yang menyimpan data.
- [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/) dan [rate limits](https://api-docs.deepseek.com/quick_start/rate_limit/): model API ditagih per token dengan tarif yang berubah; tidak terverifikasi free tier universal. [Privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html) menjelaskan pemrosesan/penggunaan data; jangan mengirim informasi rahasia.
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), dan [Terms](https://ai.google.dev/gemini-api/terms): ada free tier terbatas, tetapi free-tier input/output dapat dipakai untuk peningkatan produk dan tidak cocok untuk data sensitif. Kuota bergantung pada project/model/tier.
- [OpenRouter pricing](https://openrouter.ai/pricing) dan [routing](https://openrouter.ai/docs/guides/routing/provider-selection): model gratis terbatas tersedia, tetapi provider/model fallback dapat berbayar; limit gratis rendah dan dapat berubah.
- [Cohere pricing](https://docs.cohere.com/v2/docs/how-does-cohere-pricing-work) dan [rate limits](https://docs.cohere.com/docs/rate-limits): API trial gratis tetapi terbatas; production key berbayar, dan trial tidak boleh diasumsikan cocok untuk penggunaan produksi/komersial.

Sumber resmi per provider juga digunakan untuk endpoint dan auth: [Groq API](https://console.groq.com/docs/api-reference), [DeepSeek API](https://api-docs.deepseek.com/), [Gemini API key/model docs](https://ai.google.dev/gemini-api/docs/api-key), [OpenRouter quickstart](https://openrouter.ai/docs/quickstart), dan [Cohere Chat API](https://docs.cohere.com/docs/chat-api). Model/API dapat berubah; daftar default di source perlu diverifikasi ulang sebelum aktivasi.

Untuk itu fitur tidak boleh diaktifkan/dideploy untuk penggunaan operasional sampai pemilik meninjau provider, tier billing, kuota, kebijakan data, dan batas biaya tiap kunci. Tidak ada kunci provider yang ditambahkan atau dipakai; `.env.example` hanya memberi daftar nama dan tidak berisi nilai. Tidak ada panggilan LLM live pada pengujian.

## Verifikasi lokal

Uji provider memakai mock: Groq 429 → DeepSeek sukses; 5xx/timeout berlanjut ke provider berikutnya; kegagalan auth/skema berhenti; respons selalu melewati validasi JSON dan sanitasi. Tes tidak membuat panggilan provider live.
