import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";

// ============================================================================
// Native Node.js Supertonic 3 ONNX Engine (Zero Python Dependency)
// Runs Supertonic 3 directly inside Electron / Node.js via onnxruntime-node
// using the bundled ONNX models in services/supertonic3.
// ============================================================================

interface StyleTensorJson {
  dims: number[];
  data: any;
}

interface VoiceStyleJson {
  style_ttl: StyleTensorJson;
  style_dp: StyleTensorJson;
}

interface LoadedStyle {
  ttlData: Float32Array;
  ttlDims: number[];
  dpData: Float32Array;
  dpDims: number[];
}

interface SupertonicRuntime {
  ort: any;
  dpSession: any;
  textEncSession: any;
  vectorEstSession: any;
  vocoderSession: any;
  indexer: number[];
  supportedChars: Set<string>;
  sampleRate: number;
  baseChunkSize: number;
  chunkCompressFactor: number;
  ldim: number;
  modelDir: string;
  styles: Map<string, LoadedStyle>;
}

let runtimePromise: Promise<SupertonicRuntime> | null = null;
let synthChain: Promise<any> = Promise.resolve();

function getOrt(): any {
  const req =
    typeof require === "function"
      ? require
      : createRequire((import.meta as any)?.url || `file://${process.cwd()}/`);
  try {
    return req("onnxruntime-node");
  } catch (err) {
    const resourcesPath = (process as any).resourcesPath || "";
    if (resourcesPath) {
      const unpackedPath = path.join(resourcesPath, "app.asar.unpacked", "node_modules", "onnxruntime-node");
      if (fs.existsSync(unpackedPath)) {
        return req(unpackedPath);
      }
    }
    throw err;
  }
}

export function findSupertonicModelDir(): string | null {
  const resourcesPath = (process as any).resourcesPath || "";
  const candidates = [
    process.env.SUPERTONIC_CACHE_DIR || "",
    resourcesPath ? path.join(resourcesPath, "services", "supertonic3") : "",
    resourcesPath ? path.join(resourcesPath, "app.asar.unpacked", "services", "supertonic3") : "",
    path.join(process.cwd(), "services", "supertonic3"),
    typeof __dirname !== "undefined" ? path.join(__dirname, "..", "services", "supertonic3") : "",
    path.join(os.homedir(), ".cache", "supertonic3"),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, "onnx", "duration_predictor.onnx")) &&
      fs.existsSync(path.join(dir, "onnx", "text_encoder.onnx")) &&
      fs.existsSync(path.join(dir, "onnx", "vector_estimator.onnx")) &&
      fs.existsSync(path.join(dir, "onnx", "vocoder.onnx")) &&
      fs.existsSync(path.join(dir, "onnx", "tts.json")) &&
      fs.existsSync(path.join(dir, "onnx", "unicode_indexer.json"))
    ) {
      return dir;
    }
  }
  return null;
}

function flattenFloat32(nested: any): Float32Array {
  if (nested instanceof Float32Array) return nested;
  const flat: number[] = [];
  const walk = (arr: any) => {
    if (Array.isArray(arr)) {
      for (let i = 0; i < arr.length; i++) walk(arr[i]);
    } else if (typeof arr === "number") {
      flat.push(arr);
    }
  };
  walk(nested);
  return Float32Array.from(flat);
}

// ============================================================================
// INDONESIAN & ENGLISH SPEECH TEXT NORMALIZATION
// Mirrors services/supertonic_server.py for identical pronunciation
// ============================================================================

