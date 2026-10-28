# PIN Akun Lintas Perangkat — Kesiapan dan Gerbang Rilis

**Alur PIN sudah diimplementasikan dan diuji secara lokal, tetapi Production belum aktif.** Runtime keyless WIF sudah disiapkan, tetapi env Account PIN/Firebase Admin belum diaktifkan dan belum ada deployment dari perubahan ini. Enrollment Production tetap mati kecuali flag server khusus diaktifkan secara eksplisit.

## Alur keamanan yang ada di kode

`FirebaseAuthGate` menunggu Google Auth dan memanggil endpoint status sebelum mengaktifkan antrean Firestore. Pada hosted target, CRM hanya dibuka jika token Firebase membawa claim `pinSessionId` yang valid dan server memastikan dokumen sesi aktif, belum kedaluwarsa, serta terikat UID yang benar. Kegagalan backend, claim, sesi, atau pemulihan antrean menahan CRM; antrean pending tidak dihapus.

PIN akun dikirim sementara melalui HTTPS `no-store`; klien tidak menyimpan PIN akun ke localStorage atau `SecurityVault`. Setelah verifikasi, klien menukar custom token server dengan Firebase Auth. PIN akun berbeda dari PIN lokal perangkat; kebijakan PIN akun 6–12 digit. Server menyimpan verifier scrypt tersalt dengan pepper server-only, bukan PIN mentah.

Dispatch API Account PIN fail-closed. Preview hanya boleh memilih runtime staging pada branch `cue/firebase-stabilization`, target staging, project staging yang tepat, dan konfigurasi server staging lengkap. Production hanya boleh memilih runtime keyless jika environment, branch, target, project, service account, WIF, owner, pepper, dan flag PIN cocok. Owner PIN dapat memakai `ACCOUNT_PIN_OWNER_UID`; jika env itu tidak tersedia, server boleh memakai `VITE_FIREBASE_OWNER_UID` yang sudah ada. Keduanya wajib cocok dengan binding owner/workspace Firestore Rules Production dan project Production yang ditetapkan. Nilai kosong atau berbeda menolak runtime. Enrollment Production mati secara default dan hanya dibuka dengan `ACCOUNT_PIN_ENROLLMENT_ENABLED=true`; staging tetap mengikuti flag eksplisitnya.

Endpoint `status`, `verify`, dan `enroll` memerlukan Firebase ID token valid yang status pencabutannya turut diperiksa, audience/issuer/auth time yang sesuai, designated owner, origin HTTPS yang sama, dan penyimpanan server-side. Rate limit durable membatasi lima kegagalan per jendela 15 menit, lalu lockout 15 menit. Enrollment memerlukan Google re-auth baru (maksimal lima menit), konfirmasi PIN, dan pembuatan credential Admin create-only; credential yang sudah ada tidak dapat ditimpa melalui endpoint ini. Tidak ada endpoint reset. Sesi berlaku delapan jam; Firestore Rules menolak klien membaca credential, limiter, atau session docs. `SecurityVault` perangkat hanya aktif pada target Firebase `local`; storage lama dan antrean IndexedDB tidak dibersihkan.

## Enrollment Production satu kali

1. Aktifkan runtime PIN Production hanya setelah seluruh env server, WIF, owner/workspace/project, pepper, serta prosedur rollback siap. `ACCOUNT_PIN_OWNER_UID` boleh tidak disetel jika `VITE_FIREBASE_OWNER_UID` server sudah tersedia dan valid terhadap binding Production.
2. Untuk jendela enrollment singkat, set `ACCOUNT_PIN_ENROLLMENT_ENABLED=true` pada env server Production. Flag ini tidak aktif secara default; route juga tetap memerlukan konfigurasi runtime Production yang lengkap.
3. Owner login Google lagi agar autentikasinya masih baru, lalu membuat PIN dan mengonfirmasikannya di website. PIN dimasukkan langsung di website, bukan dikirim lewat chat. Enrollment create-only: hanya berhasil bila belum ada credential PIN.
4. Setelah website mengonfirmasi enrollment berhasil, hapus/nonaktifkan `ACCOUNT_PIN_ENROLLMENT_ENABLED` dan deploy ulang fungsi agar jalur enrollment tertutup. Biarkan `ACCOUNT_PIN_ENABLED=true` tetap aktif jika PIN masih dipakai untuk login lintas perangkat; mematikan flag tersebut akan menonaktifkan runtime PIN, bukan sekadar enrollment.

Jangan biarkan flag enrollment aktif setelah langkah 3. Menghapus flag tidak menghapus PIN yang sudah didaftarkan dan tidak mematikan verifikasi PIN.

## Bukti tes lokal

