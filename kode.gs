// ============================================
// KONFIGURASI//
// ============================================
// kode.gs (Apps Script) — gunakan ContentService untuk JSON murni
function doGet(e) {
  const resp = { status: "success", message: "API Absensi Robotic Aktif. Gunakan metode POST untuk mengirim data." };
  return ContentService
    .createTextOutput(JSON.stringify(resp))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    let data = {};

    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch {
        data = e.parameter;
      }
    }

    Logger.log("Body diterima: " + JSON.stringify(data));

    // sisanya biarkan sama (switch action dst)


    let result;

    switch (data.action) {
      case "authenticateUser":
        result = authenticateUser(data.nama, data.password);
        break;
      case "getDashboardData":
        result = getDashboardData(data.nama, data.kelas);
        break;
      case "markHadirViaQR":
        result = markHadirViaQR(data.nama, data.kelas, data.qrCodeData, data.latitude, data.longitude, data.imageData); 
        break;
      case "markIzinFromDashboard":
        result = markIzinFromDashboard(data.nama, data.kelas, data.alasan, data.imageData);
        break;
        // ... [di dalam switch (data.action)] ...
      case "markIzinFromDashboard":
        result = markIzinFromDashboard(data.nama, data.kelas, data.alasan, data.imageData);
        break;
      
      // TAMBAHAN BARU
      case "setHolidayStatus":
        result = setHolidayStatus(data.nama, data.alasanLibur, data.targetWeek); // <-- Baru
        break;
      case "revokeHolidayStatus":
        result = revokeHolidayStatus(data.nama, data.targetWeek); // <-- Baru
        break;
      case "getMonthlySheetData":
        result = getMonthlySheetData();
        break;
      case "setRunningText":
        result = setRunningText(data.nama, data.text);
        break;
      // AKHIR TAMBAHAN
      default:
        result = { success: false, message: "Aksi tidak dikenali" };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: "Server Error",
        detail: err.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}





const CONFIG = {
  MASTER_SHEET: "Master data",
  LOG_SHEET: "Log Absensi",
  QR_SECRET_KEY: "ABSENSI-ROBOTIC-06102025",
  DRIVE_FOLDER_ID: "1dbS9ZchAlOKUxyseTfNnaeklpVzNOddh",
  TEMPLATE_SHEET: "Template - Absensi Bulanan",
  DRIVE_HADIR_FOLDER_ID: "1UVOKVZj-AniWhHokyQ9RFKyuQEWDNIsY"
};

// ============================================
// FUNGSI BANTUAN
// ============================================
// GANTI TOTAL FUNGSI INI
function isAttendanceWindowOpen() {
  const now = new Date(); // <-- Pakai 'now'
  const day = now.getDay();
  const hour = now.getHours(); // 0-23

  //Cek apakah hari Sabtu DAN jam 8:00 pagi (8) sampai 15:59 sore (sebelum 16)
  if (day === 6 && hour >= 8 && hour < 16) {
    return true; // JENDELA DIBUKA
  }
  return false; // JENDELA DITUTUP
}

