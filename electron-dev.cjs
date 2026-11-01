const cp = require("child_process");
const electronPath = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = cp.spawn(electronPath, ["."], {
  stdio: "inherit",
  windowsHide: false,
  env,
});

child.on("exit", (code) => {
  process.exit(code || 0);
});

child.on("error", (err) => {
  console.error("[Electron Dev] Error:", err);
  process.exit(1);
});

