const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const path = require("path");

app.setName("SIMANTU");
app.setAppUserModelId("com.ugm.simantu");

const UPDATE_STATUS_CHANNEL = "app-update-status";
const DEFAULT_GITHUB_OWNER = "MAG2603";
const DEFAULT_GITHUB_REPO = "SIMANTU-UGM";
const GITHUB_OWNER = process.env.SIMANTU_GITHUB_OWNER || DEFAULT_GITHUB_OWNER;
const GITHUB_REPO = process.env.SIMANTU_GITHUB_REPO || DEFAULT_GITHUB_REPO;
const GITHUB_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";

let mainWindow = null;
let tray = null;
let isQuitting = false;
let updaterInitialized = false;
let updateReadyToInstall = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function resolveAssetPath(fileName) {
  const resourcesPath = process.resourcesPath || "";
  const candidates = [
    resourcesPath ? path.join(resourcesPath, "public", fileName) : "",
    path.join(__dirname, "..", "dist", "public", fileName),
    path.join(__dirname, "..", "client", "public", fileName),
    path.join(process.cwd(), "dist", "public", fileName),
    path.join(process.cwd(), "client", "public", fileName),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

const APP_ICON_ICO = resolveAssetPath("logo_aplikasi.ico");
const APP_ICON_PNG = resolveAssetPath("logo_aplikasi.png") || APP_ICON_ICO;

function emitUpdaterStatus(payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(UPDATE_STATUS_CHANNEL, payload);
  }
}

function showSystemNotification(title, body) {
  try {
    const safeBody = (typeof body === "string" && body.trim()) ? body.trim() : "SIMANTU — Sistem Informasi Pengumuman Terpadu";
    const notifOptions = {
      title,
      body: safeBody,
    };

    if (APP_ICON_PNG) {
      notifOptions.icon = APP_ICON_PNG;
    }

    const notif = new Notification(notifOptions);

    notif.on("click", () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    });

    notif.show();
  } catch (error) {
    console.warn("[SIMANTU] Notification error:", error);
  }
}

function publishUpdaterStatus(type, message, extra = {}) {
  const payload = { type, message, ...extra };
  console.log("[SIMANTU][Updater]", type, message);
  emitUpdaterStatus(payload);
}

async function checkForUpdatesNow() {
  if (!app.isPackaged) {
    const message = "Auto-update hanya aktif pada aplikasi yang sudah di-install.";
    publishUpdaterStatus("disabled", message);
    return { ok: false, message };
  }

  try {
    publishUpdaterStatus("checking", "Memeriksa pembaruan aplikasi...");
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, info: result?.updateInfo ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    publishUpdaterStatus("error", `Gagal memeriksa pembaruan: ${message}`, { error: message });
    return { ok: false, message };
  }
}

function installUpdateNow() {
  if (!updateReadyToInstall) return false;

  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });

  return true;
}

function setupAutoUpdater() {
  if (updaterInitialized || !app.isPackaged) return;

  updaterInitialized = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  // Use production feed by default; env vars can override for staging/testing.
  if (GITHUB_OWNER && GITHUB_REPO) {
    autoUpdater.setFeedURL({
      provider: "github",
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      private: false,
      token: GITHUB_TOKEN || undefined,
    });
  }

  autoUpdater.on("checking-for-update", () => {
    publishUpdaterStatus("checking", "Memeriksa pembaruan aplikasi...");
  });

  autoUpdater.on("update-available", (info) => {
    const versionText = info?.version ? `v${info.version}` : "versi terbaru";
    publishUpdaterStatus("available", `Pembaruan ${versionText} ditemukan. Mengunduh di latar belakang...`, {
      version: info?.version,
    });
    showSystemNotification("Update SIMANTU tersedia", `Versi ${versionText} sedang diunduh otomatis.`);
  });

  autoUpdater.on("update-not-available", () => {
    publishUpdaterStatus("not-available", "Aplikasi sudah menggunakan versi terbaru.");
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress?.percent ?? 0);
    publishUpdaterStatus("downloading", `Mengunduh pembaruan ${percent}%`, {
      percent,
      transferred: progress?.transferred,
      total: progress?.total,
      bytesPerSecond: progress?.bytesPerSecond,
    });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    updateReadyToInstall = true;
    const versionText = info?.version ? `v${info.version}` : "versi terbaru";

    publishUpdaterStatus("downloaded", `Pembaruan ${versionText} siap diinstal.`, {
      version: info?.version,
    });

    showSystemNotification("Pembaruan SIMANTU siap", "Restart aplikasi untuk memasang versi terbaru.");

    const result = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart Sekarang", "Nanti"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: "Pembaruan SIMANTU",
      message: "Versi terbaru sudah selesai diunduh.",
      detail: "Aplikasi akan restart untuk memasang pembaruan.",
    });

    if (result.response === 0) {
      installUpdateNow();
    }
  });

  autoUpdater.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    publishUpdaterStatus("error", `Updater mengalami kendala: ${message}`, { error: message });
  });

  setTimeout(() => {
    void checkForUpdatesNow();
  }, 5000);
}

