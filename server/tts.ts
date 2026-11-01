import { WebSocket } from "ws";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { URL } from "url";
import { createRequire } from "module";
import { synthesizeSupertonicNativeWav, findSupertonicModelDir } from "./supertonicNode";

export function resolveEnvWritePath(): string {
  if (process.env.SIMANTU_DATA_DIR && process.env.SIMANTU_DATA_DIR.trim()) {
    const dir = process.env.SIMANTU_DATA_DIR.trim();
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    return path.join(dir, ".env");
  }
  return path.resolve(process.cwd(), ".env");
}

export function readEnvFileContent(): string {
  const candidates = [
    process.env.SIMANTU_DATA_DIR ? path.join(process.env.SIMANTU_DATA_DIR, ".env") : "",
    path.resolve(process.cwd(), ".env"),
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, "utf-8");
      }
    } catch {}
  }
  return "";
}

function getTtsCacheDir(): string {
  const baseDir = process.env.SIMANTU_DATA_DIR || path.resolve(process.cwd(), "data");
  const cacheDir = path.join(baseDir, "tts_cache");
  if (!fs.existsSync(cacheDir)) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
    } catch (e) {
      console.warn("[TTS Cache] Gagal membuat direktori cache:", e);
    }
  }
  return cacheDir;
}

function getCacheKey(text: string, voiceId: string, engine = "edge"): string {
  const isFemale = /gadis|vivienne|ava|wanita|female|f[1-9]/i.test(voiceId);
  const variant = engine === "supertonic" ? (isFemale ? getSupertonicVoiceFemale() : getSupertonicVoiceMale()) : "";
  // Sertakan kecepatan bicara Supertonic agar perubahan kecepatan tidak memakai audio cache lama.
  // Kecepatan default (1.0) tidak diberi sufiks sehingga cache yang sudah ada tetap valid.
  let speedKey = "";
  if (engine === "supertonic") {
    const sId = getSupertonicSpeed(false);
    const sEn = getSupertonicSpeed(true);
    if (sId !== SUPERTONIC_SPEED_DEFAULT || sEn !== SUPERTONIC_SPEED_DEFAULT) {
      speedKey = `-s${sId}_${sEn}`;
    }
  }
  const engineKey = `${engine}-v10${variant ? `-${variant}` : ""}${speedKey}`;
  return crypto.createHash("sha256").update(`${engineKey}:::${voiceId}:::${text.trim()}`).digest("hex");
}

export function getCachedAudio(text: string, voiceId: string, engine = "edge"): Buffer | null {
  try {
    const cacheDir = getTtsCacheDir();
    const filePath = path.join(cacheDir, `${getCacheKey(text, voiceId, engine)}.mp3`);
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      if (buf.length > 0) return buf;
    }
  } catch (err) {
    console.warn("[TTS Cache] Gagal membaca cache:", err);
  }
  return null;
}

export function saveCachedAudio(text: string, voiceId: string, buffer: Buffer, engine = "edge"): void {
  try {
    const cacheDir = getTtsCacheDir();
    const filePath = path.join(cacheDir, `${getCacheKey(text, voiceId, engine)}.mp3`);
    fs.writeFileSync(filePath, buffer);
  } catch (err) {
    console.warn("[TTS Cache] Gagal menyimpan cache:", err);
  }
}

function getFfmpegStatic(): string {
  try {
    if (typeof require === "function") {
      return require("ffmpeg-static");
    }
    const metaUrl = (import.meta as any)?.url || `file://${process.cwd()}/`;
    return createRequire(metaUrl)("ffmpeg-static");
  } catch {
    return "";
  }
}

const ffmpegStatic: string = getFfmpegStatic();

function resolveFfmpegPath(): string {
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || "";

  const candidates = [
    String(ffmpegStatic),
    process.env.FFMPEG_PATH || "",
    resourcesPath
      ? path.resolve(resourcesPath, "app.asar.unpacked", "node_modules", "ffmpeg-static", binaryName)
      : "",
    path.resolve(process.cwd(), "node_modules", "ffmpeg-static", binaryName),
  ].filter(Boolean);

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) {
    return found;
  }

  throw new Error(`ffmpeg binary not found. Checked: ${candidates.join(", ")}`);
}

const ffmpegBin = resolveFfmpegPath();

export const VOICE_PRESETS: Record<string, { id: string; en: string }> = {
  "Pria": { id: "id-ID-ArdiNeural", en: "en-US-AndrewMultilingualNeural" },
  "Wanita": { id: "fr-FR-VivienneMultilingualNeural", en: "en-US-AvaMultilingualNeural" },
};

// msedge-tts produces MPEG2 Layer3 @ 24kHz which Chromium's decodeAudioData cannot decode.
// Transcode synchronously to MPEG1 Layer3 @ 44100Hz using the bundled ffmpeg binary.
function transcodeToMpeg1(mpeg2Buffer: Buffer): Buffer {
  const result = spawnSync(
    ffmpegBin,
    ["-loglevel", "error", "-i", "pipe:0", "-f", "mp3", "-acodec", "libmp3lame", "-ar", "44100", "-ab", "64k", "pipe:1"],
    { input: mpeg2Buffer, maxBuffer: 50 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("ffmpeg transcode failed: " + (result.stderr?.toString() ?? "unknown error"));
  }
  return result.stdout as Buffer;
}

// msedge-tts fails to produce audio for long texts (WebSocket stream comes empty).
// Split text into smaller chunks at sentence/paragraph boundaries (max ~250 chars each).
function splitTextChunks(text: string, maxLen = 250): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  // Split on paragraph breaks first, then sentences
  const paragraphs = text.split(/\n+/);
  let current = "";
  for (const para of paragraphs) {
    const sentences = para.split(/(?<=[.!?,;])\s+/);
    for (const sent of sentences) {
      const candidate = current ? current + " " + sent : sent;
      if (candidate.length <= maxLen) {
        current = candidate;
      } else {
        if (current) chunks.push(current.trim());
        // If single sentence still too long, split by words
        if (sent.length > maxLen) {
          const words = sent.split(" ");
          let sub = "";
          for (const w of words) {
            const c = sub ? sub + " " + w : w;
            if (c.length <= maxLen) { sub = c; }
            else { if (sub) chunks.push(sub.trim()); sub = w; }
          }
          current = sub;
        } else {
          current = sent;
        }
      }
    }
    if (current) { chunks.push(current.trim()); current = ""; }
  }
  if (current) chunks.push(current.trim());
  return chunks.filter(c => c.length > 0);
}