export function num2wordsId(n: number): string {
  n = Math.trunc(n);
  if (n === 0) return "nol";
  const satuan = [
    "", "satu", "dua", "tiga", "empat", "lima", "enam",
    "tujuh", "delapan", "sembilan", "sepuluh", "sebelas",
  ];
  if (n < 12) return satuan[n];
  if (n < 20) return satuan[n - 10] + " belas";
  if (n < 100) {
    const s = satuan[Math.floor(n / 10)] + " puluh";
    const rem = n % 10;
    return rem ? `${s} ${satuan[rem]}` : s;
  }
  if (n < 200) {
    const rem = n % 100;
    return rem ? `seratus ${num2wordsId(rem)}` : "seratus";
  }
  if (n < 1000) {
    const s = satuan[Math.floor(n / 100)] + " ratus";
    const rem = n % 100;
    return rem ? `${s} ${num2wordsId(rem)}` : s;
  }
  if (n < 2000) {
    const rem = n % 1000;
    return rem ? `seribu ${num2wordsId(rem)}` : "seribu";
  }
  if (n < 1_000_000) {
    const s = `${num2wordsId(Math.floor(n / 1000))} ribu`;
    const rem = n % 1000;
    return rem ? `${s} ${num2wordsId(rem)}` : s;
  }
  if (n < 1_000_000_000) {
    const s = `${num2wordsId(Math.floor(n / 1_000_000))} juta`;
    const rem = n % 1_000_000;
    return rem ? `${s} ${num2wordsId(rem)}` : s;
  }
  return String(n);
}

function formatTimeWordsId(h: number, m: number): string {
  const hStr = num2wordsId(h);
  if (m === 0) return hStr;
  if (m < 10) return `${hStr} lewat ${num2wordsId(m)}`;
  return `${hStr} ${num2wordsId(m)}`;
}

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
  30: "thirty", 40: "forty", 50: "fifty",
};

function num2wordsEnUnder60(n: number): string {
  n = Math.trunc(n);
  if (NUM_WORDS_EN[n]) return NUM_WORDS_EN[n];
  const tens = Math.floor(n / 10) * 10;
  const ones = n % 10;
  return `${NUM_WORDS_EN[tens] || ""} ${NUM_WORDS_EN[ones] || ""}`.trim();
}

