# Audit Kesiapan AR-CRM — Solo Account Manager Edition

**Kesimpulan: belum siap untuk menyimpan data prospek nyata atau menjadi CRM utama harian.** Snapshot kode lokal cukup matang untuk uji fungsional sintetis melalui Firebase Emulator, dan perlindungan Rules serta antrean tulis menunjukkan fondasi teknis yang baik. Namun, Preview hosted yang tersedia belum menjalankan kandidat branch ini dan alur sign-in/PIN/CRUD belum diverifikasi di sana. Di samping itu, belum ada backup–restore teruji dan terdapat beberapa celah fungsional yang dapat menghasilkan arsip Won yang hilang atau informasi Lead yang tidak bisa dikoreksi.

**Keputusan praktis:** silakan mulai uji coba dengan data sintetis di lingkungan lokal yang memakai Emulator. Jangan masukkan kontak prospek atau informasi deal nyata ke Preview/Production sebelum gerbang hosted, akses PIN, dan pemulihan data diselesaikan.

## Snapshot yang diperiksa

Repository `/workspace/ar-crm`, branch `cue/firebase-stabilization`, HEAD `56c30ea4d8fec0d0fdd5cb802b05840224bfdf26`; branch lokal tiga commit di depan `origin/cue/firebase-stabilization`. Working tree bersih sebelum laporan ini dibuat. Build dan pemeriksaan dijalankan pada source lokal; tidak ada deployment, push, perubahan Rules/cloud, atau penulisan data Firebase.

Hasil ulang pada snapshot saat ini:

| Pemeriksaan | Hasil |
|---|---:|
| `npm test` | 154 lulus, 0 gagal, 1 dilewati (155 total) |
| `npm run test:firestore` | 17/17 lulus di Firestore Emulator |
| `npm run lint` dan `npx --no-install tsc --noEmit` | Lulus |
| `npm run build` | Lulus |
| Bundle JavaScript | Chunk terbesar 241.65 kB; entry 87.40 kB; sekitar 994.55 kB raw tersebar pada 26 file JS |

Tes yang dilewati adalah pemeriksaan Rules staging privat yang memerlukan binding staging lokal. Angka 241.65 kB adalah **chunk terbesar**, bukan total seluruh JavaScript. Pemecahan route/modal dengan lazy-loading memperbaiki ukuran chunk dan membantu memuat fitur saat dibutuhkan; belum ada pengukuran performa nyata di ponsel/laptop atau uji browser end-to-end.

## Kesiapan fitur untuk pekerjaan harian

### Leads dan scoring

Form dapat mencatat nama perusahaan, PIC, telepon, industri, kota, tahap, nilai deal IDR, follow-up, dan score. Perusahaan dan PIC wajib; telepon, industri, kota, nilai, dan follow-up boleh kosong/bernilai awal nol. Nilai score yang tersedia ialah `Hot`, `Warm`, `Cold`, dan `Unrated` (`src/components/QuickLeadModal.tsx:44-61,109-245`; skema/Rules di `src/types/crm.ts:13-27` dan `firestore.rules:68-92`). Rules membatasi panjang/tipe bidang, nilai deal tidak boleh negatif, dan tanggal follow-up harus tanggal kalender yang sah.

Scoring adalah **label manual**, bukan score perilaku atau rekomendasi yang dihitung otomatis. `ai_match_score` pada Lead Finder adalah skor kecocokan saran AI yang berbeda dari `lead_score`. Setelah Lead dibuat, UI dan Rules tidak menyediakan perubahan contact, telepon, nilai deal, maupun score; update Lead saat ini dibatasi ke tahap, tanggal follow-up, dan timestamp (`firestore.rules:172-179`; `src/components/LeadDetailModal.tsx:128-179`). Tidak ada tombol edit atau delete. Jadi salah ketik nomor/PIC/nilai sulit atau tidak dapat dibetulkan lewat aplikasi—risiko nyata untuk operasional harian.

### Pipeline dan pengarsipan

Tahap Prospect → Meeting → Negotiation → Closing Won/Lost tersedia. Pengguna dapat memilih tahap langsung, tanpa urutan wajib atau alasan perubahan. Dashboard menghitung nilai pipeline dengan probabilitas tetap per tahap; angka ini membantu ringkasan, tetapi bukan forecast yang dilatih dari hasil penjualan (`src/types/crm.ts:110-168`; `src/utils/crmCalculations.ts:28-73`). Closing Lost tidak meminta alasan dan tidak membuat arsip khusus.

