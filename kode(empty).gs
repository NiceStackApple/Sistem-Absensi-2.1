// ============================================
// KONFIGURASI
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
      case "setHolidayStatus":
        result = setHolidayStatus(data.nama, data.alasanLibur, data.targetWeek, data.monthOption); 
        break;
      case "revokeHolidayStatus":
        result = revokeHolidayStatus(data.nama, data.targetWeek, data.monthOption);
        break;
      case "adminOverrideHadir":
        result = adminOverrideHadir(data.nama, data.kelas, data.targetWeek, data.imageData);
        break;
      case "adminOverrideIzin":
        result = adminOverrideIzin(data.nama, data.kelas, data.targetWeek, data.alasan, data.imageData);
        break;
      case "adminOverrideAlpha":
        result = adminOverrideAlpha(data.nama, data.kelas, data.targetWeek);
        break;
      case "setRunningText":
        result = setRunningText(data.nama, data.text);
        break;
      case "setCameraMessage":
        result = setCameraMessage(data.nama, data.text);
        break;
      case "manualTriggerAlpha":
        result = manualTriggerAlpha();
        break;
      case "getUsers":
        result = getUsers();
        break;
      case "addUser":
        result = addUser(data.nama, data.kelas, data.password);
        break;
      case "editUser":
        result = editUser(data.originalNama, data.nama, data.kelas, data.password);
        break;
      case "deleteUser":
        result = deleteUser(data.nama);
        break;
      case "recalculateAllStreaks":
        result = recalculateAllStreaks();
        break;
      case "getMonthlySheetData":
        result = getMonthlySheetData(data.sheetName); 
        break;
      case "getAvailableSheets":
        result = getAvailableSheets();
        break;
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
  TOTAL_SHEET: "Data Total",
  STREAK_SHEET: "Streak Data",
  QR_SECRET_KEY: "ISI_SECRET_KEY_QR_DI_SINI",
  DRIVE_FOLDER_ID: "ISI_DRIVE_FOLDER_ID_DI_SINI",
  TEMPLATE_SHEET: "Template - Absensi Bulanan",
  DRIVE_HADIR_FOLDER_ID: "ISI_DRIVE_HADIR_FOLDER_ID_DI_SINI",
  SPREADSHEET_ID: "ISI_ID_SPREADSHEET_DI_SINI"
};

function getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID !== "ISI_ID_SPREADSHEET_DI_SINI") {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("Spreadsheet aktif tidak ditemukan. Isi CONFIG.SPREADSHEET_ID agar web app selalu menulis ke spreadsheet yang benar.");
  }
  return ss;
}

function withScriptLock_(callback, timeoutMs) {
  const lock = LockService.getScriptLock();
  lock.waitLock(timeoutMs || 30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function sanitizeFileName_(value) {
  return String(value || "tanpa_nama")
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildDriveViewUrl_(fileId) {
  return "https://drive.google.com/uc?export=view&id=" + fileId;
}

function uploadEvidenceImage_(imageData, folderId, prefix, nama) {
  if (!imageData || typeof imageData !== "string" || imageData.indexOf(",") === -1) {
    throw new Error("Format imageData tidak valid.");
  }

  const parts = imageData.split(",", 2);
  const meta = parts[0];
  const base64 = parts[1];
  const mimeMatch = meta.match(/^data:(.*?);base64$/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const rawExt = mimeType.split("/")[1] || "jpg";
  const ext = rawExt === "jpeg" ? "jpg" : rawExt;
  const timestampFoto = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd_HH-mm-ss");
  const fileName = `${prefix}_${sanitizeFileName_(nama)}_${timestampFoto}.${ext}`;

  const imageBlob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
  const folder = DriveApp.getFolderById(folderId);
  const file = folder.createFile(imageBlob);

  let sharingMode = "PRIVATE";
  let sharingWarning = "";

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    sharingMode = "ANYONE_WITH_LINK";
  } catch (e1) {
    Logger.log("ANYONE_WITH_LINK gagal untuk file " + file.getId() + ": " + e1.message);
    try {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
      sharingMode = "DOMAIN_WITH_LINK";
      sharingWarning = "Link publik diblokir kebijakan domain, fallback ke DOMAIN_WITH_LINK.";
    } catch (e2) {
      Logger.log("DOMAIN_WITH_LINK juga gagal untuk file " + file.getId() + ": " + e2.message);
      sharingMode = "PRIVATE";
      sharingWarning = "File tersimpan, tetapi sharing Drive dibatasi. Bukti tetap tersimpan di folder Drive.";
    }
  }

  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    viewUrl: buildDriveViewUrl_(file.getId()),
    sharingMode: sharingMode,
    sharingWarning: sharingWarning
  };
}

function safeTrashFile_(fileId) {
  if (!fileId) return;
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (e) {
    Logger.log("safeTrashFile_ gagal untuk " + fileId + ": " + e.message);
  }
}

// ============================================
// FUNGSI BANTUAN
// ============================================
function isAttendanceWindowOpen() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  if (day === 6 && hour >= 8 && hour < 16) {
    return true;
  }
  return false;
}

function getCurrentWeekNumber() {
  const now = new Date();
  const dayOfMonth = now.getDate();
  if (dayOfMonth <= 7) return 1;
  if (dayOfMonth <= 14) return 2;
  if (dayOfMonth <= 21) return 3;
  if (dayOfMonth <= 28) return 4;
  return 5;
}

function getWeekOfMonth(date) {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  return Math.ceil((date.getDate() + firstDay.getDay()) / 7);
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance * 1000;
}

function updateAndSaveStreak(nama, kelas) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const streakSheet = ensureStreakSheetExists(ss, nama, kelas);
    const logSheet = ss.getSheetByName(CONFIG.LOG_SHEET);
    if (!logSheet || logSheet.getLastRow() < 2) return 0;
    
    const allLogData = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 4).getValues(); 
    let userLogs = allLogData.filter(row => 
        row[1].toString().toLowerCase() === nama.toLowerCase() && row[2].toString().toLowerCase() === kelas.toLowerCase()
    );

    let finalStatusesByWeek = {};

    userLogs.forEach(row => {
        const timestamp = new Date(row[0]);
        const status = row[3].toString().trim();
        const year = timestamp.getFullYear();
        const month = timestamp.getMonth() + 1;
        const weekIndex = getWeekOfMonth(timestamp); 
        const weekId = `${year}-${month}-${weekIndex}`;

        finalStatusesByWeek[weekId] = status;
    });

    const sortedWeekIds = Object.keys(finalStatusesByWeek).sort();
    let streakCount = 0;

    for (let i = 0; i < sortedWeekIds.length; i++) {
        const weekId = sortedWeekIds[i];
        const rawStatus = finalStatusesByWeek[weekId];
        const category = getStatusCategory(rawStatus); 

        if (category === "Hadir") {
            streakCount++;
        } else if (category === "Alpha") {
            streakCount = 0; 
        } else if (category === "Libur" || category === "-" || category === "Izin") {
            continue;
        } else {
            streakCount = 0;
        }
    }

    const data = streakSheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === nama.toLowerCase()) {
        rowIndex = i + 1;
        break;
      }
    }
    if (rowIndex !== -1) {
      streakSheet.getRange(rowIndex, 3).setValue(streakCount);
    }

    return streakCount;

  } catch (error) {
    Logger.log(`Error updateAndSaveStreak for ${nama}: ${error.message}`);
    return 0;
  }
}

function calculateStreak(nama, kelas) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const streakSheet = ensureStreakSheetExists(ss, nama, kelas);
    const data = streakSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === nama.toLowerCase()) {
        const streakVal = data[i][2];
        return (typeof streakVal === 'number') ? streakVal : 0;
      }
    }
    return 0;
  } catch (e) {
    Logger.log("Error reading streak: " + e.message);
    return 0;
  }
}