// GANTI TOTAL FUNGSI INI
function getCurrentWeekNumber() {
  const now = new Date(); // <-- Pakai 'now'
  const dayOfMonth = now.getDate();
  if (dayOfMonth <= 7) return 1;
  if (dayOfMonth <= 14) return 2;
  if (dayOfMonth <= 21) return 3;
  if (dayOfMonth <= 28) return 4; // Sampai tanggal 28
  return 5; // Tanggal 29 ke atas masuk minggu 5
}
function getWeekOfMonth(date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  return Math.ceil((date.getDate() + firstDay.getDay()) / 7);
}
// ... [di bawah fungsi getWeekOfMonth] ...
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius bumi dalam km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Jarak dalam km
  return distance * 1000; // Kembalikan dalam meter
}
///////////////////////////////////////////////////////////////////////////////////
// --- FUNGSI BARU UNTUK MENGHITUNG STREAK --- ////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
// GANTI TOTAL FUNGSI calculateStreak DENGAN VERSI DEBUG INI
function calculateStreak(nama, kelas) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName(CONFIG.LOG_SHEET);
    if (!logSheet || logSheet.getLastRow() < 2) {
      Logger.log(`calculateStreak (${nama}): Log sheet kosong atau tidak ditemukan.`);
      return 0; // Belum ada log, streak 0
    }

    const allLogData = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 4).getValues(); // Kolom A-D

    let streak = 0;
    let foundCurrentWeekEntry = false;
    let lastSaturdayTimestamp = null; // Untuk cek jeda minggu

    Logger.log(`calculateStreak (${nama}): Mulai menghitung dari ${allLogData.length} log.`);

    // Looping dari log TERBARU ke terlama
    for (let i = allLogData.length - 1; i >= 0; i--) {
      const row = allLogData[i];
      const logTimestamp = new Date(row[0]);
      const logNama = row[1];
      const logKelas = row[2];
      const logStatus = row[3].toString().trim();
      const logDay = logTimestamp.getDay(); // 0=Minggu, 6=Sabtu

      // Hanya proses log milik user ini
      if (logNama === nama && logKelas === kelas) {
          Logger.log(` -> Cek log ke-${i}: [${Utilities.formatDate(logTimestamp, "Asia/Jakarta", "yyyy-MM-dd HH:mm")}] Status: "${logStatus}", Hari: ${logDay}`);

          // Hanya proses jika log terjadi di hari Sabtu
          if (logDay === 6) {
              // Cek apakah ini Sabtu berturut-turut (jarak <= 7 hari dari Sabtu terakhir)
              if (lastSaturdayTimestamp && (lastSaturdayTimestamp.getTime() - logTimestamp.getTime()) > 7 * 24 * 60 * 60 * 1000) {
                 Logger.log(`    -> Jeda lebih dari 7 hari terdeteksi. Streak berhenti di ${streak}.`);
                 break; // Berhenti jika jeda antar Sabtu terlalu jauh
              }
              lastSaturdayTimestamp = logTimestamp; // Update Sabtu terakhir yang valid

              // Logika perhitungan streak
              if (logStatus.startsWith("Hadir")) { // <-- Cek awalan "Hadir"
                  streak++;
                  foundCurrentWeekEntry = true;
                  Logger.log(`    -> Hadir! Streak jadi ${streak}.`);
              } else if (logStatus === "Izin" || (logStatus.startsWith("(") && logStatus.includes("https://drive.google.com"))) { // <-- Cek "Izin" ATAU format "(..., link)"
                  streak--;
                  foundCurrentWeekEntry = true;
                  if (streak < 0) streak = 0;
                  Logger.log(`    -> Izin. Streak jadi ${streak}.`);
              } else if (logStatus.toLowerCase().includes("libur") || logStatus.toLowerCase().includes("acara")) {
                  foundCurrentWeekEntry = true;
                  Logger.log(`    -> Libur/Acara. Streak tetap ${streak}. Lanjut cek minggu sebelumnya.`);
                  continue;
              } else {
                  // Alpha, "-", Status Dicabut, dll.
                  Logger.log(`    -> Status tidak valid ("${logStatus}"). Cek kondisi reset.`);
                  if (foundCurrentWeekEntry) {
                      Logger.log(`    -> Minggu sebelumnya tidak valid tapi minggu ini/terakhir valid. Streak berhenti di ${streak}.`);
                      break;
                  } else {
                      Logger.log(`    -> Data terbaru tidak valid. Streak direset jadi 0.`);
                      streak = 0;
                      break;
                  }
              }
          } else {
             Logger.log(`    -> Bukan hari Sabtu, dilewati.`);
          }
      } // Akhir cek user

    } // Akhir loop

    Logger.log(`calculateStreak (${nama}): Perhitungan selesai. Final Streak: ${streak}`);
    return streak;

  } catch (error) {
    Logger.log(`Error calculateStreak for ${nama}: ${error.message}`);
    return 0; // Return 0 jika ada error
  }
}
// ============================================
// TITIK MASUK WEB APP (API DENGAN CORS HEADER)
// ============================================
// ============================================
// TITIK MASUK WEB APP (SEBAGAI API)
// ============================================


// --- PASTIKAN SEMUA FUNGSI LAIN (authenticateUser, getDashboardData, dll.) MASIH ADA DI BAWAH SINI ---

// GANTI FUNGSI LAMA KAMU DENGAN YANG INI
// GANTI TOTAL FUNGSI LAMA KAMU DENGAN YANG INI
function getDashboardData(nama, kelas) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
// --- TAMBAHAN BARU ---
    const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
    if (!masterSheet) {
      return { success: false, message: "Sheet Master data tidak ditemukan." };
    }
    // Ambil teks dari F1. Jika kosong, isi string kosong.
    const runningText = masterSheet.getRange("F1").getValue().toString() || "";
    // --- AKHIR TAMBAHAN ---