Perpindahan Lead yang sudah ada ke Closing Won membuat dokumen `wonDealArchives/{leadId}` dan mengubah stage dalam transaksi Firestore yang sama (`src/firebaseRepository.ts:125-171`). Rules mengharuskan transisi baru ke Won, mencocokkan detail arsip dengan Lead setelah transisi, dan menolak update/delete arsip (`firestore.rules:196-213`). Emulator menguji transaksi yang sah serta penolakan arsip langsung dan duplikat (`firestore.rules.test.ts:329-356`). Ini proteksi backend yang baik.

Ada tiga batas penting:

1. **Jalur pembuatan Lead dapat melewati auto-archive.** Form mengizinkan `Closing Won` sebagai initial stage (`src/components/QuickLeadModal.tsx:178-192`), sedangkan `createLead` hanya membuat dokumen Lead dan bukan arsip (`src/firebaseRepository.ts:249-276`). Rules menerima stage awal Won. Dengan demikian, Lead yang dibuat langsung sebagai Won tidak akan masuk arsip; aturan arsip justru mensyaratkan transisi dari non-Won. Ini perlu ditutup sebelum mengandalkan pencatatan deal Won.
2. Closing Won tetap berada di koleksi Leads dan **tidak ada halaman arsip** di aplikasi; archive saat ini merupakan salinan backend yang tidak dapat ditelusuri lewat UI. Closing Lost juga tetap di daftar Leads tanpa catatan alasan/tanggal terpisah.
3. Jika Lead Won dibuka kembali lalu ditutup Won lagi, ID arsip tetap sama dan kode tidak memperbarui arsip yang sudah ada. Tanggal/nilai arsip dapat mencerminkan penutupan pertama, bukan penutupan terbaru (`src/firebaseRepository.ts:131-153`).

### Aktivitas lapangan, GPS, WhatsApp

Activity Logger mewajibkan Lead dan catatan, serta menyediakan tipe Meeting Check-In, Phone Call, WhatsApp Message, Proposal Sent, dan Site Visit. GPS opsional dan hanya diminta sekali setelah pengguna menekan tombol; bila disetujui browser, koordinat serta akurasi disimpan bersama aktivitas. Tidak ada background tracking. Rules memvalidasi rentang koordinat dan memastikan aktivitas merujuk ke Lead milik owner pada workspace yang sama (`src/components/ActivityLoggerModal.tsx:147-193,216-249`; `firestore.rules:94-125,183-191`). Catatan aktivitas tidak dapat diedit/dihapus dari UI. Rangkuman lokal tidak mengirim catatan; Gemini hanya digunakan setelah persetujuan eksplisit dan saat server mengaktifkannya.

WhatsApp Quick Reach menyediakan template yang dapat diedit, preview, salin teks, lalu membuka `wa.me` dengan pesan terisi (`src/components/WhatsAppModal.tsx:21-41,71-188`). Normalisasi nomor cocok untuk pola nomor Indonesia lazim, tetapi **bukan verifikasi nomor internasional yang sebenarnya**: hampir semua karakter selain digit/`+` dibuang dan UI menandai nomor non-kosong sebagai “Verified” (`src/utils/crmCalculations.ts:165-177`; `src/components/WhatsAppModal.tsx:78-87`). Nomor malformed seperti rangkaian digit pendek masih dapat ditandai siap. Selain itu, membuka WhatsApp tidak otomatis membuat Activity; interaksi harus dicatat terpisah agar riwayat sales lengkap.

## Keandalan teknis, keamanan, dan PWA

### Bukti teknis lokal

Hasil 154 unit test dan 17 Rules Emulator lulus mengonfirmasi banyak validasi, kalkulasi, proteksi akses, sesi PIN, antrean, dan beberapa kasus Service Worker. Rules membatasi satu owner/workspace, mensyaratkan sesi PIN server yang aktif untuk hosted, memvalidasi schema secara ketat, menolak delete dan menutup koleksi lain secara default (`firestore.rules:4-41,68-92,106-125,156-220`). Desain aplikasi memang personal/single-owner, bukan CRM kolaboratif tim. App PIN account ditangani server-side; PIN perangkat lokal hanya aktif pada target lokal (`src/localSecurityPolicy.ts:3-6`).

Optimasi build terbaru berhasil memecah route dan modal; chunk terbesar turun ke 241.65 kB dan entry utama 87.40 kB. UI menggunakan layout responsif seperti breakpoint `sm`/`md`, modal adaptif, dan Kanban horizontal-scroll. Itu menunjukkan niat responsive, **bukan bukti** hasil visual/usability pada perangkat nyata.

### Offline dan PWA: bukan CRM offline penuh