// msedge-tts uses SSML internally; XML special chars must be escaped to avoid empty stream.
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Replace literal ampersand with the spoken word to avoid TTS reading "ampersand".
function replaceAmpersand(text: string, isEnglish: boolean): string {
  return text.replace(/\s*&\s*/g, isEnglish ? " and " : " dan ");
}

// Edge TTS (msedge-tts) does NOT support <say-as>, <lang>, <sub> or any custom SSML tags.
// Plain text only workarounds:
//   - Abbreviations: insert dots → "WIB" → "W.I.B." (TTS reads each letter)
//   - English segments: route to English voice via [en: text] markup

// Map Indonesian voice → English counterpart for inline [en: ...] segments
const ID_TO_EN_VOICE: Record<string, string> = {
  // Prefer multilingual EN voices to reduce timbre jump from the main announcement voice.
  "id-ID-ArdiNeural": "en-US-AndrewMultilingualNeural",
  "id-ID-GadisNeural": "en-US-AvaMultilingualNeural",
  // Vivienne is multilingual; inline EN should stay on the same base voice for continuity.
  "fr-FR-VivienneMultilingualNeural": "fr-FR-VivienneMultilingualNeural",
};
function getEnglishVoice(idVoice: string): string {
  return ID_TO_EN_VOICE[idVoice] ?? "en-US-AndrewMultilingualNeural";
}

// Map English voice → Indonesian counterpart for inline [id: ...] segments inside EN column
const EN_TO_ID_VOICE: Record<string, string> = {
  "en-US-AndrewMultilingualNeural": "id-ID-ArdiNeural",
  "en-US-AvaMultilingualNeural": "fr-FR-VivienneMultilingualNeural",
  "en-US-GuyNeural": "id-ID-ArdiNeural",
  "en-US-JennyNeural": "fr-FR-VivienneMultilingualNeural",
  "en-US-AriaNeural": "fr-FR-VivienneMultilingualNeural",
};
function getIndonesianVoice(enVoice: string): string {
  return EN_TO_ID_VOICE[enVoice] ?? "id-ID-ArdiNeural";
}

function isMultilingualVoice(voiceId: string): boolean {
  return /MultilingualNeural$/i.test(voiceId);
}

// ==============================================================================
// INDONESIAN & ENGLISH SPEECH TEXT NORMALIZATION
// Resolves hours, times, numbers, abbreviations, and acronyms into natural words
// to prevent stuttering ("belibet") and ensure clear, authoritative announcements.
// ==============================================================================

export function num2wordsId(n: number): string {
  if (n === 0) return "nol";
  const satuan = [
    "", "satu", "dua", "tiga", "empat", "lima", "enam",
    "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"
  ];
  if (n < 12) return satuan[n];
  if (n < 20) return satuan[n - 10] + " belas";
  if (n < 100) {
    const s = satuan[Math.floor(n / 10)] + " puluh";
    const rem = n % 10;
    return rem ? s + " " + satuan[rem] : s;
  }
  if (n < 200) {
    const rem = n % 100;
    return rem ? "seratus " + num2wordsId(rem) : "seratus";
  }
  if (n < 1000) {
    const s = satuan[Math.floor(n / 100)] + " ratus";
    const rem = n % 100;
    return rem ? s + " " + num2wordsId(rem) : s;
  }
  if (n < 2000) {
    const rem = n % 1000;
    return rem ? "seribu " + num2wordsId(rem) : "seribu";
  }
  if (n < 1000000) {
    const s = num2wordsId(Math.floor(n / 1000)) + " ribu";
    const rem = n % 1000;
    return rem ? s + " " + num2wordsId(rem) : s;
  }
  if (n < 1000000000) {
    const s = num2wordsId(Math.floor(n / 1000000)) + " juta";
    const rem = n % 1000000;
    return rem ? s + " " + num2wordsId(rem) : s;
  }
  return String(n);
}

/** Format jam:menit menjadi kata Indonesia yang singkat dan natural.
 *  (8, 0) → "delapan", (8, 5) → "delapan lewat lima", (16, 30) → "enam belas tiga puluh"
 */
export function timeToWordsId(h: number, m: number): string {
  const hNum = parseInt(String(h), 10);
  const mNum = parseInt(String(m), 10);
  const hStr = num2wordsId(hNum);
  if (mNum === 0) return hStr;
  if (mNum < 10) return `${hStr} lewat ${num2wordsId(mNum)}`;
  return `${hStr} ${num2wordsId(mNum)}`;
}

/** Konversi singkatan zona waktu ke ejaan huruf terpisah yang ringkas untuk TTS. */
function tzAbbr(tz: string): string {
  const t = tz.toUpperCase();
  if (t === "WIB") return "W I B";
  if (t === "WITA") return "W I T A";
  return "W I T";
}

const NUM_WORDS_EN: Record<number, string> = {
  0: "twelve", 1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
  6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten",
  11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen",
  16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen", 20: "twenty",
  30: "thirty", 40: "forty", 50: "fifty"
};

function num2wordsEnUnder60(n: number): string {
  if (NUM_WORDS_EN[n]) return NUM_WORDS_EN[n];
  const tens = Math.floor(n / 10) * 10;
  const ones = n % 10;
  return `${NUM_WORDS_EN[tens] || ""} ${NUM_WORDS_EN[ones] || ""}`.trim();
}

function timeToWordsEn(h: number, m: number, period?: string): string {
  let pClean = "A M";
  let h12 = h;
  if (period) {
    pClean = /p/i.test(period) ? "P M" : "A M";
    h12 = (h === 0 || h === 12) ? 12 : (h % 12);
  } else {
    if (h === 0) {
      h12 = 12;
      pClean = "A M";
    } else if (h < 12) {
      h12 = h;
      pClean = "A M";
    } else if (h === 12) {
      h12 = 12;
      pClean = "P M";
    } else {
      h12 = h - 12;
      pClean = "P M";
    }
  }

  const hWord = NUM_WORDS_EN[h12] || String(h12);
  if (m === 0) {
    return `${hWord} ${pClean}`;
  } else if (m < 10) {
    return `${hWord} oh ${num2wordsEnUnder60(m)} ${pClean}`;
  } else {
    return `${hWord} ${num2wordsEnUnder60(m)} ${pClean}`;
  }
}