// =======================================================
    // BAGIAN 1: Ambil data dari "Log Absensi" (VERSI BARU - LOOP MUNDUR)
    // =======================================================
    const logSheet = ss.getSheetByName(CONFIG.LOG_SHEET);
    if (!logSheet) {
      return { success: false, message: "Sheet log absensi tidak ditemukan." }; 
    }

    const last10 = [];
    let currentStatus = "-";
    const monthNow = Utilities.formatDate(new Date(), "Asia/Jakarta", "MMMM yyyy");

    if (logSheet.getLastRow() >= 2) {
      // Ambil SEMUA data, tapi buang header
            // Ambil SEMUA data log, mulai baris 2
      const allLogData = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 5).getValues();

      // Looping dari baris terakhir (paling baru) ke atas
      for (let i = allLogData.length - 1; i >= 0; i--) {
        const row = allLogData[i];
        const logNama = row[1];
        const logKelas = row[2];

        // Cek apakah log ini milik user yang sedang login
        if (logNama === nama && logKelas === kelas) {
          
          // Ambil status terbaru (ini yang pertama kali kita temui)
          if (currentStatus === "-") {
            currentStatus = row[3];
          }

          // Kumpulkan 10 riwayat
          if (last10.length < 10) {
            last10.push({
              timestamp: Utilities.formatDate(new Date(row[0]), "Asia/Jakarta", "dd/MM/yyyy HH:mm"),
              status: row[3],
              location: row[4] || "-"
            });
          }
        }
        
        // Jika kita sudah dapat 10 riwayat, berhenti looping
        // (Kita tidak perlu status terbaru karena kita pasti sudah dapat)
        if (last10.length >= 10) {
          break; 
        }
      }
      
    }
    // =======================================================
    // BAGIAN 2: Ambil data dari "Laporan Bulanan" (Untuk Status Mingguan)
    // =======================================================
    const { monthlySheetName } = createMonthlySheetIfNeeded();
    const monthlySheet = ss.getSheetByName(monthlySheetName);
    if (!monthlySheet) {
       return { success: false, message: "Sheet bulanan '" + monthlySheetName + "' tidak ditemukan." };
    }
    
    const namesRange = monthlySheet.getRange("A6:A" + monthlySheet.getLastRow());
    const namesValues = namesRange.getValues();
    let userRow = -1;
    
    // Cari baris user
    for (let i = 0; i < namesValues.length; i++) {
      if (namesValues[i][0] && namesValues[i][0].toString().toLowerCase() === nama.toLowerCase()) {
        userRow = i + 6; // +2 karena range mulai dari baris 2
        break;
      }
    }

    if (userRow === -1) {
      return { success: false, message: "Nama Anda tidak ditemukan di sheet " + monthlySheetName };
    }

    // Ambil status Minggu 1 s/d 4 (Kolom C, D, E, F)
    const weeklyStatusValues = monthlySheet.getRange(userRow, 3, 1, 5).getValues()[0];

    // FUNGSI BANTUAN UNTUK MEMBERSIHKAN STATUS (VERSI BARU)
    const cleanStatus = (s) => {
      if (!s || s.toString().trim() === "") return "-";
      const status = s.toString().trim();
      // --- TAMBAHAN BARU ---
      // Cek dulu apakah diawali "Hadir"
      if (status.startsWith("Hadir")) {
        return "Hadir"; // Langsung return "Hadir"
      }
      // --- AKHIR TAMBAHAN ---
      // Pastikan dia ngecek 'libur' atau 'acara' SEBELUM return 'Izin'
      if (status === "Hadir" || status === "Alpha" || status === "-" || status.toLowerCase().includes("libur") || status.toLowerCase().includes("acara")) {
        return status; // Kembalikan teks asli ("Libur man")
      }
      return "Izin"; // Hanya return "Izin" kalau bukan status di atas
    };

    const monthlyAttendanceData = [
      { week: "Minggu 1", status: cleanStatus(weeklyStatusValues[0]) },
      { week: "Minggu 2", status: cleanStatus(weeklyStatusValues[1]) },
      { week: "Minggu 3", status: cleanStatus(weeklyStatusValues[2]) },
      { week: "Minggu 4", status: cleanStatus(weeklyStatusValues[3]) },
      { week: "Minggu 5", status: cleanStatus(weeklyStatusValues[4]) } // Tambah Minggu 5
    ];

    // =======================================================
    // BAGIAN 3: Kirim datanya
    // =======================================================
    const streakCount = calculateStreak(nama, kelas);
    return {
      success: true,
      message: "Data dashboard berhasil diambil.",
      currentMonth: monthNow,
      currentWeek: "Minggu ke-" + getWeekOfMonth(new Date()),
      currentStatus: currentStatus, // Ini status terbaru dari Log Absensi
      monthlyAttendance: monthlyAttendanceData, // Ini status per minggu dari Laporan Bulanan
      history: last10, // Ini 10 riwayat dari Log Absensi
      runningText: runningText, // Fitur pengumuman running text
      streakCount: streakCount
    };

  } catch (error) {
    return { success: false, message: "Error getDashboardData: " + error.message };
  }
}
// ============================================
// FUNGSI-FUNGSI UTAMA
// ============================================

