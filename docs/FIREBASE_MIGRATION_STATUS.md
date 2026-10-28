# AR CRM — Status Integrasi Firebase

Diperbarui pada 28 Oktober 2026, 07:53 WIB. Branch lokal `cue/firebase-stabilization`, HEAD `8498878`; seluruh perubahan sesi ini belum di-commit. Tidak membandingkan remote ref.

## Ringkasan

Owner/workspace staging dan Rules terpisah sudah diprovisikan. App Check/Auth loopback, create/readback Lead–Activity sintetis, serta Firestore SDK offline → reload durable → reconnect → replay idempotent berhasil diuji. Seluruh empat dokumen CRM sintetis sudah dihapus melalui admin; root workspace dan membership owner tetap ada. **Ini belum berarti production ready dan bukan hosted Vercel Preview.**

Cabang ini menggunakan Google Sign-In dan Firestore untuk Leads/Activities, tanpa impor otomatis dari `localStorage`, Sheets, atau GAS. Development tetap emulator-only. Hosted Preview wajib memakai target `staging`, project ID terpisah berpola `ar-crm-staging-` dan exact allowlist; Production hanya menerima project production yang ditetapkan. Guard client bukan pengganti Rules.

## Pembaruan kandidat lokal — 28 Oktober 2026

- Activity kini menyimpan `ai_summary` dengan sumber `gemini`/`local` dan GPS opsional. UI meminta persetujuan sebelum mengirim catatan ke Gemini; fallback lokal hanya mengambil teks yang sudah ada. GPS hanya diminta sekali lewat tombol, bukan background tracking.
- Rules membatasi pasangan summary/source, rentang koordinat, dan fields tambahan. Perpindahan Closing Won memakai transaction Firestore untuk mengubah stage dan membuat arsip `wonDealArchives/{leadId}` yang immutable; Rules mengizinkan create hanya jika lead yang sama berstatus Closing Won dalam `getAfter()`.
- UI Pipeline optimistik dan mengembalikan stage hanya bila operasi terkait ditolak. Uji hosted untuk alur tersebut belum dilakukan.
- Unit/mock tests: 128 lulus; Rules/Admin Emulator: 17 lulus; TypeScript, build sanitasi, dan `git diff --check` lulus. Build mencatat satu bundle JavaScript 983.92 kB (Vite warning di atas 500 kB); bundle tidak memuat marker SDK/key Gemini server.
- Vercel Production tidak mencatat `VITE_FIREBASE_TARGET=production`, dan Gemini key Production belum terkonfirmasi. Source baru tetap fail-closed; tidak ada perubahan environment, data, Rules, deployment, alias, push, atau commit Production.
- Tidak ada uji browser hosted atau panggilan live Gemini. Build/local emulator bukan bukti bahwa deployment hosted terbaru berfungsi.

## Staging yang terverifikasi

