/**
 * Generate BMP images for NSIS installer wizard
 * - Header: 150x57 (top banner on wizard pages)
 * - Sidebar: 164x314 (left panel on welcome/finish pages)
 * 
 * Uses raw BMP generation (no dependencies needed)
 */
const fs = require("fs");
const path = require("path");

function createBMP(width, height, pixelCallback) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  
  const buf = Buffer.alloc(fileSize);
  
  // BMP Header
  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10); // pixel data offset
  
  // DIB Header (BITMAPINFOHEADER)
  buf.writeUInt32LE(40, 14); // header size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // positive = bottom-up
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(24, 28); // bits per pixel
  buf.writeUInt32LE(0, 30); // no compression
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeInt32LE(2835, 38); // X pixels per meter
  buf.writeInt32LE(2835, 42); // Y pixels per meter
  
  // Pixel data (bottom-up, BGR)
  for (let y = height - 1; y >= 0; y--) {
    const rowOffset = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelCallback(x, y, width, height);
      const offset = rowOffset + x * 3;
      buf[offset] = b;
      buf[offset + 1] = g;
      buf[offset + 2] = r;
    }
  }
  
  return buf;
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

// UGM Blue: #004175 -> rgb(0, 65, 117)
// UGM Gold: #F9BB00 -> rgb(249, 187, 0)
// Dark Blue: #002244 -> rgb(0, 34, 68)

// Header image: 150x57 - gradient blue with gold accent
const headerBMP = createBMP(150, 57, (x, y, w, h) => {
  const t = x / w;
  const ty = y / h;
  
  // Diagonal gradient from dark blue to UGM blue
  const grad = (t * 0.6 + ty * 0.4);
  let r = lerp(0, 0, grad);
  let g = lerp(28, 65, grad);
  let b = lerp(58, 117, grad);
  
  // Gold accent stripe at bottom (3px)
  if (y >= h - 3) {
    const goldT = (h - y) / 3;
    r = lerp(r, 249, 0.8 + goldT * 0.2);
    g = lerp(g, 187, 0.8 + goldT * 0.2);
    b = lerp(b, 0, 0.8 + goldT * 0.2);
  }
  
  // Subtle light sweep from right
  if (t > 0.6) {
    const sweep = (t - 0.6) / 0.4;
    r = Math.min(255, r + Math.round(sweep * 15));
    g = Math.min(255, g + Math.round(sweep * 20));
    b = Math.min(255, b + Math.round(sweep * 25));
  }
  
  return [r, g, b];
});

// Sidebar image: 164x314 - branded gradient with gold accent
const sidebarBMP = createBMP(164, 314, (x, y, w, h) => {
  const tx = x / w;
  const ty = y / h;
  
  // Vertical gradient: very dark blue top -> UGM blue bottom
  let r = lerp(0, 0, ty);
  let g = lerp(20, 65, ty);
  let b = lerp(45, 117, ty);
  
  // Subtle diagonal lighter area (top-right to bottom-left)
  const diag = (tx * 0.3 + (1 - ty) * 0.7);
  if (diag > 0.5) {
    const extra = (diag - 0.5) * 2;
    r = Math.min(255, r + Math.round(extra * 8));
    g = Math.min(255, g + Math.round(extra * 12));
    b = Math.min(255, b + Math.round(extra * 18));
  }
  
  // Gold accent bar on right edge (4px)
  if (x >= w - 4) {
    r = 249; g = 187; b = 0;
    // Slight gradient on the gold bar
    const barT = (w - x) / 4;
    r = lerp(249, r, barT * 0.3);
  }
  
  // Bottom gold stripe (3px)
  if (y >= h - 3) {
    r = 249; g = 187; b = 0;
  }
  
  // Top area slightly lighter for text visibility
  if (ty < 0.15) {
    const topFade = 1 - (ty / 0.15);
    r = Math.min(255, r + Math.round(topFade * 5));
    g = Math.min(255, g + Math.round(topFade * 8));
    b = Math.min(255, b + Math.round(topFade * 12));
  }
  
  return [r, g, b];
});

// Uninstaller header & sidebar (same style but slightly different tint)
const uninstallerHeaderBMP = createBMP(150, 57, (x, y, w, h) => {
  const t = x / w;
  const ty = y / h;
  const grad = (t * 0.6 + ty * 0.4);
  let r = lerp(10, 0, grad);
  let g = lerp(22, 55, grad);
  let b = lerp(48, 100, grad);
  
  if (y >= h - 3) {
    r = 200; g = 150; b = 0;
  }
  if (t > 0.6) {
    const sweep = (t - 0.6) / 0.4;
    r = Math.min(255, r + Math.round(sweep * 12));
    g = Math.min(255, g + Math.round(sweep * 16));
    b = Math.min(255, b + Math.round(sweep * 20));
  }
  return [r, g, b];
});

const uninstallerSidebarBMP = createBMP(164, 314, (x, y, w, h) => {
  const tx = x / w;
  const ty = y / h;
  let r = lerp(10, 0, ty);
  let g = lerp(18, 55, ty);
  let b = lerp(38, 100, ty);
  
  if (x >= w - 4) { r = 200; g = 150; b = 0; }
  if (y >= h - 3) { r = 200; g = 150; b = 0; }
  
  return [r, g, b];
});

const buildDir = path.resolve(__dirname);

fs.writeFileSync(path.join(buildDir, "installerHeader.bmp"), headerBMP);
fs.writeFileSync(path.join(buildDir, "installerSidebar.bmp"), sidebarBMP);
fs.writeFileSync(path.join(buildDir, "uninstallerHeader.bmp"), uninstallerHeaderBMP);
fs.writeFileSync(path.join(buildDir, "uninstallerSidebar.bmp"), uninstallerSidebarBMP);

console.log("Installer images generated:");
console.log("  - installerHeader.bmp (150x57)");
console.log("  - installerSidebar.bmp (164x314)");
console.log("  - uninstallerHeader.bmp (150x57)");
console.log("  - uninstallerSidebar.bmp (164x314)");