// FUNGSI YANG HILANG (TARUH DI SINI)
function updateMonthlySheet(nama, kelas, status) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const { monthlySheetName } = createMonthlySheetIfNeeded();
    const monthlySheet = ss.getSheetByName(monthlySheetName);
    if (!monthlySheet) {
      return { success: false, message: "Sheet bulanan '" + monthlySheetName + "' tidak ditemukan." };
    }

    const namesRange = monthlySheet.getRange("A6:A" + monthlySheet.getLastRow());
    const namesValues = namesRange.getValues();
    let userRow = -1;

    // Cari baris user
    for (let i = 0; i < namesValues.length; i++) {
      if (namesValues[i][0] && namesValues[i][0].toString().toLowerCase() === nama.toLowerCase()) {
        userRow = i + 6; // +2 karena range mulai dari baris 2
        break;
      }
    }

    if (userRow === -1) {
      return { success: false, message: "Nama Anda tidak ditemukan di sheet " + monthlySheetName };
    }

    // Tentukan kolom minggu
    const currentWeek = getCurrentWeekNumber();
    let weekColumn = 2 + currentWeek;
    if (weekColumn > 7) weekColumn = 7; // Batasi maksimal di kolom G (Minggu 5)

    // Update status di sel yang benar
    monthlySheet.getRange(userRow, weekColumn).setValue(status);

    return { success: true };
  
  } catch (error) {
    return { success: false, message: "Error updateMonthlySheet: " + error.message };
  }
}
// ===================================
// FUNGSI KHUSUS ADMIN
// ===================================

// ===================================
// FUNGSI KHUSUS ADMIN (VERSI OPTIMIZED)
// ===================================

// GANTI TOTAL FUNGSI setHolidayStatus YANG LAMA DENGAN INI
function setHolidayStatus(adminNama, alasanLibur, targetWeek) { // Tambah parameter targetWeek
  try {
    const now = new Date();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Ambil minggu SEKARANG untuk perbandingan
    const currentWeekNumber = getCurrentWeekNumber();

    // Tentukan tanggal target (untuk menentukan nama sheet bulan ini/depan)
    let targetMonthDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Salin tanggal sekarang
    if (parseInt(targetWeek) < currentWeekNumber) {
      // Jika target minggu lebih kecil dari minggu sekarang, artinya ini untuk bulan depan
      targetMonthDate.setMonth(targetMonthDate.getMonth() + 1);
    }
    // Dapatkan nama sheet target (misal: LAPORAN BULANAN NOVEMBER)
    const targetMonthName = targetMonthDate.toLocaleString('id-ID', { month: 'long' }).toUpperCase();
    const targetYear = targetMonthDate.getFullYear(); // Ambil tahun target
    const targetSheetName = `${targetMonthName} ${targetYear}`; // Format: NOVEMBER 2025

    // Pastikan sheet bulan depan dibuat jika perlu
    // Kita panggil createMonthlySheetIfNeeded DENGAN tanggal target
    const { monthlySheetName } = createMonthlySheetIfNeeded(targetMonthDate);

    // Double check jika createMonthlySheetIfNeeded salah (misal krn tgl 31 Okt)
    if (monthlySheetName !== targetSheetName) {
       const firstDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
       createMonthlySheetIfNeeded(firstDayNextMonth); // Coba paksa buat sheet bulan depan
    }

    const monthlySheet = ss.getSheetByName(targetSheetName); // Gunakan nama sheet target
    const logSheet = ss.getSheetByName(CONFIG.LOG_SHEET);
    if (!monthlySheet || !logSheet) {
        return { success: false, message: `Sheet '${targetSheetName}' atau Log Absensi tidak ditemukan.` };
    }

    let weekColumn = 2 + parseInt(targetWeek); // Kolom target berdasarkan input admin (Minggu 1=C=3, dst.)
    if (weekColumn > 7) weekColumn = 7; // Batasi maksimal di kolom G (Minggu 5)

    const lastRow = monthlySheet.getLastRow();
    // Gunakan baris 6 sebagai awal data siswa
    if (lastRow < 6) {
        return { success: false, message: `Sheet '${targetSheetName}' kosong (tidak ada data siswa).` };
    }

    // Ambil range data siswa dari baris 6 ke bawah
    const numRowsToUpdate = lastRow - 5; // Jumlah baris siswa
    const statusRange = monthlySheet.getRange(6, weekColumn, numRowsToUpdate, 1);
    const namaRange = monthlySheet.getRange(6, 1, numRowsToUpdate, 2);
    const namaValues = namaRange.getValues();

    const newStatuses = [];
    const logEntries = [];
    const timestamp = new Date(); // Timestamp saat admin nge-set

    for (let i = 0; i < namaValues.length; i++) {
      newStatuses.push([alasanLibur]); // Siapkan status baru
      const nama = namaValues[i][0];
      const kelas = namaValues[i][1];
      if (nama && kelas) {
        // Siapkan log (Ganti "Libur/Acara" jadi "Libur")
        logEntries.push([ timestamp, nama, kelas, "Libur", `Di-set oleh admin: ${alasanLibur}` ]);
      }
    }

    // Update sheet Laporan Bulanan
    statusRange.setValues(newStatuses);

    // Update sheet Log Absensi (sekaligus)
    if (logEntries.length > 0) {
      logSheet.getRange(logSheet.getLastRow() + 1, 1, logEntries.length, 5).setValues(logEntries);
    }

    return { success: true, message: `Status untuk Minggu ${targetWeek} di bulan ${targetMonthName} berhasil diubah menjadi: "${alasanLibur}"` };

  } catch (error) {
    Logger.log("Error di setHolidayStatus: " + error.message + " Stack: " + error.stack); // Tambah log error detail
    return { success: false, message: "Error setHolidayStatus: " + error.message };
  }
}

