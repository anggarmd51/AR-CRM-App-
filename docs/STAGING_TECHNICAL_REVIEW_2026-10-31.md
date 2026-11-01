# Review teknis staging AR CRM

**Kesimpulan:** validasi lokal tetap hijau, tetapi App Check Enterprise belum pulih dan kesiapan operasional penuh belum terbukti. Ditemukan gap integritas Lead–Activity yang berhasil direproduksi di emulator. Tidak ada perubahan kode aplikasi, Rules, konfigurasi cloud, deployment, data staging nyata, Production, atau `main` pada review ini.

Branch tetap `cue/firebase-stabilization`, HEAD `71187fc3a084ff304915d309b96ea82824c10850`. Perubahan lokal milik koordinator pada `PROJECT_STATE.md` dipertahankan tanpa diedit. Dokumen ini merupakan tambahan terpisah; tidak ada commit/push.

## Percakapan Gemini tidak selesai

Tab Gemini yang sudah disiapkan ditemukan dan dibaca. Jalur browser mengalami peringatan berulang serta aksi pengisian berstatus tidak pasti. Atas arahan pemilik, akses Gemini dihentikan. Tidak ada tindakan submit pesan yang dilakukan atau percakapan mentor baru yang terkonfirmasi selesai; draft non-sensitif mungkin tertinggal pada composer.

Saran awal yang telah ada di halaman tidak diperlakukan sebagai instruksi atau bukti. Semua kesimpulan berikut adalah **review independen terhadap source, tes lokal, dan dokumentasi resmi**, bukan rekomendasi baru yang dikonfirmasi dari Gemini. Tidak ada secret, PIN, service-account JSON, token, atau data CRM nyata yang sengaja dikirim.

## Hasil validasi yang benar-benar dijalankan

| Pemeriksaan | Hasil dan batas bukti |
| --- | --- |
| Unit test | **209/209 lulus**, 0 gagal, 0 dilewati; source aplikasi tidak berubah. |
| Lint / TypeScript | `npm run lint` lulus. |
| Build | Lulus pada salinan sementara tanpa `.env*`, `.npmrc`, atau environment proses privat. Tidak memakai atau mengubah `dist` repository. |
| Rules baseline | **22/22 lulus** pada `demo-ar-crm-rules`, emulator lokal. |
| Rules staging lokal | **25/25 lulus** pada `demo-ar-crm-staging-rules`, emulator lokal, memakai file privat yang sudah ada tanpa mengganti/menghapusnya. Bukan pembacaan ulang Rules cloud. |
| Backup/restore drill | Lulus di emulator demo: 3 Lead, 1 Activity, 1 arsip Won; ID/timestamp/relasi terjaga; 5 bundle invalid ditolak; namespace existing ditolak tanpa overwrite; fixture dibersihkan. |
| Probe integritas tambahan | **1/1 probe diagnostik** mereproduksi penghapusan Lead yang meninggalkan Activity yatim. Ini membuktikan gap, bukan bahwa perilaku itu aman atau sebuah gate rilis telah lulus. |

Kredensial/project cloud dihapus dari environment proses emulator dan `CLOUDSDK_CONFIG` diarahkan ke direktori kosong. CLI mengenali project `demo-*`; tidak ada penggunaan service non-emulated yang diizinkan. Warning `MetadataLookupWarning` (401/ENOTFOUND) terlihat pada tes Admin, tidak menggagalkan tes; ini bukan bukti keberhasilan akses cloud.

## App Check: 403 masih belum terdiagnosis sampai akar masalah

**Terverifikasi dari source saat ini:** `src/firebase.ts:70–119` memakai `ReCaptchaEnterpriseProvider`, auto-refresh, inisialisasi sebelum klien Auth/Firestore, dan preflight token fail-closed. Bypass sementara di `src/firebaseAppCheckPolicy.ts:39–59` memerlukan empat batas exact: target staging, Preview, branch, dan runtime origin. Batas tersebut tidak diubah.

**Bukti historis yang tersedia, tidak diperiksa ulang ke cloud dalam review ini:** key runtime/provider/project, appId, domain exact, dan metadata API restriction telah cocok; kegagalan berada pada `exchangeRecaptchaEnterpriseToken` HTTP 403, diikuti `appCheck/initial-throttle` satu hari. Body/alasan backend 403 belum tersedia. Karena itu, salah domain, salah key, API restriction, threshold, atau billing **tidak boleh dinyatakan sebagai akar masalah** hanya berdasarkan status 403.