export function normalizeSpeechText(text: string, isEnglish: boolean): string {
  if (!text || !text.trim()) return "";

  if (isEnglish) {
    let res = text
      .replace(/\s*&\s*/g, " and ");

    // 1. Time range with AM/PM: 8:00 AM - 5:00 PM or 8:00 AM to 5:00 PM
    res = res.replace(
      /([0-1]?[0-9])[:.]([0-5][0-9])\s*(AM|PM|a\.m\.|p\.m\.|am|pm)(?:\s*-\s*|\s*–\s*|\s*to\s*|\s*until\s*)([0-1]?[0-9])[:.]([0-5][0-9])\s*(AM|PM|a\.m\.|p\.m\.|am|pm)/gi,
      (_, h1, m1, p1, h2, m2, p2) => `${timeToWordsEn(parseInt(h1, 10), parseInt(m1, 10), p1)} to ${timeToWordsEn(parseInt(h2, 10), parseInt(m2, 10), p2)}`
    );

    // 2. Time with AM/PM (optional timezone): 3:00 PM, 03:00 PM, 11:45 a.m., 3:00 PM WIB
    res = res.replace(
      /\b([0-1]?[0-9])[:.]([0-5][0-9])\s*(AM|PM|a\.m\.|p\.m\.|am|pm)(?:\s*(WIB|WITA|WIT))?\b/gi,
      (_, h, m, p, tz) => `${timeToWordsEn(parseInt(h, 10), parseInt(m, 10), p)}${tz && /wib/i.test(tz) ? ", W I B" : ""}`
    );

    // 3. Simple hour with AM/PM without minutes: 3 PM, 3pm, 10 AM
    res = res.replace(
      /\b([0-1]?[0-9])\s*(AM|PM|a\.m\.|p\.m\.|am|pm)(?:\s*(WIB|WITA|WIT))?\b/gi,
      (_, h, p, tz) => `${timeToWordsEn(parseInt(h, 10), 0, p)}${tz && /wib/i.test(tz) ? ", W I B" : ""}`
    );

    // 4. 24h format with timezone: 15:00 WIB, 15.00 WIB
    res = res.replace(
      /\b([01]?[0-9]|2[0-3])[:.]([0-5][0-9])\s*(WIB|WITA|WIT)\b/gi,
      (_, h, m) => `${timeToWordsEn(parseInt(h, 10), parseInt(m, 10))}, W I B`
    );

    // 5. Standalone 24h format (e.g. at 15:00 or 08:30)
    res = res.replace(
      /\b(?:at\s+)?([01]?[0-9]|2[0-3])[:.]([0-5][0-9])\b/gi,
      (_, h, m) => timeToWordsEn(parseInt(h, 10), parseInt(m, 10))
    );

    // 6. English ordinals: 1st, 2nd, 3rd, 4th, etc.
    const ordinals: Record<number, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth" };
    res = res.replace(
      /\b([1-9]|10)(st|nd|rd|th)\b/gi,
      (_, n) => ordinals[parseInt(n, 10)] || _
    );

    // 7. Campus abbreviations
    return res
      .replace(/\bUGM\b/gi, "U G M")
      .replace(/\bETD\b/gi, "E T D")
      .replace(/\bWIB\b/gi, "W I B")
      .replace(/\bL1\b/gi, "Level One")
      .replace(/\bL2\b/gi, "Level Two")
      .replace(/\bL3\b/gi, "Level Three")
      .replace(/\bL4\b/gi, "Level Four")
      .replace(/\bL5\b/gi, "Level Five");
  }

  let res = text;

  // 1. Clean up slashes, symbols, and conjunctions
  res = res
    .replace(/\s*&\s*/g, " dan ")
    .replace(/\s*\/\s*atau\s*/gi, " atau ")
    .replace(/\bdan\/atau\b/gi, "dan atau")
    .replace(/\b(?:bapak\/ibu|ibu\/bapak)\b/gi, "Bapak atau Ibu");

  // 2. High-priority campus abbreviations & codes
  res = res
    .replace(/\bUGM\b/gi, "U G M")
    .replace(/\bETD\b/gi, "E T D")
    .replace(/\bKTM\b/gi, "K T M")
    .replace(/\bOPAC\b/gi, "O-Pac")
    .replace(/\bSIMANTU\b/gi, "Simantu")
    .replace(/\b(?:wi-?fi)\b/gi, "Wai-Fai")
    .replace(/\bAC\b/g, "A C")
    .replace(/\bPC\b/g, "P C")
    .replace(/\bCS\b/g, "Customer Service")
    .replace(/\bL1\b/gi, "Lantai satu")
    .replace(/\bL2\b/gi, "Lantai dua")
    .replace(/\bL3\b/gi, "Lantai tiga")
    .replace(/\bL4\b/gi, "Lantai empat")
    .replace(/\bL5\b/gi, "Lantai lima");

  // 3. Time ranges (HARUS paling awal agar tidak dipotong regex tunggal)
  // Contoh: 08.00 - 16.30 WIB  |  pukul 08:00 s.d. 16:00
  res = res.replace(
    /(?:pukul|jam)?\s*([01]?[0-9]|2[0-3])[:.]([0-5][0-9])\s*(?:-|–|—|\bs\.?d\.?\b|\bs\/d\b|\bsampai\b)\s*(?:pukul|jam)?\s*([01]?[0-9]|2[0-3])[:.]([0-5][0-9])(?:\s*(WIB|WITA|WIT|Waktu Indonesia (?:Barat|Tengah|Timur)))?/gi,
    (_, h1, m1, h2, m2, tz) => {
      const t1 = timeToWordsId(parseInt(h1, 10), parseInt(m1, 10));
      const t2 = timeToWordsId(parseInt(h2, 10), parseInt(m2, 10));
      let out = `pukul ${t1} sampai pukul ${t2}`;
      if (tz) out += `, ${tz.length > 4 ? tz : tzAbbr(tz)}`;
      return out;
    }
  );

  // 4. Jam+menit dengan timezone (tanpa/dengan prefix): 15.00 WIB, pukul 08:00 WIB, 15:00 Waktu Indonesia Barat
  res = res.replace(
    /(?:(?:pukul|jam|pk\.?)\s*)?([01]?[0-9]|2[0-3])[:.]([0-5][0-9])\s*(WIB|WITA|WIT|Waktu Indonesia (?:Barat|Tengah|Timur))\b/gi,
    (_, h, m, tz) => `pukul ${timeToWordsId(parseInt(h, 10), parseInt(m, 10))}, ${tz.length > 4 ? tz : tzAbbr(tz)}`
  );

  // 5. Jam dengan prefix pukul/jam/pk tanpa timezone: pukul 16.30, jam 08.00 tepat
  res = res.replace(
    /\b(?:pukul|jam|pk\.?)\s*([01]?[0-9]|2[0-3])[:.]([0-5][0-9])(\s*tepat)?\b/gi,
    (_, h, m, tepat) => {
      let out = "pukul " + timeToWordsId(parseInt(h, 10), parseInt(m, 10));
      if (tepat) out += " tepat";
      return out;
    }
  );

  // 6. Standalone HH.MM / HH:MM tanpa prefix dan tanpa timezone: 16.30, 08:00, 15.00
  res = res.replace(
    /\b([01]?[0-9]|2[0-3])[:.]([0-5][0-9])\b/g,
    (_, h, m) => `pukul ${timeToWordsId(parseInt(h, 10), parseInt(m, 10))}`
  );

  // 7. General timezone abbreviations if not yet replaced → ejaan huruf terpisah
  res = res
    .replace(/\bWIB\b/gi, "W I B")
    .replace(/\bWITA\b/gi, "W I T A")
    .replace(/\bWIT\b/gi, "W I T");

  // 8. Common abbreviations (consuming trailing dot if present)
  res = res
    .replace(/\bs\.d\.|\bs\.d\b|\bs\/d\b/gi, "sampai dengan")
    .replace(/\bd\.a\.|\bd\.a\b|\bd\/a\b/gi, "dengan alamat")
    .replace(/\bdll\b\.?/gi, "dan lain-lain")
    .replace(/\bdsb\b\.?/gi, "dan sebagainya")
    .replace(/\bdst\b\.?/gi, "dan seterusnya")
    .replace(/\bttd\b\.?/gi, "tertanda")
    .replace(/\byth\b\.?/gi, "Yang terhormat")
    .replace(/\bno\b\.?/gi, "nomor")
    .replace(/\btgl\b\.?/gi, "tanggal")
    .replace(/\bthn\b\.?/gi, "tahun")
    .replace(/\bbln\b\.?/gi, "bulan")
    .replace(/\bdr\.\s+/gi, "Dokter ")
    .replace(/\bprof\.\s+/gi, "Profesor ")
    .replace(/\bbpk\.?\s+/gi, "Bapak ")
    .replace(/\bsdr\.?\s+/gi, "Saudara ")
    .replace(/\bsdri\.?\s+/gi, "Saudari ");

  // 9. Rupiah currency
  res = res.replace(/(?:rp\.?|idr)\s*([0-9]+(?:\.[0-9]{3})+|[0-9]+)/gi, (_, rawNum) => {
    const cleanNum = parseInt(rawNum.replace(/\./g, ""), 10);
    if (!isNaN(cleanNum)) {
      return num2wordsId(cleanNum) + " rupiah";
    }
    return _;
  });

  // 10. Ordinal numbers: ke-1, ke-2, ke 3
  res = res.replace(/\bke\s*-\s*([0-9]+)\b|\bke\s+([0-9]+)\b/gi, (_, n1, n2) => {
    const val = parseInt(n1 || n2, 10);
    if (val === 1) return "pertama";
    return "ke" + num2wordsId(val);
  });

  // 11. Entity + number: Lantai 2, Pintu 1, Ruang 3, Meja 4, Loket 5, Gedung 6
  res = res.replace(
    /\b(lantai|lt\.?|pintu|ruang|meja|loket|gedung|gd\.?|kelas|tingkat|tahap)\s+([0-9]+)\b/gi,
    (_, prefix, num) => {
      let p = prefix.toLowerCase();
      if (p.startsWith("lt")) p = "lantai";
      if (p.startsWith("gd")) p = "gedung";
      return p + " " + num2wordsId(parseInt(num, 10));
    }
  );

  // 12. Time duration: 15 menit, 30 detik, 2 jam
  res = res.replace(
    /\b([0-9]+)\s*(menit|detik|jam|hari|minggu|bulan|tahun)\b/gi,
    (_, num, unit) => {
      return num2wordsId(parseInt(num, 10)) + " " + unit;
    }
  );

  // 13. Percentages: 100%
  res = res.replace(/\b([0-9]+)\s*%/g, (_, num) => {
    return num2wordsId(parseInt(num, 10)) + " persen";
  });

  // 14. Remaining standalone integers (1 to 6 digits)
  res = res.replace(/\b([0-9]{1,6})\b/g, (match) => {
    const val = parseInt(match, 10);
    if (!isNaN(val)) return num2wordsId(val);
    return match;
  });

  // 15. Digit sequences > 6 digits (e.g. phone numbers)
  const digitWords = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];
  res = res.replace(/\b([0-9]{7,})\b/g, (match) => {
    return match.split("").map(d => digitWords[parseInt(d, 10)] || d).join(" ");
  });

  return res.replace(/\s+/g, " ").trim();
}

