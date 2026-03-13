import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm } from "fs/promises";
import path from "path";

async function buildAll() {
  await rm("dist", { recursive: true, force: true });
  await rm("dist-electron", { recursive: true, force: true });

  console.log("building client (renderer)...");
  await viteBuild();

  console.log("building server for electron...");
  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist-electron/server.js",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: [
      "electron",
      "vite",
      "@replit/vite-plugin-runtime-error-modal",
      "@replit/vite-plugin-cartographer",
      "@replit/vite-plugin-dev-banner",
    ],
    alias: {
      "@shared": path.resolve("shared"),
    },
    logLevel: "info",
  });

  console.log("build complete!");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