function updateUserStat(ss, nama, oldRawStatus, newRawStatus) {
  try {
    const totalSheet = ensureTotalSheetExists(ss);
    const oldCat = getStatusCategory(oldRawStatus);
    const newCat = getStatusCategory(newRawStatus);
  
    if (oldCat === newCat) return;
  
    const data = totalSheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === nama.toLowerCase()) {
        rowIndex = i + 1;
        break;
      }
    }
  
    if (rowIndex === -1) return;
  
    const mapCol = { "Hadir": 3, "Izin": 4, "Alpha": 5, "Libur": 6 };
  
    if (oldCat !== "-" && mapCol[oldCat]) {
      const cell = totalSheet.getRange(rowIndex, mapCol[oldCat]);
      const val = cell.getValue();
      cell.setValue(Math.max(0, (typeof val === 'number' ? val : 0) - 1));
    }
  
    if (newCat !== "-" && mapCol[newCat]) {
      const cell = totalSheet.getRange(rowIndex, mapCol[newCat]);
      const val = cell.getValue();
      cell.setValue((typeof val === 'number' ? val : 0) + 1);
    }
  } catch (e) {
    Logger.log("Error updateUserStat: " + e.message);
  }
}

function ensureTotalSheetExists(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  let totalSheet = spreadsheet.getSheetByName(CONFIG.TOTAL_SHEET);
  const masterSheet = spreadsheet.getSheetByName(CONFIG.MASTER_SHEET);
  if (!masterSheet) {
    throw new Error("Sheet Master data tidak ditemukan.");
  }

  const startRow = 7;
  const lastRow = masterSheet.getLastRow();
  const masterData = lastRow >= startRow
    ? masterSheet.getRange(startRow, 2, lastRow - 6, 2).getValues().filter(row => row[0])
    : [];

  if (!totalSheet) {
    totalSheet = spreadsheet.insertSheet(CONFIG.TOTAL_SHEET);
    totalSheet.appendRow(["Nama", "Kelas", "Hadir", "Izin", "Alpha", "Libur"]);
    totalSheet.getRange(1, 1, 1, 6).setFontWeight("bold");

    if (masterData.length > 0) {
      const initData = masterData.map(row => [row[0], row[1], 0, 0, 0, 0]);
      totalSheet.getRange(2, 1, initData.length, 6).setValues(initData);
    }
  } else {
    const existing = totalSheet.getLastRow() >= 2
      ? totalSheet.getRange(2, 1, totalSheet.getLastRow() - 1, 2).getValues()
      : [];
    const existingNames = {};
    existing.forEach(row => {
      if (row[0]) existingNames[String(row[0]).trim().toLowerCase()] = true;
    });

    const newStudents = masterData
      .filter(row => !existingNames[String(row[0]).trim().toLowerCase()])
      .map(row => [row[0], row[1], 0, 0, 0, 0]);

    if (newStudents.length > 0) {
      totalSheet.getRange(totalSheet.getLastRow() + 1, 1, newStudents.length, 6).setValues(newStudents);
    }
  }

  return totalSheet;
}

function getStatusCategory(rawStatus) {
  if (!rawStatus) return "-";
  const s = rawStatus.toString().trim();
  if (s === "" || s === "-") return "-";
  
  if (s.includes("Dicabut") || s.includes("Reset") || s.includes("Injeksi")) return "-"; 

  if (s.startsWith("Hadir") || s.startsWith("!Hadir")) return "Hadir";
  if (s.startsWith("Alpha") || s.startsWith("!Alpha")) return "Alpha";
  if (s.toLowerCase().includes("libur")) return "Libur";
  
  return "Izin";
}

function getDashboardData(nama, kelas) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
    if (!masterSheet) {
      return { success: false, message: "Sheet Master data tidak ditemukan." };
    }
    const runningText = masterSheet.getRange("F1").getValue().toString() || "";
    const cameraMessage = masterSheet.getRange("F2").getValue().toString() || "Senyum! Cekrek!";
    const logSheet = ss.getSheetByName(CONFIG.LOG_SHEET);
    if (!logSheet) {
      return { success: false, message: "Sheet log absensi tidak ditemukan." }; 
    }

    const last10 = [];
    let currentStatus = "-";
    const monthNow = Utilities.formatDate(new Date(), "Asia/Jakarta", "MMMM yyyy");

    if (logSheet.getLastRow() >= 2) {
      const allLogData = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 5).getValues();

      for (let i = allLogData.length - 1; i >= 0; i--) {
        const row = allLogData[i];
        const logNama = row[1];
        const logKelas = row[2];

        if (logNama === nama && logKelas === kelas) {
          if (currentStatus === "-") {
            currentStatus = row[3];
          }

          if (last10.length < 10) {
            last10.push({
              timestamp: Utilities.formatDate(new Date(row[0]), "Asia/Jakarta", "dd/MM/yyyy HH:mm"),
              status: row[3],
              location: row[4] || "-"
            });
          }
        }
        
        if (last10.length >= 10) {
          break; 
        }
      }
    }

    const { monthlySheetName } = createMonthlySheetIfNeeded();
    const monthlySheet = ss.getSheetByName(monthlySheetName);
    if (!monthlySheet) {
       return { success: false, message: "Sheet bulanan '" + monthlySheetName + "' tidak ditemukan." };
    }
    
    const namesRange = monthlySheet.getRange("A6:A" + monthlySheet.getLastRow());
    const namesValues = namesRange.getValues();
    let userRow = -1;
    
    for (let i = 0; i < namesValues.length; i++) {
      if (namesValues[i][0] && namesValues[i][0].toString().toLowerCase() === nama.toLowerCase()) {
        userRow = i + 6;
        break;
      }
    }

    if (userRow === -1) {
      return { success: false, message: "Nama Anda tidak ditemukan di sheet " + monthlySheetName };
    }

    const weeklyStatusValues = monthlySheet.getRange(userRow, 3, 1, 5).getValues()[0];

    const cleanStatus = (s) => {
      if (!s || s.toString().trim() === "") return "-";
      const status = s.toString().trim();

      if (status.startsWith("Hadir")) {
        return "Hadir";
      }
      if (status === "Alpha" || status === "-") {
        return status;
      }
      if (status.toLowerCase().includes("libur")) { 
        return status;
      }

      return "Izin"; 
    };

    const monthlyAttendanceData = [
      { week: "Minggu 1", status: cleanStatus(weeklyStatusValues[0]) },
      { week: "Minggu 2", status: cleanStatus(weeklyStatusValues[1]) },
      { week: "Minggu 3", status: cleanStatus(weeklyStatusValues[2]) },
      { week: "Minggu 4", status: cleanStatus(weeklyStatusValues[3]) },
      { week: "Minggu 5", status: cleanStatus(weeklyStatusValues[4]) }
    ];

    let totalStats = { hadir: 0, izin: 0, alpha: 0, libur: 0 };
    try {
       const totalSheet = ss.getSheetByName(CONFIG.TOTAL_SHEET);
       if (totalSheet) {
         const textFinder = totalSheet.getRange("A:A").createTextFinder(nama).matchEntireCell(true);
         const result = textFinder.findNext();
         if (result) {
           const row = result.getRow();
           const vals = totalSheet.getRange(row, 3, 1, 4).getValues()[0];
           totalStats = { hadir: vals[0], izin: vals[1], alpha: vals[2], libur: vals[3] };
         }
       }
    } catch(e) { Logger.log("Gagal ambil total stats: " + e.message); }

    const streakCount = calculateStreak(nama, kelas);
    return {
      success: true,
      message: "Data dashboard berhasil diambil.",
      currentMonth: monthNow,
      currentWeek: "Minggu ke-" + getWeekOfMonth(new Date()),
      currentStatus: currentStatus,
      monthlyAttendance: monthlyAttendanceData,
      history: last10,
      runningText: runningText,
      cameraMessage: cameraMessage,
      streakCount: streakCount,
      totalStats: totalStats
    };

  } catch (error) {
    return { success: false, message: "Error getDashboardData: " + error.message };
  }
}