function stripDanglingLanguageMarkers(text: string): string {
  return text.replace(/\[\s*(en|id)\s*:\s*/gi, "");
}

// Split text into segments by language tag: [en: ...] and [id: ...] are both supported.
// lang='root' means the segment inherits the voice's native language.
interface Segment { text: string; lang: 'id' | 'en' | 'root'; }
function segmentByLanguage(text: string): Segment[] {
  const segments: Segment[] = [];
  // Supports:
  // - [en: text]
  // - [EN: text]
  // - [en : text]
  // - [en: text} (common typo with closing brace)
  const re = /\[\s*(en|id)\s*:\s*([^\]\}]+?)\s*[\]\}]/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ text: stripDanglingLanguageMarkers(text.slice(lastIndex, m.index)), lang: 'root' });
    }
    segments.push({ text: m[2].trim(), lang: m[1].toLowerCase() as 'id' | 'en' });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: stripDanglingLanguageMarkers(text.slice(lastIndex)), lang: 'root' });
  }
  return segments.filter(s => s.text.trim().length > 0);
}

// Prosody tuning by context:
// - ID root: slower for public-address clarity
// - EN inline in ID text: close to ID pacing so switch sounds less abrupt
// - EN root (full English textarea): moderately slow for intelligibility
const SPEECH_PROSODY_ID = { rate: "-20%", pitch: "+0Hz", volume: "100" };
const SPEECH_PROSODY_EN_INLINE = { rate: "-15%", pitch: "+0Hz", volume: "100" };
const SPEECH_PROSODY_EN_ROOT = { rate: "-12%", pitch: "+0Hz", volume: "100" };

function pickProsody(isEnglish: boolean, rootIsEnglish: boolean): { rate: string; pitch: string; volume: string } {
  if (!isEnglish) return SPEECH_PROSODY_ID;
  return rootIsEnglish ? SPEECH_PROSODY_EN_ROOT : SPEECH_PROSODY_EN_INLINE;
}

export function getSupertonicUrl(): string {
  if (process.env.SUPERTONIC_URL && process.env.SUPERTONIC_URL.trim()) {
    return process.env.SUPERTONIC_URL.trim().replace(/\/+$/, "");
  }
  try {
    const content = readEnvFileContent();
    if (content) {
      const match = content.match(/SUPERTONIC_URL\s*=\s*([^\r\n]+)/);
      if (match && match[1]) {
        return match[1].trim().replace(/\/+$/, "");
      }
    }
  } catch {}
  return "http://127.0.0.1:8765";
}

