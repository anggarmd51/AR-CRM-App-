# Panduan Pengembang Lokal

Catatan ini menjelaskan batas implementasi lokal pada branch `cue/firebase-stabilization`. Perubahan dan pengujian di sini tidak berarti aplikasi telah diverifikasi pada hosted staging atau diubah di production.

## Bundle dan pemuatan layar

Tab dashboard, pipeline, Lead Finder, aktivitas, dan contoh Android dimuat saat dipilih. Modal dimuat saat pertama dibuka dan tetap dipasang sesudahnya agar state formulir tidak hilang ketika modal ditutup. Aturan build Rolldown juga membagi modul dependency yang dipakai bersama ke chunk vendor dengan batas target 350 KiB; jangan menaikkan batas warning hanya untuk menyembunyikan chunk besar. Verifikasi dengan `npm run build` dan tinjau ukuran setiap chunk.

## Batas cache Service Worker

Implementasi berada di `public/sw.js` dan diregistrasikan dari `src/main.tsx` hanya pada build production.

- Cache statis bernama `arcrm-cache-v2.2.1` melakukan precache app shell (`/`, `/index.html`, manifest, favicon, dan ikon). Saat aktivasi, cache lama selain versi yang sedang dipakai dihapus.
- Request navigasi memakai network-first; hanya jika jaringan gagal, Service Worker memakai `/index.html` sebagai fallback.
- Selain app shell, hanya GET same-origin untuk aset publik yang diizinkan atau berkas dengan ekstensi statis di `/assets/` yang dapat masuk Cache Storage. Response yang disimpan harus sukses (`200`) dan bertipe `basic`.
- Request non-GET, lintas origin, `/api/`, halaman/endpoint dinamis, serta ekspor tidak dicegat atau disimpan sebagai cache aset.
- Cache ini hanya untuk shell dan aset aplikasi, bukan snapshot Lead/Activity maupun data Firestore. Perilaku SDK Firestore dan antrean pemulihan lokal adalah mekanisme terpisah; cache Service Worker bukan backup atau jaminan seluruh CRM dapat dipakai offline.

Pengujian pembatasan request ada di `src/serviceWorker.test.ts`.

## Arsip Firestore untuk Closing Won

Arsip disimpan di `workspaces/{workspaceId}/wonDealArchives/{leadId}`. `src/firebaseRepository.ts` membuat Lead langsung Won atau perubahan stage beserta arsip dalam satu transaksi Firestore; arsip mengikuti first-win yang sah, bukan penulisan arsip bebas.

Rules di `firestore.rules` membatasi arsip ke owner workspace dan field yang diizinkan. Sebelum transaksi, Lead belum ada (direct-Won) atau belum berstatus `Closing Won`; `getAfter()` harus menunjukkan Lead Won dengan owner/role yang benar, sementara identitas dan nilai snapshot arsip harus cocok dengan Lead setelah transaksi. Arsip harus memiliki ID/`lead_id` Lead yang sama, tanggal won valid, dan timestamp `archived_at`. Client tidak boleh mengubah atau menghapus arsip (`allow update, delete: if false`). Transisi kembali ke Won hanya boleh memakai arsip pertama jika snapshot masih cocok; jika berbeda, repository menolak secara terkontrol dan Rules juga menolak transaksi tersebut. Gunakan opportunity/Lead baru untuk transaksi baru, bukan menimpa arsip pertama.

Kasus transisi sah, arsip ganda, perubahan, dan penghapusan diuji pada `firestore.rules.test.ts` dengan Firestore Rules Emulator. Jalankan `npm run test:firestore` untuk audit ulang emulator lokal.

## Koreksi data Lead yang dibatasi Rules

Detail Lead kini menyediakan aksi **Koreksi data** untuk telepon, PIC/contact person, nilai deal, dan lead score. Repository mengirim hanya field yang berubah melalui antrean durable terenkripsi dan memakai server timestamp untuk `updated_at`; Firestore Rules tetap mewajibkan owner workspace aktif, sesi PIN, skema Lead yang valid, identitas/role/tanggal pembuatan tetap, serta daftar field perubahan yang ketat. Stage dan tanggal follow-up tetap memakai alur perubahan stage yang ada. Nama perusahaan, industri, kota, owner, role, dan penghapusan Lead tidak dapat dikoreksi dari formulir ini.

## Ekspor snapshot JSON lokal