function updateMonthlySheet(nama, kelas, status, targetWeek = null) {
  return withScriptLock_(function () {
    try {
      const ss = getSpreadsheet_();
      const creationResult = createMonthlySheetIfNeeded();
      const monthlySheetName = creationResult && creationResult.monthlySheetName;
      if (!monthlySheetName) {
        return { success: false, message: "Sheet bulanan gagal dibuat / ditemukan." };
      }

      const monthlySheet = ss.getSheetByName(monthlySheetName);
      if (!monthlySheet) {
        return { success: false, message: "Sheet bulanan '" + monthlySheetName + "' tidak ditemukan." };
      }

      const lastRow = monthlySheet.getLastRow();
      if (lastRow < 6) {
        return { success: false, message: "Sheet bulanan belum berisi data siswa." };
      }

      const namesValues = monthlySheet.getRange(6, 1, lastRow - 5, 1).getValues();
      let userRow = -1;

      for (let i = 0; i < namesValues.length; i++) {
        const currentName = namesValues[i][0];
        if (currentName && currentName.toString().trim().toLowerCase() === String(nama).trim().toLowerCase()) {
          userRow = i + 6;
          break;
        }
      }

      if (userRow === -1) {
        return { success: false, message: "Nama '" + nama + "' tidak ditemukan di sheet " + monthlySheetName };
      }

      let weekNumber = targetWeek ? parseInt(targetWeek, 10) : getCurrentWeekNumber();
      if (isNaN(weekNumber) || weekNumber < 1) weekNumber = 1;
      if (weekNumber > 5) weekNumber = 5;

      const weekColumn = 2 + weekNumber;
      monthlySheet.getRange(userRow, weekColumn).setValue(status);
      SpreadsheetApp.flush();

      return { success: true, row: userRow, column: weekColumn, sheetName: monthlySheetName };
    } catch (error) {
      Logger.log("Error updateMonthlySheet: " + error.message + " | stack: " + error.stack);
      return { success: false, message: "Error updateMonthlySheet: " + error.message };
    }
  });
}

function adminOverrideHadir(nama, kelas, targetWeek, imageData) {
  try {
    if (!imageData) {
      return { success: false, message: "Foto bukti (via kamera) wajib diambil." };
    }

    const upload = uploadEvidenceImage_(imageData, CONFIG.DRIVE_HADIR_FOLDER_ID, "!HADIR_OVERRIDE", nama);
    const cellValueMonthly = `!Hadir, ${upload.fileUrl}`;
    const updateResult = updateMonthlySheet(nama, kelas, cellValueMonthly, targetWeek);

    if (!updateResult.success) {
      safeTrashFile_(upload.fileId);
      return updateResult;
    }

    logAttendance(nama, kelas, "!Hadir", "Di-override oleh admin (via foto)");
    updateAndSaveStreak(nama, kelas);
    syncUserTotalStats(nama);

    const extraInfo = upload.sharingWarning ? " " + upload.sharingWarning : "";
    return { success: true, message: "Berhasil override status jadi !Hadir." + extraInfo, fileUrl: upload.fileUrl, sharingMode: upload.sharingMode };
  } catch (error) {
    Logger.log("Error di adminOverrideHadir: " + error.message + " | stack: " + error.stack);
    return { success: false, message: "Error adminOverrideHadir: " + error.message };
  }
}

function adminOverrideIzin(nama, kelas, targetWeek, alasan, imageData) {
  try {
    if (!imageData) {
      return { success: false, message: "Foto bukti izin wajib diambil." };
    }
    if (!alasan || alasan.trim() === "") {
      return { success: false, message: "Alasan izin wajib diisi." };
    }

    const upload = uploadEvidenceImage_(imageData, CONFIG.DRIVE_FOLDER_ID, "!IZIN_OVERRIDE", nama);
    const cellValueMonthly = `(!Izin [Admin]: ${alasan}, ${upload.fileUrl})`;
    const updateResult = updateMonthlySheet(nama, kelas, cellValueMonthly, targetWeek);

    if (!updateResult.success) {
      safeTrashFile_(upload.fileId);
      return updateResult;
    }

    logAttendance(nama, kelas, "!Izin", `Diubah oleh admin: ${alasan}`);
    updateAndSaveStreak(nama, kelas);
    syncUserTotalStats(nama);

    const extraInfo = upload.sharingWarning ? " " + upload.sharingWarning : "";
    return { success: true, message: "Berhasil override status jadi !Izin." + extraInfo, fileUrl: upload.fileUrl, sharingMode: upload.sharingMode };
  } catch (error) {
    Logger.log("Error di adminOverrideIzin: " + error.message + " | stack: " + error.stack);
    return { success: false, message: "Error adminOverrideIzin: " + error.message };
  }
}

function adminOverrideAlpha(nama, kelas, targetWeek) {
  try {
    const updateResult = updateMonthlySheet(nama, kelas, "!Alpha", targetWeek);
    if (!updateResult.success) {
      return updateResult;
    }

    logAttendance(nama, kelas, "!Alpha", "Diubah oleh admin");
    updateAndSaveStreak(nama, kelas);
    syncUserTotalStats(nama);

    return { success: true, message: "Berhasil override status jadi !Alpha." };
  } catch (error) {
    Logger.log("Error di adminOverrideAlpha: " + error.message + " | stack: " + error.stack);
    return { success: false, message: "Error adminOverrideAlpha: " + error.message };
  }
}

function manualTriggerAlpha() {
  try {
    tandaiAlphaOtomatis(); 
    return { success: true, message: "Pengecekan Alpha manual berhasil dijalankan. Cek Log Eksekusi untuk detail." };
  } catch (error) {
    Logger.log("Error di manualTriggerAlpha: " + error.message);
    return { success: false, message: "Error manualTriggerAlpha: " + error.message };
  }
}

function getUsers() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
    if (!masterSheet) {
      return { success: false, message: "Sheet Master data tidak ditemukan." };
    }
    
    const startRow = 7; 
    if (masterSheet.getLastRow() < startRow) {
      return { success: true, users: [] };
    }
    const numRows = masterSheet.getLastRow() - startRow + 1;
    const data = masterSheet.getRange(startRow, 2, numRows, 3).getValues(); 
    
    const users = data.map(row => ({
      nama: row[0],
      kelas: row[1],
      password: row[2]
    }));
    
    return { success: true, users: users };

  } catch (error) {
    return { success: false, message: "Error getUsers: " + error.message };
  }
}

function addUser(nama, kelas, password) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
    if (!masterSheet) {
      return { success: false, message: "Sheet Master data tidak ditemukan." };
    }
    
    const names = masterSheet.getRange("B7:B" + masterSheet.getLastRow()).getValues(); 
    const isDuplicate = names.some(row => row[0].toString().toLowerCase() === nama.toLowerCase());
    
    if (isDuplicate) {
      return { success: false, message: "Nama user sudah ada. Gunakan nama lain." };
    }

    masterSheet.appendRow(["", nama, kelas, password]); 
    
    return { success: true, message: "User " + nama + " berhasil ditambahkan." };

  } catch (error) {
    return { success: false, message: "Error addUser: " + error.message };
  }
}