function formatTimeWordsEn(h: number, m: number, period?: string): string {
  h = Math.trunc(h);
  m = Math.trunc(m);
  let h12: number;
  let pClean: string;
  if (period) {
    pClean = period.toLowerCase().includes("p") ? "P M" : "A M";
    h12 = h === 0 || h === 12 ? 12 : h % 12;
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
  if (m === 0) return `${hWord} ${pClean}`;
  if (m < 10) return `${hWord} oh ${num2wordsEnUnder60(m)} ${pClean}`;
  return `${hWord} ${num2wordsEnUnder60(m)} ${pClean}`;
}

export function normalizeSpeechText(text: string, lang: "id" | "en" = "id"): string {
  if (!text) return "";
  if (lang === "en") {
    let res = text;
    res = res.replace(/\s*&\s*/g, " and ");
    res = res.replace(
      /([0-1]?[0-9])[:.]([0-5][0-9])\s*(AM|PM|a\.m\.|p\.m\.|am|pm)(?:\s*-\s*|\s*–\s*|\s*to\s*|\s*until\s*)([0-1]?[0-9])[:.]([0-5][0-9])\s*(AM|PM|a\.m\.|p\.m\.|am|pm)/gi,
      (_m, h1, m1, p1, h2, m2, p2) =>
        `${formatTimeWordsEn(parseInt(h1, 10), parseInt(m1, 10), p1)} to ${formatTimeWordsEn(parseInt(h2, 10), parseInt(m2, 10), p2)}`
    );
    res = res.replace(
      /\b([0-1]?[0-9])[:.]([0-5][0-9])\s*(AM|PM|a\.m\.|p\.m\.|am|pm)(?:\s*(WIB|WITA|WIT))?\b/gi,
      (_m, h, mn, p, tz) =>
        `${formatTimeWordsEn(parseInt(h, 10), parseInt(mn, 10), p)}${tz && /wib/i.test(tz) ? ", W I B" : ""}`
    );
    res = res.replace(
      /\b([0-1]?[0-9])\s*(AM|PM|a\.m\.|p\.m\.|am|pm)(?:\s*(WIB|WITA|WIT))?\b/gi,
      (_m, h, p, tz) =>
        `${formatTimeWordsEn(parseInt(h, 10), 0, p)}${tz && /wib/i.test(tz) ? ", W I B" : ""}`
    );
    res = res.replace(
      /\b([01]?[0-9]|2[0-3])[:.]([0-5][0-9])\s*(WIB|WITA|WIT)\b/gi,
      (_m, h, mn) => `${formatTimeWordsEn(parseInt(h, 10), parseInt(mn, 10))}, W I B`
    );
    res = res.replace(
      /\b(?:at\s+)?([01]?[0-9]|2[0-3])[:.]([0-5][0-9])\b/g,
      (_m, h, mn) => formatTimeWordsEn(parseInt(h, 10), parseInt(mn, 10))
    );
    const ordinals: Record<number, string> = {
      1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth",
      6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth",
    };
    res = res.replace(/\b([1-9]|10)(st|nd|rd|th)\b/gi, (m, num) => ordinals[parseInt(num, 10)] || m);
    res = res.replace(/\bUGM\b/gi, "U G M");
    res = res.replace(/\bETD\b/gi, "E T D");
    res = res.replace(/\bWIB\b/gi, "W I B");
    res = res.replace(/\bL1\b/gi, "Level One");
    res = res.replace(/\bL2\b/gi, "Level Two");
    res = res.replace(/\bL3\b/gi, "Level Three");
    res = res.replace(/\bL4\b/gi, "Level Four");
    res = res.replace(/\bL5\b/gi, "Level Five");
    return res;
  }

  let res = text;
  res = res.replace(/:([^\s\d])/g, ": $1");
  res = res.replace(/:\s*([0-9])/g, ": $1");
  res = res.replace(/\s*&\s*/g, " dan ");
  res = res.replace(/\s*\/\s*atau\s*/gi, " atau ");
  res = res.replace(/\bdan\/atau\b/gi, "dan atau");
  res = res.replace(/\b(?:bapak\/ibu|ibu\/bapak)\b/gi, "Bapak atau Ibu");

  res = res.replace(/\bUGM\b/gi, "U G M");
  res = res.replace(/\bETD\b/gi, "E T D");
  res = res.replace(/\bKTM\b/gi, "K T M");
  res = res.replace(/\bOPAC\b/gi, "O-Pac");
  res = res.replace(/\bSIMANTU\b/gi, "Simantu");
  res = res.replace(/\b(?:wi-?fi)\b/gi, "Wai-Fai");
  res = res.replace(/\bAC\b/g, "A C");
  res = res.replace(/\bPC\b/g, "P C");
  res = res.replace(/\bCS\b/g, "Customer Service");
  res = res.replace(/\bL1\b/gi, "Lantai satu");
  res = res.replace(/\bL2\b/gi, "Lantai dua");
  res = res.replace(/\bL3\b/gi, "Lantai tiga");
  res = res.replace(/\bL4\b/gi, "Lantai empat");
  res = res.replace(/\bL5\b/gi, "Lantai lima");

  const T = "([01]?[0-9]|2[0-3])[:.]([0-5][0-9])";
  const TZ = "(WIB|WITA|WIT|Waktu Indonesia (?:Barat|Tengah|Timur))";
  const SEP = "(?:-|–|—|\\bs\\.?d\\.?\\b|\\bs\\/d\\b|\\bsampai\\b)";
  const PRE = "(?:pukul|jam|pk\\.?)";

  res = res.replace(
    new RegExp(`(?:${PRE}\\s*)?${T}\\s*${SEP}\\s*(?:${PRE}\\s*)?${T}(?:\\s*${TZ})?`, "gi"),
    (_m, h1, m1, h2, m2, tz) => {
      const t1 = formatTimeWordsId(parseInt(h1, 10), parseInt(m1, 10));
      const t2 = formatTimeWordsId(parseInt(h2, 10), parseInt(m2, 10));
      let out = `pukul ${t1} sampai pukul ${t2}`;
      if (tz) out += `, ${tz.length > 4 ? tz : tzAbbr(tz)}`;
      return out;
    }
  );

  res = res.replace(
    new RegExp(`(?:${PRE}\\s*)?${T}\\s*${TZ}\\b`, "gi"),
    (_m, h, mn, tz) => {
      const t = formatTimeWordsId(parseInt(h, 10), parseInt(mn, 10));
      return `pukul ${t}, ${tz.length > 4 ? tz : tzAbbr(tz)}`;
    }
  );

  res = res.replace(
    new RegExp(`\\b${PRE}\\s*${T}(\\s*tepat)?\\b`, "gi"),
    (_m, h, mn, tepat) => {
      const t = formatTimeWordsId(parseInt(h, 10), parseInt(mn, 10));
      return `pukul ${t}${tepat ? " tepat" : ""}`;
    }
  );

  res = res.replace(
    /\b([01]?[0-9]|2[0-3])[:.]([0-5][0-9])\b/g,
    (_m, h, mn) => `pukul ${formatTimeWordsId(parseInt(h, 10), parseInt(mn, 10))}`
  );

  res = res.replace(/\bWIB\b/gi, "W I B");
  res = res.replace(/\bWITA\b/gi, "W I T A");
  res = res.replace(/\bWIT\b/gi, "W I T");

  res = res.replace(/\bs\.d\.|\bs\.d\b|\bs\/d\b/gi, "sampai dengan");
  res = res.replace(/\bd\.a\.|\bd\.a\b|\bd\/a\b/gi, "dengan alamat");
  res = res.replace(/\bdll\b\.?/gi, "dan lain-lain");
  res = res.replace(/\bdsb\b\.?/gi, "dan sebagainya");
  res = res.replace(/\bdst\b\.?/gi, "dan seterusnya");
  res = res.replace(/\bttd\b\.?/gi, "tertanda");
  res = res.replace(/\byth\b\.?/gi, "Yang terhormat");
  res = res.replace(/\bno\b\.?/gi, "nomor");
  res = res.replace(/\btgl\b\.?/gi, "tanggal");
  res = res.replace(/\bthn\b\.?/gi, "tahun");
  res = res.replace(/\bbln\b\.?/gi, "bulan");
  res = res.replace(/\bdr\.\s+/gi, "Dokter ");
  res = res.replace(/\bprof\.\s+/gi, "Profesor ");
  res = res.replace(/\bbpk\.?\s+/gi, "Bapak ");
  res = res.replace(/\bsdr\.?\s+/gi, "Saudara ");
  res = res.replace(/\bsdri\.?\s+/gi, "Saudari ");

  res = res.replace(/(?:rp\.?|idr)\s*([0-9]+(?:\.[0-9]{3})+|[0-9]+)/gi, (m, rawNum) => {
    const clean = parseInt(String(rawNum).replace(/\./g, ""), 10);
    return Number.isFinite(clean) ? `${num2wordsId(clean)} rupiah` : m;
  });

  res = res.replace(/\bke\s*-\s*([0-9]+)\b|\bke\s+([0-9]+)\b/gi, (_m, g1, g2) => {
    const val = parseInt(g1 || g2, 10);
    return val === 1 ? "pertama" : `ke${num2wordsId(val)}`;
  });

  res = res.replace(
    /\b(lantai|lt\.?|pintu|ruang|meja|loket|gedung|gd\.?|kelas|tingkat|tahap)\s+([0-9]+)\b/gi,
    (_m, pfx, num) => {
      let prefix = String(pfx).toLowerCase();
      if (prefix.startsWith("lt")) prefix = "lantai";
      else if (prefix.startsWith("gd")) prefix = "gedung";
      return `${prefix} ${num2wordsId(parseInt(num, 10))}`;
    }
  );

  res = res.replace(
    /\b([0-9]+)\s*(menit|detik|jam|hari|minggu|bulan|tahun)\b/gi,
    (_m, num, unit) => `${num2wordsId(parseInt(num, 10))} ${unit}`
  );

  res = res.replace(/\b([0-9]+)\s*%/g, (_m, num) => `${num2wordsId(parseInt(num, 10))} persen`);
  res = res.replace(/\b([0-9]{1,6})\b/g, (_m, num) => num2wordsId(parseInt(num, 10)));

  const digitWords = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];
  res = res.replace(/\b([0-9]{7,})\b/g, (_m, digits) =>
    String(digits)
      .split("")
      .map((d) => digitWords[parseInt(d, 10)] || d)
      .join(" ")
  );

  return res.replace(/\s+/g, " ").trim();
}