Service Worker hanya memakai network-first untuk navigasi/app shell dan menyimpan aset statis same-origin yang dikenal; API, halaman dinamis, serta request lintas-origin tidak dicache (`public/sw.js:49-92`). Data Firebase bukan bagian dari cache app shell. Outbox mutasi menggunakan IndexedDB dan enkripsi AES-GCM, dipisah per owner/workspace (`src/utils/offlineOutbox.ts:288-360`), tetapi ketika browser melaporkan offline, antrean menolak mutasi durable baru (`src/utils/offlineWriteQueue.ts:319-325`). Mutasi lama yang dipulihkan menunggu tindakan manual owner sebelum replay. Maka jangan menganggap PWA dapat terus dipakai untuk input sales tanpa jaringan atau bahwa cache Service Worker adalah backup. Perilaku full offline di browser/perangkat nyata belum terverifikasi.

Metadata PWA juga perlu dirapikan: manifest masih menyebut Firebase sign-in/cloud sync belum tersambung, walau source kini menggunakannya (`public/manifest.json:2-4`), dan mengunci orientasi `portrait` (`:25-29`). Meta viewport melarang zoom pengguna (`index.html:5`), yang mengurangi aksesibilitas bagi pengguna yang perlu memperbesar tampilan. Font Google berasal dari jaringan eksternal dan tidak termasuk cache lokal Service Worker.

### Hosted staging, PIN, dan backup

Berdasarkan status hosted yang diberikan untuk audit ini (tidak saya ubah atau verifikasi ulang melalui cloud), Preview lama terikat ke project staging tetapi tidak membawa route/claim PIN kandidat saat ini; pemeriksaan terhenti pada gangguan CORS manifest yang berkaitan dengan Vercel SSO. Hosted sign-in/CRUD dan offline sync tidak diuji, tidak ada fixture, dan Rules belum dipublikasikan. Branch lokal berada tiga commit di depan remote, sehingga Preview lama bukan representasi HEAD `56c30ea`. Service account dan role/condition staging telah dibuat, tetapi key staging yang masih aktif belum dipasang di Vercel; tinjau kebutuhan key itu dan cabut/rotasi bila tidak diperlukan.

Karena endpoint/claim PIN hosted belum dibuktikan, belum ada bukti bahwa owner bisa melewati gate dan mengakses CRM di Preview. PIN lokal pada Emulator bukan pengganti Account PIN hosted. Kode PIN memiliki desain fail-closed, limiter, dan sesi server, tetapi hal itu tidak membuktikan konfigurasi runtime/deployment yang ada benar atau tidak mengunci owner.

Belum ada backup/restore otomatis bawaan aplikasi maupun drill restore yang terverifikasi. CSV aplikasi hanya mengekspor Leads, bukan snapshot utuh Activity, archive, Rules, Auth, dan konfigurasi; ekspor Google Sheets adalah laporan/portabilitas, bukan pemulihan Firestore. Ini membuat kehilangan atau korupsi data sulit dipulihkan. Pengamanan browser tidak menghilangkan kebutuhan backup terpisah.

## Keputusan penggunaan

| Lingkungan | Rekomendasi |
|---|---|
| Lokal dengan Firebase Emulator | **Boleh untuk uji coba sintetis.** Development lokal diarahkan ke Emulator, bukan otomatis ke project hosted (`src/firebase.ts:113-132`). Jangan gunakan kontak/PIC atau nilai deal nyata; data lokal bukan penyimpanan operasional terjamin. |
| Hosted Preview saat ini | **Jangan masukkan data nyata.** Kandidat branch ini belum terpasang/terverifikasi; autentikasi/PIN, Rules hosted, dan CRUD belum lulus smoke test. Gunakan hanya setelah Preview terisolasi diperbarui dan diverifikasi dengan data sintetis. |
| Production untuk sales harian | **Belum siap.** Perlu hosted sign-in/PIN/CRUD yang lulus, proteksi backup–restore yang diuji, dan penutupan temuan arsip serta kemampuan koreksi data sebelum menjadi sistem pencatatan utama. |

## Prioritas sebelum mengandalkan CRM

1. Perbarui/uji Preview yang benar-benar memakai kandidat branch ini pada project staging terisolasi: authorized domain/SSO, App Check, owner/workspace, Rules hosted, PIN enroll/verify/retry/expiry, sign-in, Lead/Activity CRUD, dan cleanup fixture sintetis. Jangan promosikan Production sebagai bagian dari audit ini.
2. Tutup gap integritas dan operasional: cegah Lead baru dibuat langsung sebagai Won atau pastikan arsip ikut dibuat; dukung pembukaan/penelusuran arsip Won; tetapkan alur untuk re-won dan Lost; tambahkan edit terbatas untuk contact/phone/deal value/score atau cara koreksi yang aman; simpan alasan Lost dan aktivitas perubahan penting.
3. Siapkan backup yang sesuai cakupan data dan lakukan restore drill ke environment terpisah. Jangan memperlakukan CSV Leads atau Google Sheets sebagai salinan pemulihan lengkap.
4. Perketat verifikasi nomor WhatsApp dan tampilkan status “format dinormalisasi” alih-alih “verified”; pertimbangkan log Activity sesudah pengguna benar-benar membuka/mengirim pesan. Uji GPS permission, proses reconnect, pemulihan outbox, serta UI di ponsel dan laptop.
5. Setelah semua itu, baru pertimbangkan pemakaian nyata dengan minimisasi data, kontrol akses perangkat/browser, kebijakan ekspor/retensi, dan pemantauan jumlah antrean pending sebelum logout atau ganti perangkat.