export function getSupertonicVoiceMale(): string {
  const v = (process.env.SUPERTONIC_VOICE_MALE || "").trim().toUpperCase();
  if (/^M[1-5]$/.test(v)) return v;
  try {
    const content = readEnvFileContent();
    if (content) {
      const match = content.match(/SUPERTONIC_VOICE_MALE\s*=\s*([^\r\n]+)/);
      if (match && match[1]) {
        const fileVal = match[1].trim().toUpperCase();
        if (/^M[1-5]$/.test(fileVal)) return fileVal;
      }
    }
  } catch {}
  return "M1";
}

export function getSupertonicVoiceFemale(): string {
  const v = (process.env.SUPERTONIC_VOICE_FEMALE || "").trim().toUpperCase();
  if (/^F[1-5]$/.test(v)) return v;
  try {
    const content = readEnvFileContent();
    if (content) {
      const match = content.match(/SUPERTONIC_VOICE_FEMALE\s*=\s*([^\r\n]+)/);
      if (match && match[1]) {
        const fileVal = match[1].trim().toUpperCase();
        if (/^F[1-5]$/.test(fileVal)) return fileVal;
      }
    }
  } catch {}
  return "F1";
}

export function setSupertonicVoices(male?: string, female?: string): void {
  if (male && /^M[1-5]$/i.test(male.trim())) {
    process.env.SUPERTONIC_VOICE_MALE = male.trim().toUpperCase();
  }
  if (female && /^F[1-5]$/i.test(female.trim())) {
    process.env.SUPERTONIC_VOICE_FEMALE = female.trim().toUpperCase();
  }
}

// --- Kecepatan bicara Supertonic 3 (1.0 = normal, < 1 lebih lambat, > 1 lebih cepat) ---
export const SUPERTONIC_SPEED_MIN = 0.7;
export const SUPERTONIC_SPEED_MAX = 1.3;
export const SUPERTONIC_SPEED_DEFAULT = 1.0;

export function clampSupertonicSpeed(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return SUPERTONIC_SPEED_DEFAULT;
  const clamped = Math.min(SUPERTONIC_SPEED_MAX, Math.max(SUPERTONIC_SPEED_MIN, n));
  return Math.round(clamped * 100) / 100;
}

export function getSupertonicSpeed(isEnglish: boolean): number {
  const key = isEnglish ? "SUPERTONIC_SPEED_EN" : "SUPERTONIC_SPEED_ID";
  const fromEnv = process.env[key];
  if (fromEnv && fromEnv.trim()) return clampSupertonicSpeed(fromEnv);
  try {
    const content = readEnvFileContent();
    if (content) {
      const match = content.match(new RegExp(`${key}\\s*=\\s*([^\\r\\n]+)`));
      if (match && match[1]) return clampSupertonicSpeed(match[1].trim());
    }
  } catch {}
  return SUPERTONIC_SPEED_DEFAULT;
}

export function setSupertonicSpeed(isEnglish: boolean, value: unknown): number {
  const v = clampSupertonicSpeed(value);
  process.env[isEnglish ? "SUPERTONIC_SPEED_EN" : "SUPERTONIC_SPEED_ID"] = v.toString();
  return v;
}

export function getVoxcpm2Url(): string {
  if (process.env.VOXCPM_URL && process.env.VOXCPM_URL.trim()) {
    return process.env.VOXCPM_URL.trim().replace(/\/+$/, "");
  }
  try {
    const content = readEnvFileContent();
    if (content) {
      const match = content.match(/VOXCPM_URL\s*=\s*([^\r\n]+)/);
      if (match && match[1]) {
        return match[1].trim().replace(/\/+$/, "");
      }
    }
  } catch {}
  return "http://127.0.0.1:8766";
}


// 1. PRIMARY ENGINE: Modern Edge TTS in pure Node.js (via WebSocket + dynamic Sec-MS-GEC v2 token)
// Runs 100% self-contained inside the Electron package without needing Python or external runtimes!
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WINDOWS_FILE_TIME_EPOCH = 11644473600n;

function generateSecMsGecToken(): string {
  const ticks = BigInt(Math.floor(Date.now() / 1000 + Number(WINDOWS_FILE_TIME_EPOCH))) * 10000000n;
  const roundedTicks = ticks - (ticks % 3000000000n);
  const strToHash = `${roundedTicks}${TRUSTED_CLIENT_TOKEN}`;
  const hash = crypto.createHash("sha256");
  hash.update(strToHash, "ascii");
  return hash.digest("hex").toUpperCase();
}

async function synthesizeEdgeNodeModern(
  text: string,
  voiceId: string,
  isEnglish = false,
  prosody: { rate: string; pitch: string; volume: string } = SPEECH_PROSODY_ID,
  timeoutMs = 15000
): Promise<Buffer> {
  const token = generateSecMsGecToken();
  const url = `wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${token}&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}`;

  return new Promise<Buffer>((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, {
        origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        headers: {
          Pragma: "no-cache",
          "Cache-Control": "no-cache",
          "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_FULL_VERSION.split(".")[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM_FULL_VERSION.split(".")[0]}.0.0.0`,
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: `muid=${crypto.randomBytes(16).toString("hex").toUpperCase()};`,
        },
      });
    } catch (wsInitErr) {
      return reject(wsInitErr);
    }

    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`Edge TTS timeout after ${timeoutMs}ms for: "${text.substring(0, 30)}..."`));
    }, timeoutMs);

    ws.on("open", () => {
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                  outputFormat: "audio-24khz-48kbitrate-mono-mp3",
                },
              },
            },
          })
      );

      const reqId = crypto.randomBytes(16).toString("hex");
      const lang = voiceId.substring(0, 5);
      const safeText = escapeXml(replaceAmpersand(text, isEnglish));
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${lang}"><voice name="${voiceId}"><prosody rate="${prosody.rate || "+0%"}" pitch="${prosody.pitch || "+0Hz"}" volume="${prosody.volume || "+0%"}">${safeText}</prosody></voice></speak>`;

      ws.send(`X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`);
    });

    ws.on("message", (data: any, isBinary: boolean) => {
      if (isBinary) {
        const sep = "Path:audio\r\n";
        const idx = data.indexOf(sep);
        if (idx !== -1) {
          chunks.push(data.subarray(idx + sep.length));
        }
      } else {
        const msg = data.toString();
        if (msg.includes("Path:turn.end")) {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          if (chunks.length === 0) {
            reject(new Error("Edge TTS returned empty stream for: " + text.substring(0, 50)));
          } else {
            resolve(Buffer.concat(chunks));
          }
        }
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    ws.on("close", (code, reason) => {
      clearTimeout(timer);
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`Edge TTS WebSocket closed (code ${code}): ${reason || "no audio received"}`));
      }
    });
  });
}