// ============================================================================
// SUPERTONIC UNICODE PREPROCESSOR & CHUNKER
// ============================================================================

const SYMBOL_REPLACEMENTS: Record<string, string> = {
  "\u2013": "-",
  "\u2011": "-",
  "\u2014": "-",
  "\u00af": " ",
  "_": " ",
  "\u201c": '"',
  "\u201d": '"',
  "\u2018": "'",
  "\u2019": "'",
  "\u00b4": "'",
  "`": "'",
  "[": " ",
  "]": " ",
  "|": " ",
  "/": " ",
  "#": " ",
  "→": " ",
  "←": " ",
};

function preprocessTextForSupertonic(
  rawText: string,
  lang: "id" | "en",
  supportedChars: Set<string>
): string {
  let text = rawText;
  try {
    text = text.normalize("NFKD");
  } catch {}

  for (const [oldCh, newCh] of Object.entries(SYMBOL_REPLACEMENTS)) {
    text = text.split(oldCh).join(newCh);
  }
  text = text.replace(/[♥☆♡©\\]/g, "");
  text = text.replace(/@/g, " at ").replace(/e\.g\.,/g, "for example, ").replace(/i\.e\.,/g, "that is, ");
  text = text
    .replace(/ ,/g, ",")
    .replace(/ \./g, ".")
    .replace(/ !/g, "!")
    .replace(/ \?/g, "?")
    .replace(/ ;/g, ";")
    .replace(/ :/g, ":")
    .replace(/ '/g, "'");
  text = text.replace(/(["'`])\1+/g, "$1");

  // Strip any character not in the model's unicode indexer
  let filtered = "";
  for (const ch of text) {
    filtered += supportedChars.has(ch) ? ch : " ";
  }
  text = filtered.replace(/\s+/g, " ").trim();
  if (!text) text = ".";
  if (!/[.!?;:,'"')\]{}…。」』】〉》›»]$/.test(text)) {
    text += ".";
  }
  return `<${lang}>${text}</${lang}>`;
}

function chunkTextForSupertonic(text: string, maxLen = 280): string[] {
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];

  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    let current = "";
    for (const rawSentence of sentences) {
      const sentence = rawSentence.trim();
      if (!sentence) continue;
      if (current.length + sentence.length + 1 <= maxLen) {
        current += (current ? " " : "") + sentence;
      } else {
        if (current) chunks.push(current);
        if (sentence.length <= maxLen) {
          current = sentence;
        } else {
          // Further split very long sentences by comma or space
          const words = sentence.split(/\s+/);
          let sub = "";
          for (const w of words) {
            if (sub.length + w.length + 1 <= maxLen) {
              sub += (sub ? " " : "") + w;
            } else {
              if (sub) chunks.push(sub);
              sub = w;
            }
          }
          current = sub;
        }
      }
    }
    if (current) chunks.push(current);
  }
  return chunks.length > 0 ? chunks : [text.trim()];
}

