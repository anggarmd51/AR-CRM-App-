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

Arsip disimpan di `workspaces/{workspaceId}/wonDealArchives/{leadId}`. `src/firebaseRepository.ts` membuat perubahan stage dan arsip dalam satu transaksi Firestore; arsip mengikuti transisi baru ke `Closing Won`, bukan penulisan arsip bebas.

Rules di `firestore.rules` membatasi arsip ke owner workspace dan field yang diizinkan. Saat create, lead yang sama harus sudah ada dan sebelumnya belum `Closing Won`; `getAfter()` harus menunjukkan lead tersebut menjadi `Closing Won` dengan owner/role yang benar, sementara identitas dan nilai transaksi arsip harus cocok dengan lead setelah transaksi. Arsip harus memiliki ID/`lead_id` lead yang sama, tanggal won valid, dan timestamp `archived_at`. Client tidak boleh mengubah atau menghapus arsip (`allow update, delete: if false`).

Kasus transisi sah, arsip ganda, perubahan, dan penghapusan diuji pada `firestore.rules.test.ts` dengan Firestore Rules Emulator. Jalankan `npm run test:firestore` untuk audit ulang emulator lokal.
