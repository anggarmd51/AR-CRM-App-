# Firebase staging, backup, dan App Check

**Status: rancangan dan implementasi lokal saja.** Tidak ada project Firebase, site key, konfigurasi Vercel, backup, atau data production yang dibuat/diubah. Project `ar-crm-73222` tetap dianggap production sesuai konteks tugas; branch ini belum memiliki project staging.

## 1. Staging terpisah dan pencegahan salah arah

Aplikasi lokal tetap memakai Auth dan Firestore Emulator. Pemilihan target fail-closed: development hanya menerima target `local`; Vercel Preview wajib menyatakan `VITE_FIREBASE_TARGET=staging`, project ID staging harus mengikuti pola `ar-crm-staging-<suffix>` dan harus cocok persis dengan `VITE_FIREBASE_STAGING_PROJECT_ID_ALLOWLIST`; known production project `ar-crm-73222` ditolak. Target `production` hanya diterima pada Vercel Production dan hanya dengan project ID `ar-crm-73222`. Guard ini melindungi jalur Firebase Web SDK; ia bukan pengganti pemeriksaan konfigurasi deployment atau kebijakan akses.

Template yang disertakan:

- [`.env.staging.example`](../.env.staging.example) berisi placeholder variabel Firebase dan site key. Salin nilainya secara manual ke **Vercel Preview Environment** setelah project staging benar-benar dibuat; jangan commit file env berisi nilai aktual.
- [`.firebaserc.example`](../.firebaserc.example) hanya memiliki alias `staging` placeholder—tidak ada alias default/production. File `.firebaserc` aktif sengaja tidak dibuat.
- [`firebase.json`](../firebase.json) tetap mengatur rules/indexes lokal dan emulators saja; tidak ditambahkan target hosting atau project production.

Sebelum mengaktifkan Preview, pemilik perlu membuat project Firebase terpisah, mendaftarkan Web App dan Auth/Firestore-nya, menentukan workspace dan test Auth UID khusus, serta memasang variabel Preview dari konfigurasi **project staging itu saja**. Gunakan data sintetis; jangan menyalin data production. Pastikan seluruh nilai Firebase Web App berasal dari project yang sama. Semua `VITE_*` dapat masuk ke bundle browser, jadi jangan menaruh private key/service-account, token, atau kredensial di sana.

Variabel minimal staging ditunjukkan di template: `VITE_FIREBASE_TARGET=staging`, konfigurasi Web App staging, exact ID yang sama di `VITE_FIREBASE_PROJECT_ID` dan `VITE_FIREBASE_STAGING_PROJECT_ID_ALLOWLIST`, `VITE_FIREBASE_WORKSPACE_ID`, `VITE_FIREBASE_OWNER_UID`, dan key publik reCAPTCHA Enterprise. Placeholder `ar-crm-staging-your-project-suffix` hanya contoh sintaks; ia bukan project yang tersedia. Ganti dengan project staging nyata yang disetujui. Biarkan workspace/UID kosong sampai provisioning staging disetujui—aplikasi menolak workspace/owner yang belum terikat. Isi Preview settings hanya pada environment Preview, bukan Production. Jangan membuat atau menjalankan deploy selama tahap persiapan ini.

Untuk deployment Production berikutnya, pemilik perlu memastikan `VITE_FIREBASE_TARGET=production` disetel hanya pada environment Vercel Production dan konfigurasi project cocok dengan `ar-crm-73222`; guard akan menolak build hosted jika target tidak eksplisit atau tidak cocok. Pengaturan Production itu belum diubah di sini.

Endpoint cron Firestore-to-Sheets yang sudah ada memiliki target production tetap; guard server-side kini mengembalikan 404 kecuali `VERCEL_ENV=production`. Jangan menyalin secret cron atau service account ke Preview, dan jangan membuat cron staging pada tahap ini.

## 2. Backup dan restore: pilihan realistis di Spark

### Yang tidak tersedia sebagai backup terkelola di Spark

Firestore scheduled backups dan managed export/import memerlukan paket Blaze. Managed export/import juga memerlukan bucket Cloud Storage yang lokasinya sesuai/dekat dengan database. Operasi membaca satu dokumen untuk setiap dokumen yang diekspor dan menulis satu dokumen untuk setiap dokumen yang diimpor. Restore dari scheduled backup membuat database Firestore baru, bukan menimpa database sumber secara langsung. Periksa biaya dan batasan terkini sebelum mengaktifkan Blaze.

