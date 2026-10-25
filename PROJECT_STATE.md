# PROJECT STATE & ARCHITECTURAL SPECIFICATION
## AR Personal CRM Enterprise (Solo Account Manager Edition)

> **Document Version:** 2.2.0 (Production-Clean & Zero-Mock Hardened Edition)  
> **Status:** Production-Ready / Operational & Audited  
> **Live Production URL (Vercel):** [https://arcrmapp.vercel.app/](https://arcrmapp.vercel.app/)  
> **Author & Architect:** Lead Full-Stack Software Architect & Database Integration Specialist  
> **Last Updated:** October 2026  
> **Target Platform:** Offline-First Progressive Web App (PWA) & Native Android (Jetpack Compose / Room DB)

---

## DAFTAR ISI
1. [Visi & Problem Statement](#1-visi--problem-statement)
2. [Arsitektur Sistem & Tech Stack](#2-arsitektur-sistem--tech-stack)
3. [Desain Sistem & Identitas Brand (AR CRM)](#3-desain-sistem--identitas-brand-ar-crm)
4. [Modul & Fitur Utama yang Telah Diimplementasikan](#4-modul--fitur-utama-yang-telah-diimplementasikan)
5. [Skema Database & Spesifikasi REST API](#5-skema-database--spesifikasi-rest-api)
6. [Arsitektur Native Android (Kotlin & Jetpack Compose)](#6-arsitektur-native-android-kotlin--jetpack-compose)
7. [Hasil Code Review, Security Hardening & Refactoring (v2.2.0)](#7-hasil-code-review-security-hardening--refactoring-v220)
8. [Pembersihan Data Dummy & Hardening Integrasi Google Sheets](#8-pembersihan-data-dummy--hardening-integrasi-google-sheets)
9. [Status Deployment & Verifikasi Teknis](#9-status-deployment--verifikasi-teknis)
10. [Roadmap & Langkah Optimalisasi Selanjutnya](#10-roadmap--langkah-optimalisasi-selanjutnya)

---

## 1. VISI & PROBLEM STATEMENT

### 1.1 Visi Produk
**AR Personal CRM Enterprise** adalah sales command center pribadi berkinerja tinggi yang dirancang khusus untuk seorang **Account Manager (AM)** atau Sales Professional B2B independen. Sistem ini menghadirkan kemampuan setara CRM korporat bernilai ribuan dolar, namun dengan **biaya operasional Rp0 (100% gratis selamanya)**, berjalan secara **offline-first**, dan tidak bergantung pada lisensi perangkat lunak per pengguna (*per-seat licensing*).

### 1.2 Problem Statement
Di lapangan, Account Manager B2B menghadapi tantangan operasional krusial:
1. **Konektivitas Tidak Stabil di Lapangan:** Kunjungan ke kawasan industri (KIM Medan, Cikarang, Karawang, Rungkut Surabaya) seringkali mengalami *dead zone* sinyal internet seluler. Aplikasi CRM berbasis cloud murni sering *hang*, gagal menyimpan catatan rapat, atau lambat dimuat.
2. **Follow-Up Tercecer & Kehilangan Momentum:** Kesepakatan bernilai ratusan juta rupiah sering lepas akibat follow-up terlambat karena catatan tersebar di buku saku, WhatsApp pribadi, atau spreadsheet statis.
3. **Biaya Langganan CRM Komersial yang Mahal:** CRM enterprise seperti Salesforce atau HubSpot membebankan biaya $50 – $150 per pengguna per bulan, yang tidak efisien bagi sales individual atau konsultan mandiri.
4. **Beban Administrasi Pencatatan Rapat:** Mengingat dan merangkum poin pembicaraan serta butir tindakan (*action items*) selepas rapat klien menyita waktu berharga.
5. **Keluarnya Aplikasi Akibat Gestur Navigasi Ponsel:** Pada perangkat Android dan browser mobile, gestur *swipe-back* seringkali langsung memicu aksi *browser exit* atau menutup PWA secara tidak sengaja ketika pengguna hanya bermaksud menutup modal popup atau kembali ke Dashboard.
6. **Kerahasiaan Data Klien & Portabilitas Laporan:** AM membutuhkan cara cepat untuk mengekspor rekapitulasi prospek ke spreadsheet Excel/CSV tanpa bergantung pada koneksi internet, serta perlindungan PIN/biometrik saat perangkat dipinjamkan.

### 1.3 Solusi AR CRM
- **Offline-First dengan Optimistic UI:** Data disimpan secara instan di perangkat lokal (*zero-latency write*) dan secara otomatis disinkronkan ke database cloud saat koneksi internet pulih.
- **Biaya Operasional Rp0 (Serverless):** Memanfaatkan kombinasi Google Apps Script (GAS) Web App dan Google Sheets sebagai database cloud tanpa biaya server bulanan.
- **AI-Powered Field Assistant:** Peringkasan otomatis catatan rapat lapangan dan ekstraksi *Action Items* menggunakan Gemini API (`gemini-3.8-flash`) dengan mekanisme *intelligent rule-based fallback* dan timeout guard `AbortController`.
- **Integrated Direct Outreach:** Integrasi satu ketukan untuk panggilan telepon dan perutean WhatsApp (`wa.me`) dengan validasi nomor internasional dan template pesan profesional.
- **Mobile Back Gesture Management (LIFO Order):** Penanganan `popstate` dan `history.pushState` bertingkat (*Last-In, First-Out*) yang menutup sub-modal aktif terlebih dahulu sebelum modal induk atau navigasi tab.
- **Local Security Vault (WebAuthn & Rate-Limiting Lockout):** Otentikasi biometrik riil berbasis WebAuthn (`navigator.credentials.get`), hashing PIN SHA-256 tersalt, dan proteksi *brute-force rate-limiting lockout* (5 percobaan gagal $\rightarrow$ cooldown 30 detik).
- **Sanitized CSV Export Engine:** Ekspor instan data prospek ke format RFC-4180 CSV yang terproteksi penuh dari serangan *CSV Formula Injection* (`=`, `+`, `-`, `@`, `\t`, `\r`).
- **Complete PWA Service Worker:** Registrasi Service Worker mandiri (`sw.js`) dengan strategi cache cerdas *NetworkFirst* untuk dokumen HTML dan *CacheFirst* untuk aset statis.
- **Zero-Mock Production State:** Seluruh data mock/dummy bawaan telah dibersihkan secara tuntas. Aplikasi beroperasi murni pada data nyata dari Google Sheets dan input pengguna.

---

## 2. ARSITEKTUR SISTEM & TECH STACK

Arsitektur AR CRM dibangun dengan prinsip pemisahan tanggung jawab (*Separation of Concerns*), ketahanan terhadap kegagalan jaringan, dan portabilitas tinggi.

```
+-----------------------------------------------------------------------------------+
|                            AR CRM CLIENT LAYER                                    |
|                                                                                   |
|   +------------------------------------+    +---------------------------------+   |
|   |   Progressive Web App (React 19)   |    |  Native Android (Kotlin/Room)   |   |
|   |   - Tailwind CSS v4 (AR Editorial) |    |  - Jetpack Compose Material 3   |   |
|   |   - Vite SPA Engine                |    |  - Retrofit 2 + Gson            |   |
|   |   - Popstate LIFO Back Shield      |    |  - WorkManager SyncWorker       |   |
|   |   - WebAuthn + Salted PIN Vault    |    |  - FusedLocationProviderClient  |   |
|   |   - Sanitized CSV Export Engine    |    |  - OnBackPressedDispatcher      |   |
|   |   - Dynamic FK Sync Queue Engine   |    |  - Type-safe Remote DTO Mappers |   |
|   |   - Auto-Purge Mock Sanitizer      |    |                                 |   |
|   |   - Service Worker Offline Caching |    |                                 |   |
|   +-----------------+------------------+    +----------------+----------------+   |
+---------------------|----------------------------------------|--------------------+
                      |                                        |
                      | HTTP / REST (JSON)                     | HTTP / REST (JSON)
                      v                                        v
+-----------------------------------------------------------------------------------+
|                        AR CRM BACKEND & MIDDLEWARE LAYER                          |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   | Production Edge Gateway (Vercel) / Express Proxy Server (server.ts)       |   |
|   | - /api/gas-proxy: Menangani CORS bypass & HTTP 302 Redirect Follow        |   |
|   |   dengan 12s AbortController timeout guard                                |   |
|   | - Configurable GAS_API_URL via process.env.GAS_API_URL                    |   |
|   | - /api/ai/summarize-notes: Google GenAI SDK (gemini-3.8-flash)             |   |
|   |   dengan AbortController 4s timeout & intelligent fallback               |   |
|   +-------------------------------------+-------------------------------------+   |
+-----------------------------------------|-----------------------------------------+
                                          |
                                          | Google Apps Script Web App Deployment
                                          v
+-----------------------------------------------------------------------------------+
|                       AR CLOUD SYNC & DATABASE ENGINE                             |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   | Google Apps Script Web App (Code.gs v2.2.0)                               |   |
|   | - Action Router: getLeads, addLead, updateLeadStage, addActivity, dll.    |   |
|   | - Auto-Archive Router: archiveClosingWon, getArchiveLogs                  |   |
|   | - Global Leads Router: getGlobalLeads, importGlobalLead                   |   |
|   | - Atomic ID Generator: LEAD-xxx, ACT-xxx, ARCHIVE-xxx                      |   |
|   +-------------------------------------+-------------------------------------+   |
|                                         | SpreadsheetApp API                      |
|                                         v                                         |
|   +---------------------------------------------------------------------------+   |
|   | Google Sheets Database ("Personal CRM Data")                              |   |
|   | - Sheet [Leads]: Master data prospek & tahapan pipeline                   |   |
|   | - Sheet [Activities]: Log check-in GPS, catatan, dan ringkasan AI         |   |
|   | - Sheet [Global_Leads]: Direktori target prospek korporat B2B             |   |
|   | - Sheet [Archive_Logs]: Arsip permanen closing won & rekap performa       |   |
|   +---------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------+
```

---

## 3. DESAIN SISTEM & IDENTITAS BRAND (AR CRM)

- **Palette Warna Utama:**
  - **Navy Blue (`#1A2E40`):** Simbol otoritas korporat, stabilitas finansial, dan kedewasaan enterprise.
  - **Hub Orange (`#FF4800`):** Titik fokus energi, node jaringan koneksi bisnis, dan indikator status proaktif.
  - **Editorial Cream Paper (`#FCFCFA` / `#F8F5EE`):** Latar belakang bertekstur kertas premium editorial (*high-contrast readability*).
  - **Batas Presisi:** Hairline border 1px (`border-[#1F1F1F]`) dengan radius 8px seragam (zero-pill discipline).

---

## 4. MODUL & FITUR UTAMA YANG TELAH DIIMPLEMENTASIKAN

### 4.1 Dashboard & Financial Forecast
- **KPI Real-Time:** Total Pipeline Value, Deals Closed Won, Active Pipeline Deals, dan Weighted Forecast (probabilitas tertimbang berdasarkan bobot stage: Prospect 20%, Meeting 40%, Negotiation 70%, Closing Won 100%, Closing Lost 0%).
- **Follow-Up Categorization:** Klasifikasi otomatis prospek berstatus `Overdue`, `Today`, `This Week`, dan `Upcoming`.
- **Top Deals & Industry Distribution:** Ringkasan kesepakatan bernilai tertinggi dan sebaran industri prospek.

### 4.2 Sales Pipeline (Kanban & List View)
- **5 Tahapan Standar Penjualan:** Prospect $\rightarrow$ Meeting $\rightarrow$ Negotiation $\rightarrow$ Closing Won $\rightarrow$ Closing Lost.
- **Drag & Drop / Quick Advance:** Perubahan tahapan pipeline dengan pembaruan tanggal follow-up otomatis dan penulisan antrean mutasi instan (*optimistic write*).
- **Auto-Archive Closing Won:** Deal yang berpindah ke Closing Won otomatis diarsipkan ke sheet `Archive_Logs` dan disimpan di arsip lokal.

### 4.3 AI Lead Finder & Enrichment
- **Pencarian Relevan B2B:** Mesin pencarian cerdas berbasis token industri, skoring relevansi geografis (Medan, Jakarta, Cikarang, Surabaya), dan sintesis data prospek korporat dinamis.
- **AI Match Score:** Skoring kecocokan prospek (Hot/Warm) dengan informasi pengambil keputusan (*decision makers*).
- **1-Click Import:** Konversi instan prospek global menjadi prospek aktif di sheet `Leads`.

### 4.4 Field Activities, GPS Check-In & AI Summarizer
- **GPS Check-In:** Pengambilan koordinat lintang/bujur presisi via browser Geolocation API / FusedLocationProviderClient.
- **AI Meeting Summarizer:** Peringkasan transkrip rapat lapangan menggunakan Gemini API (`gemini-3.8-flash`) dengan batas waktu protektif 4 detik melalui `AbortController` dan *Intelligent Local Fallback* jika koneksi terputus.

### 4.5 WhatsApp Quick Reach
- **Normalisasi Nomor Telepon:** Format nomor telepon otomatis ke standar internasional (+62/E.164).
- **Template Pesan Profesional:** Pilihan template salam formal B2B, penjadwalan demo produk, pengiriman proposal penawaran, dan ucapan apresiasi pasca rapat.

### 4.6 Offline Sync Engine & Local Security Vault
- **Dynamic Foreign Key Resolution:** Mutasi lokal yang menggunakan ID sementara (`TEMP-LEAD-xxx`) secara otomatis diperbarui dengan ID server riil (`LEAD-xxx`) saat proses sinkronisasi berhasil.
- **Local Security Lockout:** Proteksi keamanan PIN SHA-256 tersalt dan autentikasi biometrik WebAuthn sesungguhnya dengan mekanisme lockout 30 detik setelah 5 kali salah input.

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
- `securityLock.test.ts`: **PASSED** (Validasi hashing PIN SHA-256 tersalt, verifikasi PIN, verifikasi lockout rate-limiting setelah 5 kali gagal, status timeout, dan reset).
- `crmCalculations.test.ts`: **PASSED** (Kalkulasi Total Pipeline, Closed Won, Weighted Probability, win rate, kategorisasi tanggal follow-up, serta pembersihan nomor telepon WhatsApp internasional).
- `aiLeadEnrichment.test.ts`: **PASSED** (Pencarian token industri, boost relevansi geografis, dan sintesis prospek dinamis).
- **Hasil Akhir:** **19 dari 19 Unit Tests Lulus 100% (Green)**.

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