// GANTI TOTAL FUNGSI revokeHolidayStatus YANG LAMA DENGAN INI
function revokeHolidayStatus(adminNama, targetWeek) { // Tambah parameter targetWeek
  try {
    const now = new Date();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Ambil minggu SEKARANG untuk perbandingan
    const currentWeekNumber = getCurrentWeekNumber();

    // Tentukan tanggal target (untuk menentukan nama sheet bulan ini/depan)
    let targetMonthDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Pastikan pakai 'now'
    if (parseInt(targetWeek) < currentWeekNumber) {
      // Jika target minggu lebih kecil dari minggu sekarang, artinya ini untuk bulan depan
      targetMonthDate.setMonth(targetMonthDate.getMonth() + 1);
    }
    // Dapatkan nama sheet target
    const targetMonthName = targetMonthDate.toLocaleString('id-ID', { month: 'long' }).toUpperCase();
    const targetYear = targetMonthDate.getFullYear(); // Ambil tahun target
    const targetSheetName = `${targetMonthName} ${targetYear}`; // Format: NOVEMBER 2025

    // Pastikan sheet bulan depan dibuat jika perlu (panggil fungsi yg sudah diupdate)
    const { monthlySheetName } = createMonthlySheetIfNeeded(targetMonthDate);

    // Double check jika createMonthlySheetIfNeeded salah
    if (monthlySheetName !== targetSheetName) {
       const firstDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
       createMonthlySheetIfNeeded(firstDayNextMonth);
    }

    const monthlySheet = ss.getSheetByName(targetSheetName); // Gunakan nama sheet target
    const logSheet = ss.getSheetByName(CONFIG.LOG_SHEET);
    if (!monthlySheet || !logSheet) {
        return { success: false, message: `Sheet '${targetSheetName}' atau Log Absensi tidak ditemukan.` };
    }

    let weekColumn = 2 + parseInt(targetWeek); // Kolom target berdasarkan input admin
    if (weekColumn > 7) weekColumn = 7; // Batasi maksimal di kolom G (Minggu 5)

    const lastRow = monthlySheet.getLastRow();
    // Gunakan baris 6 sebagai awal data siswa
    if (lastRow < 6) {
        return { success: false, message: `Sheet '${targetSheetName}' kosong (tidak ada data siswa).` };
    }

    // Ambil range data siswa dari baris 6 ke bawah
    const numRowsToUpdate = lastRow - 5;
    const statusRange = monthlySheet.getRange(6, weekColumn, numRowsToUpdate, 1);
    const namaRange = monthlySheet.getRange(6, 1, numRowsToUpdate, 2);
    const namaValues = namaRange.getValues();

    const newStatuses = [];
    const logEntries = [];
    const timestamp = new Date();

    for (let i = 0; i < namaValues.length; i++) {
      newStatuses.push(["-"]); // Reset jadi "-"
      const nama = namaValues[i][0];
      const kelas = namaValues[i][1];
      if (nama && kelas) {
        logEntries.push([ timestamp, nama, kelas, "Status Dicabut", "Status di-reset oleh admin" ]);
      }
    }

    // Update sheet Laporan Bulanan
    statusRange.setValues(newStatuses);

    // Update sheet Log Absensi (sekaligus)
    if (logEntries.length > 0) {
      logSheet.getRange(logSheet.getLastRow() + 1, 1, logEntries.length, 5).setValues(logEntries);
    }

    return { success: true, message: `Status untuk Minggu ${targetWeek} di bulan ${targetMonthName} berhasil di-reset menjadi "-".` };

  } catch (error) {
    Logger.log("Error di revokeHolidayStatus: " + error.message + " Stack: " + error.stack); // Tambah log error detail
    return { success: false, message: "Error revokeHolidayStatus: " + error.message };
  }
}