async function synthesizeEdgeNodeModernWithRetry(
  text: string,
  voiceId: string,
  isEnglish = false,
  prosody: { rate: string; pitch: string; volume: string } = SPEECH_PROSODY_ID
): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await synthesizeEdgeNodeModern(text, voiceId, isEnglish, prosody);
    } catch (err: any) {
      lastErr = err;
      const is429 = String(err?.message || err).includes("429");
      const delayMs = is429 ? 1000 * attempt : 500;
      console.warn(`[TTS Node Modern] Attempt ${attempt} failed (${err?.message || err}). Retrying in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// Secondary fallback: Python edge_tts module (if user machine has Python installed)
function synthesizeEdgePython(
  text: string,
  voiceId: string,
  prosody: { rate: string; pitch: string; volume: string }
): Buffer {
  const result = spawnSync(
    "python",
    [
      "-m",
      "edge_tts",
      "-v",
      voiceId,
      "-t",
      text,
      "--rate",
      prosody.rate || "+0%",
      "--pitch",
      prosody.pitch || "+0Hz",
      "--volume",
      prosody.volume?.includes("%") ? prosody.volume : "+0%",
      "--write-media",
      "-",
    ],
    {
      maxBuffer: 50 * 1024 * 1024,
      encoding: "buffer",
      windowsHide: true,
      timeout: 20000,
    }
  );

  if (result.error) throw result.error;
  if (result.status !== 0 || !result.stdout || result.stdout.length === 0) {
    throw new Error(`edge_tts error (code ${result.status}): ${result.stderr?.toString() || "empty output"}`);
  }
  return result.stdout as Buffer;
}

// Helper to fetch audio from a local or remote microservice endpoint (OpenAI / standard TTS REST API)
// Alternate paths are only probed when the server says "no such route" (404/405). Any other
// answer (500, timeout, connection refused) is a real failure and must be reported at once —
// retrying it on 3 more paths would multiply a slow inference by 4.
async function fetchAudioFromEndpoint(baseUrl: string, payload: any, timeoutMs = 20000): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const candidatePaths = ["/v1/audio/speech", "/synthesize", "/generate", ""];

  try {
    for (const subPath of candidatePaths) {
      const targetUrl = `${baseUrl}${subPath}`;
      let resp: Response;
      try {
        resp = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (err: any) {
        if (err?.name === "AbortError") {
          throw new Error(`Koneksi ke ${baseUrl} timeout setelah ${timeoutMs}ms`);
        }
        throw new Error(
          `Gagal menghubungi server TTS di ${baseUrl}: ${err?.message || err}`
        );
      }

      if ((resp.status === 404 || resp.status === 405) && subPath !== "") {
        // This server does not expose that route — try the next one.
        continue;
      }

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}: ${errorText.slice(0, 150)}`);
      }

      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data: any = await resp.json();
        const base64Data = data.audio || data.data || data.audio_base64 || data.wav;
        if (!base64Data) {
          throw new Error("Respon JSON tidak memuat payload audio");
        }
        return Buffer.from(base64Data, "base64");
      }

      const arrayBuf = await resp.arrayBuffer();
      if (arrayBuf.byteLength === 0) {
        throw new Error("Server TTS mengembalikan audio kosong");
      }
      return Buffer.from(arrayBuf);
    }

    throw new Error(`Tidak ada endpoint TTS yang dikenal di ${baseUrl}`);
  } finally {
    clearTimeout(timer);
  }
}

// Local model server (Supertonic 3) runs inference on CPU and needs
// far more than the default 20s per request. Send sentence-sized chunks if needed.
const LOCAL_TTS_TIMEOUT_MS = 180000;
const LOCAL_TTS_CHUNK_LEN = 300;

// An engine that just timed out or answered "busy" is very likely to do it again:
// the Python server keeps computing the abandoned job and holds its inference lock.
// Skip such an engine for a few minutes instead of paying another full timeout on
// every request while the user waits.
const ENGINE_COOLDOWN_MS = 5 * 60 * 1000;
const engineCooldownUntil = new Map<string, number>();

function engineCooldownLeftMs(engine: string): number {
  const until = engineCooldownUntil.get(engine);
  if (!until) return 0;
  const left = until - Date.now();
  if (left <= 0) {
    engineCooldownUntil.delete(engine);
    return 0;
  }
  return left;
}

function markEngineFailed(engine: string, err: unknown): void {
  const msg = (err as { message?: string })?.message ?? String(err);
  // Only a timeout / "busy" answer means the engine is stuck; a plain HTTP 500 is a
  // real error that a retry may fix, so it must not silence the engine.
  if (/timeout|503|sibuk|busy/i.test(msg)) {
    engineCooldownUntil.set(engine, Date.now() + ENGINE_COOLDOWN_MS);
    console.warn(
      `[TTS] ${engine} dilewati selama ${Math.round(ENGINE_COOLDOWN_MS / 60000)} menit: ${msg.slice(0, 120)}`
    );
  }
}

interface LocalChunkOptions {
  chunkLen?: number;
  timeoutMs?: number;
}

async function synthesizeWithLocalEndpoint(
  baseUrl: string,
  payload: Record<string, unknown>,
  text: string,
  opts: LocalChunkOptions = {}
): Promise<Buffer> {
  const chunks = splitTextChunks(text, opts.chunkLen ?? LOCAL_TTS_CHUNK_LEN);
  const parts: Buffer[] = [];
  for (const chunk of chunks) {
    const rawAudio = await fetchAudioFromEndpoint(
      baseUrl,
      { ...payload, input: chunk, text: chunk },
      opts.timeoutMs ?? LOCAL_TTS_TIMEOUT_MS
    );
    parts.push(transcodeToMpeg1(rawAudio));
  }
  return Buffer.concat(parts);
}

