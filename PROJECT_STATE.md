# PROJECT STATE & ARCHITECTURAL SPECIFICATION
## AR Personal CRM Enterprise (Solo Account Manager Edition)

> **Document Version:** 2.4.1 (local Rules and PWA hardening)
> **Status:** Branch `cue/firebase-stabilization` diperiksa dari clone remote bersih pada HEAD `8daeb73`. Working tree sesi ini memuat remediasi lokal belum di-commit untuk aturan arsip Won, cache Service Worker, tes regresi, dan dokumentasi. Working tree lama yang disebut dalam audit tidak tersedia pada sesi ini; tidak ada perubahan lokal pengguna yang dapat diperiksa atau ditimpa. Belum siap untuk staging/Production: hosted sign-in/CRUD, runtime PIN, dan backup/restore belum diverifikasi.
> **Production terakhir diperiksa baca-saja melalui metadata Vercel (28 Okt 2026; tidak diperiksa ulang pada pembaruan ini):** project `arcrm-app`, alias [https://arcrmapp.vercel.app/](https://arcrmapp.vercel.app/) READY pada commit `f010c46f6358fa57fe2b0957e8f049058acb0b7d`, branch `cue/firebase-stabilization`; ditandai Vercel sebagai rollback candidate. Metadata deployment terkonfirmasi saat itu, tetapi prosedur dan keberhasilan rollback belum diuji.
> **Preview staging:** [https://arcrm-4sv1mj6xw-anggaramadhan538-8607.vercel.app](https://arcrm-4sv1mj6xw-anggaramadhan538-8607.vercel.app) — status dari catatan terdahulu; tidak diperiksa ulang pada pembaruan ini.
> **Author & Architect:** Lead Full-Stack Software Architect & UI/UX State Specialist  
> **Last Updated:** 29 Oktober 2026, 09:29 WIB
> **Target Platform:** Responsive Progressive Web App (PWA) untuk browser laptop dan ponsel; tidak ada native Android app pada source ini.
> **Catatan sumber kebenaran:** bagian “Status operasional terbaru” di bawah menjadi ringkasan saat ini. Bagian bertanggal setelahnya adalah snapshot historis pada waktu masing-masing dan tidak boleh mengalahkan bukti yang lebih baru. Branch `cue/firebase-stabilization` memakai Firebase Auth/Firestore untuk Leads/Activities dan tidak mengimpor data lama otomatis. Data operasional belum dimigrasikan; jangan memakai spreadsheet lama yang dikosongkan sebagai sumber.

## Status operasional terbaru — 29 Oktober 2026, 09:29 WIB

### Snapshot, remediasi lokal, dan verifikasi

- Snapshot awal adalah remote branch `cue/firebase-stabilization` pada `8daeb7383f19b95365450f6a5476873288a6edb4`; clone sesi ini bersih sebelum perubahan. Audit lampiran melaporkan working tree lain dengan perubahan pengguna, tetapi checkout tersebut tidak tersedia di sini. Perubahan di bawah hanya ada pada clone ini dan belum di-stage, di-commit, atau di-push.
- Firestore Rules kini mensyaratkan Lead yang diarsipkan berpindah dari status non-Won menjadi `Closing Won` dalam operasi yang sama. Tes emulator menolak arsip langsung untuk Lead yang sudah Won dan pembuatan arsip duplikat; transaksi valid tetap diterima.
- Service Worker sekarang hanya mengintersep request same-origin untuk navigasi app shell dan aset statis yang dikenal di `/assets/`; API, halaman dinamis, ekspor, dan request lintas-origin tidak dicache. Cache key dinaikkan ke `arcrm-cache-v2.2.1`. Ditambahkan dua tes unit untuk cakupan intersepsi/cache.
- Dokumen kesiapan migrasi dikoreksi agar menyatakan Firestore Rules memvalidasi tanggal kalender nyata, termasuk tahun kabisat. Tidak ada migrasi data atau perubahan cloud.
- Verifikasi 29 Okt: `npm test` **154 lulus, 0 gagal, 1 skip** (155 total); `npm run test:firestore` **17/17**; `npm run lint`; `npx --no-install tsc --noEmit`; `npm run build`; `git diff --check`; smoke test HTTP localhost untuk app shell dan `/sw.js`; `npm audit --omit=dev` **0 advisori**.
- Build lulus dengan warning chunk JavaScript **984,30 kB** (gzip **288,11 kB**), melampaui ambang 500 kB. `npm ci` juga melaporkan **5 advisori Moderate** pada pohon dependency keseluruhan; tidak ada upgrade otomatis yang dilakukan.

### Batas bukti dan gate berikutnya

- Tidak ada commit, push, deployment, perubahan Firebase/Vercel, penulisan data CRM, hosted browser test, uji PIN hosted, maupun backup/restore drill. Smoke test hanya di Vite Preview localhost; bukan verifikasi Preview/Production.
- Tetap perlu pengujian hosted sign-in/CRUD dengan data sintetis di Preview terisolasi, tes handler HTTP PIN dan runtime, backup/restore pada project terpisah, serta keputusan untuk bundle splitting. Jangan promosikan branch ini atau menyatakan siap Production hanya dari tes lokal.

## Snapshot operasional sebelumnya — 28 Oktober 2026, 17:07 WIB

### Perubahan lokal dan verifikasi

- Sesudah autentikasi/sesi PIN yang valid, outbox untuk owner/workspace yang sama dipulihkan untuk ditampilkan tetapi tidak direplay otomatis—termasuk setelah koneksi pulih. Owner dapat memilih “Sinkronkan mutasi tersimpan” lalu mengonfirmasi jumlahnya, atau mengirim satu operasi secara eksplisit. Mutasi baru tetap mengikuti alur sinkronisasi biasa.
- Panel antrean hanya menampilkan jumlah, kategori, status, dan pesan error generik; snapshot tidak membawa payload Lead/Activity dan editor koreksi yang memaparkan payload telah dilepas dari UI. Payload outbox tidak dihapus atau diubah oleh restore maupun kegagalan; record baru dibersihkan setelah acknowledgement Firestore. Tes sintetis juga memverifikasi fail-closed saat payload tidak dapat dipulihkan.
- Verifikasi lokal 28 Okt: `npm test` **152 lulus, 0 gagal, 1 skip** (153 tes); tes outbox terfokus **29/29**; `npm run lint`; `npx --no-install tsc --noEmit`; `npm run build`; `git diff --check` dan `git diff --cached --check` lulus. Build selesai dengan warning bundle JavaScript **984.63 kB** (gzip **288.23 kB**), di atas ambang Vite 500 kB.
- HEAD tetap `8498878` pada branch `cue/firebase-stabilization`; tidak ada perubahan staged. Semua pekerjaan masih lokal/uncommitted. Tidak ada commit, push, deployment, perubahan Rules/data Production, atau perubahan cloud pada langkah ini.

### Gerbang rilis dan hal yang belum diketahui

- Pemeriksaan metadata Vercel baca-saja terbaru menemukan project `arcrm-app` dan Production deployment READY pada alias `arcrmapp.vercel.app`, commit `f010c46f6358fa57fe2b0957e8f049058acb0b7d`, branch `cue/firebase-stabilization`; Vercel menandainya rollback candidate. Fakta ini mengonfirmasi metadata deployment, bukan bahwa prosedur rollback sudah diuji. Preview SSO `all_except_custom_domains` tetap enabled.
- Environment Vercel Production untuk enrollment PIN satu kali telah disimpan khusus Production. Pengaturan itu baru berlaku setelah deployment baru; enrollment belum diaktifkan saat runtime atau digunakan. Owner sebelumnya menyetujui enrollment satu kali, tetapi izin itu bukan persetujuan untuk deployment. Firestore Rules Production tetap mensyaratkan sesi PIN valid; akses owner dan cara mencegah lockout harus diverifikasi sebelum rilis. Jangan mengubah Rules atau data Production.
- Jumlah/status outbox di profil browser owner **tidak diketahui** karena `DESKTOP-0NPV94C` offline. Perangkat tidak diakses, isi antrean tidak diperiksa, dan storage tidak dibersihkan. Setelah owner dapat membuka aplikasi, tinjau jumlah/status aman di UI sebelum memutuskan replay manual.
- Blocker rilis: alur konfigurasi dan akses PIN Production harus diverifikasi tanpa lockout; prosedur deployment dan rollback belum diuji; jumlah antrean owner belum diketahui; kandidat lokal belum dirilis. Jangan stage, commit, push, deploy, mengubah environment/cloud, atau menulis data Production sebelum gate dan persetujuan terpisah terpenuhi.
- Pada putaran ini tidak dijalankan emulator Rules, hosted browser/e2e, replay pada outbox milik owner, panggilan Gemini, maupun smoke test Production.
- Lihat [dokumen AI](docs/AI_LEAD_FINDER_READINESS.md) dan [kesiapan PIN lintas perangkat](docs/ACCOUNT_PIN_CROSS_DEVICE_READINESS.md) untuk konteks sebelumnya dan gerbang terkait.

## Snapshot operasional sebelumnya — 28 Oktober 2026, 10:23 WIB

### Hasil kandidat lokal dan gerbang rilis

- Lead Finder dan Meeting Summarizer memakai server-side `gemini-3.8-flash`; consent notes tetap eksplisit, fallback summarizer ekstraktif lokal, dan kuota lima request/hari kini dibagi bersama. Tidak ada panggilan live Gemini atau data CRM nyata yang digunakan.
- Fix lokal mencakup ID impor perusahaan deterministik per owner/workspace, rekonsiliasi stage yang mempertahankan intent ketika snapshot cache/pending tertinggal, metadata snapshot dipertahankan saat ack/rollback, dan konfigurasi emulator staging terpisah. UID staging tetap di `.env.staging.local`; Rules staging dibangkitkan sementara, diuji, lalu dihapus/diabaikan Git.
- Security patch mem-pin `@grpc/grpc-js` ke `1.14.6`; `npm audit --omit=dev` melaporkan 0 advisory runtime. Audit penuh melaporkan 0 High dan 5 Moderate pada development/tooling dependency paths. Perbaikan otomatis yang disarankan npm untuk tooling meminta downgrade major Firebase CLI; downgrade itu tidak diterapkan tanpa review, jadi advisories Moderate dicatat sebagai residual dev risk. Kedua jalur Firebase/Admin memakai versi patched.
- Verifikasi lokal terakhir: `npm test` 135 lulus, 0 gagal, 1 skip (test private staging binding dijalankan pada emulator staging); `npm run test:firestore` 17/17; `npm run test:firestore:staging` 20/20; `npm run lint`; build Production dan Preview sanitasi; `git diff --check` — semuanya lulus.
- Build masih menghasilkan bundle JS sekitar 987 kB (gzip sekitar 289 kB), melewati peringatan Vite 500 kB. Scan output browser tidak menemukan marker Gemini API key, Firebase Admin service account, PIN pepper, atau private key. Belum ada manual/e2e browser test pada kandidat terbaru.
- Audit baca-saja Vercel terbaru mengonfirmasi `GEMINI_API_KEY` hanya untuk Preview branch `cue/firebase-stabilization`; `VITE_FIREBASE_TARGET=production` tidak terdaftar; variabel server `ACCOUNT_PIN_*`/`FIREBASE_ADMIN_*` Production juga tidak terdaftar. Nilai Firebase client env yang tersimpan tidak didekripsi atau divalidasi, dan tidak ada environment yang diubah.
- Kode hosted memakai PIN session server-issued sebelum Firestore; Rules mewajibkan sesi aktif, sedangkan endpoint PIN yang ditinjau hanya mengizinkan Preview. Dengan environment Production saat ini, rilis berisiko mengunci pemilik keluar. **Jangan commit/push/deploy** sampai target Firebase Production, service account/PIN Production, endpoint production-safe, dan uji autentikasi/rollback dikonfigurasi serta diverifikasi.
- Production saat ini tetap pada deployment lama `f010c46f6358fa57fe2b0957e8f049058acb0b7d` (READY; kandidat rollback). Perubahan lokal belum di-commit/push. Tidak ada perubahan Vercel/Firebase Production, data nyata, ataupun alias deployment.
- Lihat [dokumen AI](docs/AI_LEAD_FINDER_READINESS.md) dan [kesiapan PIN lintas perangkat](docs/ACCOUNT_PIN_CROSS_DEVICE_READINESS.md) untuk detail bukti dan gerbang rilis.

## Snapshot operasional sebelumnya — 28 Oktober 2026, 03:56 WIB

### Deployment dan lingkungan

- **Production:** Vercel melaporkan deployment `arcrmapp.vercel.app` berstatus READY dari commit `f010c46` pada branch `cue/firebase-stabilization`. Status READY hanya menegaskan deployment selesai; bukan bukti seluruh alur CRUD production berfungsi. Setelah perbaikan indeks, autentikasi serta baca/tulis Lead dan Activity di production belum diverifikasi tuntas.
- **Preview staging:** satu deployment dari build lokal terpisah berstatus READY pada URL di atas. Deployment memiliki metadata branch `cue/firebase-stabilization`, tetapi tidak memiliki SHA commit source. SSO tetap aktif. Setelah hostname Preview ditambahkan hanya ke daftar domain key App Check dan Authorized domains Auth pada project staging, layar aplikasi berhasil mencapai Google Sign-In. Login dan CRUD pada hosted Preview belum dijalankan; tidak ada data CRM yang ditulis.
- **Isolasi:** sebelas override Firebase di Vercel dibatasi ke Preview branch `cue/firebase-stabilization`; Production dan environment umum tidak diubah. Firebase staging memakai project, workspace, UID owner, Rules, serta indeks tersendiri di paket Spark/Singapore. Verifikasi domain App Check tetap aktif. Tidak ada perubahan Rules atau konfigurasi production pada tahap Preview.

### Kode, tes, dan kondisi Git

- **Fitur inti:** Firebase Auth + Firestore aktif untuk Leads/Activities. Rules bersifat fail-closed dan membatasi aplikasi ke satu owner/workspace; aplikasi cocok untuk penggunaan solo, bukan CRM tim multi-user. Delete dokumen ditolak Rules.
- **Offline:** antrean mutasi IndexedDB terenkripsi mendukung pemulihan setelah reload, dependency Lead→Activity, retry, acknowledgement server, dan pencegahan duplikasi. Pengujian staging dengan `disableNetwork()` Firestore, reload antrean, reconnect, replay, serta cleanup fixture lulus. Ini belum setara dengan uji kehilangan seluruh jaringan pada browser/perangkat nyata.
- **Verifikasi suite sebelumnya (27 Okt):** 83/83 unit test, 12/12 Rules Emulator, lint, TypeScript, build staging, dan `git diff --check` lulus. Warning Vite `__dirname` dan JavaScript bundle sekitar 954 kB (ambang peringatan 500 kB) masih ada. Advisory High pada jalur Firebase/gRPC belum dibereskan.
- **Uji PIN lokal (28 Okt, 03:55 WIB):** `npm test` 108/108, `npm run lint`, `npm run test:firestore` 15/15, `npm run build`, dan `git diff --check` lulus. Emulator menguji limiter lintas dua koneksi Admin serta race enrollment create-only; Rules juga menolak klien membaca/membuat credential docs. Build browser tidak memuat Firebase Admin, service-account JSON, pepper, atau verifier. Ini bukti lokal/mock/Emulator, bukan bukti hosted.
- **Alur PIN lokal:** endpoint `status`, `verify`, dan `enroll` default-off; UI PIN, Google re-auth enrollment pertama, custom-token exchange, pemeriksaan claim/session, serta aktivasi queue hanya setelah status server lolos sudah disambungkan. Credential verifier berada pada Firestore Admin-only dan create-only; tidak ada reset. `SecurityVault` PIN perangkat hanya dijalankan pada target local; PIN/storage lama dan antrean IndexedDB tidak dibersihkan. Hosted tetap fail-closed karena belum ada konfigurasi/deployment.
- **Branch lokal:** `cue/firebase-stabilization` berada di HEAD `8498878`; 22 file terlacak berubah dan 14 file baru belum dilacak, seluruhnya belum di-commit. Tidak ada push/merge ke `main`. Production tidak menjalankan perubahan lokal tersebut.

### Pekerjaan yang masih menghalangi kesiapan produksi penuh

1. Uji Google Sign-In dan CRUD Leads/Activities pada hosted Preview staging, tanpa memindahkan data nyata; rapikan fixture sintetis setelah tes.
2. PIN akun hosted staging masih terhambat: runtime Vercel Preview harus Node >=22; server-only service account, pepper, project/owner binding dan flag endpoint belum disetujui/diubah. Deploy route belum dilakukan. Tidak ada reset PIN; enrollment flag hanya boleh dinyalakan untuk pendaftaran pertama dan dimatikan setelahnya. Jangan aktifkan Blaze/layanan berbayar atau buka gerbang UI/Rules sebelum uji hosted sintetis lulus.
3. Selesaikan uji autentikasi dan CRUD owner di production secara terbatas dengan Lead nyata yang memang ingin disimpan. Jangan memakai data contoh karena delete ditolak Rules.
4. Siapkan backup dan prosedur restore yang benar-benar diuji sebelum mengandalkan Firestore production sebagai satu-satunya catatan sales. Saat ini backup/restore belum terverifikasi.
5. Audit dan selesaikan advisory dependency High; tinjau juga warning ukuran bundle dan konfigurasi Vite.
6. Verifikasi App Check khusus production; keberhasilan App Check staging tidak membuktikan konfigurasi production.
7. Ekspor Firestore → Google Sheets masih implementasi lokal, belum terkonfigurasi atau aktif. Belum ada spreadsheet pelaporan terpisah, service account dengan izin minimum, environment server, atau jadwal. Jangan memakai spreadsheet lama yang dikosongkan.
8. Setelah gate di atas selesai, lakukan review rilis dan minta persetujuan terpisah untuk commit/push/deploy. Jangan merge ke `main` atau cutover otomatis.

**Kesimpulan kesiapan:** boleh dipakai untuk pengujian staging terbatas setelah login diuji; belum layak menjadi satu-satunya CRM operasional production atau disebut “100% siap produksi”.

## Owner provisioning dan smoke test staging — 27 Oktober 2026, sekitar 13:52 WIB

> Snapshot pada 13:52 WIB ini mendahului persetujuan dan deployment Preview. Status Preview yang lebih baru tercatat di bagian “Status operasional terbaru” di atas.

- **Target tunggal:** `ar-crm-staging-angga-20261027`, workspace `ar-crm-staging-owner`. Metadata akhir database tetap `asia-southeast1`, `FIRESTORE_NATIVE`, `STANDARD`, `freeTier=true`, PITR disabled. Tidak mengaktifkan billing/Blaze.
- **Rules:** file staging privat di luar repo menyalin struktur/validasi Rules dan mengganti hanya binding ke identitas staging yang berbeda dari production. Smoke emulator staging lulus untuk owner, penolakan non-owner/delete, create/readback Lead–Activity, replay dan cleanup. Rules dirilis hanya dengan `--project ar-crm-staging-angga-20261027`; target diverifikasi sebelum/sesudah. `firestore.rules`, `firebase.json`, dan `firestore.indexes.json` repo tidak berubah.
- **Provisioning administratif:** commit atomik create-only membuat tepat root workspace (`ownerId`) dan membership owner (`role=owner`), tanpa record CRM sebelumnya. Keduanya dibaca kembali dan tetap utuh setelah cleanup. UID tidak dicatat di source/docs; identitas dan Rules staging tetap privat.
- **Client/build:** guard staging menggunakan workspace tetap dan UID non-production, sedangkan Rules privat menegakkan UID staging persis. `.env.staging.local` dibuat, ignored Git, mode `0600`; tidak membaca/menyentuh `.env.local`. Build hanya pada salinan privat yang mengecualikan seluruh `.env*`/`.npmrc` sumber, lalu memasukkan env staging eksplisit dan membersihkan environment proses dengan `env -i`. Build lulus; warning ukuran JavaScript chunk di atas ambang 500 kB tetap ada.
- **Cloud staging/browser loopback:** App Check preflight dan Google Auth owner berhasil membuka CRM kosong melalui server yang hanya listen `127.0.0.1:4174`. Satu Lead dan satu Activity online sintetis dibuat lewat UI; persisted readback dan relasi parent terverifikasi.
- **Indeks:** query awal gagal `FAILED_PRECONDITION`; dua indeks `ownerId ASC + created_at DESC` dirilis hanya ke staging dan sudah READY. Respons list ternyata memuat indeks Leads dan Activities sekaligus, bukan duplikasi; guard cleanup indeks berhenti sebelum DELETE. Tidak ada indeks yang dihapus. Query ekuivalen aplikasi kemudian HTTP 200 dan UI membaca fixture.
- **Offline terbatas:** harness privat di salinan build memakai repository asli, Auth/App Check dan Rules normal, dengan `disableNetwork()` Firestore SDK. Lead+Activity kedua diterima lokal tanpa acknowledgement; admin memastikan keduanya belum ada di server sebelum maupun sesudah reload. Dua operasi durable dipulihkan (`pending=1`, `syncing=1`, `failed=0`), lalu reconnect mempersist keduanya. Readback awal harness terlalu dini ditolak Rules pada dokumen yang belum ada; sinkronisasi harness diperbaiki untuk menunggu queue, tanpa create ulang. Server-only readback dan replay ID sama kemudian lulus; timestamp immutable tidak berubah, queue berakhir `pending=0`, `syncing=0`, `failed=0`. Ini bukan pemutusan seluruh jaringan browser/perangkat dan bukan hosted Preview.
- **Cleanup selesai:** setiap marker online/offline terverifikasi tepat satu (total dua Lead + dua Activity). Admin commit menghapus hanya empat ID fixture dengan marker/owner/parent dan precondition `updateTime` yang cocok. Keempat GET kemudian 404, koleksi Leads/Activities staging kosong, root/member owner tetap ada.
- **Suite lokal sesi ini:** `npm test` 83/83, `npm run lint`, `npx --no-install tsc --noEmit`, Rules Emulator 12/12 pada project `demo-ar-crm-rules`, dan `git diff --check` lulus. Tidak ada upgrade dependency; advisory High yang tercatat belum diselesaikan.
- **Batas:** HEAD tetap `8498878`, semua perubahan lokal uncommitted. Tidak ada push, merge, deployment Vercel/production, data nyata, migrasi, atau perubahan `main`. Hosted Preview/environment/domain Preview masih memerlukan persetujuan eksplisit. Full-browser offline, live non-owner denial, backup/restore, App Check production, production CRUD, dan cutover belum diverifikasi/disetujui; jangan menyebut production ready.

## Snapshot historis provisioning dan identitas staging — 27 Oktober 2026, 13:04–13:22 WIB

Pemilik menyetujui project terpisah pada Spark dengan Firestore Singapore `asia-southeast1`, tanpa Blaze. Izin tidak mencakup deployment Vercel Preview.

- **Project berhasil dibuat:** [`ar-crm-staging-angga-20261027`](https://console.firebase.google.com/project/ar-crm-staging-angga-20261027/overview), display name `AR CRM Staging`.
- **Cloud Firestore API aktif** dan database `(default)` berhasil dibuat. Metadata server mengonfirmasi `locationId=asia-southeast1`, `FIRESTORE_NATIVE`, `databaseEdition=STANDARD`, `freeTier=true`, dan PITR nonaktif. CLI mengonfirmasi database baru memakai closed rules yang memblokir traffic pihak ketiga. Tidak ada Rules/indexes repository yang dideploy atau dokumen workspace/member/CRM yang ditulis.
- **Web App berhasil didaftarkan:** `AR CRM Staging Web`, App ID `1:622108535247:web:b94a1d19f319ec7f200aba`. SDK config staging berhasil diambil secara read-only ke file temporer privat; nilai config/key tidak dicetak atau dimasukkan ke dokumentasi. Validasi mencakup project/App ID/authDomain/storage bucket/sender yang cocok dengan staging.
- **Paket terverifikasi di Firebase Console:** `Spark`, `No-cost ($0/month)`. Tidak mengaktifkan free trial, billing, Blaze, PITR, atau fitur backup berbayar.
- **Authentication terverifikasi:** Authentication sudah diinisialisasi; provider Google berstatus **Enabled** dengan public name `AR CRM Staging`. Authorized Domains yang terbaca dan terverifikasi: `localhost`, `ar-crm-staging-angga-20261027.firebaseapp.com`, dan `ar-crm-staging-angga-20261027.web.app`. Belum ada custom DNS hostname atau hosted deployment.
- **App Check terverifikasi:** App Check sudah diinisialisasi; API `recaptchaenterprise` aktif tanpa billing. Key `AR CRM Staging Local UID` terdaftar sebagai Web score-based, domain `localhost` saja, domain verification **ENABLED**; AMP, challenges, fixed testing, dan WAF **OFF**. Key yang sama terdaftar pada `AR CRM Staging Web`; UI menampilkan status **Fraud Defense — Registered**. Public key tidak dicatat di dokumentasi.
- **Login owner terverifikasi pada 13:21 WIB:** setelah tindakan owner di browser, halaman loopback menampilkan **Login uji owner berhasil**. UID Firebase Auth staging diperoleh, diverifikasi berbeda dari binding repo yang sudah ada, dan disimpan privat di luar repo; nilai UID/email/token tidak dicatat di sini. Layar hanya menampilkan identitas, tidak mengikat owner otomatis, tidak membuka CRM, dan tidak mengaktifkan antrean Firestore.
- **Belum dilakukan:** provisioning workspace/member staging, Rules/client binding staging tersendiri, Vercel Preview variables/deployment, atau smoke test Lead/Activity/offline. APIs UI menunjukkan Cloud Firestore dan Authentication **Unenforced**; tidak ada enforcement toggle yang diubah. Binding production tidak boleh disalin sebagai identitas staging; closed Rules cloud tetap dipertahankan.
- **Build identity-only staging:** temporary copy yang mengecualikan seluruh `.env*`/`.npmrc` dari sumber dan menghapus `VITE_*`/`VERCEL_ENV` warisan berhasil dibuild dengan `vite build --mode staging` (exit 0; `dist/index.html` tersedia). Preflight token App Check dan login Google staging berhasil melalui server loopback-only; owner/workspace env tetap kosong.
- Tidak mengakses atau mengubah production/`main`, tidak membuka atau menampilkan isi `.env.local`/credential, tidak menggunakan data production/Sheets, dan tidak melakukan push, merge, deployment Vercel, atau migrasi.

## Snapshot historis hardening staging — 27 Oktober 2026, 12:42 WIB (sebelum verifikasi dan login di atas)

- Firebase CLI read-only `apps:list WEB` pada project staging mengonfirmasi Web App `AR CRM Staging Web` dan App ID yang tercatat. Pengambilan SDK config tidak selesai dalam batas waktu; tidak ada nilai SDK yang disalin ke file lokal. `.env.staging.example` kini memuat project ID/App ID staging yang diketahui dan placeholder untuk konfigurasi Web SDK serta site key App Check. Tidak dibuat `.env.staging.local`.
- Google Sign-In, Authorized Domains (`localhost`), dan App Check staging kini terverifikasi sesuai bukti Console terbaru. Enforcement Cloud Firestore dan Authentication tetap **Unenforced**; tidak ada toggle enforcement yang diubah.
- Perubahan kode lokal menyiapkan layar identitas-only untuk non-development staging preview pada host loopback. Development tetap emulator-only, host publik/Preview ditolak, App Check tetap wajib, dan staging selalu menolak konfigurasi owner/workspace maupun UID production. Layar bootstrap tidak mengaktifkan queue atau akses Firestore.
- UID owner staging belum ada; karena itu tidak ada workspace/member, Rules staging, indeks, atau data yang dibuat/deploy. `firestore.rules` production binding tidak diubah atau dideploy. `.env.local` tidak dibaca; `.env.staging.local` belum dibuat.
- Langkah berikutnya: pemilik melakukan login Google melalui server loopback-only untuk memperoleh UID staging. Setelah UID ada, siapkan workspace/member dan Rules/client binding terpisah sebelum membuat data atau melakukan deploy. Vercel Preview tetap menunggu persetujuan eksplisit.

**Batas inspeksi environment:** audit tambahan sempat menjalankan `npm run build`. Konfigurasi Vite tidak menonaktifkan pemuatan file env otomatis, sehingga proses build mungkin memuat `.env.local` walaupun isinya tidak dibuka atau ditampilkan. Jangan mengklaim file env tidak dibaca proses sama sekali. Hasil build itu tidak dideploy, dan build tidak dijalankan ulang setelah batas ini diketahui.

## Verifikasi lokal lanjutan — 27 Oktober 2026, 12:17 WIB (sebelum staging dibuat)

**Checkout saat verifikasi:** branch `cue/firebase-stabilization`, HEAD `849887855a9fbe8ee6b514dbee6a0795496b3648` (`feat(export): add gated Firestore-to-Sheets export and migration readiness docs`); working tree bersih sebelum pembaruan catatan ini.

- **Verifikasi yang dijalankan ulang:** `npm test` **81 lulus, 0 gagal**; `npm run lint` **lulus**; Firestore Rules Emulator **12 lulus, 0 gagal** pada emulator lokal yang sudah aktif melalui `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`; `git diff --check` **lulus**. Emulator tidak dihentikan atau dimulai ulang. Audit tambahan melaporkan build lulus dengan warning; batas pemuatan env otomatis dijelaskan di atas.
- Tes antrean mengonfirmasi operasi durable dapat dipulihkan oleh instance antrean baru untuk owner/workspace yang sama, payload terenkripsi di IndexedDB, aktivitas menunggu Lead, dan acknowledgement hanya setelah write Firestore selesai. Ini bukti unit/emulator, bukan uji browser end-to-end.
- **Snapshot sebelum provisioning:** pada 12:17 WIB belum ada project Firebase staging, site key App Check, test owner/workspace, atau environment Vercel Preview. Login nyata, penyimpanan Lead/Activity di Firebase staging, dan recovery offline di browser Preview belum terverifikasi. Isi `.env.local`/credential tidak dibuka atau ditampilkan; batas build otomatis dijelaskan di atas.
- Tidak ada push, merge, deployment, perubahan `main`, atau migrasi data.

## Perbaikan deep audit sebelumnya — 27 Oktober 2026, 11:09 WIB

**Snapshot saat itu:** commit `ac90bd60d71b0dff1f7ef4e4b5730d9aac0fa7ac` (`fix(crm): resolve modal history sync, calendar date validation, activity lead reset, and outbox scope lifecycle`) adalah perbaikan deep audit terbaru sebelum penambahan fitur export pada HEAD saat ini. Perubahan tersebut memperbaiki sinkronisasi riwayat modal, validasi tanggal kalender, reset lead pada aktivitas, dan siklus hidup scope outbox.

- **Verifikasi post-commit lokal:** `npm test` **81 lulus, 0 gagal**; Firestore Rules Emulator **12 lulus, 0 gagal**; `npm run lint` **lulus**; `npx --no-install tsc --noEmit` **lulus**; `npm run build` **lulus**; `git diff --check` **lulus**. Rules Emulator dijalankan terhadap emulator lokal yang sudah aktif; tidak menghentikan atau memulai ulang emulator.
- **Peringatan build yang tersisa:** warning Vite terkait `__dirname` dan ukuran chunk JavaScript sekitar **954,18 kB**, melewati ambang warning **500 kB**. Build tetap lulus.
- Tidak ada push, merge, atau deploy; tidak ada akses Firebase/Vercel/cloud/production, dan tidak membaca secret maupun `.env.local`.

## Pembaruan implementasi dan triase setelah audit — snapshot 27 Oktober 2026, 02:01 WIB (sebelum `ac90bd6`)

**Status lokal:** hardening di-commit secara lokal pada `d7c8bcc69af8a19ec11bf8fdd38c3052ffaf029c`, diikuti commit status `a6670b8f5d3d5a8a3fd5391daa4963e6e8b7865e`; HEAD saat pemeriksaan ini `a6670b8` pada branch `cue/firebase-stabilization`. Perubahan lokal yang sudah ada dipertahankan. Tidak ada push, merge, deploy, akses Firebase/Vercel production, atau perubahan Rules/Console.

- Outbox antrean IndexedDB menyimpan payload business-only yang di-allowlist dan dienkripsi AES-GCM, dipartisi per owner/workspace; tidak ada fallback `localStorage`. Payload dibersihkan setelah acknowledgement server. UI menunjukkan queued/syncing/acknowledged/failed, retry dan koreksi payload; dependency lead→activity dipertahankan. Create ber-ID tetap memakai rekonsiliasi server yang membandingkan seluruh field bisnis/owner. Batas XSS/origin, metadata, serta pemulihan browser dijelaskan di [`OFFLINE_QUEUE_DESIGN.md`](docs/OFFLINE_QUEUE_DESIGN.md).
- App Check staging melakukan preflight token dan fail-closed sebelum Auth/Firestore; guard memvalidasi target hosted, pola ID staging `ar-crm-staging-<suffix>` dan exact allowlist. Tidak ada project/site key/environment staging yang diprovisikan atau diuji live; production dan Rules/Console tidak diubah.
- **Verifikasi lokal 27 Oktober:** `npm test` **74 lulus, 0 gagal**; `npm run lint` **lulus**; `npx tsc --noEmit` **lulus**; `npm run build` **lulus**; Firestore Rules Emulator **12 lulus, 0 gagal**; `git diff --check` **lulus**. Rules suite berjalan langsung terhadap emulator sintetis yang sudah aktif di `127.0.0.1:8080`; emulator tidak dihentikan. Build memperlihatkan warning Vite tentang `__dirname` dan chunk JavaScript **950,41 kB** (ambang warning 500 kB).
- **Triase dependency 27 Oktober:** `npm audit --json` melaporkan **10 entri paket terdampak** (5 severity package-level moderate, 5 high, 0 critical); `npm audit --omit=dev --json` melaporkan **4 entri paket production terdampak** (maksimum severity high). Ini hitungan paket/path, bukan empat advisory High unik: jalur production merujuk satu GHSA High dan satu GHSA Low pada `@grpc/grpc-js`.

| Paket/versi terkunci | Severity / jenis | Path dan rentang upstream terdampak → fixed |
|---|---|---|
| `firebase@12.19.0` | High, direct production (severity maksimum dari jalur transitif) | `firebase → @firebase/firestore@4.17.2 → @grpc/grpc-js@1.9.16`; entri audit ini mewarisi GHSA High yang sama, bukan advisory unik tambahan. |
| `@firebase/firestore@4.17.2` | High, transitive production | Path gRPC yang sama; pin Firestore `@grpc/grpc-js ~1.9.0` menahan resolusi di `1.9.16`. |
| `@firebase/firestore-compat@0.4.14` | High, transitive production | `firebase → firestore-compat → firestore → @grpc/grpc-js@1.9.16`; duplikasi path paket untuk advisory gRPC yang sama. |
| `@grpc/grpc-js@1.9.16` | GHSA-m9gg: **High, CVSS 7,4**; GHSA-f596: **Low, CVSS 3,7** | `@grpc/grpc-js` adalah satu-satunya komponen rentan yang mendasari empat entri production. [GHSA-m9gg-hp2v-232j / CVE-2026-101916](https://github.com/advisories/GHSA-m9gg-hp2v-232j): affected `<1.13.6` atau `>=1.14.0 <1.14.5`, advisory lists patched `1.13.6`/`1.14.5`; bug otentikasi server TLS `getAuthContext` bersyarat. [GHSA-f596-whhp-79r4 / CVE-2026-101915](https://github.com/advisories/GHSA-f596-whhp-79r4): Low, affected pada rentang yang sama menurut advisory, kebocoran pesan error server; rilis resmi `1.13.7` dan `1.14.6` menyebut perbaikan terhadap sisa kasus advisory ini. |
| `@firebase/rules-unit-testing@5.0.2` | High, direct dev/test | `rules-unit-testing → firebase@12.19.0 → firestore → @grpc/grpc-js@1.9.16`; hitungan dev/test tambahan, bukan jalur production. |
| `firebase-tools@15.34.1` | Moderate, direct dev | Nested path Pub/Sub→OpenTelemetry (`<2.8.0` → `2.8.0`) serta `gaxios@6.7.1 → uuid@9.0.1` (`<11.1.1` → `11.1.1`, `12.0.1`, atau `13.0.1`); lihat GHSA di baris terkait. |
| `@google-cloud/pubsub@5.3.1` | Moderate, transitive dev | `firebase-tools → pubsub → @opentelemetry/core@1.30.1`; affected `<2.8.0`, fixed `2.8.0`; [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf). Pub/Sub 5 membatasi dependency ke `^1.30.1`; Pub/Sub 6.3.1 menggunakan core `^2.8.0` (major). |
| `@opentelemetry/core@1.30.1` | Moderate, transitive dev | `firebase-tools → pubsub → core`; affected `<2.8.0`, fixed `2.8.0`; [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf). |
| `gaxios@6.7.1` | Moderate, nested dev | `firebase-tools → gaxios → uuid@9.0.1`; dipropagasi oleh rentang UUID di advisory [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). |
| `uuid@9.0.1` | Moderate, transitive dev | `firebase-tools → gaxios@6.7.1 → uuid`; audit affected `<11.1.1`, upstream patched `11.1.1`, `12.0.1`, `13.0.1`; [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). gaxios 6 membatasi `uuid ^9.0.1`. |

Tidak ada pembaruan aman yang terverifikasi dalam batas versi sekarang. Registry menampilkan `firebase@12.19.0` sebagai rilis 12.x tertinggi (sudah terkunci), sedangkan `firebase@13.1.0` adalah major; Firestore terbaru `4.19.0` juga masih mematok `@grpc/grpc-js ~1.9.0`. `npm explain @grpc/grpc-js` menunjukkan dua salinan dev-only `1.14.6` lain melalui `@google-cloud/cloud-sql-connector` dan `google-gax`; keduanya berada di luar rentang terdampak. Upstream [issue #10400](https://github.com/firebase/firebase-js-sdk/issues/10400) masih terbuka; [PR #10412](https://github.com/firebase/firebase-js-sdk/pull/10412) yang menaikkan pin ke `~1.14.5` masih terbuka meski mendapat approval, jadi belum menjadi rilis yang terpasang. `npm audit fix --dry-run --json` memberi 0 added/removed/changed; opsi `fixAvailable` yang tercatat adalah downgrade/major tak kompatibel (`firebase@9.14.0`, `firebase-tools@14.23.0`, `@firebase/rules-unit-testing@2.0.7`) dan tidak diterapkan. Tidak ada override out-of-range, upgrade major, atau `--force`.

Empat entri paket production mencerminkan satu advisory unik High dan satu Low, bukan empat High unik. Source aplikasi hanya mengimpor Firebase Web SDK untuk browser; package Firestore memilih browser export, bundle hasil build tidak memuat token `@grpc`, `grpc-js`, `getAuthContext`, atau `requireClientCertificate`, dan endpoint server menggunakan Firestore REST, bukan gRPC. Tidak ada gRPC server atau pemanggilan `getAuthContext` dalam kode produk yang diperiksa. Ini **mengurangi paparan aplikasi browser**, tetapi tidak memperbaiki package lock atau temuan audit. Workaround advisory (`requireClientCertificate: true` atau sanitasi error handler) hanya relevan bagi aplikasi yang menjalankan gRPC server dengan konfigurasi terkait dan bukan mitigasi lokal untuk dependency ini. Tetap tahan rilis sampai Firebase/Firestore merilis pin patched yang kompatibel, atau pemilik membuat keputusan risiko eksplisit setelah evaluasi; jangan menerapkan override tanpa uji kompatibilitas penuh.

Hasil ini **tidak** membuktikan crash/reload behavior seluruh browser, provisioning staging, metrik/enforcement App Check Console, backup/restore, migrasi data, atau readiness production/cutover. Advisory High pada dependency production masih belum diperbaiki dan tetap menjadi gate rilis; jangan klaim project production-safe. Tidak ada push/merge/deploy.

## Baseline audit sebelum hardening — 26 Oktober 2026, 20:59 WIB (historis)

Catatan di bagian ini merekam temuan sebelum perubahan antrean durable, App Check, dan strict staging allowlist pada working tree saat ini. Angka test, daftar file, serta gap yang menyebut queue in-memory atau error startup App Check adalah baseline historis; gunakan pembaruan deep-audit 11:09 WIB di atas untuk status terbaru.

### Keputusan dan cakupan

**Status baseline: audit lokal lulus; belum siap dinyatakan 100% production/cutover.** Environment Vercel/Firebase live tidak diperiksa ulang, project staging dan App Check belum dibuktikan siap, data lama belum dimigrasikan/di-backup, dan pada baseline ini antrean offline belum tahan reload/penutupan tab.

- Repository: `/workspace/ar-crm`; branch `cue/firebase-stabilization`; HEAD `de0e164a64b2ed1d6514ffbc3197c7a42e55250a`. Local tracking ref `origin/cue/firebase-stabilization` yang tersedia di checkout sama dengan HEAD; tidak dilakukan fetch jaringan.
- Sebelum pembaruan status ini, working tree sudah memuat 14 file tracked yang berubah dan 13 file untracked. Perubahan-perubahan tersebut dipertahankan. Dalam tugas ini hanya `PROJECT_STATE.md` yang diperbarui; tidak ada perubahan kode aplikasi, staging, commit, push, merge, atau deploy.
- Audit memakai source, dokumentasi, test sintetis, emulator lokal, dan build lokal. `.env.local`/nilai secret, data CRM production, serta Firebase/Vercel Console tidak dibaca. Tidak ada operasi terhadap environment production.

### Hasil verifikasi yang dijalankan

| Pemeriksaan | Hasil | Batas bukti |
|---|---|---|
| `npm test` | **64 lulus, 0 gagal** | Unit test lokal pada working tree; bukan uji browser end-to-end atau uji layanan live. |
| Firestore Rules Emulator | **11 lulus, 0 gagal** | Project sintetis `demo-ar-crm-rules`, port Firestore lokal alternatif `18181`; konfigurasi sementara menunjuk Rules repository secara eksplisit. Tidak menyentuh Firebase production. |
| `npm run lint` (`tsc --noEmit`) | **Lulus** | Pemeriksaan TypeScript lokal. |
| Vite production build | **Lulus** di direktori sementara `/tmp` | Peringatan: `__dirname` pada Vite config tidak kompatibel dengan rencana config loader native ke depan; chunk JS **924,72 kB** melewati ambang peringatan 500 kB. Build output tidak mendeteksi pola `BEGIN PRIVATE KEY`, `serviceAccountPrivateKey`, `CRON_SECRET`, atau `GOOGLE_SHEETS_SPREADSHEET_ID`; scan ini bukan pengganti audit semua konfigurasi. `VITE_*` adalah nilai client/public dan tidak boleh memuat secret. |
| `git diff --check` | **Lulus setelah pembaruan status** | Dijalankan ulang setelah edit; tidak ada whitespace error. |

### Temuan terkonfirmasi

- **Pipeline:** `src/utils/crmCalculations.ts:42-72` tetap menghitung jumlah setiap stage, mengecualikan `Closing Lost` dari `totalPipelineValue`, `activeValue`, dan weighted pipeline, serta memasukkan Won/Lost pada denominator win rate. Test pipeline terkait termasuk dalam 64 test lulus. Untuk data dengan stage valid yang diterima Rules, kalkulasi ini konsisten. Dashboard menghitung nilai aktif yang juga mencakup `Meeting`, walaupun label UI `In Prospect / Negot.` di `src/components/DashboardView.tsx:120-130` tidak menyebut Meeting.
- **Antrean offline:** `OfflineWriteQueue` (`src/utils/syncQueue.ts:476-647`) membedakan `pending/syncing/failed`, menahan duplikasi operasi yang sedang in-flight, membolehkan retry manual, tidak memutar ulang penolakan permanen saat reconnect, dan menyamarkan pesan error. Test meliputi offline→online, kegagalan sementara/permanen, retry, dan deduplikasi. Metadata operasi dan closure retry hanya disimpan di `Map` memori halaman; Firestore memakai cache memori default, bukan IndexedDB persisten. UI memperingatkan bahwa pending operation tidak dijamin pulih setelah reload atau tab ditutup.
- **Semantik penyimpanan:** `src/firebaseRepository.ts:27-31,80-114` memasukkan operasi ke antrean dan mengembalikan ID/resolve sebelum acknowledgement server; rejection selanjutnya ditampilkan melalui status antrean, bukan hasil `await` pada caller. Toast menyatakan operasi “masuk antrean”, bukan sudah committed. Karena itu status UI antrean harus diperiksa sampai acknowledged; caller belum dapat memperlakukan `await createLead/createActivity/updateLeadStage` sebagai bukti commit server.
- **Firestore Rules lokal:** `firestore.rules:5-23,29-53,71-121` mengunci owner dan workspace, membership, schema ketat, owner scope, relasi Activity→Lead, update allowlist, larangan delete dan deny-by-default untuk koleksi lain. Rules test sintetis mencakup unauthorized/non-owner, workspace tambahan/keliru, query tanpa filter owner, schema/field tampering, activity orphan/cross-workspace dan delete. Hasil ini membuktikan file lokal di emulator, bukan konfigurasi live.
- **Auth dan emulator:** `FirebaseAuthGate` (`src/components/FirebaseAuthGate.tsx:45-73`) menahan UI sampai Auth siap, menolak workspace/owner mismatch dan UID non-owner; `src/firebaseEmulatorMode.ts` memastikan development memakai Auth/Firestore Emulator. Sign-in Google non-owner masih dapat membuat identitas Firebase Auth sebelum gate menolak akses CRM; Rules tetap membatasi data, tetapi ini bukan allowlist pembuatan akun Auth.
- **Guard Firebase target:** `src/firebaseDeploymentGuard.ts` fail-closed pada hosted build tanpa target; Preview diwajibkan `staging` dan menolak project production yang diketahui; Production hanya diterima pada `VERCEL_ENV=production` dengan project ID production yang ditetapkan. Test guard sintetis lulus. Guard memvalidasi konfigurasi build/runtime client; ia tidak membuktikan environment Vercel, project staging, Rules, Auth domain, atau deployment live. Untuk target `staging`, source menolak project production tetapi belum membatasi ke satu ID staging yang disetujui.
- **App Check:** App Check reCAPTCHA Enterprise baru diinisialisasi untuk target `staging` (`src/firebase.ts:44-55`, `src/firebaseAppCheckPolicy.ts:4-11`), tidak pada `production`. Tidak ada bukti project/site key, metrik, atau enforcement Console staging/live; enforcement produksi belum dibuktikan. Jika site key staging hilang, policy melempar saat Auth dibuat; `FirebaseAuthGate` belum menangkap exception inisialisasi tersebut untuk menampilkan kegagalan yang terkendali.
- **Endpoint ekspor:** `api/cron/export-firestore-to-sheets.ts` mengembalikan 404 di luar `VERCEL_ENV=production`, hanya menerima GET, dan memerlukan bearer `CRON_SECRET`; adapter memeriksa secret ≥32 karakter dengan `timingSafeEqual`. Target project/workspace/owner/collection/spreadsheet tetap dan server-only; tidak mengambil target dari request. Export hanya laporan satu arah dan tidak menghapus baris yang hilang. **Belum ada `vercel.json`/jadwal Cron, spreadsheet, service account/IAM, atau server environment yang diverifikasi atau disiapkan; ekspor bukan backup.**
- **Legacy dan provenance:** `server.ts:31-41` menutup GAS proxy lama dengan 410 dan notes-AI endpoint dengan 403 sebelum body diproses. Scan import lokal tidak menemukan penggunaan runtime `src/data/gasCode.ts`; berkas referensi GAS tetap ada. Helper `CrmStorage`/`CrmSyncEngine` lokal juga masih ada di `src/utils/syncQueue.ts`, tetapi jalur UI utama menggunakan Firebase repository dan antrean tulis Firestore. Perubahan fitur audit/guard/export yang saat ini untracked atau modified belum menjadi bagian dari commit HEAD dan tidak terbukti terpasang pada deployment.

### Risiko dan status cloud yang belum diketahui

| Prioritas | Temuan | Implikasi / tindak lanjut |
|---|---|---|
| **Gate cutover** | Environment Vercel Production/Preview, target build, domain Auth, staging Firebase, dan deployment aktif tidak diperiksa live dalam audit ini. | Jalankan checklist verifikasi Vercel/Firebase secara read-only sebelum cutover; jangan menganggap guard lokal berarti Preview sudah terisolasi. Local code terbaru belum menjadi commit/deployment yang diverifikasi. |
| **Tinggi bila diperlukan offline tanpa kehilangan operasi** | Antrean pending tidak durable saat reload/penutupan tab/terminasi browser. | Tentukan apakah session-only acceptable. Untuk operasional lapangan tanpa risiko kehilangan, rancang persistence eksplisit dan uji crash/reload/recovery sebelum dinyatakan siap; jangan mengandalkan indikator koneksi saja. |
| **Tinggi / keputusan data** | Tidak ada migrasi, backup/restore yang dibuktikan, atau sumber data operasional yang disetujui. | Aplikasi Firebase dapat tampak kosong dari Leads/Activities. Setujui sumber dan scope, backup privat, restore test, mapping, dry-run, rekonsiliasi, lalu approval apply/cutover terpisah. Jangan menggunakan `Personal CRM Data` yang telah dikosongkan sebagai sumber. |
| **Sedang** | API repository menganggap operasi queued berhasil pada level caller sebelum acknowledgement Firestore. | Pertahankan wording “queued”; sebelum operasi bisnis dianggap sukses, pastikan acknowledgement/error terlihat dan tambahkan test repository/UI yang membuktikan jalur success/rejection. |
| **Sedang** | App Check production tidak diinisialisasi; staging/provider/key/metrics/enforcement tidak diverifikasi. | Putuskan kebijakan App Check production; siapkan staging provider dan metrik, tinjau false reject, lalu aktifkan enforcement hanya melalui persetujuan dan langkah Console terpisah. Firestore Rules tetap kontrol akses utama. |
| **Sedang** | Endpoint export tidak dijadwalkan dan IAM/tujuan belum dikonfigurasi. | Jangan menganggap laporan otomatis aktif. Jika diaktifkan kelak, pakai service account least-privilege, satu invocation pada satu waktu, target Sheet terpisah, dan jadwal yang disetujui. |
| **Rendah–sedang** | Sign-in dapat membuat Auth account non-owner sebelum gate menolak CRM; konfigurasi App Check staging yang invalid dapat menimbulkan exception tak tertangani. | Tentukan apakah kebijakan mengharuskan mencegah pembuatan akun non-owner; tambahkan error boundary/try-catch untuk konfigurasi staging. Ini bukan bukti akses Firestore oleh non-owner. |
| **Rendah** | Rules memvalidasi tanggal follow-up lewat pola `YYYY-MM-DD`, bukan validitas kalender; dashboard label active-stage melewatkan Meeting. | Validasi tanggal kalender pada jalur aplikasi tepercaya; perbaiki label UI bila diizinkan pada pekerjaan kode berikutnya. Tidak mengubah source dalam audit ini. |
| **Pemeliharaan/performa** | Build berhasil tetapi memberi warning chunk besar dan `__dirname`; salinan aset gambar di output masing-masing sekitar 1,12 MB. | Pertimbangkan code-splitting, optimasi aset, dan konfigurasi path Vite. Tidak memblokir kompilasi, tetapi perlu evaluasi pengalaman mobile dan kompatibilitas Vite berikutnya. |

Artefak lokal [`ar-crm-release-evidence.md`](../ar-crm-release-evidence.md) mencatat bahwa pada bukti terdahulu deployment Production Vercel berada pada commit `f010c46` dan smoke test tanpa login menerima halaman sign-in; artefak itu juga mencatat Rules aktif pernah memiliki hash yang sama dengan source lokal pada saat pemeriksaan terdahulu. **Audit ini tidak memeriksa ulang apakah deployment/hash tersebut masih aktif saat ini.** Jangan menyamakan bukti terdahulu itu dengan deployment branch/working tree yang sekarang.

### Checklist operasional sebelum Preview dan cutover

**Sebelum Preview:**
1. Siapkan project Firebase staging terpisah yang disetujui, project ID yang akan di-allowlist, Web App/Auth, workspace/owner staging, Rules dan indexes; jangan gunakan project production.
2. Konfigurasikan Vercel Preview `VITE_FIREBASE_TARGET=staging` dan seluruh konfigurasi client yang sesuai; jangan mencatat nilainya. Tambahkan reCAPTCHA Enterprise site key hanya setelah origin/provider staging terdaftar.
3. Verifikasi guard positif/negatif terhadap ID staging yang tepat, lalu uji sign-in, Rules, create/update/read dan App Check di staging dengan fixture sintetis. Pastikan error konfigurasi muncul terkendali.

**Sebelum cutover production:**
1. Dengan akses read-only yang berwenang, konfirmasi proyek/domain/commit deployment dan scope environment Production/Preview di Vercel, serta nilai konfigurasi Firebase secara privat tanpa menyalinnya ke log/dokumen. Pastikan target Production tidak dipakai Preview.
2. Cocokkan Rules dan indexes production, project/workspace/owner, Authorized Domains dan query aplikasi. Catatan parity Rules terdahulu bukan pengganti verifikasi cutover.
3. Tetapkan keputusan App Check production dan bukti monitoring/enforcement. Tentukan apakah rilis menampilkan CRM baru kosong atau menunggu migrasi yang disetujui.
4. Sebelum migrasi, sahkan sumber operasional yang benar; siapkan snapshot read-only, checksum, backup privat dan restore test, schema mapping, dry-run sintetis/offline, rekonsiliasi serta approval apply baru. Sumber legacy tetap tidak diubah.
5. Putuskan kebutuhan offline durability dan acknowledgement: jika kehilangan mutasi pending tidak dapat diterima, tutup gap persistence dan uji reload/crash/reconnect serta rejection Rules sebelum operasi lapangan.
6. Bila ekspor Sheets dibutuhkan, baru setelah approval siapkan spreadsheet khusus, IAM service account minimal, server secrets, dan jadwal Cron; uji adapter sintetis, larang concurrent run, dan jangan menyebutnya backup.
7. Tinjau warning bundle/Vite, lakukan smoke test tanpa data production, tetapkan monitoring/kriteria stop/rollback, lalu minta persetujuan terpisah untuk deploy, Rules, migrasi, dan cutover. Audit ini tidak memberi approval untuk tindakan tersebut.

**Kesimpulan:** pemeriksaan lokal yang dijalankan lulus dan kontrol source lokal tampak ketat, tetapi kesiapan live, pemulihan data, staging, App Check dan daya tahan operasi offline belum terbukti. Jangan mengklaim aplikasi 100% siap untuk tools operasional B2B sampai gate di atas ditutup dengan bukti.

---

## DAFTAR ISI
1. [Visi & Problem Statement](#1-visi--problem-statement)
2. [Arsitektur Sistem & Tech Stack](#2-arsitektur-sistem--tech-stack)
3. [Desain Sistem & Identitas Brand (AR CRM)](#3-desain-sistem--identitas-brand-ar-crm)
4. [Modul & Fitur pada Source Branch (Hosted Belum Diverifikasi)](#4-modul--fitur-pada-source-branch-hosted-belum-diverifikasi)
5. [Skema Database & Spesifikasi REST API](#5-skema-database--spesifikasi-rest-api)
6. [Arsitektur Native Android (Kotlin & Jetpack Compose)](#6-arsitektur-native-android-kotlin--jetpack-compose)
7. [Hasil Code Review, Security Hardening & Refactoring (v2.2.0)](#7-hasil-code-review-security-hardening--refactoring-v220)
8. [Pembersihan Data Dummy & Hardening Integrasi Google Sheets](#8-pembersihan-data-dummy--hardening-integrasi-google-sheets)
9. [Status Deployment & Verifikasi Teknis](#9-status-deployment--verifikasi-teknis)
10. [Roadmap & Langkah Optimalisasi Selanjutnya](#10-roadmap--langkah-optimalisasi-selanjutnya)

---

## 1. VISI & PROBLEM STATEMENT

### 1.1 Visi Produk
**AR Personal CRM** adalah PWA responsif untuk sales B2B yang menggunakan Firebase Auth dan Cloud Firestore sebagai sumber data cloud. Antrean IndexedDB terenkripsi dipakai untuk mutasi yang belum tersinkron, bukan sebagai salinan offline penuh. Biaya layanan dapat bergantung pada penggunaan; tidak ada jaminan biaya selalu Rp0. Kesiapan deployment lintas perangkat harus dibedakan dari kesiapan source lokal, sesuai status operasional terbaru di bagian atas dokumen ini.

### 1.2 Problem Statement
Di lapangan, Account Manager B2B menghadapi tantangan operasional krusial:
1. **Konektivitas Tidak Stabil di Lapangan:** Kunjungan ke kawasan industri (KIM Medan, Cikarang, Karawang, Rungkut Surabaya) seringkali mengalami *dead zone* sinyal internet seluler. Aplikasi CRM berbasis cloud murni sering *hang*, gagal menyimpan catatan rapat, atau lambat dimuat.
2. **Follow-Up Tercecer & Kehilangan Momentum:** Kesepakatan bernilai ratusan juta rupiah sering lepas akibat follow-up terlambat karena catatan tersebar di buku saku, WhatsApp pribadi, atau spreadsheet statis.
3. **Biaya Langganan CRM Komersial yang Mahal:** CRM enterprise seperti Salesforce atau HubSpot membebankan biaya $50 – $150 per pengguna per bulan, yang tidak efisien bagi sales individual atau konsultan mandiri.
4. **Beban Administrasi Pencatatan Rapat:** Mengingat dan merangkum poin pembicaraan serta butir tindakan (*action items*) selepas rapat klien menyita waktu berharga.
5. **Keluarnya Aplikasi Akibat Gestur Navigasi Ponsel:** Pada perangkat Android dan browser mobile, gestur *swipe-back* seringkali langsung memicu aksi *browser exit* atau menutup PWA secara tidak sengaja ketika pengguna hanya bermaksud menutup modal popup atau kembali ke Dashboard.
6. **Kerahasiaan Data Klien & Portabilitas Laporan:** AM membutuhkan cara cepat untuk mengekspor rekapitulasi prospek ke spreadsheet Excel/CSV tanpa bergantung pada koneksi internet, serta perlindungan PIN/biometrik saat perangkat dipinjamkan.

### 1.3 Solusi AR CRM
- **Cloud-first dengan antrean tulis aman:** Firestore menjadi sumber utama; antrean IndexedDB terenkripsi menyimpan hanya mutasi pending dan menyinkronkannya ketika koneksi tersedia. Aplikasi tidak menjanjikan pembacaan/penulisan CRM penuh secara offline.
- **Biaya bergantung konfigurasi dan pemakaian:** Project staging pernah diverifikasi pada Firebase Spark, tetapi itu tidak menjamin biaya Production maupun penggunaan Gemini Search grounding selalu Rp0.
- **AI dengan batas privasi:** Meeting Summarizer menggunakan Gemini hanya setelah persetujuan eksplisit dan punya fallback lokal ekstraktif. Lead Finder tidak mengarang prospek jika endpoint/sumber gagal.
- **Integrated Direct Outreach:** Integrasi satu ketukan untuk panggilan telepon dan perutean WhatsApp (`wa.me`) dengan validasi nomor internasional dan template pesan profesional.
- **Mobile Back Gesture Management (LIFO Order):** Penanganan `popstate` dan `history.pushState` bertingkat (*Last-In, First-Out*) yang menutup sub-modal aktif terlebih dahulu sebelum modal induk atau navigasi tab.
- **PIN yang dibatasi target:** PIN perangkat lama hanya untuk mode lokal; mode hosted memakai sesi PIN akun server-side dan Firestore Rules. Hosted enrollment/recovery belum diuji atau diaktifkan.
- **Sanitized CSV Export Engine:** Ekspor instan data prospek ke format RFC-4180 CSV yang terproteksi penuh dari serangan *CSV Formula Injection* (`=`, `+`, `-`, `@`, `\t`, `\r`).
- **PWA dan sanitasi ekspor:** Service Worker meng-cache aset web; cache aset bukan backup atau mode CRM offline penuh. CSV yang diekspor disanitasi terhadap formula injection.
- **Status data:** UI source terbaru memakai Firestore; development wajib memakai emulator. Production masih menjalankan deployment lama yang terverifikasi sebelumnya dan belum diuji dengan kode lokal ini.

---

## 2. ARSITEKTUR SISTEM & TECH STACK

Arsitektur pada branch saat ini memisahkan PWA, identitas, penyimpanan cloud, dan endpoint AI. Diagram ini menerangkan source yang ada, bukan bukti bahwa endpoint/deployment hosted terbaru sudah aktif.

```
PWA React/Vite (browser laptop & ponsel)
  ├─ Google Sign-In + target-specific App Check
  ├─ Firestore realtime: workspace Leads, Activities, wonDealArchives
  ├─ Firestore Rules: owner/workspace dan sesi PIN untuk jalur hosted
  ├─ Encrypted IndexedDB: hanya operasi tulis pending, per owner/workspace
  └─ Vercel serverless AI (default-off; secret server-only)
       ├─ /api/ai/lead-finder → Gemini Search grounding + citations
       └─ /api/ai/summarize-notes → opt-in notes + PIN/session/quota

Laporan Google Sheets, bila diaktifkan, adalah ekspor terpisah—bukan sumber CRM.
Local development wajib menggunakan Firebase Auth/Firestore Emulator.
```

---

## 3. DESAIN SISTEM & IDENTITAS BRAND (AR CRM)

- **Palette Warna Utama:**
  - **Navy Blue (`#1A2E40`):** Simbol otoritas korporat, stabilitas finansial, dan kedewasaan enterprise.
  - **Hub Orange (`#FF4800`):** Titik fokus energi, node jaringan koneksi bisnis, dan indikator status proaktif.
  - **Editorial Cream Paper (`#FCFCFA` / `#F8F5EE`):** Latar belakang bertekstur kertas premium editorial (*high-contrast readability*).
  - **Batas Presisi:** Hairline border 1px (`border-[#1F1F1F]`) dengan radius 8px seragam (zero-pill discipline).

---

## 4. MODUL & FITUR PADA SOURCE BRANCH (HOSTED BELUM DIVERIFIKASI)

### 4.1 Dashboard & Financial Forecast
- **KPI dan forecast:** Total Pipeline, Won, Active, weighted forecast, win rate, dan jumlah per stage dari data Leads pada UI. Bobot forecast: Prospect 20%, Meeting 50%, Negotiation 80%, Closing Won 100%, Closing Lost 0%.
- **Follow-up:** Kategori `overdue`, `due today`, `upcoming`, dan `no date`; lead Closing Won/Lost dikecualikan. Dashboard menampilkan overdue dan due hari ini; tidak ada push reminder otomatis yang diklaim.
- **Aktivitas terbaru:** Dashboard menampilkan Activity terbaru dan tombol untuk mencatat aktivitas.

### 4.2 Sales Pipeline (Kanban & List View)
- **5 Tahapan Standar Penjualan:** Prospect $\rightarrow$ Meeting $\rightarrow$ Negotiation $\rightarrow$ Closing Won $\rightarrow$ Closing Lost.
- **Kanban/List lima tahap:** Perubahan memakai quick-advance dan pemilih tahap; UI optimistik dengan rollback khusus jika mutasi ditolak. Tanggal follow-up tetap opsional.
- **Auto-Archive Closing Won:** Perubahan stage dan pembuatan `wonDealArchives/{leadId}` terjadi dalam transaksi Firestore; aturan membuat arsip immutable. Belum ada browser hosted test atau layar khusus untuk menelusuri daftar arsip.

### 4.3 AI Lead Finder & Enrichment
- **Pencarian publik:** Kriteria kategori, kota, dan profil opsional; paling banyak lima kandidat berbasis Gemini/Search grounding dengan `fit_score` tervalidasi 0–100 dan citation HTTPS.
- **Provenance:** Saran ditandai belum diverifikasi dan tidak mencantumkan kontak pribadi. Jika sumber/API tidak tersedia, UI tidak membuat prospek pengganti atau data palsu.
- **Import ke Pipeline:** Tombol satu klik menyimpan kandidat ke Firestore tanpa mengarang kontak, nilai deal, tanggal follow-up, atau score manual.

### 4.4 Field Activities, GPS Check-In & AI Summarizer
- **GPS Check-In:** Koordinat opsional diminta sekali setelah pengguna menekan tombol dan memberi izin; tidak ada background tracking.
- **AI Meeting Summarizer:** Gemini (`gemini-3.8-flash`) menerima catatan hanya setelah persetujuan eksplisit, melalui endpoint server default-off dengan PIN/session/kuota dan batas input/output. Kegagalan memberi fallback lokal ekstraktif; hasil dapat diedit sebelum disimpan.

### 4.5 WhatsApp Quick Reach
- **Normalisasi Nomor Telepon:** Format nomor telepon otomatis ke standar internasional (+62/E.164).
- **Template Pesan Profesional:** Pilihan template salam formal B2B, penjadwalan demo produk, pengiriman proposal penawaran, dan ucapan apresiasi pasca rapat.

### 4.6 Offline Sync Engine & Local Security Vault
- **Encrypted outbox:** Operasi tulis pending dienkripsi dan dipulihkan hanya untuk owner/workspace yang sama; tes lokal tidak membuktikan sinkronisasi hosted terbaru.
- **PIN:** Mode hosted menunggu sesi PIN akun server-side yang sah; credential/limiter/session dilindungi Rules. PIN lokal lama hanya untuk mode emulator/local.

---

## 5. SKEMA DATABASE & SPESIFIKASI REST API

### 5.1 Skema Tabel Google Sheets

#### 1. Sheet `Leads`
| Kolom | Tipe Data | Deskripsi |
|---|---|---|
| `id` | String | ID unik (`LEAD-xxx`, `TEMP-LEAD-xxx`) |
| `company_name` | String | Nama perusahaan klien |
| `contact_person` | String | Nama pengambil keputusan (PIC) |
| `phone` | String | Nomor telepon format internasional (+62...) |
| `industry` | String | Sektor industri klien |
| `city` | String | Kota domisili klien |
| `pipeline_stage` | String | Tahap pipeline (Prospect, Meeting, Negotiation, Closing Won, Closing Lost) |
| `deal_value` | Number | Nilai transaksi (Rupiah) |
| `next_followup_date`| String | Tanggal tindak lanjut (YYYY-MM-DD) |
| `lead_score` | String | `Hot`, `Warm`, atau `Cold` |
| `created_at` | String | Timestamp pembuatan (ISO 8601) |
| `updated_at` | String | Timestamp pembaruan terakhir (ISO 8601) |

#### 2. Sheet `Activities`
| Kolom | Tipe Data | Deskripsi |
|---|---|---|
| `id` | String | ID aktivitas unik (`ACT-xxx`) |
| `lead_id` | String | ID relasi prospek |
| `activity_type` | String | `Meeting Check-In`, `Call`, `WhatsApp` |
| `notes` | String | Catatan lapangan |
| `ai_summary` | String | Ringkasan dan poin tindakan AI |
| `location_gps` | String | Koordinat lintang dan bujur |
| `created_at` | String | Timestamp aktivitas (ISO 8601) |

#### 3. Sheet `Global_Leads`
| Kolom | Tipe Data | Deskripsi |
|---|---|---|
| `id` | String | ID direktori prospek (`GLOB-xxx`) |
| `company_name` | String | Nama target perusahaan |
| `contact_person` | String | PIC dan jabatan |
| `phone` | String | Kontak target |
| `industry` | String | Sektor bisnis target |
| `city` | String | Lokasi kantor target |
| `estimated_value` | Number | Estimasi nilai potensi proyek |
| `tags` | String / Array | Kategori tag industri |

#### 4. Sheet `Archive_Logs`
| Kolom | Tipe Data | Deskripsi |
|---|---|---|
| `id` | String | ID arsip transaksi (`ARCHIVE-xxx`) |
| `lead_id` | String | ID prospek pemenang |
| `company_name` | String | Nama perusahaan klien yang dimenangkan |
| `contact_person` | String | Nama pengambil keputusan |
| `phone` | String | Nomor telepon |
| `deal_value` | Number | Nilai closing deal (IDR) |
| `industry` | String | Sektor industri |
| `city` | String | Kota transaksi |
| `won_date` | String | Tanggal status Closing Won |
| `archived_at` | String | Timestamp pengarsipan |

---

## 6. ARSITEKTUR NATIVE ANDROID (KOTLIN & JETPACK COMPOSE)

Modul `src/data/androidKotlinCode.ts` menyertakan implementasi native Android lengkap:
1. **Data Transfer Objects (DTO):** `RemoteLeadDto`, `RemoteActivityDto`, dan `RemoteGlobalLeadDto` dengan mapper `.toEntity()` yang aman secara tipe ke entitas Room SQLite.
2. **Room Database & DAO:** `LeadEntity.kt`, `ActivityEntity.kt`, dan `CrmDao.kt` yang mengekspos Coroutines Flow.
3. **Retrofit REST Client:** `CrmApiService.kt` untuk komunikasi dengan Google Apps Script Web App.
4. **WorkManager Background Sync:** `SyncWorker.kt` yang melakukan sinkronisasi otomatis saat jaringan tersedia.
5. **UI Layer:** `PipelineKanbanScreen.kt` menggunakan Jetpack Compose dengan `BackHandler` native.

---

## 7. HASIL CODE REVIEW, SECURITY HARDENING & REFACTORING (v2.2.0)

| Kode Temuan | File Target | Kategori | Tindakan Perbaikan yang Telah Dieksekusi |
|---|---|---|---|
| **SEC-01** | `src/utils/securityLock.ts` | Keamanan WebAuthn | Menghapus implementasi *mock* biometrik instan. Mengimplementasikan autentikasi biometrik riil menggunakan `navigator.credentials.get({ publicKey: ... })` dengan penanganan pengecualian `NotAllowedError` yang aman. |
| **SEC-03** | `src/utils/securityLock.ts` | Brute-force Protection | Menambahkan salt kriptografis pada hash PIN SHA-256 dan menerapkan mekanisme *rate-limiting lockout* (5 kali percobaan salah $\rightarrow$ penguncian otomatis 30 detik) lengkap dengan visualisasi hitung mundur. |
| **BUG-01** | `src/App.tsx` | Navigasi Mobile | Memperbaiki urutan LIFO (*Last-In, First-Out*) pada `handlePopState`. Sub-modal (`ActivityLogger`, `WhatsAppModal`, `SecuritySettings`) kini ditutup bertingkat sebelum modal detail induk atau perpindahan tab. |
| **BUG-02** | `src/utils/syncQueue.ts` | Konsistensi Data | Mencegah *dangling foreign key*: antrean mutasi `addActivity` dan `archiveClosingWon` yang terkait dengan `TEMP-LEAD-xxx` secara otomatis diperbarui ke ID server riil (`LEAD-xxx`) setelah `addLead` sukses tersinkronisasi. |
| **DATA-01**| `src/utils/syncQueue.ts` | Data Fetching | Menambahkan penarikan data arsip transaksi dari sheet `Archive_Logs` ke penyimpanan lokal pada pemanggilan fungsi `pullRemoteData()`. |
| **SEC-02** | `src/utils/exportCsv.ts` | Keamanan CSV | Mencegah serangan *CSV Formula Injection*. Karakter pemicu formula spreadsheet (`=`, `+`, `-`, `@`, `\t`, `\r`) pada sel otomatis diawali dengan tanda petik tunggal (`'`). |
| **PERF-01**| `server.ts` | Konfigurasi Server | Menjadikan endpoint Google Apps Script dapat dikonfigurasi secara fleksibel melalui `process.env.GAS_API_URL` dengan fallback ke URL produksi aktif. |
| **PWA-01** | `public/sw.js` & `src/main.tsx` | PWA & Offline Cache | Menambahkan Service Worker mandiri (`sw.js`) dengan strategi *NetworkFirst* untuk navigasi dan *CacheFirst* untuk aset statis shell aplikasi, serta registrasi otomatis saat mode produksi. |
| **AI-01**  | `server.ts` | Keandalan AI | Memasang `AbortController` dengan timeout 4 detik pada pemanggilan API Gemini (`gemini-3.8-flash`) pada rute `/api/ai/summarize-notes` untuk memastikan fallback lokal selalu merespons tepat waktu. |
| **DEAD-01**| `src/components/ArcrmLogo.tsx` | Dead Code | Menghapus komponen `ArcrmLogo.tsx` yang tidak lagi digunakan dan redundan dengan aset gambar brandmark di `TopAppBar.tsx`. |
| **DEAD-02**| `package.json` | Dependency Hygiene | Menghapus dependensi paket `motion` yang tidak terpakai dari `dependencies` guna merampingkan bundle size. |
| **DEAD-03**| Workspace Root | Asset Cleanup | Menghapus 6 file screenshot mockup usang (`mobile_*.png`) dari direktori root proyek. |
| **TYPE-01**| `src/data/androidKotlinCode.ts`| Type Safety | Menambahkan deklarasi data class `RemoteLeadDto`, `RemoteActivityDto`, `RemoteGlobalLeadDto` serta fungsi mapper ekstensi `.toEntity()` yang memetakan DTO ke Room Entity. |
| **SEC-04** | `src/utils/securityLock.ts` & `src/components/SecurityLockScreen.tsx` | Dynamic PIN Length & UI Sync | Memperbaiki inkonsistensi panjang PIN antara form pengaturan (4-6 digit) dan layar kunci. Menyimpan panjang digit PIN (`STORAGE_KEY_PIN_LENGTH`) secara dinamis, menyesuaikan jumlah bulatan indikator PIN, dan mengeksekusi verifikasi saat input pengguna mencapai panjang PIN yang dikonfigurasi (4, 5, atau 6 digit). Menambahkan dukungan input keyboard desktop. |

---

## 8. PEMBERSIHAN DATA DUMMY & HARDENING INTEGRASI GOOGLE SHEETS

Pada pembaruan v2.2.0 ini, sistem telah dibersihkan secara menyeluruh dari seluruh residu data tiruan/mock:

1. **Penghapusan Total Mock Seeds (`SEED_LEADS`, `SEED_ACTIVITIES`, `GLOBAL_LEADS_CATALOG`):**
   - Array data dummy statis telah dihapus dari kode sumber `src/utils/syncQueue.ts`.
   - `CrmStorage.getLeads()` dan `CrmStorage.getActivities()` kini mengembalikan array kosong `[]` pada inisialisasi awal murni tanpa menyuntikkan data dummy ke dalam `localStorage`.
2. **Auto-Purge Sanitizer untuk Residu LocalStorage:**
   - Ditambahkan filter sanitasi otomatis pada `CrmStorage` yang mendeteksi dan menghapus ID dummy lama (`LEAD-101` s/d `LEAD-104`, `ACT-201` s/d `ACT-202`, `GL-1` s/d `GL-5`) dari penyimpanan browser pengguna lama secara instan saat aplikasi dimuat.
3. **Sinkronisasi Penuh Database Cloud Google Sheets:**
   - Aplikasi menarik data live dari 4 sheet utama: `Leads`, `Activities`, `Global_Leads`, dan `Archive_Logs` melalui Google Apps Script Web App.
   - Normalisasi nomor telepon: Format nomor telepon tanpa tanda plus (misal: `62812...` atau `0812...`) otomatis dinormalisasi menjadi standar internasional `+62...`.
   - Normalisasi tanggal tindak lanjut: Serialisasi tanggal dari Google Sheets otomatis dipotong menjadi format standar `YYYY-MM-DD` untuk kompatibilitas input HTML5.
   - Konversi tipe data numerik: Properti `deal_value` dan `estimated_value` selalu dikonversi melalui `Number() || 0`.
4. **Hardening Proxy Gateway Server (`server.ts`):**
   - Rute `/api/gas-proxy` kini dilengkapi `AbortController` dengan batas waktu 12 detik, mencegah koneksi menggantung jika backend Google Apps Script mengalami latensi tinggi atau cold start.
5. **Pembaruan Kode Referensi Google Apps Script (`Code.gs` v2.2.0):**
   - Skrip backend referensi di `src/data/gasCode.ts` diperbarui ke versi 2.2.0 dengan pemetaan dinamis untuk seluruh operasi baca dan tulis.

---

## 9. STATUS DEPLOYMENT & VERIFIKASI TEKNIS

### 9.1 Status Deployment Aktif
- **Live Production URL (Vercel):**  
  [https://arcrmapp.vercel.app/](https://arcrmapp.vercel.app/)  
  *(Aplikasi telah ter-deploy secara live, dapat diinstal sebagai PWA di smartphone Android/iOS, dan mendukung penuh operasional offline)*.
- **GAS Web App URL (Live Backend):**  
  `https://script.google.com/macros/s/AKfycbx5SNAUvM2MOW9X62M9uzs2bw6bM19-us57r0X10GZYEU5wBd_ajXDDPCAm6M82wkzO/exec`
- **Express Proxy Gateway & AI Summarizer:**  
  Rute `/api/gas-proxy` dan `/api/ai/summarize-notes` berjalan di server port 3000.

### 9.2 Hasil Verifikasi Pengujian (Unit Tests)
Pengujian otomatis menggunakan test runner native `node:test` (`npm run test`):
- `syncQueue.test.ts`: **PASSED** (Inisialisasi clean state 0 records, verifikasi auto-purge residu dummy, mutasi optimistik, pembaruan tahapan, dan auto-archive Closing Won).
- `exportCsv.test.ts`: **PASSED** (Validasi format CSV RFC-4180, sanitasi formula injection untuk `=`, `+`, `-`, `@`, dan *escaping* karakter khusus).
- `securityLock.test.ts`: **PASSED** (Validasi hashing PIN SHA-256 tersalt, verifikasi PIN dinamis 4, 5, dan 6 digit, verifikasi lockout rate-limiting setelah 5 kali gagal, status timeout, dan reset).
- `crmCalculations.test.ts`: **PASSED** (Kalkulasi Total Pipeline, Closed Won, Weighted Probability, win rate, kategorisasi tanggal follow-up, serta pembersihan nomor telepon WhatsApp internasional).
- `aiLeadEnrichment.test.ts`: **PASSED** (Pencarian token industri, boost relevansi geografis, dan sintesis prospek dinamis).
- **Hasil Akhir:** **20 dari 20 Unit Tests Lulus 100% (Green)**.

---

## 10. ROADMAP & LANGKAH OPTIMALISASI SELANJUTNYA

1. **Batching Mutation Queue pada Google Apps Script:**
   - Menggabungkan beberapa mutasi lokal menjadi satu request payload (`action: "batchSync"`) guna menghemat kuota eksekusi Google Apps Script (maksimum 6 menit per eksekusi).
2. **Push Notifications & Google Calendar Sync:**
   - Menghubungkan pengingat jadwal follow-up ke Google Calendar AM atau Web Push Notification API untuk mengirim notifikasi peringatan pagi hari (pukul 08:00).
3. **Pencadangan Otomatis Cadangan Database:**
   - Menambahkan rutinitas berkala di Google Sheets untuk membuat snapshot salinan cadangan (*versioned backup sheet*) setiap akhir pekan secara otomatis.

---
*Dokumen ini merupakan catatan arsitektur resmi proyek AR Personal CRM Enterprise v2.2.0. Seluruh spesifikasi bersumber langsung dari implementasi kode sumber aktif.*

> **Koreksi footer historis:** kalimat penutup di atas berasal dari versi dokumen lama dan tidak berlaku untuk branch Firebase saat ini. Uraian v2.2.0 di atas bersifat historis; gunakan ringkasan audit dan source branch `cue/firebase-stabilization` sebagai status implementasi.