[Dokumentasi provider resmi](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider) mendukung urutan inisialisasi dan prasyarat score-based key/domain/registrasi yang dipakai kode. [Debug provider](https://firebase.google.com/docs/app-check/web/debug-provider) memberikan akses dari perangkat tanpa attestation dan harus tetap privat; sukses debug **bukan** bukti Enterprise pulih. [Metrik App Check](https://firebase.google.com/docs/app-check/monitor-metrics) membedakan request verified/invalid/missing dan diperlukan sebelum keputusan enforcement.

**Rekomendasi:** pertahankan Issue #2 terbuka. Langkah berikutnya adalah mendapatkan alasan backend yang disanitasi melalui observasi yang disetujui pada satu percobaan strict yang terkendali setelah throttle, tanpa retry loop. Jangan memperluas bypass, memasukkan debug token ke bundle/Git, menurunkan threshold, mengganti provider/key/restriction, mengaktifkan enforcement, atau mengaktifkan billing sebagai tebakan. Semua perubahan konfigurasi tersebut memerlukan persetujuan exact baru. Review ini tidak membuat request attestation/challenge baru.

## Activity: pertahankan audit trail immutable

Source repository/UI saat ini hanya mengekspos `createActivity` (`src/firebaseRepository.ts:451–474`, `src/App.tsx:449–475`). Timeline dan daftar Activity tidak menyediakan edit/delete; UI menyebut audit trail. Rules `firestore.rules:221–232` dan logika yang sama pada file staging mengizinkan read/create terbatas owner/workspace/sesi serta parent Lead valid, lalu menolak update/delete.

**Keputusan paling kecil dan paling aman sekarang:** tidak memperluas izin Activity. Tidak ada kebutuhan UI/API yang menjustifikasi update/delete saat ini.

Jika fitur edit benar-benar disetujui kelak, kandidat perlu menggabungkan active PIN/session/membership, existing owner/role, schema hasil akhir, parent Lead valid di workspace yang sama, immutable `ownerId`, `role`, `lead_id`, `created_at`, serta `diff(...).affectedKeys().hasOnly(...)` untuk field konten yang disetujui. Delete adalah keputusan retensi histori terpisah, bukan konsekuensi otomatis dari edit. [Panduan field Rules resmi](https://firebase.google.com/docs/firestore/security/rules-fields) merekomendasikan allowlist perubahan, bukan sekadar memeriksa owner pada payload baru.

Matriks emulator sebelum izin baru: owner aktif allow hanya operasi/field yang disetujui; deny unauthenticated/non-owner/wrong workspace, sesi hilang/expired/revoked, perubahan identity/parent/timestamp, field tak dikenal, schema/summary/GPS invalid, serta parent missing/cross-workspace/foreign/malformed. Kandidat tidak dibuat atau dipublikasikan dalam review ini.

## Gap terkonfirmasi: Lead dapat dihapus dengan Activity yang masih ada

`firestore.rules:214–218` mengizinkan owner bersesi valid menghapus Lead non-Won yang belum mempunyai arsip Won. Tidak ada pemeriksaan referensi Activity. UI (`src/App.tsx:408–428`) melarangnya, tetapi direct SDK call tidak melewati UI.

Probe sintetis di emulator membuktikan: create Lead → create Activity yang menunjuk Lead → delete Lead diterima → Lead tidak ada, Activity tetap ada. Ini risiko **integritas data di dalam scope owner yang sah**, bukan bukti akses lintas owner atau kebocoran data. Existing test `firestore.rules.test.ts:331–344` hanya menguji delete Lead kosong dan penolakan delete Activity; karena itu suite hijau tidak menutup gap ini.

[Rules `get`/`exists` memerlukan path dokumen lengkap](https://firebase.google.com/docs/firestore/security/rules-conditions); Rules tidak dapat menjalankan query arbitrer untuk memastikan tidak ada sibling Activity. Memindahkan Activity ke subcollection saja juga bukan solusi: [delete parent tidak otomatis menghapus subcollection](https://firebase.google.com/docs/firestore/manage-data/delete-data).

**Mitigasi desain prioritas:** tahan hard-delete Lead pada klien sampai ada kebijakan retensi dan integritas yang ditegakkan server/Rules. Opsi fail-closed terkecil adalah menolak semua client Lead delete; ini mengubah fitur yang sudah ada sehingga harus direview, diuji allow/deny, dan memerlukan persetujuan publikasi Rules terpisah. Alternatif soft-delete atau counter/ledger atomik membutuhkan perubahan schema, repository, dan Rules yang memastikan semua penulis Activity mengikuti invariant; pemeriksaan UI atau query-then-delete biasa masih rentan race. Tidak ada mitigasi tersebut yang dipasang sekarang.

Regression yang dibutuhkan sesudah desain dipilih: direct delete Lead-with-Activity harus ditolak, termasuk race Activity-create vs Lead-delete dan batch/transaction, tanpa melemahkan owner/session/Won-archive guards.

## Ketahanan perangkat dan pemulihan: bukti dan gate

Unit tests antrean membuktikan replay manual setelah restore sesi, owner/workspace isolation, dependency Lead→Activity, stable operation/document IDs, retry/permanent failure handling, deactivation/logout race, dan payload outbox terenkripsi pada IndexedDB palsu + Web Crypto. Ini belum membuktikan perilaku browser/perangkat nyata, multi-tab, storage eviction, crash browser, atau pemutusan jaringan penuh.

Drill `scripts/backup-restore-drill.ts` menolak project non-demo/non-loopback, memvalidasi bundle dan namespace kosong, memakai create-only, serta membersihkan fixture sintetis. Ia memakai Admin SDK, yang [melewati Firestore Security Rules](https://firebase.google.com/docs/firestore/security/rules-conditions); maka drill bukan tes authorization Rules. JSON/CSV export bukan backup proyek Firebase lengkap, CSV tetap `firestore_restore_supported: false`, dan belum ada cloud restore drill.

Urutan uji lanjutan yang aman, terlebih dahulu pada emulator/demo terpisah dengan data sintetis:

1. Dua tab owner yang sama: concurrent create/retry, satu tab logout saat tab lain menulis, acknowledgement ambigu, dan verifikasi server hanya satu record per stable ID. Periksa lost update/stale UI, bukan hanya hitungan dokumen.
2. Pemutusan jaringan browser penuh: enqueue → reload/restart tab → login ulang → reconnect; tidak auto-replay mutasi lama sebelum tindakan owner; ack server membersihkan antrean tanpa duplikasi.
3. Storage/quota/Web Crypto tidak tersedia, private mode, eviction, dan upgrade schema IndexedDB: fail-closed tanpa menimpa payload atau mengklaim tersimpan ketika commit gagal.
4. Browser/perangkat nyata yang disetujui, terutama Android Chrome dan iOS Safari; uji logout/login serta perangkat kedua. Outbox lokal tidak berpindah perangkat.
5. Restore drill cloud hanya pada demo/project terpisah yang disetujui, dengan inventaris Auth/Rules/index/config, IAM, retensi, verifikasi jumlah/hash/relasi, dan rencana rollback; jangan restore/write ke data staging nyata.

## Gate yang tetap terbuka

1. Alasan backend 403 dan bukti Enterprise strict attestation pulih; bypass sementara belum boleh dianggap solusi permanen.
2. Desain dan regression integritas Lead–Activity; publikasi perubahan Rules memerlukan persetujuan terpisah.
3. Browser offline/reconnect, logout/relogin, multi-tab, storage failure, serta perangkat fisik.
4. Backup/restore cloud di demo terpisah dan bukti pemulihan operasional lengkap.
5. Production tetap bukan GO; tidak diperiksa atau diubah pada review ini.

## Bukti lokal untuk handoff

- Build terisolasi: `/tmp/arcrm-build-review-20261031.log`.
- Baseline Rules: `/tmp/arcrm-baseline-rules-20261031.log`.
- Staging Rules lokal: `/tmp/arcrm-staging-rules-20261031.log`.
- Probe integritas: `/tmp/arcrm-integrity-probe-20261031.log`; source sementara di `/tmp/arcrm-review-validation-20261031/firestore.integrity-probe.test.ts`.
- Fingerprint `PROJECT_STATE.md` sebelum/sesudah review: `3c9750725e998e3a0ee7ca0035dab0cd9cd980ee19e05d3884dd19ba47fc9b39`.

Path sementara di atas adalah bukti lokal untuk koordinator, bukan artefak restore atau file untuk dipublikasikan. Tidak memuat secret atau data CRM nyata yang sengaja dicatat.