// ... [di bawah fungsi revokeHolidayStatus] ...

// FUNGSI BARU UNTUK ADMIN MELIHAT SHEET
function getMonthlySheetData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const { monthlySheetName } = createMonthlySheetIfNeeded();
    const monthlySheet = ss.getSheetByName(monthlySheetName);
    if (!monthlySheet) {
      return { success: false, message: "Sheet bulanan '" + monthlySheetName + "' tidak ditemukan." };
    }

    const data = monthlySheet.getDataRange().getValues();
    
    // Asumsi data siswa mulai di baris 4 (index 3)
    if (!data || data.length <= 3) {
      return { success: false, message: "Sheet bulanan kosong (belum ada data siswa)." };
    }

    // Ambil header dari baris 3 (index 2)
    const headers = data[2];
    // Ambil data siswa dari baris 4 (index 3) sampai akhir
    const studentData = data.slice(3);

    return { 
      success: true, 
      sheetName: monthlySheetName, 
      headers: headers,       // Kirim header
      studentData: studentData  // Kirim data siswa
    };

  } catch (error) {
    return { success: false, message: "Error getMonthlySheetData: " + error.message };
  }
}

// ... [di bawah fungsi getMonthlySheetData] ...

// FUNGSI BARU UNTUK ADMIN SET RUNNING TEXT
function setRunningText(adminNama, text) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
    if (!masterSheet) {
      return { success: false, message: "Sheet Master data tidak ditemukan." };
    }

    // Tulis teks pengumuman ke sel F1
    masterSheet.getRange("F1").setValue(text);
    
    return { success: true, message: "Teks berjalan berhasil diupdate." };

  } catch (error) {
    return { success: false, message: "Error setRunningText: " + error.message };
  }
}


//AUTH USER LOGIN
function authenticateUser(nama, password) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
    if (!masterSheet) return { success: false, message: "Master Data sheet not found" };
    
    const data = masterSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const namaMaster = row[1] ? row[1].toString().trim() : "";
      const kelasMaster = row[2] ? row[2].toString().trim() : "";
      const passwordMaster = row[3] ? row[3].toString().trim() : "";
      if (namaMaster.toLowerCase() === nama.toLowerCase() && passwordMaster === password) {
        // Cek apakah ini admin
        const isAdmin = passwordMaster.includes("@DM1N");
        return { success: true, nama: namaMaster, kelas: kelasMaster, isAdmin: isAdmin };
      }
    }
    return { success: false, message: "Nama atau password salah" };
  } catch (error) {
    return { success: false, message: "Error: " + error.message };
  }
}

// GANTI TOTAL FUNGSI createMonthlySheetIfNeeded YANG LAMA DENGAN INI
function createMonthlySheetIfNeeded(targetDate = null) { // <-- Tambah parameter 'targetDate'
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Gunakan tanggal target JIKA ADA, kalau tidak pakai tanggal sekarang
  const dateToCheck = targetDate || new Date();
  // Hitung nama bulan dari 'dateToCheck'
  const monthName = dateToCheck.toLocaleString('id-ID', { month: 'long' }).toUpperCase();
  const year = dateToCheck.getFullYear(); // Ambil tahun
  const monthlySheetName = `${monthName} ${year}`; // Format: NOVEMBER 2025
  // Cek apakah sheet sudah ada
  if (!ss.getSheetByName(monthlySheetName)) {
    const templateSheet = ss.getSheetByName(CONFIG.TEMPLATE_SHEET);
    if (templateSheet) {
      const newSheet = templateSheet.copyTo(ss).setName(monthlySheetName);
      const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
      // Pastikan ambil data master dari baris 6
      // Ambil Nama (kolom A) dan Kelas (kolom B) dari Master Data, mulai baris 7 (skip header di baris 6)
      const masterDataValues = masterSheet.getRange(7, 1, masterSheet.getLastRow() - 6, 2).getValues();
      // Pastikan kolom pertama adalah Nama (row[0]), kedua adalah Kelas (row[1])
      const dataToFill = masterDataValues.map(row => [row[0], row[1], "-", "-", "-", "-", "-", ""]);
      // ... [setelah const dataToFill = masterDataValues.map(...)] ...
      const startRow = 6; // Data siswa mulai di baris 6

      // --- SISIPKAN LOG DI SINI ---
      Logger.log("Jumlah data siswa dibaca: " + masterDataValues.length);
      Logger.log("Data siap ditulis (sample): " + JSON.stringify(dataToFill.slice(0, 3))); // Tampilkan 3 data pertama
      // --- AKHIR SISIPAN ---

      // Langsung tulis data siswa ke baris 6 ke bawah
      if (dataToFill.length >= 0) {
        newSheet.getRange(startRow, 0, dataToFill.length, dataToFill[0].length).setValues(dataToFill);
      }
      newSheet.showSheet();
    } else {
       Logger.log("ERROR: Sheet template '" + CONFIG.TEMPLATE_SHEET + "' tidak ditemukan!");
       // Mungkin return error di sini biar lebih jelas
       return { monthlySheetName: null }; // Indikasi gagal
    }
  }
  return { monthlySheetName }; // Kembalikan nama sheet yang benar
}



