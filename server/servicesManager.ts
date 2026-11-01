import { spawn, spawnSync, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import treeKill from "tree-kill";
import { log } from "./index";
import { findSupertonicModelDir } from "./supertonicNode";

// CJS and ESM safe directory resolution
const _dirname = typeof __dirname !== "undefined" ? __dirname : process.cwd();

interface ManagedService {
  name: string;
  scriptName: string;
  defaultPort: number;
  child: ChildProcess | null;
  pid: number | null;
  startedAt: number | null;
}

const services: Record<"supertonic", ManagedService> = {
  supertonic: {
    name: "Supertonic 3",
    scriptName: "supertonic_server.py",
    defaultPort: 8765,
    child: null,
    pid: null,
    startedAt: null,
  },
};

// A service that is already listening when we try to start it was launched
// outside this process (manual `python services/...`, leftover from a crash, …).
// It still counts as running, but we do not own its child handle.
const externalRunning: Record<"supertonic", boolean> = {
  supertonic: false,
};

let pythonExecutableCache: string | null = null;
let hooksRegistered = false;

export function findPythonExecutable(): string | null {
  if (pythonExecutableCache && fs.existsSync(pythonExecutableCache)) {
    return pythonExecutableCache;
  }

  // 1. Check environment variable override
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    pythonExecutableCache = process.env.PYTHON_PATH;
    return pythonExecutableCache;
  }

  // 2. Check PATH with `python`
  try {
    const test = spawnSync("python", ["--version"], { stdio: "ignore", windowsHide: true });
    if (test.status === 0) {
      pythonExecutableCache = "python";
      return "python";
    }
  } catch {
    // ignore
  }

  // 3. Check Windows Python launcher `py`
  try {
    const testPy = spawnSync("py", ["-3", "--version"], { stdio: "ignore", windowsHide: true });
    if (testPy.status === 0) {
      pythonExecutableCache = "py";
      return "py";
    }
  } catch {
    // ignore
  }

  // 4. Check known Windows installation paths
  const localAppData = process.env.LOCALAPPDATA || "";
  const candidatePaths = [
    path.join(localAppData, "Python", "bin", "python.exe"),
    path.join(localAppData, "Programs", "Python", "Python314", "python.exe"),
    path.join(localAppData, "Programs", "Python", "Python313", "python.exe"),
    path.join(localAppData, "Programs", "Python", "Python312", "python.exe"),
    path.join(localAppData, "Programs", "Python", "Python311", "python.exe"),
    path.join(localAppData, "Programs", "Python", "Python310", "python.exe"),
    "C:\\Python314\\python.exe",
    "C:\\Python313\\python.exe",
    "C:\\Python312\\python.exe",
    "C:\\Python311\\python.exe",
    "C:\\Python310\\python.exe",
  ];

  for (const candidate of candidatePaths) {
    if (candidate && fs.existsSync(candidate)) {
      pythonExecutableCache = candidate;
      return candidate;
    }
  }

  return null;
}

export function findServiceScript(scriptName: string): string | null {
  const candidates = [
    path.join(process.cwd(), "services", scriptName),
    path.join(_dirname, "..", "services", scriptName),
    path.join(_dirname, "services", scriptName),
  ];

  // In packaged Electron apps, resourcesPath is available on process
  const resourcesPath = (process as any).resourcesPath;
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, "services", scriptName));
    candidates.push(path.join(resourcesPath, "app.asar.unpacked", "services", scriptName));
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

// The health probe is only used to detect an already-listening instance, so it must
// outlive a slow first model load; a 1s abort produced spurious "not running" results
// and flooded the Python services with aborted-connection tracebacks.
const PORT_CHECK_TIMEOUT_MS = 5000;

export async function isPortInUse(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(PORT_CHECK_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Find the PID that is listening on a local TCP port (Windows / POSIX best effort).
function findPidListeningOnPort(port: number): number | null {
  try {
    if (process.platform === "win32") {
      const out = spawnSync("netstat", ["-ano", "-p", "tcp"], {
        encoding: "utf-8",
        windowsHide: true,
        timeout: 5000,
      });
      if (out.status !== 0 || !out.stdout) return null;
      for (const line of out.stdout.split(/\r?\n/)) {
        const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
        if (m && Number(m[1]) === port) return Number(m[2]);
      }
      return null;
    }

    const out = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf-8",
    });
    if (out.status !== 0 || !out.stdout) return null;
    const first = out.stdout.split(/\r?\n/).find((l) => l.trim());
    return first ? Number(first.trim()) : null;
  } catch {
    return null;
  }
}