function getErrorPage(serverUrl) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #004175;
      color: white;
      font-family: 'Segoe UI', system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
      -webkit-app-region: drag;
    }
    .container { text-align: center; max-width: 480px; padding: 40px; }
    .icon {
      width: 80px; height: 80px; margin: 0 auto 24px;
      background: rgba(249,187,0,0.15); border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }
    .icon svg { width: 40px; height: 40px; color: #F9BB00; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; color: #F9BB00; }
    p { font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.7); margin-bottom: 8px; }
    .status {
      margin-top: 24px; padding: 16px;
      background: rgba(255,255,255,0.08); border-radius: 12px;
      font-size: 13px; color: rgba(255,255,255,0.5);
    }
    .dot {
      display: inline-block; width: 8px; height: 8px;
      background: #F9BB00; border-radius: 50%; margin-right: 8px;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }
    .retry-btn {
      -webkit-app-region: no-drag;
      margin-top: 20px; padding: 10px 28px;
      background: #F9BB00; color: #004175; border: none; border-radius: 8px;
      font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .retry-btn:hover { opacity: 0.85; }
    .footer { margin-top: 32px; font-size: 11px; color: rgba(255,255,255,0.3); }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
      </svg>
    </div>
    <h1>Tidak Ada Koneksi</h1>
    <p>Aplikasi SIMANTU memerlukan koneksi jaringan untuk memuat halaman.</p>
    <p>Pastikan perangkat terhubung ke jaringan lokal atau WiFi.</p>
    <div class="status">
      <span class="dot"></span>
      <span id="statusText">Mencoba menghubungkan kembali...</span>
    </div>
    <button class="retry-btn" onclick="tryReconnect()">Coba Lagi</button>
    <div class="footer">SIMANTU &mdash; Sistem Informasi Pengumuman Terpadu UGM</div>
  </div>
  <script>
    const serverUrl = "${serverUrl}";
    let retryCount = 0;
    async function tryReconnect() {
      document.getElementById("statusText").textContent = "Menghubungkan...";
      try {
        const r = await fetch(serverUrl + "/api/status", { signal: AbortSignal.timeout(3000) });
        if (r.ok) { document.getElementById("statusText").textContent = "Terhubung!"; window.location.href = serverUrl; return; }
      } catch(_) {}
      retryCount++;
      document.getElementById("statusText").textContent = "Belum terhubung. Percobaan ke-" + retryCount;
    }
    setInterval(tryReconnect, 5000);
    setTimeout(tryReconnect, 2000);
  </script>
</body></html>`)}`;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#004175",
    show: false,
    autoHideMenuBar: true,
    fullscreen: true,
    frame: false,
    icon: APP_ICON_ICO || undefined,
    title: "SIMANTU - Sistem Informasi Pengumuman Terpadu",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.loadURL(url).catch(() => {
    mainWindow.loadURL(getErrorPage(url));
  });

  mainWindow.webContents.on("did-fail-load", (_event, _code, _desc, failedUrl) => {
    if (failedUrl && !failedUrl.startsWith("data:")) {
      mainWindow.loadURL(getErrorPage(url));
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.setFullScreen(true);
  });

  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("hide", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("window-hidden");
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Window control IPC handlers
ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
  if (mainWindow?.isFullScreen()) {
    mainWindow.setFullScreen(false);
  } else if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on("window-close", () => mainWindow?.close());

// Native notification handler
ipcMain.on("show-notification", (_event, payload, bodyFallback) => {
  if (typeof payload === "string") {
    showSystemNotification(payload, typeof bodyFallback === "string" ? bodyFallback : "");
    return;
  }

  if (payload && typeof payload === "object") {
    const title = typeof payload.title === "string" ? payload.title : "SIMANTU";
    const body = typeof payload.body === "string" ? payload.body : "";
    showSystemNotification(title, body);
  }
  // ignore malformed payloads silently
});

ipcMain.handle("app-update-check", async () => {
  return checkForUpdatesNow();
});

ipcMain.handle("app-update-install", async () => {
  if (installUpdateNow()) {
    return { ok: true };
  }

  return {
    ok: false,
    message: "Belum ada pembaruan yang siap diinstal.",
  };
});

app.whenReady().then(async () => {
  const isDev = !app.isPackaged;

  const trayIconPath = APP_ICON_ICO || APP_ICON_PNG;
  if (trayIconPath) {
    tray = new Tray(trayIconPath);
    tray.setToolTip("SIMANTU - Sistem Informasi Pengumuman Terpadu UGM");
    const trayMenu = Menu.buildFromTemplate([
      {
        label: "Buka SIMANTU",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.setFullScreen(true);
          }
        },
      },
      {
        label: "Periksa Pembaruan",
        click: () => {
          void checkForUpdatesNow();
        },
      },
      { type: "separator" },
      {
        label: "Keluar",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setContextMenu(trayMenu);
    tray.on("double-click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.setFullScreen(true);
      }
    });
  } else {
    console.warn("[SIMANTU] Tray icon tidak ditemukan, tray dinonaktifkan.");
  }

  if (isDev) {
    createWindow("http://localhost:5000");
  } else {
    try {
      // Production: set data directory and start embedded server
      process.env.SIMANTU_DATA_DIR = app.getPath("userData");
      process.env.NODE_ENV = "production";
      process.env.SIMANTU_EMBEDDED_ELECTRON = "1";

      const serverEntry = path.join(__dirname, "..", "dist-electron", "server.cjs");
      const { startServer } = require(serverEntry);
      const port = await startServer();
      createWindow(`http://localhost:${port}`);
      setupAutoUpdater();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox(
        "SIMANTU gagal dijalankan",
        `Backend lokal tidak dapat dimulai.\n\n${message}`,
      );
      app.quit();
    }
  }
});

app.on("window-all-closed", () => {
  if (isQuitting) app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow("http://localhost:5000");
  }
});

app.on("second-instance", () => {
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
  mainWindow.setFullScreen(true);
});
