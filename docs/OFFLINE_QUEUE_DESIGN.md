# Antrean Offline Firestore

## Alur mutasi dan status

Antrean aplikasi menyimpan operasi mutasi di IndexedDB sebelum repository menyatakan operasi diterima secara lokal. UI membedakan **Masuk antrean lokal** (belum ada bukti commit server), **Mengirim ke Firestore**, **Diakui Firestore** (write Promise berhasil atau server-read memverifikasi dokumen setelah hasil ambigu), dan **Gagal — perlu tindakan** (penolakan permanen). Indikator `navigator.onLine` atau data cache saja bukan bukti commit.

Operasi durable aktif: create lead, update stage lead, dan create activity. Retry transient dijadwalkan dengan backoff dan dijalankan lagi saat koneksi pulih atau antrean dipulihkan saat startup. Firestore Web SDK tetap dipakai untuk penulisan optimistis/offline; antrean IndexedDB aplikasi menjadi sumber pemulihan lintas reload. Status permanen `failed` tidak diputar ulang otomatis. Pemilik dapat mencoba lagi setelah penyebabnya ditangani, atau mengoreksi payload dari panel antrean; payload yang dikoreksi disimpan sebelum retry.

## Persistensi, privasi, dan batas keamanan

`src/utils/offlineOutbox.ts` menyimpan payload business-only yang di-allowlist sebagai ciphertext AES-GCM di object store IndexedDB. Kunci AES `CryptoKey` non-extractable disimpan di IndexedDB pada partisi yang sama per pasangan `workspaceId` dan authenticated `ownerId`. Additional authenticated data mengikat ciphertext ke jenis operasi, ID operasi/dokumen, workspace, owner, label, dan dependency. Token, ID token, credential, maupun field tak dikenal tidak disimpan. Tidak ada fallback ke `localStorage`; jika IndexedDB atau Web Crypto gagal, antrean menolak pemulihan/penyimpanan dan aplikasi menahan akses CRM.

Metadata routing/status (termasuk owner/workspace dan ID dokumen) tetap ada sebagai metadata IndexedDB; hanya payload mutasi yang dienkripsi. Penghapusan record payload terjadi setelah acknowledgement Firestore; operasi gagal dipertahankan sampai pemilik menyelesaikan dan server mengakuinya, agar tidak hilang diam-diam. Data pending/failed dapat tetap berada pada profil browser sampai saat itu.

Enkripsi at rest ini mengurangi keterbacaan langsung file browser, tetapi **bukan** perlindungan terhadap XSS atau kode jahat pada origin yang sama: kode tersebut dapat memakai key IndexedDB saat sesi aktif. Ia juga bukan backup lintas perangkat, bukan proteksi terhadap profil OS/browser yang diambil alih, dan bukan klaim compliance. Jangan hapus data situs atau IndexedDB jika antrean tertunda perlu dipulihkan.

Saat logout, bila ada pending/syncing/failed operation, UI meminta konfirmasi dan menyatakan antrean akan tetap tersimpan untuk owner/workspace yang sama. Pengguna lain tidak memuat partisi tersebut. Pada login berikutnya, hanya scope owner/workspace yang cocok dipulihkan. `getFirestore()` masih memakai cache SDK default (bukan persistent Firestore cache); persistentitas antrean aplikasi tidak berarti seluruh snapshot CRM tersimpan offline.

## Retry, idempotensi, dan dependency

Create lead dan activity memakai document ID Firestore yang dibuat satu kali dan disimpan pada operasi durable. Jika `setDoc` mengalami hasil ambigu/ditolak saat retry, `setDocWithServerReconciliation` hanya menyelesaikan operasi sebagai acknowledged setelah `getDocFromServer` menemukan dokumen pada ID yang sama dengan seluruh field business/owner yang diharapkan. Jika pembacaan server gagal atau data tidak cocok, error write asal tetap terlihat; data yang hanya berasal dari cache tidak dihitung sebagai acknowledgement. Ini menghindari duplikasi tanpa mengubah atau melonggarkan Firestore Rules. Stage update memakai patch pada document path lead yang sama. Activity yang bergantung pada lead baru menunggu acknowledgement create lead sebelum dikirim. Rules Firestore tetap menjadi kontrol otorisasi.

Gangguan jaringan/transient tetap pending dan dicoba kembali. Penolakan Rules, autentikasi, atau validasi dihentikan dari retry otomatis; status, tindakan manual, dan koreksi payload tersedia dari panel. Koreksi mempertahankan jenis operasi, document ID, scope, dan dependency, melewati allowlist/sanitizer yang sama, lalu memperbarui outbox sebelum penjadwalan ulang.

## Cakupan verifikasi dan yang belum dibuktikan

Unit test mencakup queue recreation/reload dengan IndexedDB nyata palsu, ciphertext tanpa field payload plaintext, pemulihan scope yang cocok, isolasi owner/workspace, retry transient/permanen, koreksi payload dengan document ID stabil, dan urutan lead→activity. Rules Emulator memakai project demo/sintetis. Tidak ada tes yang membaca/menulis Firebase production, Vercel, atau Google Sheets live.

Keberhasilan test/build lokal tidak membuktikan konfigurasi staging/production, browser crash behavior di semua perangkat, backup/restore bisnis, atau readiness cutover. Project staging, site key App Check, environment Vercel Preview, monitoring Console, dan verifikasi live tetap gate terpisah. Antrean durable tidak mengubah status aplikasi menjadi 100% siap production.
