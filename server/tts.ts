import { WebSocket } from "ws";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import https from "https";
import os from "os";
import { URL } from "url";
import { createRequire } from "module";

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
  const engineKey = `${engine}-v9`;
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

// Expand ALL-CAPS abbreviations by inserting dots between letters.
// Always applied regardless of surrounding context or voice language.
// "UGM" → "U.G.M."  "WIB" → "W.I.B."  "RSUP" → "R.S.U.P."
// Skips words that look like acronyms with too many vowels (e.g. NASA, ASEAN are kept as-is
// only if they read naturally — but here we expand all 2-6 char ALL-CAPS runs).
function expandAbbreviations(text: string): string {
  return text.replace(/\b([A-Z]{2,6})\b/g, (match) => {
    return match.split("").join(".") + ".";
  });
}

// Server-side safety net so default spelling behavior survives even if client-side rules are bypassed.
function applySystemSpellingFallback(text: string, isEnglish: boolean): string {
  return text
    .replace(/\s*&\s*/g, isEnglish ? " and " : " dan ")
    .replace(/\bUGM\b/gi, "U G M")
    .replace(/\bETD\b/gi, "E T D")
    .replace(/\bWIB\b/gi, isEnglish ? "W I B" : "Waktu Indonesia Barat")
    .replace(/\bL1\b/gi, isEnglish ? "L One" : "L Satu")
    .replace(/\bL5\b/gi, isEnglish ? "L Five" : "L Lima");
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

function getGeminiApiKey(): string {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const match = content.match(/GEMINI_API_KEY\s*=\s*([^\r\n]+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch {}
  return "";
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

// Derive Gemini prebuilt voice name from voice ID.
// IMPORTANT: Always pass the ROOT voiceId (user's gender preference), NOT the segment voice
// (which can be switched to an EN/ID counterpart and would break gender detection).
// Female voice IDs mapping:
//   Indonesian:  fr-FR-VivienneMultilingualNeural  (Wanita ID preset)
//   English:     en-US-AvaMultilingualNeural        (Wanita EN preset)
//   Indonesian:  id-ID-GadisNeural
function getGeminiVoiceName(rootVoiceId: string): string {
  // Female markers: Vivienne (Wanita ID), Ava (Wanita EN), Gadis (ID female), Jenny/Aria (EN female)
  const isFemale = /gadis|vivienne|ava|wanita|jenny|aria/i.test(rootVoiceId);
  return isFemale ? "Aoede" : "Fenrir";
}


function transcodeGeminiPcmToMpeg1(pcmBuffer: Buffer, mimeType = ""): Buffer {
  const args = ["-loglevel", "error"];
  if (/l16|pcm/i.test(mimeType)) {
    args.push("-f", "s16le", "-ar", "24000", "-ac", "1");
  }
  args.push("-i", "pipe:0", "-f", "mp3", "-acodec", "libmp3lame", "-ar", "44100", "-ab", "64k", "pipe:1");
  const result = spawnSync(ffmpegBin, args, { input: pcmBuffer, maxBuffer: 50 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("ffmpeg transcode failed: " + (result.stderr?.toString() ?? "unknown error"));
  }
  return result.stdout as Buffer;
}

// 2. TIER 2 FALLBACK: Gemini Flash TTS (with audio modality, PCM transcoding, and Gender support)
async function requestGeminiAudio(model: string, text: string, voiceName: string, apiKey: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "You are an automated public announcement system and text-to-speech engine. Strictly speak ONLY the exact text given by the user verbatim. Absolutely NEVER say any greeting, acknowledgement, introduction, or commentary such as 'Baik', 'Tentu', 'Berikut adalah pengumuman', 'Ini adalah', or anything else. Output only the speech for the provided text.",
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName,
            },
          },
        },
      },
    });

    const parsedUrl = new URL(url);
    const req = https.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "x-goog-api-key": apiKey,
        },
        timeout: 25000,
      },
      (res) => {
        let raw = "";
        res.on("data", (d) => (raw += d));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Gemini TTS [${model}] status ${res.statusCode}: ${raw.substring(0, 200)}`));
          }
          try {
            const data = JSON.parse(raw);
            const parts = data?.candidates?.[0]?.content?.parts || [];
            const audioPart = parts.find((p: any) => p?.inlineData?.data);
            const inlineData = audioPart?.inlineData;
            if (!inlineData?.data) throw new Error(`No audio payload returned from Gemini TTS [${model}]`);
            const pcmBuffer = Buffer.from(inlineData.data, "base64");
            const mimeType = inlineData.mimeType || "audio/L16;codec=pcm;rate=24000";
            resolve(transcodeGeminiPcmToMpeg1(pcmBuffer, mimeType));
          } catch (err: any) {
            reject(new Error(`Failed to parse Gemini response: ${err.message}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Gemini TTS [${model}] request timed out`));
    });
    req.write(payload);
    req.end();
  });
}

async function synthesizeGeminiTts(text: string, voiceId: string, _isEnglish: boolean): Promise<Buffer> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("Gemini API Key is not configured");

  const voiceName = getGeminiVoiceName(voiceId);
  // Model list updated October 2026 — Google retired gemini-2.x for new API keys.
  // Use dedicated TTS models first (faster, cheaper), then general-purpose flash as fallback.
  const models = [
    "gemini-3.8-flash-tts",       // Dedicated TTS model (best quality, lowest latency)
    "gemini-3.8-flash-lite-tts",  // Lighter TTS fallback
    "gemini-2.5-flash-preview-tts", // Legacy preview TTS
    "gemini-3.8-flash",           // General-purpose flash (supports AUDIO modality)
  ];
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      return await requestGeminiAudio(model, text, voiceName, apiKey);
    } catch (err: any) {
      lastError = err;
      const errStr = String(err?.message || err);
      console.warn(`[TTS] Model ${model} (${voiceName}) gagal: ${errStr}.`);
      // Stop retrying immediately if it's a credentials issue (not a model issue)
      if (errStr.includes("401") || errStr.includes("UNAUTHENTICATED") || errStr.includes("API key not valid")) {
        break;
      }
      // Stop retrying if this is a 404 — the model simply doesn't exist, try the next one
      if (errStr.includes("404") || errStr.includes("NOT_FOUND")) {
        console.warn(`[TTS] Model ${model} tidak tersedia, mencoba model alternatif...`);
        continue;
      }
      console.warn(`[TTS] Mencoba model alternatif...`);
    }
  }

  throw lastError || new Error("Semua model Gemini TTS gagal");
}

// 3. TIER 3 FALLBACK: Google Translate TTS (Zero-config)
// Google Translate TTS API rejects texts longer than ~120 characters with HTTP 400.
// Split into ≤120-char chunks, fetch each separately, and concatenate the raw MP3 buffers.
const GOOGLE_TTS_MAX_LEN = 120;

function fetchGoogleTranslateSingle(text: string, lang: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text)}`;
    const parsedUrl = new URL(url);

    https
      .get(
        {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
          },
          timeout: 10000,
        },
        (res) => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Google Translate TTS status ${res.statusCode} for text: "${text.substring(0, 40)}..."`));
          }
          const bufChunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => bufChunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(bufChunks)));
        }
      )
      .on("error", reject);
  });
}

async function synthesizeGoogleTranslateTts(text: string, isEnglish: boolean): Promise<Buffer> {
  const lang = isEnglish ? "en" : "id";
  // Split into ≤120-char sub-chunks at sentence/word boundaries
  const subChunks = splitTextChunks(text, GOOGLE_TTS_MAX_LEN);
  console.log(`[TTS] Google Translate: ${subChunks.length} sub-chunk(s) untuk teks (${text.length} chars)`);
  const parts: Buffer[] = [];
  for (const sub of subChunks) {
    const part = await fetchGoogleTranslateSingle(sub, lang);
    parts.push(part);
  }
  // Concatenate the raw MP3 data chunks — already valid MP3, no re-transcode needed
  return Buffer.concat(parts);
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

  const tryGemini = async (): Promise<{ audio: Buffer; engineUsed: string } | null> => {
    try {
      console.log(`[TTS] Menggunakan Gemini Flash TTS (${segVoice}) untuk: "${chunk.substring(0, 40)}..."`);
      const geminiAudio = await synthesizeGeminiTts(chunk, segVoice, isEnglish);
      if (geminiAudio && geminiAudio.length > 0) {
        return { audio: geminiAudio, engineUsed: "gemini" };
      }
    } catch (geminiErr: any) {
      console.warn(`[TTS] Gemini TTS gagal: ${geminiErr?.message || geminiErr}`);
    }
    return null;
  };

  const tryGoogle = async (): Promise<{ audio: Buffer; engineUsed: string } | null> => {
    try {
      console.log(`[TTS] Menggunakan Google Translate TTS...`);
      const googleAudio = await synthesizeGoogleTranslateTts(chunk, isEnglish);
      if (googleAudio && googleAudio.length > 0) {
        return { audio: googleAudio, engineUsed: "google" };
      }
    } catch (googleErr: any) {
      console.warn(`[TTS] Google Translate TTS gagal: ${googleErr?.message || googleErr}`);
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
  if (preferredEngine === "gemini") {
    attempts = [tryGemini, tryEdge, tryGoogle, trySapi];
  } else if (preferredEngine === "google") {
    attempts = [tryGoogle, tryEdge, tryGemini, trySapi];
  } else {
    // "edge" or "auto"
    attempts = [tryEdge, tryGemini, tryGoogle, trySapi];
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

  const segments = segmentByLanguage(text);
  const mpeg1Parts: Buffer[] = [];

  // Determine root language from voice ID prefix
  const rootIsEnglish = voiceId.startsWith("en-");
  let prevLang: "id" | "en" | null = null;
  let actualEngineUsed = preferredEngine;
  let fallbackReason: string | undefined;

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

    let segText = applySystemSpellingFallback(seg.text, isEnglish);
    if (!isEnglish) {
      segText = expandAbbreviations(segText);
    }

    const currentLang: "id" | "en" = isEnglish ? "en" : "id";
    if (prevLang && prevLang !== currentLang && !/^[\s,.;:!?-]/.test(segText)) {
      segText = ", " + segText;
    }
    prevLang = currentLang;

    const prosody = pickProsody(isEnglish, rootIsEnglish);

    // Untuk Gemini: Kirim seluruh teks segmen sekaligus (tanpa chunking).
    // PENTING: Gender (Aoede/Fenrir) SELALU diambil dari voiceId ASLI (pilihan gender user),
    //          BUKAN dari segVoice (yang bisa di-switch ke EN voice ID dan merusak deteksi gender).
    //          Gemini voice bersifat multilingual — tidak perlu switch suara per segmen bahasa.
    if (preferredEngine === "gemini") {
      const geminiVoiceName = getGeminiVoiceName(voiceId); // voiceId = root, bukan segVoice
      try {
        console.log(`[TTS] Gemini Flash TTS (${geminiVoiceName}) — "${segText.substring(0, 50)}..."`);
        const geminiMp3 = await synthesizeGeminiTts(segText, voiceId, isEnglish);
        if (geminiMp3 && geminiMp3.length > 0) {
          mpeg1Parts.push(geminiMp3); // Already MP3 — no re-transcode
          continue;
        }
      } catch (err: any) {
        console.warn(`[TTS] Gemini TTS gagal (${geminiVoiceName}): ${err?.message || err}. Beralih ke Edge TTS.`);
        actualEngineUsed = "edge";
        const errMsg = String(err?.message || err);
        if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) {
          fallbackReason = "Kuota harian Gemini API telah habis (limit 10 request/hari pada Free Tier). Suara otomatis dialihkan ke Edge TTS.";
        } else if (errMsg.includes("401") || errMsg.includes("UNAUTHENTICATED") || errMsg.includes("API key not valid")) {
          fallbackReason = "API Key Gemini tidak valid atau ditolak Google (HTTP 401). Silakan cek API Key di Pengaturan. Suara dialihkan ke Edge TTS.";
        } else if (errMsg.includes("timed out") || errMsg.includes("timeout")) {
          fallbackReason = "Koneksi ke Gemini API timeout. Suara otomatis dialihkan ke Edge TTS.";
        } else {
          fallbackReason = `Gemini TTS mengalami kendala (${errMsg.slice(0, 70)}). Suara dialihkan ke Edge TTS.`;
        }
      }
    }

    // Engine selain Gemini (Edge TTS & Google): potong per kalimat (max 250 char)
    // NOTE: synthesizeChunkWithCascade mengembalikan audio mentah (MP3).
    //       transcodeToMpeg1 normalizes any MP3 input → consistent MPEG1 Layer3 @ 44100Hz
    const textChunks = splitTextChunks(segText);
    const fallbackEngine = preferredEngine === "gemini" ? "edge" : preferredEngine;

    for (const chunk of textChunks) {
      const chunkResult = await synthesizeChunkWithCascade(chunk, segVoice, isEnglish, prosody, fallbackEngine);
      actualEngineUsed = chunkResult.engineUsed;
      const transcoded = transcodeToMpeg1(chunkResult.audio);
      mpeg1Parts.push(transcoded);
    }
  }

  const mpeg1 = Buffer.concat(mpeg1Parts);
  // Simpan cache dengan actualEngineUsed agar akurat
  if (actualEngineUsed === preferredEngine) {
    saveCachedAudio(text, voiceId, mpeg1, preferredEngine);
  } else {
    saveCachedAudio(text, voiceId, mpeg1, actualEngineUsed);
  }

  return { audio: mpeg1, engineUsed: actualEngineUsed, fallbackReason };
}