function editUser(originalNama, newNama, newKelas, newPassword) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
    if (!masterSheet) {
      return { success: false, message: "Sheet Master data tidak ditemukan." };
    }

    const namesRange = masterSheet.getRange("B7:B" + masterSheet.getLastRow()); 
    const namesValues = namesRange.getValues();
    let userRow = -1;

    for (let i = 0; i < namesValues.length; i++) {
      if (namesValues[i][0] && namesValues[i][0].toString().toLowerCase() === originalNama.toLowerCase()) {
        userRow = i + 7;
        break;
      }
    }

    if (userRow === -1) {
      return { success: false, message: "User " + originalNama + " tidak ditemukan." };
    }
    
    masterSheet.getRange(userRow, 2, 1, 3).setValues([[newNama, newKelas, newPassword]]);
    
    return { success: true, message: "Data user " + newNama + " berhasil diupdate." };

  } catch (error) {
    return { success: false, message: "Error editUser: " + error.message };
  }
}

function deleteUser(nama) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
    if (!masterSheet) {
      return { success: false, message: "Sheet Master data tidak ditemukan." };
    }

    const namesRange = masterSheet.getRange("B7:B" + masterSheet.getLastRow()); 
    const namesValues = namesRange.getValues();
    let userRow = -1;

    for (let i = 0; i < namesValues.length; i++) {
      if (namesValues[i][0] && namesValues[i][0].toString().toLowerCase() === nama.toLowerCase()) {
        userRow = i + 7;
        break;
      }
    }

    if (userRow === -1) {
      return { success: false, message: "User " + nama + " tidak ditemukan." };
    }
    
    masterSheet.deleteRow(userRow);
    
    return { success: true, message: "User " + nama + " berhasil dihapus." };

  } catch (error) {
    return { success: false, message: "Error deleteUser: " + error.message };
  }
}

function authenticateUser(nama, password) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
    if (!masterSheet) return { success: false, message: "Master Data sheet not found" };
    
    const data = masterSheet.getDataRange().getValues();
    
    for (let i = 6; i < data.length; i++) { 
      const row = data[i];
      const namaMaster = row[1] ? row[1].toString().trim() : "";
      const kelasMaster = row[2] ? row[2].toString().trim() : "";
      const passwordMaster = row[3] ? row[3].toString().trim() : "";
      
      if (namaMaster.toLowerCase() === nama.toLowerCase() && passwordMaster === password) {
        const isAdmin = passwordMaster.includes("@DM1N");
        return { success: true, nama: namaMaster, kelas: kelasMaster, isAdmin: isAdmin };
      }
    }
    return { success: false, message: "Nama atau password salah" };
  } catch (error) {
    return { success: false, message: "Error: " + error.message };
  }
}

function setHolidayStatus(adminNama, alasanLibur, targetWeek, monthOption) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date();

    const offset = monthOption !== undefined ? parseInt(monthOption) : 0;
    let targetMonthDate = new Date(now.getFullYear(), now.getMonth() + offset, 1); 

    const { monthlySheetName } = createMonthlySheetIfNeeded(targetMonthDate);

    const targetMonthName = targetMonthDate.toLocaleString('id-ID', { month: 'long' }).toUpperCase();
    const targetYear = targetMonthDate.getFullYear();
    const targetSheetName = `${targetMonthName} ${targetYear}`;

    const monthlySheet = ss.getSheetByName(targetSheetName);
    const logSheet = ss.getSheetByName(CONFIG.LOG_SHEET);
    const totalSheet = ensureTotalSheetExists(ss);

    if (!monthlySheet || !logSheet || !totalSheet) {
        return { success: false, message: `Sheet ${targetSheetName} belum dibuat/tidak ditemukan.` };
    }

    let weekColumn = 2 + parseInt(targetWeek);
    if (weekColumn > 7) weekColumn = 7;

    const lastRow = monthlySheet.getLastRow();
    if (lastRow < 6) return { success: false, message: "Sheet kosong." };

    const numRowsToUpdate = lastRow - 5;
    const statusRange = monthlySheet.getRange(6, weekColumn, numRowsToUpdate, 1);
    const namaRange = monthlySheet.getRange(6, 1, numRowsToUpdate, 2);

    const oldStatuses = statusRange.getValues();
    const namaValues = namaRange.getValues();
    const totalData = totalSheet.getDataRange().getValues();

    const userMap = {};
    for(let i = 1; i < totalData.length; i++) {
        userMap[totalData[i][0].toString().toLowerCase()] = i;
    }

    const newStatuses = [];
    const logEntries = [];
    const timestamp = new Date();
    const newStatusText = alasanLibur.trim();

    for (let i = 0; i < namaValues.length; i++) {
      const nama = namaValues[i][0];
      const kelas = namaValues[i][1];
      const oldStatus = oldStatuses[i][0];

      newStatuses.push([newStatusText]); 

      if (nama && kelas) {
        const userIndex = userMap[nama.toLowerCase()];
        if (userIndex !== undefined) {
             const oldCat = getStatusCategory(oldStatus);
             const newCat = getStatusCategory(newStatusText);
             
             if (oldCat !== newCat) {
                 const mapCol = { "Hadir": 2, "Izin": 3, "Alpha": 4, "Libur": 5 };
                 if (oldCat !== "-" && mapCol[oldCat]) {
                    totalData[userIndex][mapCol[oldCat]] = Math.max(0, totalData[userIndex][mapCol[oldCat]] - 1);
                 }
                 if (newCat !== "-" && mapCol[newCat]) {
                    totalData[userIndex][mapCol[newCat]]++;
                 }
             }
        }
        logEntries.push([ timestamp, nama, kelas, "Libur", `Di-set oleh admin (${targetMonthName}): ${newStatusText}` ]);
      }
    }

    statusRange.setValues(newStatuses);
    
    if (logEntries.length > 0) {
      logSheet.getRange(logSheet.getLastRow() + 1, 1, logEntries.length, 5).setValues(logEntries);
    }
    
    recalculateAllStatsRealTime(); 

    return { success: true, message: `Status Minggu ${targetWeek} (${targetSheetName}) berhasil diubah.` };

  } catch (error) {
    Logger.log("Error setHolidayStatus: " + error.message);
    return { success: false, message: "Error: " + error.message };
  }
}

function revokeHolidayStatus(adminNama, targetWeek, monthOption) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date();
    
    const offset = monthOption !== undefined ? parseInt(monthOption) : 0;
    let targetMonthDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);

    const { monthlySheetName } = createMonthlySheetIfNeeded(targetMonthDate);
    const targetMonthName = targetMonthDate.toLocaleString('id-ID', { month: 'long' }).toUpperCase();
    const targetYear = targetMonthDate.getFullYear();
    const targetSheetName = `${targetMonthName} ${targetYear}`;

    const monthlySheet = ss.getSheetByName(targetSheetName);
    const logSheet = ss.getSheetByName(CONFIG.LOG_SHEET);
    const totalSheet = ensureTotalSheetExists(ss);

    if (!monthlySheet || !logSheet || !totalSheet) {
        return { success: false, message: `Sheet ${targetSheetName} tidak ditemukan.` };
    }

    let weekColumn = 2 + parseInt(targetWeek);
    if (weekColumn > 7) weekColumn = 7;

    const lastRow = monthlySheet.getLastRow();
    if (lastRow < 6) return { success: false, message: "Sheet kosong." };

    const numRowsToUpdate = lastRow - 5;
    const statusRange = monthlySheet.getRange(6, weekColumn, numRowsToUpdate, 1);
    const namaRange = monthlySheet.getRange(6, 1, numRowsToUpdate, 2);
    
    const oldStatuses = statusRange.getValues();
    const namaValues = namaRange.getValues();
    const totalData = totalSheet.getDataRange().getValues();
    
    const userMap = {};
    for(let i = 1; i < totalData.length; i++) {
        userMap[totalData[i][0].toString().toLowerCase()] = i;
    }

    const newStatuses = [];
    const logEntries = [];
    const timestamp = new Date();
    const newStatusText = "-";

    for (let i = 0; i < namaValues.length; i++) {
      newStatuses.push([newStatusText]);
      const nama = namaValues[i][0];
      const kelas = namaValues[i][1];
      const oldStatus = oldStatuses[i][0];

      if (nama && kelas) {
        const userIndex = userMap[nama.toLowerCase()];
        if (userIndex !== undefined) {
             const oldCat = getStatusCategory(oldStatus);
             const mapCol = { "Hadir": 2, "Izin": 3, "Alpha": 4, "Libur": 5 };
             if (oldCat !== "-" && mapCol[oldCat]) {
                totalData[userIndex][mapCol[oldCat]] = Math.max(0, totalData[userIndex][mapCol[oldCat]] - 1);
             }
        }

        logEntries.push([ timestamp, nama, kelas, "Status Dicabut", `Status di-reset oleh admin (${targetMonthName})` ]);
      }
    }

    statusRange.setValues(newStatuses);
    if (logEntries.length > 0) {
      logSheet.getRange(logSheet.getLastRow() + 1, 1, logEntries.length, 5).setValues(logEntries);
    }
    
    recalculateAllStatsRealTime();

    return { success: true, message: `Status Minggu ${targetWeek} (${targetSheetName}) berhasil di-reset.` };

  } catch (error) {
    Logger.log("Error revoke: " + error.message);
    return { success: false, message: "Error: " + error.message };
  }
}