function logAttendance(nama, kelas, status, location) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName(CONFIG.LOG_SHEET);
    if (!logSheet) {
      logSheet = ss.insertSheet(CONFIG.LOG_SHEET);
      logSheet.appendRow(["Timestamp", "Nama", "Kelas", "Status", "Location"]);
      logSheet.getRange(1, 1, 1, 5).setFontWeight("bold");
    }
    logSheet.appendRow([new Date(), nama, kelas, status, location]);
    return { success: true };
  } catch (error) {
    Logger.log("Error logging attendance: " + error.message);
    return { success: false, message: error.message };
  }
}

function checkIfAlreadySubmitted(nama) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const { monthlySheetName } = createMonthlySheetIfNeeded();
  const monthlySheet = ss.getSheetByName(monthlySheetName);
  if (!monthlySheet) return { submitted: true, message: `Error: Sheet bulanan '${monthlySheetName}' tidak ditemukan.` };

  const currentWeek = getCurrentWeekNumber();
  let weekColumn = 2 + currentWeek;
  if (weekColumn > 7) weekColumn = 7; // Batasi maksimal di kolom G (Minggu 5)
  const namesRange = monthlySheet.getRange("A6:A" + monthlySheet.getLastRow());
  const namesValues = namesRange.getValues();
  
  for (let i = 0; i < namesValues.length; i++) {
    if (namesValues[i][0] && namesValues[i][0].toString().toLowerCase() === nama.toLowerCase()) {
      const targetRow = i + 6;
      const currentStatus = monthlySheet.getRange(targetRow, weekColumn).getValue();
      if (currentStatus && currentStatus.toString().trim() !== "-") {
        return { submitted: true, message: `Anda sudah tercatat dengan status "${currentStatus}" untuk minggu ini.` };
      }
      return { submitted: false };
    }
  }
  return { submitted: true, message: "Error: Nama Anda tidak ditemukan di laporan bulan ini." };
}