function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function encodeFloat32ToWav(samples: Float32Array, sampleRate: number): Buffer {
  const numSamples = samples.length;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20);  // PCM format = 1
  buffer.writeUInt16LE(1, 22);  // Mono = 1 channel
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    buffer.writeInt16LE(val, offset);
    offset += 2;
  }
  return buffer;
}

async function initSupertonicRuntime(): Promise<SupertonicRuntime> {
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    const modelDir = findSupertonicModelDir();
    if (!modelDir) {
      throw new Error("Direktori model Supertonic 3 tidak ditemukan.");
    }

    const ort = getOrt();
    const logicalCpus = os.cpus()?.length || 4;
    const intraThreads = Math.max(2, Math.min(8, logicalCpus - 1));
    const sessOpts = {
      intraOpNumThreads: intraThreads,
      interOpNumThreads: 1,
      graphOptimizationLevel: "all",
      executionMode: "sequential",
    };

    const onnxDir = path.join(modelDir, "onnx");
    const [dpSession, textEncSession, vectorEstSession, vocoderSession] = await Promise.all([
      ort.InferenceSession.create(path.join(onnxDir, "duration_predictor.onnx"), sessOpts),
      ort.InferenceSession.create(path.join(onnxDir, "text_encoder.onnx"), sessOpts),
      ort.InferenceSession.create(path.join(onnxDir, "vector_estimator.onnx"), sessOpts),
      ort.InferenceSession.create(path.join(onnxDir, "vocoder.onnx"), sessOpts),
    ]);

    const cfgs = JSON.parse(fs.readFileSync(path.join(onnxDir, "tts.json"), "utf-8"));
    const indexer: number[] = JSON.parse(fs.readFileSync(path.join(onnxDir, "unicode_indexer.json"), "utf-8"));

    const supportedChars = new Set<string>();
    for (let u = 0; u < indexer.length; u++) {
      if (indexer[u] !== -1) {
        supportedChars.add(String.fromCodePoint(u));
      }
    }

    const styles = new Map<string, LoadedStyle>();
    const stylesDir = path.join(modelDir, "voice_styles");
    if (fs.existsSync(stylesDir)) {
      for (const file of fs.readdirSync(stylesDir)) {
        if (!file.endsWith(".json")) continue;
        const name = path.basename(file, ".json").toUpperCase();
        const raw: VoiceStyleJson = JSON.parse(fs.readFileSync(path.join(stylesDir, file), "utf-8"));
        styles.set(name, {
          ttlData: flattenFloat32(raw.style_ttl.data),
          ttlDims: raw.style_ttl.dims,
          dpData: flattenFloat32(raw.style_dp.data),
          dpDims: raw.style_dp.dims,
        });
      }
    }

    console.log(`[Supertonic Native] Engine ONNX siap dari ${modelDir} (${styles.size} karakter suara)`);
    return {
      ort,
      dpSession,
      textEncSession,
      vectorEstSession,
      vocoderSession,
      indexer,
      supportedChars,
      sampleRate: cfgs.ae.sample_rate || 24000,
      baseChunkSize: cfgs.ae.base_chunk_size,
      chunkCompressFactor: cfgs.ttl.chunk_compress_factor,
      ldim: cfgs.ttl.latent_dim,
      modelDir,
      styles,
    };
  })().catch((err) => {
    runtimePromise = null;
    throw err;
  });

  return runtimePromise;
}