- Project: [`ar-crm-staging-angga-20261027`](https://console.firebase.google.com/project/ar-crm-staging-angga-20261027/overview), `AR CRM Staging`. Paket Spark/no-cost telah diverifikasi pada provisioning; tidak mengaktifkan billing, Blaze, atau free trial.
- Database akhir: `(default)`, `asia-southeast1`, `FIRESTORE_NATIVE`, `STANDARD`, `freeTier=true`, PITR disabled.
- Web App: `AR CRM Staging Web`, App ID `1:622108535247:web:b94a1d19f319ec7f200aba`. SDK config/site key tidak dicetak atau ditulis dalam dokumen ini.
- Google provider **Enabled**; authorized domains tetap `localhost`, `ar-crm-staging-angga-20261027.firebaseapp.com`, dan `ar-crm-staging-angga-20261027.web.app`. Tidak ada custom domain atau hosted deployment.
- App Check reCAPTCHA Enterprise terdaftar pada Web App staging; key score-based dibatasi ke `localhost`, domain verification enabled. Enforcement Firestore/Auth tetap **Unenforced**; tidak ada toggle enforcement yang diubah. Token preflight nyata berhasil sebelum Auth/Firestore digunakan.
- Identitas owner staging diperoleh melalui OAuth owner sebelumnya dan berbeda dari production. UID tetap privat; tidak disimpan di source/docs. Rules staging privat mengikat hanya UID itu dan workspace `ar-crm-staging-owner`.

## Rules, provisioning, dan indeks

Rules staging disalin ke file privat di luar repo dengan struktur/validasi ketat yang sama; hanya binding UID/workspace diganti. Smoke emulator staging lulus untuk owner, penolakan non-owner/delete, Lead–Activity/readback, replay dan cleanup. Deployment Rules memakai `--project ar-crm-staging-angga-20261027` secara eksplisit dan project diverifikasi sebelum/sesudah. `firestore.rules`, `firebase.json`, serta `firestore.indexes.json` repo tidak diubah.

Admin commit atomik dengan precondition create-only membuat tepat root workspace (`ownerId`) dan membership owner (`role=owner`), sebelum record CRM apa pun dibuat. Kedua dokumen dibaca kembali dan tetap ada setelah cleanup. Client tidak memprovisikan root/member dan tetap tidak boleh menghapus CRM atau mengubah membership.

Query awal aplikasi gagal `FAILED_PRECONDITION` karena indeks belum ada. Dua indeks `ownerId ASC + created_at DESC` untuk Leads dan Activities diterapkan hanya ke staging dan sudah READY. Daftar API memuat kedua parent koleksi sekaligus; dugaan awal duplikasi ternyata salah. Guard cleanup berhenti sebelum DELETE, sehingga tidak ada indeks yang dihapus. Query ekuivalen aplikasi kemudian HTTP 200 dan UI berhasil membaca record.

Source guard staging menerima workspace staging tetap dan UID non-production; exact UID tetap ditegakkan Rules privat. Binding production yang ada dipertahankan. `.env.staging.local` dibuat ignored Git dengan mode `0600`; `.env.local` tidak dibaca/disentuh. Build hanya pada salinan privat yang mengecualikan seluruh `.env*`/`.npmrc` sumber, memasukkan env staging eksplisit, dan membersihkan environment proses dengan `env -i`.

## Hasil CRUD dan offline terbatas

Server preview hanya listen di `127.0.0.1:4174`. App Check dan Google Auth owner berhasil membuka CRM staging kosong tanpa tindakan owner tambahan. Lewat UI, satu Lead dan satu Activity online bertanda **SYNTHETIC STAGING … DELETE AFTER TEST** dibuat; readback server serta parent Activity terverifikasi.

Harness sementara di salinan privat memakai repository/queue asli dan Rules normal, bukan admin writer. Dengan Firestore SDK `disableNetwork()`, pasangan Lead–Activity kedua diterima lokal tanpa acknowledgement. Admin GET memastikan keduanya 404 sebelum dan sesudah reload. Reload memulihkan dua operasi durable (`pending=1`, `syncing=1`, `failed=0`); reconnect kemudian mempersist keduanya.

Verifikasi readback awal harness dilakukan terlalu cepat dan ditolak Rules saat dokumen belum ada. Kedua write kemudian terkonfirmasi berhasil di server; harness diperbaiki agar menunggu queue selesai dan melanjutkan ID yang sama tanpa enqueue ulang. Server-only readback serta replay pada ID tetap lulus; timestamp immutable tidak berubah dan queue berakhir `pending=0`, `syncing=0`, `failed=0`.

**Batas bukti:** ini uji offline Firestore SDK, bukan pemutusan seluruh jaringan browser/perangkat atau uji service-worker offline penuh. Penolakan non-owner dan delete diverifikasi di emulator, bukan login non-owner live. Update stage/arsip tercakup Rules Emulator dan implementasi lokal, tetapi belum diuji melalui browser pada hosted Preview.

## Cleanup dan keselamatan data

Setiap marker online/offline terverifikasi tepat satu: total dua Lead dan dua Activity, tanpa duplikat. Admin commit menghapus hanya empat ID tersebut setelah memverifikasi project/path, marker, owner, parent, dan `updateTime`. GET masing-masing kemudian 404; koleksi Leads/Activities staging kosong dan root/member owner tetap utuh.

Reload aplikasi setelah cleanup menunjukkan 0 akun, tidak ada Activity, dan antrean kosong. Sesi staging kemudian logout; layar Google Sign-In kembali tampil. Tidak dilakukan relogin sesudah logout akhir ini.

Tidak ada data CRM nyata yang dibaca, diekspor, dipindahkan, dihapus, atau ditulis. Google Sheet `Personal CRM Data` tidak digunakan. Tidak ada migrator executable; runbook/mapping bukan izin apply. Tidak ada catatan rapat nyata yang dikirim ke AI atau GPS nyata yang ditangkap selama pengujian; implementasi lokal baru dapat menyimpan hasil ringkasan berizin dan GPS satu-kali pada Activity. Ekspor Sheets adalah pelaporan, bukan backup.

Tidak ada perubahan production/`main`, push, merge, deployment Vercel, atau migrasi. Operasi cloud sesi ini terbatas pada Rules/indeks, provisioning owner, dan fixture/cleanup staging yang disebutkan di atas.

## Verifikasi lokal sesi ini

- `npm test`: **83/83 lulus**.
- `npm run lint`: **lulus**.
- `npx --no-install tsc --noEmit`: **lulus**.
- Rules Emulator: **12/12 lulus**, project sintetis `demo-ar-crm-rules`, port terpisah 18081.
- `git diff --check`: **lulus**.
- Build staging sanitasi: **lulus**, dengan warning ukuran JavaScript chunk di atas ambang 500 kB. Harness multi-entry juga lulus dengan shared chunk sekitar 594,42 kB.

Audit/build terdahulu yang mungkin memuat env otomatis tetap merupakan catatan historis di [`PROJECT_STATE.md`](../PROJECT_STATE.md), bukan prosedur build sesi ini. Dependency tidak di-upgrade; advisory unik High/Low pada jalur `@grpc/grpc-js@1.9.16` yang tercatat sebelumnya belum diselesaikan dan audit dependency tidak dijalankan ulang.

## Production: catatan historis, tidak diperiksa ulang

Tidak ada operasi Rules/data yang menargetkan project production `ar-crm-73222`, tidak ada perubahannya, dan data CRM production tidak diakses. Catatan terdahulu menyebut Firestore Singapore, Google Auth, Rules dan root/member tersedia; pemilik melaporkan login berhasil, tetapi production CRUD belum terverifikasi. Deployment terakhir yang diketahui berasal dari Vercel project `arcrm-app`, commit `f010c46f6358fa57fe2b0957e8f049058acb0b7d`; status live tidak diperiksa ulang.

Google Sign-In dapat membuat identitas Auth sebelum client gate menolak non-owner. Rules membatasi CRM, bukan allowlist pembuatan akun Auth. Outbox AES-GCM per owner/workspace bukan backup lintas perangkat atau persistence seluruh snapshot CRM. Ekspor Firestore→Sheets masih kode lokal; IAM/service account, environment server, dan Cron belum disiapkan.

## Gate berikutnya

1. **Hosted Vercel Preview masih belum disetujui.** Environment, domain/key App Check yang sesuai, serta deployment memerlukan persetujuan eksplisit; tidak boleh mengubah Production settings.
2. Setelah izin Preview, uji owner/non-owner live, update stage, logout/relogin, full-browser offline/reconnect, acknowledgement, dan tidak adanya duplikasi pada origin hosted.
3. Selesaikan dependency High serta backup/restore melalui scope dan persetujuan tersendiri.
4. App Check production, production CRUD, migrasi dan cutover harus disetujui serta diverifikasi terpisah. Persetujuan staging bukan izin merge, deployment production, atau cutover.


## Pembaruan lokal: perubahan hanya saat online

Perubahan lokal pada branch `cue/firebase-stabilization` menolak mutasi CRM baru saat browser menyatakan perangkat offline. Record yang sudah terlanjur menunggu atau gagal di antrean tidak dihapus; antrean tersebut tetap menunggu dan baru dicoba lagi ketika koneksi pulih. Retry dan koreksi record gagal juga ditahan saat offline. Cache Service Worker hanya berisi berkas aplikasi, bukan daftar Lead atau Activity.

Peta penyimpanan saat ini:

- **Lead dan Activity aktif:** Firestore adalah sumber data; aplikasi membaca perubahan melalui langganan Firestore realtime. Kode aktif tidak menghidrasi Lead/Activity dari `localStorage`.
- **Antrean pemulihan:** IndexedDB terenkripsi pada browser ini hanya menyimpan mutasi yang belum diakui Firestore, bukan salinan lengkap data CRM. Record antar-perangkat tidak otomatis tersinkron kecuali diakui server. Jangan menghapus browser data atau record pending/failed sebelum antrean diperiksa dan record aman dipulihkan.
- **Kode CRM lama:** helper `CrmStorage` berbasis `localStorage` tetap ada untuk kompatibilitas dan tes lama, tetapi tidak lagi diimpor oleh jalur Auth, UI, atau repository aktif. Nilai lama tidak dibaca, dihapus, atau dimigrasikan oleh patch ini.
- **Kunci layar lokal:** `SecurityVault` masih menyimpan PIN/kebijakan kunci layar dan preferensi per-browser di `localStorage`. Itu bukan PIN akun dan tidak dibagikan antar-perangkat. Data ini sengaja tidak dihapus atau dimatikan; menggantinya memerlukan penyimpanan preferensi online yang aman dan keputusan pemilik.

Guard offline memakai status koneksi browser. Jika browser masih menganggap dirinya online meskipun internet atau Firestore tidak dapat dijangkau, SDK dapat tetap menunggu konfirmasi; itulah alasan outbox pemulihan dipertahankan. Outbox ini tidak boleh dipasarkan sebagai sinkronisasi lintas-perangkat atau backup.

**PIN akun lintas perangkat dan penggunaan hosted belum siap production.** Gerbang fail-closed yang sudah ada tetap menahan akses cloud sampai verifier PIN tepercaya, hash/secret server-only, rate-limit durable lintas perangkat, sesi server yang dapat kedaluwarsa/dicabut, dan Firestore Rules yang teruji tersedia. Patch lokal ini tidak mengubah cloud, environment, deployment, atau data. Langkah berikutnya adalah menyelesaikan backend sesi/PIN dan penyimpanan preferensi terpusat, lalu uji staging terpisah; setelah antrean pending/failed direkonsiliasi, pemilik dapat memutuskan apakah outbox lokal masih diperlukan sebelum seluruh penyimpanan lokal dihapus lewat perubahan yang disetujui.