export async function startService(key: "supertonic"): Promise<boolean> {
  const service = services[key];
  if (!service) return false;

  // If bundled native ONNX model directory exists, Supertonic 3 runs in-process via onnxruntime-node
  // with zero Python dependency!
  const nativeModelDir = findSupertonicModelDir();
  if (nativeModelDir) {
    externalRunning[key] = true;
    if (!service.startedAt) service.startedAt = Date.now();
    log(`${service.name} siap (Built-in Native ONNX Engine: ${nativeModelDir})`, "tts-service");
    return true;
  }

  // If already spawned and running
  if (service.child && service.pid) {
    return true;
  }

  // If an external instance is already responding on the port, do not conflict
  const alreadyRunning = await isPortInUse(service.defaultPort);
  if (alreadyRunning) {
    externalRunning[key] = true;
    log(`${service.name} server is already running on port ${service.defaultPort}`, "tts-service");
    return true;
  }
  externalRunning[key] = false;

  const pythonBin = findPythonExecutable();
  if (!pythonBin) {
    log(`Python tidak ditemukan di sistem. ${service.name} server tidak dapat dimulai otomatis.`, "tts-service");
    return false;
  }

  const scriptPath = findServiceScript(service.scriptName);
  if (!scriptPath) {
    log(`Script ${service.scriptName} tidak ditemukan.`, "tts-service");
    return false;
  }

  log(`Memulai ${service.name} server (${scriptPath})...`, "tts-service");

  try {
    const isPyLauncher = pythonBin === "py";
    const args = isPyLauncher ? ["-3", scriptPath] : [scriptPath];

    const child = spawn(pythonBin, args, {
      cwd: path.dirname(scriptPath),
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    service.child = child;
    service.pid = child.pid || null;
    service.startedAt = Date.now();

    child.stdout?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) {
        log(`[${service.name}] ${line}`, "tts-service");
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line && !line.includes("FutureWarning") && !line.includes("DeprecationWarning")) {
        log(`[${service.name} err] ${line}`, "tts-service");
      }
    });

    child.on("exit", (code, signal) => {
      log(`${service.name} proses berhenti (code=${code}, signal=${signal})`, "tts-service");
      service.child = null;
      service.pid = null;
      service.startedAt = null;
      externalRunning[key] = false;
    });

    child.on("error", (err) => {
      log(`${service.name} gagal dimulai: ${err.message}`, "tts-service");
      service.child = null;
      service.pid = null;
      service.startedAt = null;
      externalRunning[key] = false;
    });

    registerShutdownHooks();
    return true;
  } catch (error) {
    log(`Error saat memulai ${service.name}: ${error}`, "tts-service");
    return false;
  }
}

export function stopService(key: "supertonic"): Promise<void> {
  const service = services[key];
  if (!service) return Promise.resolve();

  // An externally started instance has no child handle — resolve its PID from the port.
  if (!service.pid && externalRunning[key]) {
    const pid = findPidListeningOnPort(service.defaultPort);
    externalRunning[key] = false;
    if (!pid) return Promise.resolve();
    return new Promise((resolve) => {
      treeKill(pid, "SIGTERM", () => resolve());
    });
  }

  if (!service.pid) return Promise.resolve();

  const pid = service.pid;
  service.child = null;
  service.pid = null;
  service.startedAt = null;
  externalRunning[key] = false;

  return new Promise((resolve) => {
    treeKill(pid, "SIGTERM", (err) => {
      if (err) {
        // Fallback to SIGKILL
        treeKill(pid, "SIGKILL", () => resolve());
      } else {
        resolve();
      }
    });
  });
}

export async function startAllServices(): Promise<void> {
  await startService("supertonic");
}

export async function stopAllServices(): Promise<void> {
  await stopService("supertonic");
}

function stopAllServicesSync(): void {
  for (const key of ["supertonic"] as const) {
    const service = services[key];
    if (service && service.pid) {
      try {
        process.kill(service.pid, "SIGKILL");
      } catch {
        // ignore
      }
      service.child = null;
      service.pid = null;
    }
  }
}

function registerShutdownHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  process.once("exit", () => {
    stopAllServicesSync();
  });

  process.once("SIGINT", () => {
    void stopAllServices().finally(() => process.exit(0));
  });

  process.once("SIGTERM", () => {
    void stopAllServices().finally(() => process.exit(0));
  });
}

export function getServicesStatus() {
  const nativeBundled = Boolean(findSupertonicModelDir());
  const describe = (key: "supertonic") => {
    const service = services[key];
    const managed = Boolean(service.child && service.pid);
    return {
      name: service.name,
      port: service.defaultPort,
      running: nativeBundled || managed || externalRunning[key],
      // false = adopted from outside this process or built-in native engine
      managed: nativeBundled || managed,
      pid: service.pid ?? (nativeBundled ? process.pid : externalRunning[key] ? findPidListeningOnPort(service.defaultPort) : null),
      uptimeSeconds: service.startedAt
        ? Math.floor((Date.now() - service.startedAt) / 1000)
        : 0,
    };
  };

  return {
    supertonic: describe("supertonic"),
    pythonAvailable: nativeBundled || Boolean(findPythonExecutable()),
    pythonPath: nativeBundled ? "built-in-onnxruntime-node" : findPythonExecutable(),
  };
}