function getMonthlySheetData(targetSheetName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let monthlySheetName;

    if (targetSheetName && targetSheetName !== "") {
      monthlySheetName = targetSheetName;
    } else {
      const result = createMonthlySheetIfNeeded();
      monthlySheetName = result.monthlySheetName;
    }

    const monthlySheet = ss.getSheetByName(monthlySheetName);
    if (!monthlySheet) {
      return { success: false, message: `Sheet '${monthlySheetName}' tidak ditemukan.` };
    }

    const data = monthlySheet.getDataRange().getValues();
    
    if (!data || data.length <= 3) {
      return { success: false, message: "Sheet bulanan kosong (belum ada data siswa)." };
    }

    const headers = data[2];
    const studentData = data.slice(3);

    return { 
      success: true, 
      sheetName: monthlySheetName, 
      headers: headers,
      studentData: studentData
    };

  } catch (error) {
    return { success: false, message: "Error getMonthlySheetData: " + error.message };
  }
}

function setRunningText(adminNama, text) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
    if (!masterSheet) {
      return { success: false, message: "Sheet Master data tidak ditemukan." };
    }

    masterSheet.getRange("F1").setValue(text);
    return { success: true, message: "Teks berjalan berhasil diupdate." };

  } catch (error) {
    return { success: false, message: "Error setRunningText: " + error.message };
  }
}

function setCameraMessage(adminNama, text) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
    if (!masterSheet) return { success: false, message: "Sheet Master data tidak ditemukan." };

    masterSheet.getRange("F2").setValue(text);
    return { success: true, message: "Pesan kamera berhasil diupdate." };
  } catch (error) {
    return { success: false, message: "Error: " + error.message };
  }
}

function createMonthlySheetIfNeeded(targetDate = null) {
  const ss = getSpreadsheet_();
  const dateToCheck = targetDate || new Date();
  const monthName = dateToCheck.toLocaleString('id-ID', { month: 'long' }).toUpperCase();
  const year = dateToCheck.getFullYear();
  const monthlySheetName = `${monthName} ${year}`;

  let monthlySheet = ss.getSheetByName(monthlySheetName);
  if (monthlySheet) {
    return { monthlySheetName };
  }

  const templateSheet = ss.getSheetByName(CONFIG.TEMPLATE_SHEET);
  if (!templateSheet) {
    Logger.log("ERROR: Sheet template '" + CONFIG.TEMPLATE_SHEET + "' tidak ditemukan!");
    return { monthlySheetName: null };
  }

  const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
  if (!masterSheet) {
    throw new Error("Sheet Master data tidak ditemukan.");
  }

  monthlySheet = templateSheet.copyTo(ss).setName(monthlySheetName);

  const startRowMaster = 7;
  const lastMasterRow = masterSheet.getLastRow();
  const masterDataValues = lastMasterRow >= startRowMaster
    ? masterSheet.getRange(startRowMaster, 2, lastMasterRow - 6, 2).getValues().filter(row => row[0])
    : [];

  const dataToFill = masterDataValues.map(row => [row[0], row[1], "-", "-", "-", "-", "-", ""]);
  const startRowMonthly = 6;

  Logger.log("Jumlah data siswa dibaca: " + masterDataValues.length);
  Logger.log("Data siap ditulis (sample): " + JSON.stringify(dataToFill.slice(0, 3)));

  if (dataToFill.length > 0) {
    monthlySheet.getRange(startRowMonthly, 1, dataToFill.length, dataToFill[0].length).setValues(dataToFill);
  }

  monthlySheet.showSheet();
  SpreadsheetApp.flush();

  return { monthlySheetName };
}

function logAttendance(nama, kelas, status, location) {
  try {
    const ss = getSpreadsheet_();
    let logSheet = ss.getSheetByName(CONFIG.LOG_SHEET);
    if (!logSheet) {
      logSheet = ss.insertSheet(CONFIG.LOG_SHEET);
      logSheet.appendRow(["Timestamp", "Nama", "Kelas", "Status", "Location"]);
      logSheet.getRange(1, 1, 1, 5).setFontWeight("bold");
    }
    logSheet.appendRow([new Date(), nama, kelas, status, location]);
    SpreadsheetApp.flush();
    return { success: true };
  } catch (error) {
    Logger.log("Error logging attendance: " + error.message);
    return { success: false, message: error.message };
  }
}

