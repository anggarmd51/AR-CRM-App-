# PROJECT STATE & ARCHITECTURAL SPECIFICATION
## AR Personal CRM Enterprise (Solo Account Manager Edition)

> **Document Version:** 2.0.0  
> **Status:** Production-Ready / Operational  
> **Author & Architect:** Lead Software Architect & Full-Stack AI Engineering Team  
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
7. [Status Deployment & Verifikasi Teknis](#7-status-deployment--verifikasi-teknis)
8. [Roadmap & Langkah Optimalisasi Selanjutnya](#8-roadmap--langkah-optimalisasi-selanjutnya)

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

### 1.3 Solusi AR CRM
- **Offline-First dengan Optimistic UI:** Data disimpan secara instan di perangkat lokal (*zero-latency write*) dan secara otomatis disinkronkan ke database cloud saat koneksi internet pulih.
- **Biaya Operasional Rp0 (Serverless):** Memanfaatkan kombinasi Google Apps Script (GAS) Web App dan Google Sheets sebagai database cloud tanpa biaya server bulanan.
- **AI-Powered Field Assistant:** Peringkasan otomatis catatan rapat lapangan dan ekstraksi *Action Items* menggunakan Gemini API (`gemini-3.8-flash`) dengan mekanisme *intelligent rule-based fallback*.
- **Integrated Direct Outreach:** Integrasi satu ketukan untuk panggilan telepon dan perutean WhatsApp (`wa.me`) dengan validasi nomor internasional dan template pesan profesional.

---

## 2. ARSITEKTUR SISTEM & TECH STACK

Arsitektur AR CRM dibangun dengan prinsip pemisahan tanggung jawab (*Separation of Concerns*), ketahanan terhadap kegagalan jaringan, dan portabilitas tinggi.

```
+-----------------------------------------------------------------------------------+
|                            AR CRM CLIENT LAYER                                    |
|                                                                                   |
|   +------------------------------------+    +---------------------------------+   |
|   |   Progressive Web App (React 18)  |    |  Native Android (Kotlin/Room)   |   |
|   |   - Tailwind CSS (AR Editorial)    |    |  - Jetpack Compose Material 3   |   |
|   |   - Vite SPA Engine                |    |  - Retrofit 2 + Gson            |   |
|   |   - localStorage & Queue Engine    |    |  - WorkManager SyncWorker       |   |
|   |   - Geolocation & wa.me Generator  |    |  - FusedLocationProviderClient  |   |
|   +-----------------+------------------+    +----------------+----------------+   |
+---------------------|----------------------------------------|--------------------+
                      |                                        |
                      | HTTP / REST (JSON)                     | HTTP / REST (JSON)
                      v                                        v
+-----------------------------------------------------------------------------------+
|                        AR CRM BACKEND & MIDDLEWARE LAYER                          |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   | Express Proxy Server (server.ts / Port 3000)                              |   |
|   | - /api/gas-proxy: Menangani CORS bypass & HTTP 302 Redirect Follow        |   |
|   | - /api/ai/summarize-notes: Google GenAI SDK (gemini-3.8-flash)             |   |
|   +-------------------------------------+-------------------------------------+   |
+-----------------------------------------|-----------------------------------------+
                                          |
                                          | Google Apps Script Web App Deployment
                                          v
+-----------------------------------------------------------------------------------+
|                       AR CLOUD SYNC & DATABASE ENGINE                             |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   | Google Apps Script Web App (Code.gs v2.0)                                 |   |
|   | - Action Router: getLeads, addLead, updateLeadStage, addActivity, dll.    |   |
|   | - Atomic ID Generator: LEAD-xxx, ACT-xxx                                  |   |
|   +-------------------------------------+-------------------------------------+   |
|                                         | SpreadsheetApp API                      |
|                                         v                                         |
|   +---------------------------------------------------------------------------+   |
|   | Google Sheets Database ("Personal CRM Data")                              |   |
|   | - Sheet [Leads]: Master data prospek & tahapan pipeline                   |   |
|   | - Sheet [Activities]: Log check-in GPS, catatan, dan ringkasan AI         |   |
|   | - Sheet [Global_Leads]: Direktori target prospek korporat B2B             |   |
|   +---------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------+
```

### 2.1 Ringkasan Teknologi
| Komponen | Teknologi | Deskripsi & Peran |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 + TypeScript | Struktur antarmuka modular, *type-safe*, dan reaktif. |
| **Build Tooling** | Vite 6 | Bundler super cepat dengan kompilasi ES modules. |
| **Styling Engine** | Tailwind CSS v4 | Utilitas styling dengan konsistensi sistem desain editorial. |
| **Iconography** | Lucide React | Ikonografi vektor monoline profesional. |
| **Local Storage & Queue** | Web Storage API (localStorage) | Cache lokal persisten dan antrean mutasi *offline-first*. |
| **Middleware Server** | Express (Node.js) | Server proxy untuk komunikasi CORS-safe dan proxy AI backend. |
| **AI Engine** | `@google/genai` (Gemini 3.8 Flash) | Peringkas catatan rapat otomatis dan ekstraktor poin tindakan. |
| **Backend & Cloud DB** | Google Apps Script + Google Sheets | Backend serverless gratis dengan database spreadsheet terstruktur. |
| **Native Blueprint** | Android Kotlin + Jetpack Compose | Arsitektur native alternatif dengan Room SQLite dan WorkManager. |

---

## 3. DESAIN SISTEM & IDENTITAS BRAND (AR CRM)

Aplikasi telah melalui proses *white-labeling* total menjadi identitas resmi **"AR CRM"** (*AR Personal CRM Enterprise*), menghapus seluruh referensi ke platform pihak ketiga.

### 3.1 Identitas Visual & Palet Warna
- **Navy Blue Dark (`#1A2E40` / `#182B3A`):** Warna primer untuk tipografi header, identitas brand "AR", dan kontainer status tingkat tinggi yang mencerminkan otoritas enterprise.
- **Sprout / Hub Orange (`#FF4800` / `#FF5722`):** Warna aksen utama untuk tombol tindakan (CTA), indikator node jejaring, status aktif, dan elemen interaktif penting.
- **Parchment Surface (`#F8F5EE` / `#FCFCFA`):** Latar belakang kanvas yang hangat, nyaman di mata, dan bernuansa editorial korporat premium.
- **Hairline Ink Border (`#1F1F1F` / 1px border):** Batas garis tegas 1px tanpa bayangan blur berlebihan (*zero pill discipline*, *clean corporate structure*).
- **Corner Radii:** Struktur sudut terstandarisasi:
  - `8px (`rounded-[8px]`):` Tombol aksi, input field, filter tab, dan badge.
  - `12px (`rounded-[12px]`):` Kartu kanban dan modul check-in GPS.
  - `16px (`rounded-[16px]`):` Kartu metrik hero dan modal pop-up.

### 3.2 Aset Brand & Metadata PWA
- **Logo Resmi:** `/assets/aistudio/Logo_AR_CRM_dengan_Hub_Oranye_ce6dcc6a.png` (huruf AR Navy dengan node jejaring oranye di atas huruf R).
- **Web App Manifest (`public/manifest.json`):**
  - `name`: "AR Personal CRM Enterprise"
  - `short_name`: "AR CRM"
  - `theme_color`: "#1A2E40"
  - `background_color`: "#FCFCFA"
  - `display`: "standalone"

---

## 4. MODUL & FITUR UTAMA YANG TELAH DIIMPLEMENTASIKAN

### 4.1 Dashboard & Financial Forecast
Modul ini bertindak sebagai pusat komando harian Account Manager dengan fitur:
- **Financial Metric Cards:**
  - **Total Pipeline Value:** Total nilai moneter seluruh kesepakatan dalam mata uang Rupiah (`formatCurrency`).
  - **Closed Won Revenue:** Total pendapatan dari deal yang telah berhasil ditutup, disertai persentase *Win Rate*.
  - **Active Deals:** Akumulasi nilai kesepakatan aktif yang berada di tahap Prospect, Meeting, dan Negotiation.
  - **Weighted Pipeline Value:** Nilai potensi tertimbang berdasarkan probabilitas keberhasilan tiap tahap:
    $$\text{Weighted Value} = \sum (\text{Deal Value} \times \text{Stage Probability})$$
- **Follow-up Reminders & Alerts:**
  - Pengelompokan cerdas: *Overdue* (Jatuh tempo), *Due Today* (Hari ini), *Upcoming* (Akan datang), dan *No Date*.
  - Banner peringatan merah/oranye untuk tindak lanjut yang terlambat guna mencegah hilangnya kesepakatan.
  - Tombol aksi instan langsung pada kartu: Telepon, WhatsApp, dan GPS Check-In.
- **Pipeline Stage Distribution:** Visualisasi bilah persentase jumlah akun di masing-masing tahap.
- **Recent Activities Feed:** Catatan aktivitas lapangan terkini beserta koordinat lokasi GPS dan ringkasan AI.

### 4.2 Sales Pipeline (Kanban Board & List View)
Mengelola pergerakan prospek dari kualifikasi awal hingga penutupan:
- **5 Tahapan Standar Penjualan B2B:**
  1. `Prospect` (Probabilitas 20%): Kualifikasi awal & penemuan kebutuhan.
  2. `Meeting` (Probabilitas 50%): Presentasi produk, demo, atau kunjungan langsung.
  3. `Negotiation` (Probabilitas 80%): Penawaran komersial dan finalisasi kontrak.
  4. `Closing Won` (Probabilitas 100%): Kesepakatan berhasil dan kontrak ditandatangani.
  5. `Closing Lost` (Probabilitas 0%): Didiskualifikasi atau beralih ke kompetitor.
- **Ergonomi Sentuh Mobile (Mobile-First Touch Targets):**
  - Seluruh tombol kontrol kartu kanban (geser tahap mundur/maju, telepon, WhatsApp) memiliki area sentuh minimal **36x36 piksel** (`min-w-[36px] min-h-[36px] p-2`) agar nyaman ditekan jempol pada layar smartphone berukuran 360px – 390px.
  - Menu pemilihan tahap langsung via dropdown cepat.
- **Pencarian & Pemfilteran:** Pencarian teks bebas (nama perusahaan, PIC, kota) dan filter lead score (`Hot`, `Warm`, `Cold`).

### 4.3 AI Lead Finder & Enrichment
Modul prospeksi terintegrasi ala Apollo.io yang disesuaikan dengan pasar B2B Indonesia:
- **AI Prospecting Search Bar:**
  - Input pencarian cerdas dengan rekomendasi kata kunci: *"Manufaktur di Medan"*, *"Klinik Kecantikan Jakarta"*, *"Distributor F&B Surabaya"*, *"Logistik & Cold Chain"*, *"Fintech & Payment Gateway"*.
- **Animasi Pemindaian & Pengayaan AI (3-Step Scan):**
  1. *Memindai direktori B2B & profil perusahaan...*
  2. *Memperkaya profil decision maker & memverifikasi direct dial/email...*
  3. *Menghitung AI Match Score & estimasi potensi nilai deal...*
- **Data Prospek Terverifikasi:**
  - Monogram/Inisial Perusahaan.
  - Nama Decision Maker dan Jabatan Terverifikasi (Direktur Operasional, Purchasing Manager, dll.).
  - Nomor Telepon Direct & Alamat Email Korporat.
  - Skor Kecocokan AI (*AI Match Score*, e.g., 96% High Intent).
  - Estimasi Ukuran Pasar/Deal (e.g., Rp 135.000.000) dan jumlah karyawan.
  - AI Strategic Insights mengenai kebutuhan bisnis terkini.
- **Filter Sekunder:**
  - Filter Industri.
  - Filter Rentang Nilai Deal (`All Values`, `> Rp 50 Juta`, `> Rp 100 Juta`).
- **1-Click Import ke Pipeline:** Tombol satu klik yang langsung memasukkan prospek terpilih ke dalam database lokal dan Cloud Database, ditandai dengan lencana *"In Pipeline"*.

### 4.4 Field Activities, GPS Check-In & AI Meeting Summarizer
Alat bantu kunjungan lapangan bagi Account Manager:
- **Pencatatan Koordinat GPS Real-Time:**
  - Menggunakan HTML5 Geolocation API (`navigator.geolocation.getCurrentPosition`) dengan mode akurasi tinggi (`enableHighAccuracy: true`).
  - Indikator status visual **"GPS Locked"** berwarna hijau saat koordinat berhasil didapatkan.
  - Integrasi tautan langsung untuk melihat lokasi di Google Maps.
  - Preset lokasi cepat untuk kawasan bisnis utama (SCBD Jakarta, Kuningan, Surabaya CBD).
- **Alur Kerja Peringkasan AI yang Natural:**
  - Tombol **"Generate AI Action Items"** diposisikan tepat di bawah textarea *"Raw Field Notes"*, menciptakan alur kerja yang intuitif: menulis catatan $\rightarrow$ menekan tombol AI $\rightarrow$ memeriksa hasil ringkasan.
- **Server-Side AI Processing:**
  - Endpoint `/api/ai/summarize-notes` memproses catatan via Gemini API (`gemini-3.8-flash`) dengan *timeout guard* (4 detik).
  - *Intelligent Fallback Engine*: Jika kuota API habis atau server offline, algoritma heuristik internal tetap menghasilkan ringkasan eksekutif dan *Action Items* terstruktur tanpa error.

### 4.5 Quick Lead Input & WhatsApp Quick Reach
- **Quick Lead Modal:** Formulir cepat untuk memasukkan prospek baru saat berada di lapangan (Nama perusahaan, PIC, telepon, industri, kota, estimasi nilai deal, lead score, dan tanggal tindak lanjut).
- **WhatsApp Quick Reach Generator:**
  - **Pembersihan Nomor Otomatis (`cleanPhoneNumber`):** Mengonversi nomor lokal (cth: `0812...`) menjadi format internasional resmi (`628...`) bebas spasi dan tanda hubung.
  - **Pratinjau Nomor Terverifikasi:** Menampilkan kartu verifikasi format sebelum pengguna membuka WhatsApp, memastikan nomor siap dihubungi via `https://wa.me/628...`.
  - **Template Pesan Profesional B2B:**
    1. *Intro & Connect* (Perkenalan pembuka)
    2. *Meeting Confirmation* (Konfirmasi jadwal rapat)
    3. *Proposal Follow-up* (Tindak lanjut penawaran komersial)
    4. *Quick Check-in* (Sapaan pemeliharaan relasi akun)

### 4.6 Offline Caching & AR Cloud Sync Engine
Jantung dari arsitektur *offline-first* AR CRM:
- **Optimistic UI:** Saat pengguna menambah lead, memperbarui tahap, atau mencatat check-in, UI langsung diperbarui seketika dan data disimpan ke `localStorage`.
- **Status Sinkronisasi Transparan:** Tiap entitas memiliki status `_syncStatus`:
  - `synced`: Tersimpan identik di Google Sheets cloud.
  - `pending_insert`: Tersimpan lokal, menunggu koneksi untuk dikirim ke cloud.
  - `pending_update`: Perubahan tahap/data belum tersinkronisasi ke cloud.
- **Background Queue Processing:**
  - `CrmSyncEngine` memantau event `window.addEventListener('online')`.
  - Saat koneksi online kembali, antrean mutasi dieksekusi secara sekuensial ke endpoint `/api/gas-proxy`.
  - ID sementara (`TEMP-LEAD-xxx`) secara otomatis digantikan dengan ID resmi server (`LEAD-xxx`), termasuk memperbarui relasi foreign key pada tabel aktivitas.
- **Simulasi Mode Offline:** Tersedia tombol simulasi offline pada bilah atas (*Top App Bar*) untuk menguji perilaku aplikasi tanpa harus mematikan koneksi internet perangkat.

---

## 5. SKEMA DATABASE & SPESIFIKASI REST API

Backend menggunakan Google Sheets Spreadsheet bernama **`Personal CRM Data`** yang dikendalikan oleh Google Apps Script (`Code.gs` v2.0).

### 5.1 Skema Tabel Google Sheets

#### 1. Tabel `Leads` (Sheet: `Leads`)
Menyimpan data master prospek dan status kesepakatan penjualan.
| No | Nama Kolom | Tipe Data | Deskripsi & Contoh |
| :---: | :--- | :--- | :--- |
| 1 | `id` | String (Primary Key) | Format `LEAD-xxx` (e.g., `LEAD-101`) |
| 2 | `company_name` | String | Nama resmi perusahaan klien (e.g., `PT Nusantara Logistics`) |
| 3 | `contact_person` | String | Nama person in charge / pembuat keputusan (e.g., `Budi Santoso`) |
| 4 | `phone` | String | Nomor telepon (e.g., `+6281234567890`) |
| 5 | `industry` | String | Sektor industri (e.g., `Logistics & Supply Chain`) |
| 6 | `city` | String | Kota domisili klien (e.g., `Jakarta`) |
| 7 | `pipeline_stage` | Enum String | `Prospect`, `Meeting`, `Negotiation`, `Closing Won`, `Closing Lost` |
| 8 | `deal_value` | Number (IDR) | Nilai kesepakatan dalam Rupiah (e.g., `45000000`) |
| 9 | `next_followup_date` | String (ISO Date) | Format `YYYY-MM-DD` (e.g., `2026-10-25`) |
| 10 | `lead_score` | Enum String | `Hot`, `Warm`, `Cold` |
| 11 | `created_at` | String (ISO Timestamp)| Waktu pembuatan record (e.g., `2026-10-20T08:00:00Z`) |
| 12 | `updated_at` | String (ISO Timestamp)| Waktu pembaruan terakhir (e.g., `2026-10-24T14:30:00Z`) |

#### 2. Tabel `Activities` (Sheet: `Activities`)
Menyimpan riwayat interaksi, kunjungan lapangan, dan check-in GPS.
| No | Nama Kolom | Tipe Data | Deskripsi & Contoh |
| :---: | :--- | :--- | :--- |
| 1 | `id` | String (Primary Key) | Format `ACT-xxx` (e.g., `ACT-201`) |
| 2 | `lead_id` | String (Foreign Key) | Relasi ke `Leads.id` (e.g., `LEAD-101`) |
| 3 | `activity_type` | String | `Meeting Check-In`, `Phone Call`, `WhatsApp Message`, dll. |
| 4 | `notes` | String (Text) | Catatan mentah lapangan yang diketik oleh AM |
| 5 | `ai_summary` | String (Text) | Ringkasan terstruktur dan *Action Items* hasil Gemini AI |
| 6 | `location_gps` | String (Coordinates) | Latitude & Longitude (e.g., `-6.223100, 106.829100`) |
| 7 | `created_at` | String (ISO Timestamp)| Waktu check-in / aktivitas disimpan |

#### 3. Tabel `Global_Leads` (Sheet: `Global_Leads`)
Menyimpan katalog prospek korporat B2B yang dapat diimpor ke pipeline.
| No | Nama Kolom | Tipe Data | Deskripsi & Contoh |
| :---: | :--- | :--- | :--- |
| 1 | `id` | String (Primary Key) | Format `GL-xxx` (e.g., `GL-1`) |
| 2 | `company_name` | String | Nama perusahaan target prospek |
| 3 | `contact_person` | String | Nama kontak eksekutif target |
| 4 | `phone` | String | Nomor telepon kantor atau direct line |
| 5 | `industry` | String | Industri sasaran |
| 6 | `city` | String | Wilayah operasional |
| 7 | `estimated_value` | Number (IDR) | Perkiraan potensi nilai deal tahunan |
| 8 | `tags` | String (JSON Array) | Tagging segmen (e.g., `["High Growth", "Logistics 4.0"]`) |

---

### 5.2 Spesifikasi Endpoint Google Apps Script (`Code.gs` v2.0)

Google Apps Script dipublikasikan sebagai Web App dengan izin akses *"Anyone"*. Permintaan diarahkan melalui aksi (*action routing*):

#### A. Operasi Baca (HTTP GET)
Semua panggilan GET dikirim ke URL Web App dengan parameter query `?action=<action_name>`.

1. **`getLeads`**
   - **Method:** `GET`
   - **Query:** `?action=getLeads`
   - **Output:** Array of objects data prospek dari sheet `Leads`.
   ```json
   [
     {
       "id": "LEAD-101",
       "company_name": "PT Nusantara Logistics",
       "contact_person": "Budi Santoso",
       "phone": "+6281234567890",
       "industry": "Logistics & Supply Chain",
       "city": "Jakarta",
       "pipeline_stage": "Meeting",
       "deal_value": 45000000,
       "next_followup_date": "2026-10-25",
       "lead_score": "Hot",
       "created_at": "2026-10-22T08:00:00.000Z",
       "updated_at": "2026-10-24T10:00:00.000Z"
     }
   ]
   ```

2. **`getActivities`**
   - **Method:** `GET`
   - **Query:** `?action=getActivities`
   - **Output:** Array of objects riwayat aktivitas dari sheet `Activities`.

3. **`getGlobalLeads`**
   - **Method:** `GET`
   - **Query:** `?action=getGlobalLeads`
   - **Output:** Array of objects direktori B2B dari sheet `Global_Leads`.

#### B. Operasi Tulis / Mutasi (HTTP POST)
Panggilan POST dikirim dengan format JSON stringified pada body (atau `Content-Type: text/plain` guna menghindari preflight CORS di lingkungan tertentu).

1. **`addLead`**
   - **Payload:**
     ```json
     {
       "action": "addLead",
       "company_name": "PT Semen Perkasa",
       "contact_person": "Agus Salim",
       "phone": "+6281233445566",
       "industry": "Manufacturing & Building",
       "city": "Gresik",
       "pipeline_stage": "Prospect",
       "deal_value": 75000000,
       "next_followup_date": "2026-10-28",
       "lead_score": "Hot"
     }
     ```
   - **Response:**
     ```json
     { "status": "success", "id": "LEAD-105", "message": "Lead added successfully" }
     ```

2. **`updateLeadStage`**
   - **Payload:**
     ```json
     {
       "action": "updateLeadStage",
       "id": "LEAD-101",
       "pipeline_stage": "Negotiation",
       "next_followup_date": "2026-10-27"
     }
     ```
   - **Response:**
     ```json
     { "status": "success", "id": "LEAD-101", "message": "Stage updated" }
     ```

3. **`addActivity`**
   - **Payload:**
     ```json
     {
       "action": "addActivity",
       "lead_id": "LEAD-101",
       "activity_type": "Meeting Check-In",
       "notes": "Pertemuan di kantor pusat membicarakan addendum kontrak.",
       "ai_summary": "• Rapat addendum selesai.\n• Action: Kirim draf revisi besok.",
       "location_gps": "-6.223100, 106.829100"
     }
     ```
   - **Response:**
     ```json
     { "status": "success", "id": "ACT-203", "message": "Activity recorded" }
     ```

4. **`importGlobalLead`**
   - **Payload:** Mengirim data prospek direktori untuk langsung dimasukkan ke sheet `Leads`.
   - **Response:**
     ```json
     { "status": "success", "id": "LEAD-106", "message": "Global lead imported" }
     ```

---

## 6. ARSITEKTUR NATIVE ANDROID (KOTLIN & JETPACK COMPOSE)

Selain aplikasi web PWA, proyek ini menyertakan cetak biru arsitektur native Android lengkap yang terdokumentasi di modul teknis (`src/data/androidKotlinCode.ts`):

1. **UI Layer (Jetpack Compose & Material 3):**
   - Implementasi `PipelineKanbanScreen.kt` dengan bilah horizontal gulir lancar (`horizontalScroll`), kartu kanban responsif, badge jumlah deal, dan penanganan klik intent dialer/WhatsApp.
2. **Local Persistence Layer (Room SQLite):**
   - `LeadEntity.kt` & `ActivityEntity.kt`: Struktur tabel lokal dengan kolom status sinkronisasi (`SYNCED`, `PENDING_INSERT`, `PENDING_UPDATE`).
   - `CrmDao.kt`: Data Access Object dengan reactive Kotlin Coroutines `Flow` untuk *zero-latency local UI rendering*.
3. **Remote Networking Layer (Retrofit 2 & OkHttp):**
   - `CrmApiService.kt`: Antarmuka HTTP client yang memetakan seluruh operasi GET/POST Google Apps Script.
4. **Background Synchronization (WorkManager):**
   - `SyncWorker.kt`: CoroutineWorker terjadwal yang otomatis berjalan di latar belakang saat Android mendeteksi koneksi jaringan aktif (`NetworkType.CONNECTED`), mengeksekusi antrean mutasi tertunda tanpa menguras baterai.
5. **Location Services:**
   - Menggunakan Google Play Services `FusedLocationProviderClient` untuk mendapatkan koordinat presisi tinggi saat check-in lapangan.

---

## 7. STATUS DEPLOYMENT & VERIFIKASI TEKNIS

### 7.1 Status Deployment Aktif
- **GAS Web App URL (Live):**  
  `https://script.google.com/macros/s/AKfycbx5SNAUvM2MOW9X62M9uzs2bw6bM19-us57r0X10GZYEU5wBd_ajXDDPCAm6M82wkzO/exec`
- **Express Proxy Gateway:**  
  Rute `/api/gas-proxy` berjalan di server Node.js lokal port 3000, mem-bypass limitasi CORS browser dan secara otomatis mengikuti *302 redirect* khas Google Apps Script.
- **AI Meeting Summarizer Endpoint:**  
  Rute `/api/ai/summarize-notes` aktif menggunakan Gemini SDK dan teruji dengan *automatic fallback*.

### 7.2 Hasil Verifikasi Pengujian (Unit Tests)
Pengujian otomatis menggunakan test runner native `node:test` (`tsx --test src/**/*.test.ts`):
- `aiLeadEnrichment.test.ts`: **PASSED** (Validasi kecocokan token pencarian industri, boost relevansi kota, dan fallback sintesis prospek dinamis).
- `crmCalculations.test.ts`: **PASSED** (Validasi kalkulasi Total Pipeline, Closed Won, Weighted Probability, win rate, kategorisasi tanggal follow-up, serta pembersihan nomor telepon WhatsApp internasional).
- `syncQueue.test.ts`: **PASSED** (Validasi antrean mutasi *offline-first*, optimistik ID swap, dan pemulihan antrean).
- **Hasil Akhir:** **11 dari 11 Unit Tests Lulus 100%**.

---

## 8. ROADMAP & LANGKAH OPTIMALISASI SELANJUTNYA

Berdasarkan fondasi solid yang telah dibangun, langkah-langkah peningkatan berikutnya meliputi:

1. **Batching Mutation Queue pada Google Apps Script:**
   - Menggabungkan beberapa mutasi lokal menjadi satu request payload (`action: "batchSync"`) untuk memangkas *round-trip latency* dan menghemat kuota eksekusi Google Apps Script (maksimum 6 menit per eksekusi).
2. **Push Notifications & Google Calendar Sync:**
   - Menghubungkan pengingat jadwal follow-up ke Google Calendar AM atau menggunakan Web Push Notification API untuk mengirim notifikasi peringatan di pagi hari (pukul 08:00) mengenai daftar klien yang harus dihubungi hari itu.
3. **Biometric App Lock (Keamanan Data Sales):**
   - Menambahkan penguncian biometrik lokal (WebAuthn / Fingerprint sensor pada Android) sebelum membuka pipeline CRM guna melindungi kerahasiaan data prospek dan nilai komersial saat perangkat dipinjamkan.
4. **Export Laporan Eksekutif (Excel / PDF):**
   - Menambahkan fitur ekspor rekapitulasi performa kuartalan (Q1-Q4) ke format Excel atau dokumen PDF siap cetak untuk keperluan pelaporan komisi atau evaluasi manajemen.
5. **Pencadangan Otomatis Cadangan Database:**
   - Menambahkan rutinitas berkala di Google Sheets untuk membuat snapshot salinan cadangan (*versioned backup sheet*) setiap akhir pekan secara otomatis.

---
*Dokumen ini merupakan catatan arsitektur resmi proyek AR Personal CRM Enterprise. Seluruh spesifikasi bersumber langsung dari implementasi kode sumber aktif.*