**Batas audit:** pemeriksaan ini meninjau source, Rules Emulator, test suite, lint/type-check, dan build lokal. Tidak dilakukan login hosted, transaksi CRUD live, pengujian perangkat fisik, perubahan cloud, deployment, push, merge, atau backup/restore.


### Catatan tambahan verifikasi aset PWA

Pemeriksaan berkas menemukan `public/icon-192.png` dan `public/icon-512.png` masing-masing berukuran 1254×1254 px, sedangkan manifest mendeklarasikannya sebagai 192×192 dan 512×512 (`public/manifest.json:5-16`). Ini metadata ikon yang tidak akurat dan dapat mengurangi kompatibilitas instalasi atau menambah payload; siapkan aset pada dimensi yang dinyatakan sebelum mengklaim kualitas instalasi PWA sudah tervalidasi. Service Worker hanya memasukkan `/`, `/index.html`, manifest, dan ikon ke precache; hashed JavaScript/CSS baru tersimpan setelah berhasil diminta melalui jaringan (`public/sw.js:3-10,30-35,63-89`). Karena itu instalasi pertama/first visit tanpa jaringan dan pembukaan route yang belum pernah dimuat tidak dijamin offline. Tes Service Worker yang ada menguji cakupan intersepsi dan aset statis, bukan siklus install/activate/offline lengkap (`src/serviceWorker.test.ts`).


## Tambahan review kandidat branch `cue/firebase-stabilization` — 29 Oktober 2026

Review statis read-only terhadap seluruh diff kerja dari HEAD `56c30ea` tidak menemukan temuan material pada sejumlah area, tetapi menemukan isu berikut yang perlu ditutup sebelum mengandalkan hosted staging atau data nyata:

- **Integritas antrean offline (medium):** urutan tie-break untuk operasi dengan `createdAt` sama dibentuk ulang dari urutan `store.list()` setelah restore, bukan dari token urutan yang persisten. IndexedDB dapat mengembalikan urutan berbeda sehingga replay bergantung pada urutan storage dan bisa membalik operasi yang saling bergantung.
- **Privasi ekspor (medium):** ekspor menyalin objek Lead/Activity/archive mentah tanpa schema allowlist. Mapper Firestore menyebarkan `ownerId` dan `_syncStatus`, dan field internal/baru dapat ikut keluar ke JSON yang dibagikan.
- **Validasi edit Lead (medium):** PIC berisi spasi dapat lolos validasi HTML lalu disimpan kosong; menghapus nilai numerik dapat berubah menjadi `0` sebelum validasi. Stage action juga masih tersedia saat edit/simpan, sehingga penutupan Won dapat mengarsipkan snapshot lama sebelum detail baru tersimpan.
- **Navigasi (medium):** tombol Android Code memakai `window.history.back()` untuk kembali; saat halaman dibuka langsung pada state tersebut, navigasi dapat meninggalkan aplikasi alih-alih kembali ke Dashboard.
- **PIN perangkat lokal (medium):** batas enam digit hanya mengandalkan `maxLength` DOM, sementara handler/API menerima nilai lebih panjang; panjang PIN tersimpan dapat tidak sesuai dengan panjang yang dibaca UI saat verifikasi.
- **Aksesibilitas TopAppBar (medium):** pada Android phone-frame, beberapa kontrol menyembunyikan teks terlihat tanpa nama aksesibel yang dapat diandalkan; status online/offline juga hanya menyisakan indikator visual.

**Gerbang:** laporan ini hanya hasil review source; seluruh temuan tersebut belum diperbaiki pada kandidat ini. Celah test yang paling penting adalah replay outbox setelah restore, skema privasi ekspor, validasi edit dan race Closing Won, state-history Android Code, batas PIN, serta nama aksesibel kontrol. Hasil tes yang diminta untuk kandidat ini akan dicatat setelah dijalankan. Tidak ada akses atau perubahan Firebase/Vercel/staging dalam review ini.


**Pembaruan hasil gerbang lokal:** `npm test` — 176 lulus, 0 gagal, 1 skip (177 total); `npm run test:firestore` — 22/22 lulus. Skip unit adalah tes staging yang memang memerlukan binding privat; suite staging live tidak dijalankan.