- `npm test`: **148 lulus, 0 gagal, 1 skip** (149 tes). Mencakup fallback UID Production, penolakan binding kosong/tidak cocok, default-off enrollment, serta staging yang tetap memerlukan konfigurasi owner-nya sendiri.
- `npm run lint` dan `npx tsc --noEmit`: lulus.
- `npm run build`: lulus; bundle browser 987.06 kB (gzip 288.77 kB) dengan peringatan chunk Vite >500 kB. Audit dependency sebelumnya: 0 advisory runtime dan 5 moderate pada tooling development.
- Firestore Rules/Admin Emulator Production-target: **17/17**; emulator staging terpisah dengan owner/workspace staging privat: **20/20**.
- Belum ada login/e2e browser pada hosted Preview/Production, uji lintas perangkat hosted, CRUD Production, ataupun pemanggilan runtime PIN Production. Bukti lokal tidak membuktikan deployment hosted berfungsi.

## Mengapa Production belum boleh diaktifkan

Vercel Production sudah memiliki binding client Firebase `VITE_FIREBASE_OWNER_UID`, `VITE_FIREBASE_WORKSPACE_ID`, dan `VITE_FIREBASE_PROJECT_ID`. Namun, env Account PIN/Firebase Admin/WIF yang dibutuhkan runtime belum diaktifkan. Dengan demikian, route Production belum dapat berjalan. Jika app dirilis dengan target Firebase Production tetapi backend PIN belum dikonfigurasi, Google Sign-In dapat berjalan sementara `FirebaseAuthGate` menahan CRM sampai sesi PIN server berhasil diverifikasi. Route 404 saja bukan alasan aman untuk deploy; jangan rilis sampai konfigurasi dan jalur akses owner tervalidasi. Deployment Production READY saat ini masih pada commit sebelumnya dan tersedia sebagai kandidat rollback.

## Runtime keyless Production PIN — lokal, belum aktif

`src/server/accountPinFirebaseAdmin.ts` membangun credential keyless: token Vercel OIDC ber-audience khusus dipasok ke Google External Account Client, lalu Firebase Admin menggunakan service account Production yang ditetapkan untuk operasi Admin dan IAM `signBlob`. Setup Google WIF Production telah diselesaikan untuk project `ar-crm-73222`, service account Production, pool/provider `vercel-prod`, Team issuer, dan subject Production yang tepat. Kode membandingkan binding WIF dengan nilai Production yang disetujui, bukan hanya memvalidasi format. Implementasi tidak membuat atau memuat JSON service-account key.

Test token memakai mock; satu test hanya membangun External Account Client lokal tanpa meminta token. Tidak ada panggilan Google STS, IAM, Firebase Production, Gemini, atau perubahan cloud/env dan tidak ada deployment pada tahap ini. Route sudah terhubung secara kondisional ke builder Production, tetapi route belum aktif selama env Production tidak lengkap; live runtime belum dipanggil.

Sebelum aktivasi runtime, konfigurasi server yang diperlukan mencakup `VITE_FIREBASE_TARGET=production`, `ACCOUNT_PIN_ENABLED=true`, `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_SERVICE_ACCOUNT_ID`, `GCP_PROJECT_NUMBER`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, dan `ACCOUNT_PIN_PEPPER` (minimal 32 byte UTF-8). `ACCOUNT_PIN_OWNER_UID` opsional karena server dapat mengambil binding dari `VITE_FIREBASE_OWNER_UID`, tetapi validasi owner, workspace, dan project tetap wajib. Jangan set `ACCOUNT_PIN_ENROLLMENT_ENABLED` sampai siap menjalankan enrollment satu kali; setelah berhasil, hapus flag dan deploy ulang.

## Yang harus selesai sebelum rilis

1. Tetapkan target Firebase Production yang tepat dan validasi project, workspace, owner, serta Rules Production; jangan memakai konfigurasi staging.
2. Verifikasi env Production lewat jalur aman dan tinjau kesiapan akses owner/rollback. Jangan membuat JSON key, menaruh credential di `VITE_*`, atau memakai key staging. Enrollment hanya dibuka sebentar dengan flag eksplisit untuk pendaftaran PIN awal, lalu flag tersebut dihapus.
3. Uji hosted staging sintetis untuk Google re-auth/enrollment, PIN salah/benar, limiter lintas-instance/perangkat, expiry, akses Firestore langsung, dan cleanup. Uji sign-in Production read-only baru boleh dilakukan setelah konfigurasi dan rollback siap; jangan membuat test record Production.
4. Aktifkan `GEMINI_API_KEY` di Production hanya jika fitur AI live memang diminta. Jangan kirim catatan rapat nyata atau melakukan grounding selama tes tanpa persetujuan biaya/privasi yang sesuai.