async function synthesizeSingleChunk(
  rt: SupertonicRuntime,
  rawChunk: string,
  style: LoadedStyle,
  lang: "id" | "en",
  speed: number,
  totalSteps = 8
): Promise<Float32Array> {
  const { ort } = rt;
  const preprocessed = preprocessTextForSupertonic(rawChunk, lang, rt.supportedChars);
  const codePoints = Array.from(preprocessed).map((ch) => ch.codePointAt(0) || 0);
  const seqLen = codePoints.length;

  const textIdsData = new BigInt64Array(seqLen);
  const textMaskData = new Float32Array(seqLen);
  for (let i = 0; i < seqLen; i++) {
    const idx = rt.indexer[codePoints[i]];
    textIdsData[i] = BigInt(idx !== undefined && idx >= 0 ? idx : 0);
    textMaskData[i] = 1.0;
  }

  const textIdsTensor = new ort.Tensor("int64", textIdsData, [1, seqLen]);
  const textMaskTensor = new ort.Tensor("float32", textMaskData, [1, 1, seqLen]);
  const styleDpTensor = new ort.Tensor("float32", style.dpData, style.dpDims);
  const styleTtlTensor = new ort.Tensor("float32", style.ttlData, style.ttlDims);

  const dpOut = await rt.dpSession.run({
    text_ids: textIdsTensor,
    style_dp: styleDpTensor,
    text_mask: textMaskTensor,
  });
  const durTensor = dpOut[Object.keys(dpOut)[0]];
  const rawDur = Number(durTensor.data[0]);
  const effectiveSpeed = Math.max(0.7, Math.min(2.0, speed));
  const durSeconds = Math.max(0.15, rawDur / effectiveSpeed);

  const textEncOut = await rt.textEncSession.run({
    text_ids: textIdsTensor,
    style_ttl: styleTtlTensor,
    text_mask: textMaskTensor,
  });
  const textEmbTensor = textEncOut[Object.keys(textEncOut)[0]];

  const wavLen = Math.floor(durSeconds * rt.sampleRate);
  const chunkSize = rt.baseChunkSize * rt.chunkCompressFactor;
  const latentLen = Math.max(1, Math.floor((wavLen + chunkSize - 1) / chunkSize));
  const latentDim = rt.ldim * rt.chunkCompressFactor;

  const noisyLatentData = new Float32Array(latentDim * latentLen);
  for (let i = 0; i < noisyLatentData.length; i++) {
    noisyLatentData[i] = randn();
  }
  const latentMaskData = new Float32Array(latentLen);
  latentMaskData.fill(1.0);

  let xtTensor = new ort.Tensor("float32", noisyLatentData, [1, latentDim, latentLen]);
  const latentMaskTensor = new ort.Tensor("float32", latentMaskData, [1, 1, latentLen]);
  const totalStepTensor = new ort.Tensor("float32", new Float32Array([totalSteps]), [1]);

  for (let step = 0; step < totalSteps; step++) {
    const currentStepTensor = new ort.Tensor("float32", new Float32Array([step]), [1]);
    const vecOut = await rt.vectorEstSession.run({
      noisy_latent: xtTensor,
      text_emb: textEmbTensor,
      style_ttl: styleTtlTensor,
      text_mask: textMaskTensor,
      latent_mask: latentMaskTensor,
      current_step: currentStepTensor,
      total_step: totalStepTensor,
    });
    xtTensor = vecOut[Object.keys(vecOut)[0]];
  }

  const vocOut = await rt.vocoderSession.run({
    latent: xtTensor,
  });
  const wavTensor = vocOut[Object.keys(vocOut)[0]];
  const wavData = wavTensor.data as Float32Array;
  return new Float32Array(wavData.buffer, wavData.byteOffset, wavData.length);
}

