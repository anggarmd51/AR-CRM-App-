# Checkpoint Rules Production AR CRM

Target yang disetujui pemilik: `ar-crm-73222/(default)` saja.

`firestore.approved.rules` adalah payload yang dipublikasikan melalui Firebase Console pada 1 November 2026 pukul 00:44 WIB. SHA256: `357eca226d04d7b205d9f8b4af68f20272de9b29f7730c09ffa36b01917f1266`. File ini berukuran 10.379 byte, lulus 6/6 tes emulator demo, dan salinan seluruh editor setelah reload dari server identik dengan file yang disetujui.

`firestore.prepublish-backup.rules` adalah backup exact sebelum publikasi, 5.543 byte, SHA256 `2c5e37c802dbddcf1baf0baca09637c6f6385024a13da8e9842348da1bdcd221`. Versi ini tetap ada di histori Console bertanggal 26 Oktober 2026 pukul 07:16 WIB, sehingga dapat dipilih kembali jika rollback diperlukan.

Publikasi ini tidak membuat, mengubah, atau menghapus data sales. Policy owner/workspace tetap dibatasi; hard-delete tetap ditolak. Perubahan fungsional terbatas pada field opsional aktivitas AI/GPS dan arsip Won sesuai payload yang disetujui.

Ini adalah rekaman konfigurasi aktif, bukan instruksi untuk menerapkan Rules lain. Jangan menganggap file `firestore.rules` di root otomatis sama dengan konfigurasi live. Publikasi atau perluasan akses di luar hash ini memerlukan persetujuan tersendiri. Artefak ops ini dikecualikan dari upload runtime Vercel.