// 2. TIER 2: Supertonic 3 TTS (Built-in Native ONNX Runtime + Local HTTP fallback)
export async function synthesizeSupertonicTts(
  text: string,
  voiceId: string,
  isEnglish: boolean,
  voiceStyleOverride?: string,
  speedOverride?: number,
  outputFormat: "mp3" | "wav" = "mp3"
): Promise<Buffer> {
  const directMatch = voiceId.match(/\b([MF][1-5])\b/i);
  let voiceStyle = voiceStyleOverride;
  if (!voiceStyle) {
    if (directMatch) {
      voiceStyle = directMatch[1].toUpperCase();
    } else {
      const isFemale = /gadis|vivienne|ava|wanita|female|f[1-9]/i.test(voiceId);
      voiceStyle = isFemale ? getSupertonicVoiceFemale() : getSupertonicVoiceMale();
    }
  }

  const effectiveSpeed =
    speedOverride !== undefined ? clampSupertonicSpeed(speedOverride) : getSupertonicSpeed(isEnglish);

  // 1. Primary: Built-in Native Node.js ONNX Runtime (100% bundled in .exe, zero Python required!)
  if (findSupertonicModelDir()) {
    try {
      const wavBuf = await synthesizeSupertonicNativeWav(text, voiceStyle, isEnglish, effectiveSpeed);
      if (wavBuf && wavBuf.length > 0) {
        return outputFormat === "wav" ? wavBuf : transcodeToMpeg1(wavBuf);
      }
    } catch (nativeErr: any) {
      console.warn(
        `[TTS] Native Supertonic 3 ONNX gagal (${nativeErr?.message || nativeErr}), mencoba local endpoint fallback...`
      );
    }
  }

  // 2. Fallback: External / Python HTTP microservice endpoint
  const lang = isEnglish ? "en" : "id";
  const baseUrl = getSupertonicUrl();

  const payload = {
    model: "supertonic-3",
    input: text,
    text: text,
    voice: voiceStyle,
    voice_style: voiceStyle,
    language: lang,
    lang: lang,
    speed: effectiveSpeed,
    response_format: "wav",
  };

  if (outputFormat === "wav") {
    return fetchAudioFromEndpoint(baseUrl, payload, LOCAL_TTS_TIMEOUT_MS);
  }
  return synthesizeWithLocalEndpoint(baseUrl, payload, text);
}

// 3. TIER 3: VoxCPM 2 TTS (Expressive Foundation Model local microservice)
export async function synthesizeVoxcpm2Tts(
  text: string,
  voiceId: string,
  isEnglish: boolean
): Promise<Buffer> {
  const isFemale = /gadis|vivienne|ava|wanita|female|f[1-9]/i.test(voiceId);
  const voiceStyle = isFemale ? "female" : "male";
  const lang = isEnglish ? "en" : "id";
  const baseUrl = getVoxcpm2Url();

  const payload = {
    model: "openbmb/VoxCPM2",
    input: text,
    text: text,
    voice: voiceStyle,
    language: lang,
    lang: lang,
    response_format: "wav",
  };

  return synthesizeWithLocalEndpoint(baseUrl, payload, text);
}