Tombol **Ekspor Lengkap** di toolbar mengunduh JSON versioned berisi Lead, aktivitas, arsip Won, metrik pipeline, distribusi score/jenis aktivitas, jumlah aktivitas per Lead, dan pemeriksaan relasi arsip/aktivitas. Snapshot memuat field penuh yang tersedia, termasuk telepon/kontak, catatan aktivitas, ringkasan AI, serta koordinat GPS bila tercatat; aplikasi meminta konfirmasi sebelum unduh.

Metadata `coverage.current_server_snapshot` hanya bernilai `true` jika ketiga listener bukan dari cache dan tidak ada mutasi pending/gagal. Ringkasan juga mencatat Lead Won yang belum memiliki arsip serta aktivitas/arsip yang tidak merujuk Lead yang ditemukan. File ini adalah ekspor klien lokal, bukan backup/restore Cloud Firestore dan bukan bukti bahwa data pending telah disimpan di server. Simpan hasilnya dengan perlindungan yang sesuai karena berisi data kontak dan catatan CRM.

## Langkah verifikasi lokal sebelum pengujian hosted staging

Semua langkah berikut tetap lokal dan memakai fixture sintetis. Jangan jalankan `npm run test:firestore:staging`, jangan gunakan project ID hosted, dan jangan mengubah Rules atau data Firebase hosted.

1. Pastikan branch lokal yang dimaksud aktif dan file kerja audit `ANALISIS_KESIAPAN_CRM.md` tidak disentuh. Lihat `git status --short --branch` dan pastikan tidak ada file lain yang terlanjur masuk perubahan.
2. Jalankan `npm run test:firestore`. Skrip memakai project demo `demo-ar-crm-rules` dan Rules lokal. Verifikasi update phone/PIC/deal/score diterima; tipe salah, nilai negatif, contact kosong, field non-allowlisted, timestamp klien, owner/PIN/workspace salah, dan penghapusan tetap ditolak.
3. Di hasil Emulator, verifikasi create Lead `Closing Won` tanpa arsip ditolak; create Lead dan arsip yang cocok dalam satu transaksi diterima; archive mismatch, arsip tanpa Lead, arsip ganda, update/delete arsip ditolak; dan transisi Lead Prospect menjadi Won bersama arsip tetap lolos.
4. Jalankan `npm test`, `npm run lint`, lalu `npm run build`. Pastikan tes export JSON memeriksa tiga koleksi, metrik, relasi orphan, dan penanda cache/pending; pastikan tes antrean menguji allowlist koreksi serta tanggal arsip direct-Won.
5. Untuk pemeriksaan UI opsional, jalankan Firestore/Auth Emulator lokal pada port dari `firebase.json` (Firestore `8080`, Auth `9099`) dan `npm run dev`. Development client diarahkan ke emulator lokal. Gunakan hanya owner, session, dan data sintetis yang tersedia di emulator; buka detail Lead, simpan koreksi empat field, lalu pastikan perubahan mendapat acknowledgement atau ditolak serta rollback dengan benar.
6. Buat satu Lead sintetis langsung sebagai `Closing Won` dan periksa bahwa setelah acknowledgement ada tepat satu dokumen `wonDealArchives/{leadId}` dengan field snapshot yang sama. Buat beberapa aktivitas sintetis, unduh **Ekspor Lengkap**, lalu periksa JSON: counts, pipeline, score/activity aggregates, GPS/note, arsip Won, status coverage, dan peringatan backup/restore.
7. Coba ekspor saat listener masih dari cache atau ada mutasi pending/gagal (bila dapat direproduksi). Pastikan `current_server_snapshot` bernilai `false`; jangan menafsirkan JSON ini sebagai backup server lengkap. Hentikan emulator setelah pemeriksaan.

Lulus pada emulator lokal hanya memvalidasi perilaku kode dan Rules lokal. Hosted staging tetap perlu diuji terpisah setelah persetujuan; tahap ini tidak mencakup push, merge, deploy, perubahan cloud, atau data Production.

## Audit fungsional dan responsive lokal — 29 Oktober 2026

Bilah akun kini berada dalam alur layout normal, bukan lapisan yang menutupi toolbar. Email panjang dapat terpotong secara sengaja dengan judul lengkap saat hover; tombol Keluar tetap terpisah. Toolbar membungkus kontrol, popover antrean memakai portal dengan posisi yang dibatasi viewport, dan Mobile Frame memakai tinggi layar tersisa serta layout compact walaupun viewport desktop lebar.