function checkIfAlreadySubmitted(nama) {
  const ss = getSpreadsheet_();
  const creationResult = createMonthlySheetIfNeeded();
  const monthlySheetName = creationResult && creationResult.monthlySheetName;
  const monthlySheet = ss.getSheetByName(monthlySheetName);
  if (!monthlySheet) return { submitted: true, message: `Error: Sheet bulanan '${monthlySheetName}' tidak ditemukan.` };

  const currentWeek = getCurrentWeekNumber();
  let weekColumn = 2 + currentWeek;
  if (weekColumn > 7) weekColumn = 7;
  const totalRows = monthlySheet.getLastRow() - 5;
  if (totalRows <= 0) return { submitted: true, message: "Data siswa pada sheet bulanan kosong." };
  const namesValues = monthlySheet.getRange(6, 1, totalRows, 1).getValues();

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

function markHadirViaQR(nama, kelas, qrCodeData, latitude, longitude, imageData) {
  try {
    const submissionCheck = checkIfAlreadySubmitted(nama);
    if (submissionCheck.submitted) return { success: false, message: submissionCheck.message };
    if (!isAttendanceWindowOpen()) return { success: false, message: "Absensi hanya dibuka pada hari Sabtu, jam 8:00 - 16:00." };
    if (qrCodeData !== CONFIG.QR_SECRET_KEY) return { success: false, message: "QR Code tidak valid." };

    if (!latitude || !longitude) {
      return { success: false, message: "Lokasi Anda tidak terdeteksi. Pastikan GPS aktif dan izinkan akses lokasi." };
    }

    const TARGET_LAT = 0.0; // ISI LATITUDE TARGET DI SINI
    const TARGET_LON = 0.0; // ISI LONGITUDE TARGET DI SINI
    const MAX_DISTANCE_METERS = 110;
    const distance = getDistance(latitude, longitude, TARGET_LAT, TARGET_LON);
    if (distance > MAX_DISTANCE_METERS) {
      return { success: false, message: `Lokasi Anda terlalu jauh (${Math.round(distance)} meter). Anda harus berada dalam radius ${MAX_DISTANCE_METERS} meter.` };
    }

    if (!imageData) {
      return { success: false, message: "Foto bukti kehadiran wajib diambil." };
    }

    const upload = uploadEvidenceImage_(imageData, CONFIG.DRIVE_HADIR_FOLDER_ID, "HADIR", nama);
    const cellValueMonthly = `Hadir, ${upload.fileUrl}`;
    const updateResult = updateMonthlySheet(nama, kelas, cellValueMonthly);

    if (!updateResult.success) {
      safeTrashFile_(upload.fileId);
      return updateResult;
    }

    const locationStringLog = `Via QR Code (Jarak: ${Math.round(distance)} meter)`;
    logAttendance(nama, kelas, "Hadir", locationStringLog);
    updateAndSaveStreak(nama, kelas);
    syncUserTotalStats(nama);

    const extraInfo = upload.sharingWarning ? " " + upload.sharingWarning : "";
    return {
      success: true,
      message: `Absensi Hadir berhasil dicatat! (Jarak: ${Math.round(distance)} meter).${extraInfo}`,
      fileUrl: upload.fileUrl,
      sharingMode: upload.sharingMode
    };
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
    if (!alasan || alasan.trim() === "") return { success: false, message: "Alasan izin tidak boleh kosong." };
    if (!imageData) return { success: false, message: "Foto bukti tidak boleh kosong." };

    const upload = uploadEvidenceImage_(imageData, CONFIG.DRIVE_FOLDER_ID, "IZIN", nama);
    const cellValue = `(${alasan}, ${upload.fileUrl})`;
    const updateResult = updateMonthlySheet(nama, kelas, cellValue);

    if (!updateResult.success) {
      safeTrashFile_(upload.fileId);
      return updateResult;
    }

    logAttendance(nama, kelas, "Izin", cellValue);
    updateAndSaveStreak(nama, kelas);
    syncUserTotalStats(nama);

    const extraInfo = upload.sharingWarning ? " " + upload.sharingWarning : "";
    return {
      success: true,
      message: "Pengajuan Izin berhasil dicatat." + extraInfo,
      fileUrl: upload.fileUrl,
      sharingMode: upload.sharingMode
    };
  } catch (error) {
    Logger.log("Error saat memproses izin: " + error.message + " | stack: " + error.stack);
    return { success: false, message: "Error saat memproses izin: " + error.message };
  }
}

function tandaiAlphaOtomatis() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date();

  if (now.getDay() !== 6) {
    Logger.log("Bukan hari Sabtu, tandaiAlphaOtomatis dihentikan.");
    return; 
  }

  const monthName = now.toLocaleString('id-ID', { month: 'long' }).toUpperCase();
  const year = now.getFullYear();
  const sheetName = `${monthName} ${year}`;
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    Logger.log(`Sheet ${sheetName} tidak ditemukan.`);
    return;
  }

  const weekToCheck = getCurrentWeekNumber();
  let columnToCheck = 2 + weekToCheck;
  if (columnToCheck > 7) columnToCheck = 7;

  const startRow = 6;
  const numRows = sheet.getLastRow() - (startRow - 1);
  if (numRows <= 0) {
     Logger.log(`Tidak ada data siswa di ${sheetName}.`);
     return;
  }

  const nameClassRange = sheet.getRange(startRow, 1, numRows, 2);
  const nameClassValues = nameClassRange.getValues();

  const statusRange = sheet.getRange(startRow, columnToCheck, numRows, 1);
  const statusValues = statusRange.getValues();

  let alphaCount = 0;
  const logEntries = [];
  const timestamp = new Date();

  for (let i = 0; i < statusValues.length; i++) {
    const status = statusValues[i][0].toString().trim();

    if (status === "" || status === "-") {
      statusValues[i][0] = "Alpha";
      alphaCount++;

      const nama = nameClassValues[i][0];
      const kelas = nameClassValues[i][1];

      if (nama && kelas) {
        logEntries.push([
          timestamp,
          nama,
          kelas,
          "Alpha",
          "Otomatis ditandai Alpha (melebihi batas waktu)"
        ]);
        updateAndSaveStreak(nama, kelas);
      }
    }
  }

  if (alphaCount > 0) {
    statusRange.setValues(statusValues);
    Logger.log(`Berhasil menandai ${alphaCount} siswa sebagai Alpha di ${sheetName}, Minggu ${weekToCheck}.`);

    if (logEntries.length > 0) {
      const logSheet = ss.getSheetByName(CONFIG.LOG_SHEET);
      if (logSheet) {
        logSheet.getRange(logSheet.getLastRow() + 1, 1, logEntries.length, 5).setValues(logEntries);
        Logger.log(`Berhasil mencatat ${logEntries.length} log Alpha baru.`);
      }
    }
  } else {
    Logger.log(`Tidak ada siswa yang ditandai Alpha di ${sheetName}, Minggu ${weekToCheck}.`);
  }
  Logger.log("Menjalankan sinkronisasi Data Total...");
  recalculateAllStatsRealTime();
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

function ensureDataTotalSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
  let totalSheet = ss.getSheetByName(CONFIG.TOTAL_SHEET);

  if (!totalSheet) {
    totalSheet = ss.insertSheet(CONFIG.TOTAL_SHEET);
    totalSheet.appendRow(["Nama", "Kelas", "Hadir", "Izin", "Alpha", "Libur"]);
    totalSheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#cfe2f3");
    totalSheet.setFrozenRows(1);
  }

  const masterData = masterSheet.getRange(7, 2, masterSheet.getLastRow() - 6, 2).getValues();
  const totalData = totalSheet.getDataRange().getValues();
  
  const existingNames = totalData.map(r => r[0].toString().toLowerCase());

  masterData.forEach(row => {
    const nama = row[0];
    const kelas = row[1];
    if (nama && !existingNames.includes(nama.toString().toLowerCase())) {
      totalSheet.appendRow([nama, kelas, 0, 0, 0, 0]); 
    }
  });
}

function syncToTotalSheet(nama, kelas, oldStatusRaw, newStatusRaw) {
  try {
    ensureDataTotalSheet();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const totalSheet = ss.getSheetByName(CONFIG.TOTAL_SHEET);
    
    const categorize = (s) => {
      if (!s) return null;
      const str = s.toString().trim();
      if (str === "" || str === "-") return null;
      if (str.startsWith("Hadir") || str.includes("!Hadir")) return "Hadir";
      if (str.includes("Izin") || str.includes("!Izin") || str.startsWith("(")) return "Izin";
      if (str === "Alpha" || str.includes("!Alpha")) return "Alpha";
      if (str.toLowerCase().includes("libur")) return "Libur";
      return null;
    };

    const oldCategory = categorize(oldStatusRaw);
    const newCategory = categorize(newStatusRaw);

    if (oldCategory === newCategory) return;

    const textFinder = totalSheet.getRange("A:A").createTextFinder(nama).matchEntireCell(true);
    const result = textFinder.findNext();
    
    if (!result) {
      totalSheet.appendRow([nama, kelas, 0, 0, 0, 0]);
      syncToTotalSheet(nama, kelas, oldStatusRaw, newStatusRaw);
      return;
    }
    
    const row = result.getRow();
    const rangeValues = totalSheet.getRange(row, 3, 1, 4);
    let values = rangeValues.getValues()[0];

    if (oldCategory === "Hadir") values[0] = Math.max(0, values[0] - 1);
    else if (oldCategory === "Izin") values[1] = Math.max(0, values[1] - 1);
    else if (oldCategory === "Alpha") values[2] = Math.max(0, values[2] - 1);
    else if (oldCategory === "Libur") values[3] = Math.max(0, values[3] - 1);

    if (newCategory === "Hadir") values[0]++;
    else if (newCategory === "Izin") values[1]++;
    else if (newCategory === "Alpha") values[2]++;
    else if (newCategory === "Libur") values[3]++;

    rangeValues.setValues([values]);
    
  } catch (e) {
    Logger.log("Error syncToTotalSheet: " + e.message);
  }
}

function recalculateAllStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const totalSheet = ensureTotalSheetExists(ss);
  
  const lastRow = totalSheet.getLastRow();
  if (lastRow > 1) {
    totalSheet.getRange(2, 3, lastRow - 1, 4).setValue(0);
  }
  
  const allSheets = ss.getSheets();
  let processedSheets = 0;
  
  allSheets.forEach(sheet => {
    if (sheet.getName().includes("2025") || sheet.getName().includes("2026")) {
      Logger.log("Memproses sheet: " + sheet.getName());
      
      const lastRowSheet = sheet.getLastRow();
      if (lastRowSheet >= 6) {
        const data = sheet.getRange(6, 1, lastRowSheet - 5, 7).getValues();
        
        data.forEach(row => {
          const nama = row[0];
          for (let col = 2; col <= 6; col++) {
            const status = row[col];
            if (status && status !== "-") {
               updateUserStat(ss, nama, "-", status);
            }
          }
        });
        processedSheets++;
      }
    }
  });
  
  Logger.log(`Selesai! Memproses ${processedSheets} sheet bulanan.`);
}

function getStreakCategory(rawStatus) {
  const s = rawStatus.toString().trim();
  if (s === "" || s === "-") return null; 

  if (s.includes("Hadir")) return "Hadir"; 
  if (s.includes("Alpha")) return "Alpha"; 
  if (s.includes("Izin") || s.startsWith("(")) return "Izin";
  if (s.toLowerCase().includes("libur")) return "Libur";
  return null;
}

function ensureStreakSheetExists(ss, nama, kelas) {
  let streakSheet = ss.getSheetByName(CONFIG.STREAK_SHEET);
  if (!streakSheet) {
    streakSheet = ss.insertSheet(CONFIG.STREAK_SHEET);
    streakSheet.appendRow(["Nama", "Kelas", "Streak Count"]);
    streakSheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#c9daf8");
  }

  const data = streakSheet.getDataRange().getValues();
  let userExists = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === nama.toLowerCase()) {
      userExists = true;
      break;
    }
  }
  if (!userExists) {
    streakSheet.appendRow([nama, kelas, 0]);
  }
  return streakSheet;
}

function recalculateAllStreaks() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const streakSheet = ss.getSheetByName(CONFIG.STREAK_SHEET);
    
    const monthMap = {
      "JANUARI": 0, "FEBRUARI": 1, "MARET": 2, "APRIL": 3, "MEI": 4, "JUNI": 5,
      "JULI": 6, "AGUSTUS": 7, "SEPTEMBER": 8, "OKTOBER": 9, "NOVEMBER": 10, "DESEMBER": 11
    };

    const allSheets = ss.getSheets();
    const monthlySheets = [];

    allSheets.forEach(sheet => {
      const name = sheet.getName().trim().toUpperCase();
      const parts = name.split(" ");
      if (parts.length === 2 && monthMap.hasOwnProperty(parts[0]) && !isNaN(parts[1])) {
        monthlySheets.push({
          sheet: sheet,
          monthIndex: monthMap[parts[0]],
          year: parseInt(parts[1]),
          name: name
        });
      }
    });

    monthlySheets.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.monthIndex - b.monthIndex;
    });

    Logger.log(`Urutan Perhitungan: ${monthlySheets.map(s => s.name).join(" -> ")}`);

    if (monthlySheets.length === 0) {
      return { success: false, message: "Tidak ada sheet laporan bulanan." };
    }

    const userTimeline = {}; 

    monthlySheets.forEach(meta => {
      const sheet = meta.sheet;
      const lastRow = sheet.getLastRow();
      if (lastRow < 6) return;

      const data = sheet.getRange(6, 1, lastRow - 5, 7).getValues();

      data.forEach(row => {
        const nama = row[0];
        if (!nama) return;
        const cleanNama = nama.toString().trim().toLowerCase();
        if (!userTimeline[cleanNama]) userTimeline[cleanNama] = [];

        for (let col = 2; col <= 6; col++) {
          let status = row[col];
          if (typeof status !== 'string') status = String(status);
          userTimeline[cleanNama].push(status.trim());
        }
      });
    });

    const streakResults = {};

    for (const [namaLower, statuses] of Object.entries(userTimeline)) {
      let currentStreak = 0;

      statuses.forEach(rawStatus => {
        const s = rawStatus.toLowerCase();
        let category = "-";

        if (s.includes("hadir") || s.includes("!hadir")) category = "Hadir";
        else if (s.includes("alpha") || s.includes("!alpha")) category = "Alpha";
        else if (s.includes("izin") || s.includes("!izin") || s.startsWith("(")) category = "Izin";
        else if (s.includes("libur")) category = "Libur";
        
        if (category === "Hadir") {
           currentStreak++;
        } 
        else if (category === "Alpha") {
           currentStreak = 0;
        } 
      });

      streakResults[namaLower] = currentStreak;
    }

    if (!streakSheet) return { success: false, message: "Sheet Streak Data hilang!" };
    
    const streakData = streakSheet.getDataRange().getValues();
    const updates = [];
    
    for (let i = 1; i < streakData.length; i++) {
        const namaSheet = streakData[i][0].toString().trim().toLowerCase();
        const newStreak = streakResults[namaSheet] !== undefined ? streakResults[namaSheet] : 0;
        updates.push([newStreak]);
    }

    if (updates.length > 0) {
        streakSheet.getRange(2, 3, updates.length, 1).setValues(updates);
    }

    return { success: true, message: `Sukses! Streak dihitung ulang.` };

  } catch (error) {
    return { success: false, message: "Error: " + error.message };
  }
}

function injectHistoryFromMonthlySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName(CONFIG.LOG_SHEET);
  
  const TARGET_SHEET_NAME = "NOVEMBER 2025";
  const TARGET_MONTH_INDEX = 10;
  const TARGET_YEAR = 2025;

  const monthlySheet = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!monthlySheet) {
    Logger.log(`Sheet "${TARGET_SHEET_NAME}" tidak ditemukan!`);
    return;
  }

  const lastRow = monthlySheet.getLastRow();
  if (lastRow < 6) return;
  
  const data = monthlySheet.getRange(6, 1, lastRow - 5, 7).getValues();
  const newLogs = [];
  let count = 0;

  function getFirstSaturday(year, monthIndex) {
    const d = new Date(year, monthIndex, 1);
    const day = d.getDay();
    const diff = (6 - day + 7) % 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  const firstSaturday = getFirstSaturday(TARGET_YEAR, TARGET_MONTH_INDEX);

  Logger.log(`Mulai membaca ${data.length} siswa dari ${TARGET_SHEET_NAME}...`);

  data.forEach(row => {
    const nama = row[0];
    const kelas = row[1];
    
    for (let i = 2; i <= 6; i++) {
      const statusRaw = row[i];
      if (statusRaw && statusRaw.toString().trim() !== "" && statusRaw.toString().trim() !== "-") {
        const weekIndex = i - 1; 
        const fakeDate = new Date(firstSaturday);
        fakeDate.setDate(firstSaturday.getDate() + ((weekIndex - 1) * 7));
        fakeDate.setHours(12, 0, 0);

        newLogs.push([
          fakeDate,
          nama,
          kelas,
          statusRaw,
          `Injeksi History (${TARGET_SHEET_NAME} - W${weekIndex})`
        ]);
        
        count++;
      }
    }
  });

  if (newLogs.length > 0) {
    logSheet.getRange(logSheet.getLastRow() + 1, 1, newLogs.length, 5).setValues(newLogs);
    Logger.log(`✅ Berhasil menyuntikkan ${count} log baru ke Log Absensi.`);
    Logger.log("🔄 Menghitung ulang semua streak...");
    recalculateAllStreaks(); 
  } else {
    Logger.log("⚠️ Tidak ada data status yang perlu dipindahkan.");
  }
}