// 4. TIER 4 FALLBACK: Windows SAPI Offline
function synthesizeWindowsSapi(text: string, isEnglish: boolean): Buffer {
  const tmpFile = path.join(
    os.tmpdir(),
    `simantu_sapi_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`
  );
  const safeText = text.replace(/["'\r\n\t]/g, " ");
  const voiceName = isEnglish ? "Microsoft Zira Desktop" : "Microsoft David Desktop";

  const psScript = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; try { $s.SelectVoice('${voiceName}'); } catch {}; $s.SetOutputToWaveFile('${tmpFile.replace(/\\/g, "/")}'); $s.Speak('${safeText}'); $s.Dispose();`;

  spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", psScript], {
    windowsHide: true,
    timeout: 10000,
  });

  if (fs.existsSync(tmpFile)) {
    try {
      const buf = fs.readFileSync(tmpFile);
      fs.unlinkSync(tmpFile);
      if (buf.length > 0) return buf;
    } catch {}
  }
  throw new Error("Windows SAPI synthesis failed");
}

// Multi-tier chunk synthesizer with automatic cascade
async function synthesizeChunkWithCascade(
  chunk: string,
  segVoice: string,
  isEnglish: boolean,
  prosody: { rate: string; pitch: string; volume: string },
  preferredEngine = "edge"
): Promise<{ audio: Buffer; engineUsed: string }> {
  const tryEdge = async (): Promise<{ audio: Buffer; engineUsed: string } | null> => {
    // 1. Primary: Direct Modern Node.js WebSocket with Sec-MS-GEC v2 (Zero Python dependency, works everywhere out-of-the-box!)
    try {
      const nodeAudio = await synthesizeEdgeNodeModernWithRetry(chunk, segVoice, isEnglish, prosody);
      if (nodeAudio && nodeAudio.length > 0) {
        return { audio: nodeAudio, engineUsed: "edge" };
      }
    } catch (nodeErr: any) {
      console.warn(`[TTS] Edge-TTS Modern Node gagal: ${nodeErr?.message || nodeErr}. Mencoba Python fallback...`);
    }

    // 2. Secondary fallback: Python edge_tts module (if available)
    try {
      const edgeAudio = synthesizeEdgePython(chunk, segVoice, prosody);
      if (edgeAudio && edgeAudio.length > 0) {
        return { audio: edgeAudio, engineUsed: "edge" };
      }
    } catch {
      // Python not available or failed
    }

    return null;
  };

  const trySupertonic = async (): Promise<{ audio: Buffer; engineUsed: string } | null> => {
    const coolLeft = engineCooldownLeftMs("supertonic");
    if (coolLeft > 0) {
      console.warn(`[TTS] Supertonic 3 dilewati (${Math.ceil(coolLeft / 1000)}s tersisa).`);
      return null;
    }
    try {
      console.log(`[TTS] Menggunakan Supertonic 3 (${segVoice}) untuk: "${chunk.substring(0, 40)}..."`);
      const supertonicAudio = await synthesizeSupertonicTts(chunk, segVoice, isEnglish);
      if (supertonicAudio && supertonicAudio.length > 0) {
        return { audio: supertonicAudio, engineUsed: "supertonic" };
      }
    } catch (supertonicErr: any) {
      markEngineFailed("Supertonic 3", supertonicErr);
      console.warn(`[TTS] Supertonic 3 TTS gagal: ${supertonicErr?.message || supertonicErr}`);
    }
    return null;
  };

  const tryVoxcpm2 = async (): Promise<{ audio: Buffer; engineUsed: string } | null> => {
    const coolLeft = engineCooldownLeftMs("voxcpm2");
    if (coolLeft > 0) {
      console.warn(`[TTS] VoxCPM 2 dilewati (${Math.ceil(coolLeft / 1000)}s tersisa).`);
      return null;
    }
    try {
      console.log(`[TTS] Menggunakan VoxCPM 2 (${segVoice}) untuk: "${chunk.substring(0, 40)}..."`);
      const voxAudio = await synthesizeVoxcpm2Tts(chunk, segVoice, isEnglish);
      if (voxAudio && voxAudio.length > 0) {
        return { audio: voxAudio, engineUsed: "voxcpm2" };
      }
    } catch (voxErr: any) {
      markEngineFailed("VoxCPM 2", voxErr);
      console.warn(`[TTS] VoxCPM 2 TTS gagal: ${voxErr?.message || voxErr}`);
    }
    return null;
  };

  const trySapi = (): { audio: Buffer; engineUsed: string } | null => {
    try {
      console.log(`[TTS] Menggunakan Fallback Offline Windows SAPI...`);
      const sapiAudio = synthesizeWindowsSapi(chunk, isEnglish);
      if (sapiAudio && sapiAudio.length > 0) {
        return { audio: sapiAudio, engineUsed: "sapi" };
      }
    } catch (sapiErr: any) {
      console.error(`[TTS] Windows SAPI gagal: ${sapiErr?.message || sapiErr}`);
    }
    return null;
  };

  let attempts: (() => Promise<{ audio: Buffer; engineUsed: string } | null> | { audio: Buffer; engineUsed: string } | null)[] = [];
  if (preferredEngine === "supertonic") {
    attempts = [trySupertonic, tryEdge, tryVoxcpm2, trySapi];
  } else if (preferredEngine === "voxcpm2") {
    attempts = [tryVoxcpm2, tryEdge, trySupertonic, trySapi];
  } else {
    // "edge" or "auto"
    attempts = [tryEdge, trySupertonic, tryVoxcpm2, trySapi];
  }

  for (const fn of attempts) {
    const res = await fn();
    if (res && res.audio.length > 0) return res;
  }

  throw new Error("Semua engine TTS gagal memproses audio");
}

export interface SynthesisResult {
  audio: Buffer;
  engineUsed: string;
  fallbackReason?: string;
}

export async function synthesizeSpeech(
  text: string,
  voiceId: string,
  preferredEngine = "edge"
): Promise<SynthesisResult> {
  // Normalize preset names like "Pria", "Wanita", "Pria/Pria" to valid Azure voice IDs
  if (VOICE_PRESETS[voiceId]) {
    voiceId = VOICE_PRESETS[voiceId].id;
  } else if (/^pria/i.test(voiceId)) {
    voiceId = VOICE_PRESETS["Pria"].id;
  } else if (/^wanita/i.test(voiceId)) {
    voiceId = VOICE_PRESETS["Wanita"].id;
  }

  const cached = getCachedAudio(text, voiceId, preferredEngine);
  if (cached) {
    return { audio: cached, engineUsed: preferredEngine };
  }

  let enginePlan = preferredEngine;
  let fallbackReason: string | undefined;

  const segments = segmentByLanguage(text);
  const mpeg1Parts: Buffer[] = [];

  // Determine root language from voice ID prefix
  const rootIsEnglish = voiceId.startsWith("en-");
  let prevLang: "id" | "en" | null = null;
  let actualEngineUsed = enginePlan;

  for (const seg of segments) {
    const isEnglish = seg.lang === 'en' || (seg.lang === 'root' && rootIsEnglish);

    let segVoice: string;
    if (seg.lang === 'en' && !rootIsEnglish) {
      segVoice = isMultilingualVoice(voiceId) ? voiceId : getEnglishVoice(voiceId);
    } else if (seg.lang === 'id' && rootIsEnglish) {
      segVoice = isMultilingualVoice(voiceId) ? voiceId : getIndonesianVoice(voiceId);
    } else {
      segVoice = voiceId;
    }

    // Apply speech text normalization (resolves times, numbers, abbreviations into natural words)
    let segText = normalizeSpeechText(seg.text, isEnglish);

    const currentLang: "id" | "en" = isEnglish ? "en" : "id";
    if (prevLang && prevLang !== currentLang && !/^[\s,.;:!?-]/.test(segText)) {
      segText = ", " + segText;
    }
    prevLang = currentLang;

    const prosody = pickProsody(isEnglish, rootIsEnglish);

    // Untuk Supertonic 3: Kirim seluruh teks segmen
    if (enginePlan === "supertonic") {
      try {
        console.log(`[TTS] Supertonic 3 — "${segText.substring(0, 50)}..."`);
        const supertonicMp3 = await synthesizeSupertonicTts(segText, voiceId, isEnglish);
        if (supertonicMp3 && supertonicMp3.length > 0) {
          mpeg1Parts.push(supertonicMp3);
          continue;
        }
      } catch (err: any) {
        console.warn(`[TTS] Supertonic 3 TTS gagal: ${err?.message || err}. Beralih ke Edge TTS.`);
        actualEngineUsed = "edge";
        const errMsg = String(err?.message || err);
        fallbackReason = `Server Supertonic 3 tidak dapat dijangkau (${errMsg.slice(0, 80)}). Suara dialihkan ke Edge TTS.`;
      }
    }

    // Untuk VoxCPM 2: Kirim seluruh teks segmen
    if (enginePlan === "voxcpm2") {
      try {
        console.log(`[TTS] VoxCPM 2 — "${segText.substring(0, 50)}..."`);
        const voxcpmMp3 = await synthesizeVoxcpm2Tts(segText, voiceId, isEnglish);
        if (voxcpmMp3 && voxcpmMp3.length > 0) {
          mpeg1Parts.push(voxcpmMp3);
          continue;
        }
      } catch (err: any) {
        console.warn(`[TTS] VoxCPM 2 TTS gagal: ${err?.message || err}. Beralih ke Edge TTS.`);
        actualEngineUsed = "edge";
        const errMsg = String(err?.message || err);
        fallbackReason = `Server VoxCPM 2 tidak dapat dijangkau (${errMsg.slice(0, 80)}). Suara dialihkan ke Edge TTS.`;
      }
    }

    // Engine Edge TTS atau cascade fallback: potong per kalimat (max 250 char)
    // NOTE: synthesizeChunkWithCascade mengembalikan audio mentah (MP3/transcoded).
    //       transcodeToMpeg1 normalizes any input → consistent MPEG1 Layer3 @ 44100Hz
    const textChunks = splitTextChunks(segText);
    const fallbackEngine = (enginePlan === "supertonic" || enginePlan === "voxcpm2") ? "edge" : enginePlan;

    for (const chunk of textChunks) {
      const chunkResult = await synthesizeChunkWithCascade(chunk, segVoice, isEnglish, prosody, fallbackEngine);
      actualEngineUsed = chunkResult.engineUsed;
      const transcoded = transcodeToMpeg1(chunkResult.audio);
      mpeg1Parts.push(transcoded);
    }
  }

  const mpeg1 = Buffer.concat(mpeg1Parts);
  // Simpan cache dengan actualEngineUsed agar akurat
  saveCachedAudio(text, voiceId, mpeg1, actualEngineUsed);

  return { audio: mpeg1, engineUsed: actualEngineUsed, fallbackReason };
}