export async function synthesizeSupertonicNativeWav(
  rawText: string,
  voiceName: string,
  isEnglish: boolean,
  speed = 1.0
): Promise<Buffer> {
  const runJob = async (): Promise<Buffer> => {
    const rt = await initSupertonicRuntime();
    const lang: "id" | "en" = isEnglish ? "en" : "id";
    const normalized = normalizeSpeechText(rawText, lang);
    if (!normalized.trim()) {
      throw new Error("Teks pengumuman kosong setelah normalisasi.");
    }

    const cleanVoice = (voiceName || "M1").trim().toUpperCase();
    const style =
      rt.styles.get(cleanVoice) ||
      rt.styles.get(cleanVoice.startsWith("F") ? "F1" : "M1") ||
      Array.from(rt.styles.values())[0];

    if (!style) {
      throw new Error("Voice style Supertonic 3 tidak ditemukan.");
    }

    const chunks = chunkTextForSupertonic(normalized, 280);
    const pcmParts: Float32Array[] = [];
    const silenceSamples = Math.floor(0.3 * rt.sampleRate);
    const silence = new Float32Array(silenceSamples);

    for (let i = 0; i < chunks.length; i++) {
      const pcm = await synthesizeSingleChunk(rt, chunks[i], style, lang, speed, 8);
      pcmParts.push(pcm);
      if (i + 1 < chunks.length) {
        pcmParts.push(silence);
      }
    }

    const totalLen = pcmParts.reduce((acc, arr) => acc + arr.length, 0);
    const combined = new Float32Array(totalLen);
    let offset = 0;
    for (const part of pcmParts) {
      combined.set(part, offset);
      offset += part.length;
    }

    return encodeFloat32ToWav(combined, rt.sampleRate);
  };

  // Serialize CPU-bound ONNX inference so concurrent requests never thrash
  const next = synthChain.then(runJob, runJob);
  synthChain = next.catch(() => {});
  return next;
}
