const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");

let mainWindow = null;
let notifWindow = null;

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
    }
    .container {
      text-align: center;
      max-width: 480px;
      padding: 40px;
    }
    .icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      background: rgba(249,187,0,0.15);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon svg { width: 40px; height: 40px; color: #F9BB00; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; color: #F9BB00; }
    p { font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.7); margin-bottom: 8px; }
    .status {
      margin-top: 24px;
      padding: 16px;
      background: rgba(255,255,255,0.08);
      border-radius: 12px;
      font-size: 13px;
      color: rgba(255,255,255,0.5);
    }
    .dot {
      display: inline-block;
      width: 8px; height: 8px;
      background: #F9BB00;
      border-radius: 50%;
      margin-right: 8px;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }
    .retry-btn {
      margin-top: 20px;
      padding: 10px 28px;
      background: #F9BB00;
      color: #004175;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
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
    <p>Aplikasi SIMANTU memerlukan koneksi jaringan untuk memuat halaman. Pastikan perangkat terhubung ke jaringan lokal atau WiFi.</p>
    <p>Fitur Text-to-Speech juga memerlukan koneksi internet untuk berfungsi.</p>
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
      const statusText = document.getElementById("statusText");
      statusText.textContent = "Menghubungkan...";
      try {
        const res = await fetch(serverUrl + "/api/status", { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          statusText.textContent = "Terhubung! Memuat aplikasi...";
          window.location.href = serverUrl;
          return;
        }
      } catch (_) {}
      retryCount++;
      statusText.textContent = "Belum terhubung. Percobaan ke-" + retryCount;
    }

    // Auto-retry every 5 seconds
    setInterval(tryReconnect, 5000);
    // First attempt after 2s
    setTimeout(tryReconnect, 2000);
  </script>
</body>
</html>
  `)}`;
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
    title: "SIMANTU - Sistem Informasi Pengumuman Terpadu",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.loadURL(url).catch(() => {
    // If main URL fails, show error page with auto-retry
    mainWindow.loadURL(getErrorPage(url));
  });

  // Handle subsequent navigation errors (e.g. page refresh while offline)
  mainWindow.webContents.on("did-fail-load", (_event, _code, _desc, failedUrl) => {
    if (failedUrl && !failedUrl.startsWith("data:")) {
      mainWindow.loadURL(getErrorPage(url));
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------- Custom notification overlay ----------
function showCustomNotification({ title = '', body = '', icon = '🔊', duration = 5500 } = {}) {
  if (notifWindow && !notifWindow.isDestroyed()) {
    notifWindow.close();
    notifWindow = null;
  }

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const W = 380, H = 160, MARGIN = 18;

  notifWindow = new BrowserWindow({
    width: W,
    height: H,
    x: sw - W - MARGIN,
    y: sh - H - MARGIN,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const fs = require('fs');
  const notifPath = path.join(__dirname, 'notification-simple.html');
  
  if (fs.existsSync(notifPath)) {
    notifWindow.loadFile(notifPath, { query: { title, body, icon, duration: String(duration) } });
  } else {
    const fallbackPath = path.join(__dirname, 'notification.html');
    if (fs.existsSync(fallbackPath)) {
      notifWindow.loadFile(fallbackPath, { query: { title, body, icon, duration: String(duration) } });
    } else {
      console.warn('[SIMANTU] Notification files not found');
      notifWindow.loadURL('about:blank');
    }
  }

  notifWindow.once('ready-to-show', () => notifWindow.show());
  notifWindow.on('closed', () => { notifWindow = null; });
  setTimeout(() => { if (notifWindow && !notifWindow.isDestroyed()) { notifWindow.close(); notifWindow = null; } }, duration + 500);
}

// ---------- IPC & Window Event Handlers ----------
ipcMain.on("window-minimize",  () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.on("window-maximize",  () => {
  if (mainWindow && mainWindow.isMaximized()) mainWindow.unmaximize();
  else if (mainWindow) mainWindow.maximize();
});
ipcMain.on("window-close",     () => {
  if (mainWindow) mainWindow.close();
});
ipcMain.on("show-notification", (_event, opts) => {
  try {
    showCustomNotification(opts);
  } catch (err) {
    console.error('[SIMANTU] Notification error:', err);
  }
});

// --------------------------------------------------
app.whenReady().then(async () => {
  const isDev = !app.isPackaged;

  if (isDev) {
    createWindow("http://localhost:5000");
  } else {
    process.env.SIMANTU_DATA_DIR = app.getPath("userData");
    process.env.NODE_ENV = "production";

    const { startServer } = require("./server");
    const port = await startServer();
    createWindow(`http://localhost:${port}`);
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow("http://localhost:5000");
  }
});