Rujukan resmi: [Firestore backups](https://firebase.google.com/docs/firestore/backups) dan [export/import data](https://firebase.google.com/docs/firestore/manage-data/export-import).

### Mitigasi sementara tanpa mengklaim “backup teruji”

Di Spark, ekspor manual yang dimulai pemilik dari aplikasi dapat dipertimbangkan sebagai salinan portabilitas terbatas—hanya untuk dokumen yang dapat dibaca oleh client dan Rules/query yang dipakai. Repo ini belum memiliki backup aplikasi JSON atau jalur restore yang terverifikasi; ekspor manual semacam itu masih rekomendasi, bukan fitur yang sudah disiapkan. Jika kelak dibuat, ekspor itu tetap bukan snapshot atomik terjamin atau backup seluruh project. Rules lokal membatasi data ke workspace tertentu; client juga tidak dapat memulihkan dokumen workspace root atau membership yang hanya boleh diprovisikan melalui jalur administratif. Karena itu, jangan menghapus atau mengubah sumber hanya karena file ekspor berhasil dibuat.

Jika pemilik memilih mitigasi manual: buat ekspor sesudah freeze/catatan waktu yang jelas; catat cakupan koleksi, versi schema, jumlah record, checksum, dan tanggal; simpan file dengan enkripsi kuat pada media privat yang aksesnya dibatasi; lindungi/kelola kunci secara terpisah; tetapkan retensi dan hapus salinan sementara dengan aman. Jangan kirim ekspor berisi data CRM lewat email/chat atau log. Sebelum menyebut ekspor sebagai pemulihan, siapkan prosedur restore terpisah dan uji menggunakan fixture sintetis di Emulator/staging—uji tersebut belum dilakukan di sini.

Google Sheets export yang ada adalah fitur pelaporan/portabilitas, bukan backup: cakupan, tipe data, relasi, metadata, dan kemampuan restore tidak dijamin lengkap. Jangan jadikan Sheets sebagai satu-satunya salinan pemulihan.

### Rekomendasi jangka panjang

Jika kebutuhan pemulihan bisnis memerlukan backup otomatis, evaluasi upgrade Blaze terlebih dahulu, lalu gunakan scheduled Firestore backups atau managed export terjadwal ke bucket privat dengan lokasi sesuai, akses least-privilege, retensi/lifecycle, pemantauan keberhasilan, dan uji restore berkala ke database baru. Siapkan runbook rekonsiliasi dan persetujuan cutover sebelum mengalihkan aplikasi. Backup data Firestore tidak dengan sendirinya memulihkan seluruh Firebase project: Auth users, Rules/indexes, konfigurasi App Check/Auth, dan variabel Vercel perlu inventaris/proteksi terpisah. Jangan mengaktifkan jalur administratif atau menyimpan service-account credential di client.

## 3. App Check staging dalam monitoring saja

Kode memakai `ReCaptchaEnterpriseProvider` hanya untuk target staging. `verifyFirebaseStartup()` membuat provider dan meminta token App Check sebelum Auth/Firestore dapat dibuat. Missing/invalid site key, exception provider, atau token kosong ditangkap sebagai pesan startup yang terkendali dan memblokir request Auth/Firestore; kode tidak fallback dengan melewati App Check. Site key dibaca dari `VITE_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY`; ini key publik, tetapi harus terdaftar untuk project staging dan domain Preview yang digunakan. Tidak ada debugger token atau secret di kode.

**Enforcement tidak dapat dimatikan/diaktifkan oleh kode client ini.** Setelah provider dan key staging disiapkan, pemilik harus membiarkan enforcement Firestore/Auth (atau produk terkait) tetap OFF di Firebase Console, kemudian memantau metrik verifikasi di Console untuk traffic staging terlebih dahulu. Periksa token valid/invalid dan traffic yang belum terverifikasi; jangan mengaktifkan enforcement sampai penyebab request yang tidak terverifikasi dipahami dan pemilik menyetujui perubahan terpisah. Kode sengaja tidak menginisialisasi App Check untuk local atau production.

Rujukan resmi: [App Check web dengan reCAPTCHA Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-provider), [memantau metrik](https://firebase.google.com/docs/app-check/monitor-metrics), dan [mengaktifkan enforcement](https://firebase.google.com/docs/app-check/enable-enforcement).

## Perubahan lokal dan hal yang belum dilakukan

Guard target dan policy App Check berada di `src/firebaseDeploymentGuard.ts`, `src/firebaseAppCheckPolicy.ts`, dan `src/firebase.ts`; konfigurasi build hanya mengekspos kategori `VERCEL_ENV` dan allowlist project ID non-rahasia untuk validasi. Tes sintetis mencakup exact allowlist/pattern, missing/invalid App Check key, exception provider, token preflight, dan urutan inisialisasi sebelum client. Belum ada project staging, provider/site key, test user, env Vercel, backup, uji restore, perubahan Console, atau deployment. Nilai `.env.local` tidak ditinjau.
