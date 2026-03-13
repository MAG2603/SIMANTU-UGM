import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { spawnSync } from "child_process";
import { createRequire } from "module";

// Use createRequire to load CJS module reliably (avoids ESM default-export interop issues)
const _require = createRequire(import.meta.url);
const ffmpegBin: string = _require("ffmpeg-static");

export const VOICE_PRESETS: Record<string, { id: string; en: string }> = {
  "Gadis & Jenny - Friendly": { id: "id-ID-GadisNeural", en: "en-US-JennyNeural" },
  "Ardi & Guy - Formal": { id: "id-ID-ArdiNeural", en: "en-US-GuyNeural" },
  "Gadis & Aria - Professional": { id: "id-ID-GadisNeural", en: "en-US-AriaNeural" },
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
  "id-ID-ArdiNeural":  "en-US-AndrewMultilingualNeural",
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
  "en-US-AvaMultilingualNeural":    "id-ID-GadisNeural",
  "en-US-GuyNeural":                "id-ID-ArdiNeural",
  "en-US-JennyNeural":              "id-ID-GadisNeural",
  "en-US-AriaNeural":               "id-ID-GadisNeural",
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

async function streamToBuffer(
  text: string,
  voiceId: string,
  isEnglish = false,
  prosody = SPEECH_PROSODY_ID,
): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const processed = escapeXml(replaceAmpersand(text, isEnglish));
  const { audioStream } = tts.toStream(processed, prosody);
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    audioStream.on("end", () => {
      const buf = Buffer.concat(chunks);
      if (buf.length === 0) reject(new Error("msedge-tts returned empty stream for: " + text.substring(0, 50)));
      else resolve(buf);
    });
    audioStream.on("error", reject);
  });
}

// Retry once after 800ms for transient Edge TTS failures (connection hiccups, empty streams).
async function streamToBufferWithRetry(
  text: string,
  voiceId: string,
  isEnglish = false,
  prosody = SPEECH_PROSODY_ID,
): Promise<Buffer> {
  try {
    return await streamToBuffer(text, voiceId, isEnglish, prosody);
  } catch (firstErr) {
    await new Promise(r => setTimeout(r, 800));
    try {
      return await streamToBuffer(text, voiceId, isEnglish, prosody);
    } catch {
      throw firstErr; // throw original error for better diagnostics
    }
  }
}

export async function synthesizeSpeech(text: string, voiceId: string): Promise<Buffer> {
  const segments = segmentByLanguage(text);
  const mpeg2Parts: Buffer[] = [];

  // Determine root language from voice ID prefix
  const rootIsEnglish = voiceId.startsWith("en-");
  let prevLang: "id" | "en" | null = null;

  for (const seg of segments) {
    // Resolve effective language: explicit tag wins, 'root' inherits from voice
    const isEnglish = seg.lang === 'en' || (seg.lang === 'root' && rootIsEnglish);

    // Switch voice only when an explicit opposite-language tag is found:
    //   [en: ...] inside ID voice  → English voice
    //   [id: ...] inside EN voice  → Indonesian voice
    //   'root' segments            → keep current voice
    let segVoice: string;
    if (seg.lang === 'en' && !rootIsEnglish) {
      segVoice = isMultilingualVoice(voiceId) ? voiceId : getEnglishVoice(voiceId);
    } else if (seg.lang === 'id' && rootIsEnglish) {
      segVoice = isMultilingualVoice(voiceId) ? voiceId : getIndonesianVoice(voiceId);
    } else {
      segVoice = voiceId;
    }

    // Apply system fallback spelling first, then acronym expansion for Indonesian segments.
    let segText = applySystemSpellingFallback(seg.text, isEnglish);
    if (!isEnglish) {
      segText = expandAbbreviations(segText);
    }

    // Add a tiny pause when language switches to make cross-language transition smoother.
    const currentLang: "id" | "en" = isEnglish ? "en" : "id";
    if (prevLang && prevLang !== currentLang && !/^[\s,.;:!?-]/.test(segText)) {
      segText = ", " + segText;
    }
    prevLang = currentLang;

    const prosody = pickProsody(isEnglish, rootIsEnglish);

    const textChunks = splitTextChunks(segText);
    for (const chunk of textChunks) {
      const part = await streamToBufferWithRetry(chunk, segVoice, isEnglish, prosody);
      mpeg2Parts.push(part);
    }
  }
  // MPEG audio is frame-based, raw frame concatenation is valid
  const mpeg2 = Buffer.concat(mpeg2Parts);
  return transcodeToMpeg1(mpeg2);
}