function traceUserStreak() {
  const targetNama = "NAMA_SISWA_DEBUG"; 
  const targetKelas = "KELAS_DEBUG";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName(CONFIG.LOG_SHEET);
  const allLogData = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 4).getValues();

  Logger.log(`=== MULAI PENELUSURAN STREAK: ${targetNama} ===`);

  let userLogs = allLogData.filter(row => 
      row[1].toString().toLowerCase() === targetNama.toLowerCase() && 
      row[2].toString().toLowerCase() === targetKelas.toLowerCase()
  );

  Logger.log(`Total Log Mentah Ditemukan: ${userLogs.length}`);

  let finalStatusesByWeek = {};
  userLogs.forEach(row => {
      const timestamp = new Date(row[0]);
      const status = row[3].toString().trim();
      const weekIndex = getWeekOfMonth(timestamp); 
      const month = timestamp.getMonth() + 1;
      const weekId = `2025-${month}-${weekIndex}`;
      
      finalStatusesByWeek[weekId] = status;
  });

  const sortedWeekIds = Object.keys(finalStatusesByWeek).sort();
  Logger.log(`Minggu Final yang akan dihitung: ${JSON.stringify(sortedWeekIds)}`);

  let streakCount = 0;

  const cekKategori = (s) => {
    if (!s) return "-";
    const str = s.toString().trim();
    if (str.startsWith("Hadir") || str.startsWith("!Hadir")) return "Hadir";
    if (str.startsWith("Alpha") || str.startsWith("!Alpha")) return "Alpha";
    if (str.toLowerCase().includes("libur")) return "Libur";
    return "Izin";
  };

  sortedWeekIds.forEach(weekId => {
      const rawStatus = finalStatusesByWeek[weekId];
      const category = cekKategori(rawStatus);
      const oldStreak = streakCount;

      if (category === "Hadir") {
          streakCount++;
          Logger.log(`[${weekId}] Status: "${rawStatus}" -> Kategori: HADIR (+1). Streak: ${oldStreak} -> ${streakCount}`);
      } else if (category === "Izin") {
          if (streakCount > 0) streakCount--;
          Logger.log(`[${weekId}] Status: "${rawStatus}" -> Kategori: IZIN (-1). Streak: ${oldStreak} -> ${streakCount}`);
      } else if (category === "Alpha") {
          streakCount = 0;
          Logger.log(`[${weekId}] Status: "${rawStatus}" -> Kategori: ALPHA (Reset). Streak: ${oldStreak} -> ${streakCount}`);
      } else if (category === "Libur" || category === "-") {
          Logger.log(`[${weekId}] Status: "${rawStatus}" -> Kategori: LIBUR (Tetap). Streak: ${oldStreak} -> ${streakCount}`);
      } else {
          streakCount = 0;
          Logger.log(`[${weekId}] Status: "${rawStatus}" -> Kategori: ??? (Reset). Streak: ${oldStreak} -> ${streakCount}`);
      }
  });

  Logger.log(`=== HASIL AKHIR STREAK: ${streakCount} ===`);
}

function normalizeCategory(rawStatus) {
  if (!rawStatus) return "-";
  const s = rawStatus.toString().trim().toLowerCase();
  
  if (s === "" || s === "-") return "-";
  if (s.includes("hadir") || s.includes("!hadir")) return "Hadir";
  if (s.includes("alpha") || s.includes("!alpha")) return "Alpha";
  if (s.includes("izin") || s.includes("!izin") || s.startsWith("(")) return "Izin";
  if (s.includes("libur")) return "Libur";
  
  return "-";
}

function syncUserTotalStats(nama) {
  try {
    const ss = getSpreadsheet_();
    const totalSheet = ensureTotalSheetExists(ss);
    let stats = { Hadir: 0, Izin: 0, Alpha: 0, Libur: 0 };

    ss.getSheets().forEach(sheet => {
      const sheetName = sheet.getName();
      if (sheetName.match(/^[A-Z]+\s\d{4}$/)) {
        const founder = sheet.getRange("A:A").createTextFinder(nama).matchEntireCell(true).findNext();
        if (founder) {
          const row = founder.getRow();
          const statuses = sheet.getRange(row, 3, 1, 5).getValues()[0];
          statuses.forEach(st => {
            const cat = normalizeCategory(st);
            if (stats[cat] !== undefined) stats[cat]++;
          });
        }
      }
    });

    const founderTotal = totalSheet.getRange("A:A").createTextFinder(nama).matchEntireCell(true).findNext();
    if (founderTotal) {
      const rowTotal = founderTotal.getRow();
      totalSheet.getRange(rowTotal, 3, 1, 4).setValues([[stats.Hadir, stats.Izin, stats.Alpha, stats.Libur]]);
      SpreadsheetApp.flush();
    }

    return true;
  } catch (e) {
    Logger.log("Error syncUserTotalStats: " + e.message);
    return false;
  }
}

function getAvailableSheets() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    const sheetNames = [];
    const regex = /^[A-Z]+\s\d{4}$/;

    sheets.forEach(sheet => {
      const name = sheet.getName();
      if (regex.test(name)) {
        sheetNames.push(name);
      }
    });

    return { success: true, sheets: sheetNames };
  } catch (error) {
    return { success: false, message: "Error getAvailableSheets: " + error.message };
  }
}

function recalculateAllStatsRealTime() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const totalSheet = ensureTotalSheetExists(ss);
  
  const totalDataRange = totalSheet.getDataRange();
  const totalValues = totalDataRange.getValues();
  
  const userStats = {};
  const userRowIndex = {};

  for (let i = 1; i < totalValues.length; i++) {
    const nama = totalValues[i][0].toString().trim();
    if (nama) {
      userStats[nama] = { Hadir: 0, Izin: 0, Alpha: 0, Libur: 0 };
      userRowIndex[nama] = i + 1;
    }
  }

  const allSheets = ss.getSheets();
  
  allSheets.forEach(sheet => {
    if (sheet.getName().match(/[A-Z]+\s\d{4}/)) {
      const lastRow = sheet.getLastRow();
      if (lastRow >= 6) {
        const sheetData = sheet.getRange(6, 1, lastRow - 5, 7).getValues();
        
        sheetData.forEach(row => {
          const nama = row[0] ? row[0].toString().trim() : "";
          
          if (userStats[nama]) {
            for (let c = 2; c <= 6; c++) {
              const cat = normalizeCategory(row[c]);
              if (userStats[nama][cat] !== undefined) {
                userStats[nama][cat]++;
              }
            }
          }
        });
      }
    }
  });

  for (let i = 1; i < totalValues.length; i++) {
    const nama = totalValues[i][0].toString().trim();
    if (userStats[nama]) {
      totalValues[i][2] = userStats[nama].Hadir;
      totalValues[i][3] = userStats[nama].Izin;
      totalValues[i][4] = userStats[nama].Alpha;
      totalValues[i][5] = userStats[nama].Libur;
    }
  }

  totalSheet.getRange(1, 1, totalValues.length, 6).setValues(totalValues);
  Logger.log("Recalculate All Stats Selesai!");
}