History menyimpan tab, stack modal, dan ID Lead. Back/Forward mengembalikan konteks yang sama; snapshot Firestore tidak lagi membangun ulang history dan menghilangkan modal. Jika konteks Lead sudah tidak tersedia, hanya lapisan modal yang ditutup, bukan memaksa tab Dashboard. Koreksi detail dan perubahan stage memakai overlay token-scoped, acknowledgment mengubah status rendered, dan status gagal tetap diprioritaskan.

Modal memakai nama aksesibel, focus trap, Escape, scroll lock, serta urutan z-index berdasarkan urutan buka. Ini memperbaiki Activity Logger yang sebelumnya tertutup backdrop Lead Detail. Tombol Keamanan juga kini memasang lazy modal ketika pertama dibuka. WhatsApp mempertahankan draf untuk Lead yang sama, memisahkan draf antar-Lead, menangani kegagalan clipboard, dan menyebut nomor hanya valid secara format—bukan terverifikasi terdaftar. Copy File pada contoh Android juga tidak lagi mengklaim berhasil sebelum clipboard menerima tulisan.

### Bukti pengujian final

- `npm test`: **176 passed, 1 skipped, 0 failed**. Skip adalah pemeriksaan binding Rules staging privat yang tidak dikonfigurasi; bukan tes lokal yang gagal.
- `npm run test:firestore`: **22/22 passed** pada project demo lokal. Log `PERMISSION_DENIED` pada negative tests adalah penolakan yang memang diharapkan.
- `npm run lint`, `npm run build`, dan `git diff --check`: lulus. Tidak ada push, merge, stage, commit, deploy, atau perubahan Firebase hosted.
- Smoke browser Chromium: **14/14 skenario lulus** pada profil baru yang belum pernah dipakai, Auth/Firestore Emulator project `demo-ar-crm-ui-audit`, dan data sintetis. Request non-lokal diblokir. Profil outbox lama tidak dipakai, diputar ulang, maupun dibersihkan.
- Flow yang diperiksa: create Lead biasa/direct-Won; koreksi PIC/telepon/nilai/score; aktivitas dengan ringkasan lokal dan GPS sintetis yang diminta eksplisit; semua stage, arsip first-win dan matching re-win; template/draf/copy WhatsApp; CSV/JSON beserta relasi dan coverage; Back/Forward; tab/file/copy/download contoh Android; select Kanban native; Finder filter/flag AI; Mobile Frame; popover antrean; open/close lima modal; keyboard trap Activity; guard penulisan offline; dan sign-out sintetis.
- Geometri empat tab diuji pada **320, 390, 768, dan 1366 px**: tidak ada overflow horizontal dokumen atau overlap baris akun dengan header. Modal dibatasi viewport pada 320×568. Screenshot sampel mobile, desktop, modal, popover dan frame diperiksa visual; ini bukan klaim bahwa setiap kontrol pada setiap kombinasi viewport diperiksa visual manual.
- Alur valid final menghasilkan **0 page error tak tertangani dan 0 permission-denied**. WhatsApp hanya diintersep untuk memeriksa URL—tidak ada pesan nyata dikirim.

### Batas sebelum data operasional

Auth dan sesi PIN pada smoke adalah fixture sintetis. Login Google, endpoint PIN hosted, expiry/revocation sesi nyata, biometric perangkat, AI eksternal dan import hasilnya, serta perilaku browser/perangkat fisik belum diverifikasi end-to-end. AI memang dinonaktifkan pada konfigurasi smoke, bukan dianggap tombol aktif yang rusak. Uji multi-tab/perangkat, crash/reload dan pemulihan outbox gagal pada sesi nyata juga masih diperlukan walaupun regression antrean lokal sudah lulus.

Ekspor JSON dan outbox terenkripsi **bukan backup/restore**. Sebelum mengandalkan CRM sebagai satu-satunya tempat data harian, siapkan backup yang dilindungi dan uji restore seluruh Lead, aktivitas serta arsip; verifikasi hosted staging hanya setelah persetujuan terpisah; dan audit pemulihan antrean lama secara terkontrol, tanpa replay otomatis. Jangan menganggap PIN tampilan lokal sebagai autentikasi atau enkripsi seluruh data browser.
