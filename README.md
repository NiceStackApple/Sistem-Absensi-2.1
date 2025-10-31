# 🤖 Aplikasi Absensi Online Robotic (Template)

Ini adalah template lengkap untuk sistem absensi online yang dibangun menggunakan Google Sheets, Apps Script, dan Vercel.

Sistem ini awalnya dibuat untuk klub robotik, namun bisa diadaptasi untuk kelas atau organisasi apa pun.

## 🚀 Fitur Lengkap

* **Login Siswa & Admin:** Sistem membedakan akun siswa dan admin (password admin harus mengandung `@DM1N`).
* **Dashboard Siswa:** Menampilkan status absensi, riwayat, dan "Streak" (kehadiran beruntun).
* **Absensi Hadir (3 Lapis Keamanan):**
    1.  Scan QR Code (kunci rahasia).
    2.  Validasi Lokasi (Geotagging) untuk memastikan siswa ada di radius yang ditentukan.
    3.  **Bukti Selfie:** Siswa wajib mengambil selfie setelah scan QR sebagai bukti kehadiran.
* **Pengajuan Izin/Sakit:** Siswa bisa mengajukan izin lengkap dengan **bukti foto** (misal: surat dokter).
* **Database Terpusat:** Semua data absensi, log, dan file bukti disimpan rapi di Google Sheet & Google Drive Anda.
* **Panel Admin (Fitur Baru!):**
    * **Set Pengumuman:** Admin bisa mengatur teks berjalan (running text) di dashboard semua siswa.
    * **Atur Libur Massal:** Admin bisa menandai satu minggu penuh sebagai "Libur" (misal: "Libur Idul Fitri") untuk semua siswa.
    * **Cabut Status:** Admin bisa me-reset status absensi satu minggu penuh untuk semua siswa.
    * **Lihat Rekap Bulanan:** Admin bisa melihat tabel rekap absensi bulanan langsung di dashboard.

## 💻 Tumpukan Teknologi (Tech Stack)

* **Frontend:** HTML, Bootstrap 4, JavaScript (Vanilla JS)
* **Backend:** Google Apps Script (GAS)
* **Database:** Google Sheets
* **Penyimpanan File:** Google Drive
* **Hosting:** Vercel (dengan Vercel Proxy)

---

## ⚠️ PENTING: Cara Setup dan Instalasi

Ikuti langkah-langkah ini dengan teliti.

### Bagian 1: Setup Backend (Google)

1.  **Duplikat Google Sheet:**
    * Klik link ini: **[MASUKKAN LINK DUPLIKAT GOOGLE SHEET LO DI SINI]**
    * Klik "Make a copy". Ini akan menyalin sheet `Master Data`, `Log Absensi`, dan `Template - Absensi Bulanan` ke Google Drive Anda.

2.  **Buat Folder Google Drive:**
    * Buat **DUA** folder baru di Google Drive Anda:
        1.  Folder untuk menampung foto bukti **Izin** (misal: `Bukti Izin Absensi`).
        2.  Folder untuk menampung foto selfie bukti **Hadir** (misal: `Bukti Hadir Absensi`).
    * Salin **ID** dari kedua folder tersebut. (ID ada di URL, contoh: `.../folders/`**`123ABCxyz-INI-ID-FOLDER-ANDA`**)

3.  **Buka Editor Apps Script:**
    * Buka file Google Sheet yang baru saja Anda duplikat (dari Langkah 1).
    * Klik menu **Extensions** > **Apps Script**. Ini akan membuka editor script yang terikat dengan sheet Anda.

4.  **Salin Kode Backend:**
    * Hapus semua kode contoh yang ada di file `kode.gs`.
    * Copy-paste **seluruh isi file `kode.gs`** dari repositori ini ke dalam editor Apps Script tersebut.

5.  **Edit Konfigurasi (WAJIB):**
    * Di dalam editor Apps Script, cari bagian `const CONFIG = { ... }` di bagian atas.
    * **Ganti nilai-nilai berikut** dengan ID Anda:
        * `DRIVE_FOLDER_ID`: Ganti dengan ID folder **Bukti Izin** Anda (dari Langkah 2).
        * `DRIVE_HADIR_FOLDER_ID`: Ganti dengan ID folder **Bukti Hadir** Anda (dari Langkah 2).
        * `QR_SECRET_KEY`: Ganti dengan teks rahasia Anda sendiri. (Contoh: `"RAHASIA-KELAS-SAYA-2025"`). Ini adalah teks yang akan Anda jadikan QR Code.

6.  **Edit Lokasi (WAJIB):**
    * Cari fungsi `markHadirViaQR` (sekitar baris 197).
    * **Ganti nilai Lintang, Bujur, dan Radius** sesuai lokasi Anda:
        * `TARGET_LAT`: Ganti dengan Lintang (Latitude) lokasi Anda. (Dapatkan dari Google Maps).
        * `TARGET_LON`: Ganti dengan Bujur (Longitude) lokasi Anda.
        * `MAX_DISTANCE_METERS`: Atur radius toleransi (misal: `100` untuk 100 meter).

7.  **Deploy Apps Script:**
    * Klik tombol **Deploy** > **New deployment**.
    * Pilih "Type" ⚙️ sebagai **Web app**.
    * Pada "Who has access", pilih **Anyone**.
    * Klik **Deploy**.
    * **PENTING:** Salin **Web app URL** yang muncul (yang berakhiran `/exec`).

### Bagian 2: Setup Frontend (Vercel)

1.  **Fork/Clone Repositori Ini:**
    * Buat repositori GitHub baru Anda sendiri, lalu upload semua file dari template ini (termasuk `index.html` yang Anda ganti dari `cadangan.html`).

2.  **Buat File Proxy Vercel (WAJIB):**
    * Di dalam folder proyek Anda (di komputer lokal), buat file baru bernama `vercel.json`.
    * Isi file tersebut dengan kode berikut:
    ```json
    {
      "rewrites": [
        {
          "source": "/api/gas-proxy",
          "destination": "URL_WEB_APP_GAS_ANDA"
        }
      ]
    }
    ```

3.  **Edit File Proxy:**
    * Ganti teks `URL_WEB_APP_GAS_ANDA` di dalam file `vercel.json` dengan **Web app URL** yang Anda dapatkan dari **Bagian 1 Langkah 7**.

4.  **Deploy ke Vercel:**
    * Push proyek Anda (termasuk `index.html`, `kode.gs`, `README.md`, dan `vercel.json`) ke GitHub.
    * Buka Vercel, impor repositori GitHub Anda.
    * Vercel akan otomatis mendeteksi ini sebagai proyek statis dan mendeploy-nya.

### Bagian 3: Setup Selesai

1.  **Buat QR Code:**
    * Buatlah QR Code dari teks **`QR_SECRET_KEY`** yang Anda buat di **Bagian 1 Langkah 5**. Anda bisa pakai website generator QR Code gratis.
2.  **Data Siswa:**
    * Isi data siswa dan password di sheet `Master Data` di Google Sheet Anda.
3.  **Login Admin:**
    * Untuk login sebagai Admin, pastikan password Anda di `Master Data` mengandung teks `@DM1N` (contoh: `adminpassword@DM1N`).

---

## 🤝 Kontribusi

Merasa ada yang bisa diperbaiki? Silakan lakukan Pull Request.

## 📄 Lisensi

Proyek ini menggunakan lisensi MIT.