// GANTI TOTAL FUNGSI markHadirViaQR YANG LAMA DENGAN INI
function markHadirViaQR(nama, kelas, qrCodeData, latitude, longitude, imageData) { // Tambah imageData
  try {
    // === Validasi Input Awal ===
    const submissionCheck = checkIfAlreadySubmitted(nama);
    if (submissionCheck.submitted) return { success: false, message: submissionCheck.message };
    if (!isAttendanceWindowOpen()) return { success: false, message: "Absensi hanya dibuka pada hari Sabtu, jam 8:00 - 16:00." };
    if (qrCodeData !== CONFIG.QR_SECRET_KEY) return { success: false, message: "QR Code tidak valid." };

    // === Validasi Lokasi ===
    if (!latitude || !longitude) {
      return { success: false, message: "Lokasi Anda tidak terdeteksi. Pastikan GPS aktif dan izinkan akses lokasi." };
    }
    const TARGET_LAT = -6.803817392632759;
    const TARGET_LON = 110.82211247379476;
    const MAX_DISTANCE_METERS = 110; // Sesuaikan jika perlu
    const distance = getDistance(latitude, longitude, TARGET_LAT, TARGET_LON);
    if (distance > MAX_DISTANCE_METERS) {
      return { success: false, message: `Lokasi Anda terlalu jauh (${Math.round(distance)} meter). Anda harus berada dalam radius ${MAX_DISTANCE_METERS} meter.` };
    }

    // === Validasi & Upload Foto Bukti (BARU) ===
    if (!imageData) { // Foto Wajib
      return { success: false, message: "Foto bukti kehadiran wajib diambil." };
    }
    let fileUrl = '';
    try {
      const [meta, base64] = imageData.split(',');
      const mimeType = meta.split(';')[0].split(':')[1];
      // Format nama file
      const timestampFoto = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd_HH-mm-ss");
      const fileName = `HADIR_${nama.replace(/\s/g, '_')}_${timestampFoto}.jpg`;

      const imageBlob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
      const folder = DriveApp.getFolderById(CONFIG.DRIVE_HADIR_FOLDER_ID); // Folder Hadir
      const imageFile = folder.createFile(imageBlob);
      imageFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); // Pastikan bisa diakses
      fileUrl = imageFile.getUrl();

    } catch (uploadError) {
      Logger.log("Error Upload Bukti Hadir: " + uploadError.message);
      return { success: false, message: "Gagal mengupload foto bukti: " + uploadError.message };
    }

    // === Update Sheet & Log ===
    // 1. Nilai untuk Laporan Bulanan (Dengan Link)
    const cellValueMonthly = `Hadir, ${fileUrl}`;
    const updateResult = updateMonthlySheet(nama, kelas, cellValueMonthly);
    if (!updateResult.success) {
       // Jika gagal update sheet, coba hapus file yg sudah terupload
       try { DriveApp.getFileById(fileUrl.split('/d/')[1].split('/')[0]).setTrashed(true); } catch(e){}
       return updateResult;
    }

    // 2. Nilai untuk Log Absensi (Tanpa Link)
    const locationStringLog = `Via QR Code (Jarak: ${Math.round(distance)} meter)`;
    logAttendance(nama, kelas, "Hadir", locationStringLog); // Status tetap "Hadir"

    return { success: true, message: `Absensi Hadir berhasil dicatat! (Jarak: ${Math.round(distance)} meter)` };

  } catch (error) {
    Logger.log("Error di markHadirViaQR: " + error.message + " Stack: " + error.stack);
    return { success: false, message: "Error: " + error.message };
  }
}

function markIzinFromDashboard(nama, kelas, alasan, imageData) {
  try {
    const submissionCheck = checkIfAlreadySubmitted(nama);
    if (submissionCheck.submitted) return { success: false, message: submissionCheck.message };
    if (!isAttendanceWindowOpen()) return { success: false, message: "Pengajuan izin hanya bisa pada hari Sabtu, jam 8:00 - 16:00." };
    if (!alasan || alasan.trim() === "") return { success: false, message: "Alasan izin tidak boleh kosong."};
    if (!imageData) return { success: false, message: "Foto bukti tidak boleh kosong."};

    const [meta, base64] = imageData.split(',');
    const mimeType = meta.split(';')[0].split(':')[1];
    const fileName = `IZIN_${nama.replace(/\s/g, '_')}_${new Date().toISOString()}.jpg`;
    
    const imageBlob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const imageFile = folder.createFile(imageBlob);
    const fileUrl = imageFile.getUrl();
    
    const cellValue = `(${alasan}, ${fileUrl})`;
    const updateResult = updateMonthlySheet(nama, kelas, cellValue);
    
    if (!updateResult.success) return updateResult;
    
    logAttendance(nama, kelas, "Izin", cellValue); 
    return { success: true, message: "Pengajuan Izin berhasil dicatat." };
  } catch (error) {
    return { success: false, message: "Error saat memproses izin: " + error.message };
  }
}

function tandaiAlphaOtomatis() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (now.getDay() !== 6) return; 

  const now = new Date(); // Ambil tanggal hari ini
  if (now.getDay() !== 6) return; // Hanya jalan hari Sabtu
  const monthName = now.toLocaleString('id-ID', { month: 'long' }).toUpperCase();
  const year = now.getFullYear(); // Ambil tahun
  const sheetName = `${monthName} ${year}`; // Format: NOVEMBER 2025
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  const weekToCheck = getCurrentWeekNumber();
  const columnToCheck = 2 + weekToCheck;
  const range = sheet.getRange(6, columnToCheck, sheet.getLastRow() - 5, 1);
  const values = range.getValues();

  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === "" || values[i][0] === "-") {
      values[i][0] = "Alpha";
    }
  }
  range.setValues(values);
}

function setupTriggerAlpha() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'tandaiAlphaOtomatis') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('tandaiAlphaOtomatis')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(16)
    .nearMinute(5)
    .create();
  
  Logger.log("Trigger untuk Alpha otomatis berhasil dibuat.");

}
