import type { Express } from "express";
import type { Server } from "http";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { synthesizeSpeech, VOICE_PRESETS } from "./tts";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  function applyDefaultSpelling(text: string, lang: 'id' | 'en'): string {
    return text
      .replace(/\s*&\s*/g, lang === 'en' ? " and " : " dan ")
      .replace(/\bUGM\b/gi, "U G M")
      .replace(/\bL1\b/gi, lang === 'en' ? "L One" : "L Satu")
      .replace(/\bL5\b/gi, lang === 'en' ? "L Five" : "L Lima")
      .replace(/\bETD\b/gi, "E T D")
      .replace(/\bWIB\b/gi, lang === 'en' ? "W I B" : "Waktu Indonesia Barat");
  }

  function triggerAnnouncementPreCache(ann: { contentId: string; contentEn?: string; voice?: string }) {
    setImmediate(async () => {
      try {
        const voicePair = ann.voice || "Pria/Pria";
        const [vId, vEn] = voicePair.split("/");
        const idVoiceKey = vId === "Wanita" ? "fr-FR-VivienneMultilingualNeural" : "id-ID-ArdiNeural";
        const enVoiceKey = vEn === "Wanita" ? "en-US-AvaMultilingualNeural" : "en-US-AndrewMultilingualNeural";

        if (ann.contentId && ann.contentId.trim()) {
          const textId = applyDefaultSpelling(ann.contentId.trim(), 'id');
          await synthesizeSpeech(textId, idVoiceKey);
        }
        if (ann.contentEn && ann.contentEn.trim()) {
          const textEn = applyDefaultSpelling(ann.contentEn.trim(), 'en');
          await synthesizeSpeech(textEn, enVoiceKey);
        }
      } catch (e) {
        console.warn("[TTS Cache] Background pre-cache notice:", e instanceof Error ? e.message : e);
      }
    });
  }

  // Warm-up local MP3 cache for existing saved announcements on startup sequentially
  setTimeout(async () => {
    try {
      const list = await storage.getAnnouncements();
      for (const ann of list) {
        triggerAnnouncementPreCache(ann);
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch {
      // ignore
    }
  }, 4000);

  // --- Announcements ---
  app.get(api.announcements.list.path, async (req, res) => {
    const items = await storage.getAnnouncements();
    res.json(items);
  });

  app.post(api.announcements.create.path, async (req, res) => {
    try {
      const input = api.announcements.create.input.parse(req.body);
      const item = await storage.createAnnouncement(input);
      triggerAnnouncementPreCache(item);
      res.status(201).json(item);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.announcements.update.path, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      const input = api.announcements.update.input.parse(req.body);
      const existing = await storage.getAnnouncement(id);
      if (!existing) {
        return res.status(404).json({ message: "Announcement not found" });
      }
      const updated = await storage.updateAnnouncement(id, input);
      triggerAnnouncementPreCache(updated);
      res.json(updated);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.announcements.delete.path, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }
    const existing = await storage.getAnnouncement(id);
    if (!existing) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    await storage.deleteAnnouncement(id);
    res.status(204).end();
  });

  // --- Schedules ---
  app.get(api.schedules.list.path, async (req, res) => {
    const items = await storage.getSchedules();
    res.json(items);
  });

  app.post(api.schedules.create.path, async (req, res) => {
    try {
      const input = api.schedules.create.input.parse(req.body);
      const item = await storage.createSchedule(input);
      res.status(201).json(item);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.schedules.update.path, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      const input = api.schedules.update.input.parse(req.body);
      if (req.body && typeof req.body.lastPlayedAt === 'string') {
        input.lastPlayedAt = req.body.lastPlayedAt;
      }
      const existing = await storage.getSchedule(id);
      if (!existing) {
        return res.status(404).json({ message: "Schedule not found" });
      }
      const updated = await storage.updateSchedule(id, input);
      res.json(updated);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.post(api.schedules.claim.path, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const existing = await storage.getSchedule(id);
    if (!existing) {
      return res.status(404).json({ message: "Schedule not found" });
    }

    const claimed = await storage.claimScheduleIfWaiting(id);
    if (!claimed) {
      return res.status(409).json({ message: "Schedule already claimed or not waiting" });
    }

    res.json(claimed);
  });

  // --- CRITICAL: Missed Schedule Recovery ---
  // Returns schedules that passed their time while the app was offline
  // Used by Electron to immediately play them on app startup
  app.get(api.schedules.missed.path, async (req, res) => {
    const missedSchedules = await storage.getMissedSchedules();
    res.json(missedSchedules);
  });

  app.delete(api.schedules.delete.path, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }
    const existing = await storage.getSchedule(id);
    if (!existing) {
      return res.status(404).json({ message: "Schedule not found" });
    }
    await storage.deleteSchedule(id);
    res.status(204).end();
  });

  // --- TTS (Edge Text-to-Speech) ---
  // Returns MPEG1 L3 binary directly — transcoded from MPEG2 L3 to be compatible
  // with Electron/Chromium's FFmpeg build (which only supports MPEG1 L3).
  app.post(api.tts.synthesize.path, async (req, res) => {
    const { text, voice, engine } = req.body;
    if (!text || typeof text !== "string" || !voice || typeof voice !== "string") {
      return res.status(400).json({ message: "text and voice are required" });
    }
    try {
      const result = await synthesizeSpeech(text, voice, engine);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", result.audio.length.toString());
      res.setHeader("X-TTS-Engine-Used", result.engineUsed);
      if (result.fallbackReason) {
        res.setHeader("X-TTS-Fallback-Reason", encodeURIComponent(result.fallbackReason));
      }
      res.end(result.audio);
    } catch (err: any) {
      console.error("TTS Error:", err);
      const detail = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message: `TTS synthesis failed: ${detail}` });
    }
  });

  app.get(api.tts.voices.path, (_req, res) => {
    res.json({
      presets: Object.entries(VOICE_PRESETS).map(([name, voices]) => ({
        name,
        idVoice: voices.id,
        enVoice: voices.en,
      })),
    });
  });

  app.post("/api/tts/gemini-key", async (req, res) => {
    const { key } = req.body;
    if (typeof key === "string") {
      const trimmed = key.trim();
      process.env.GEMINI_API_KEY = trimmed;
      try {
        const envPath = path.resolve(process.cwd(), ".env");
        let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
        if (content.includes("GEMINI_API_KEY=")) {
          content = content.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${trimmed}`);
        } else {
          content += `\nGEMINI_API_KEY=${trimmed}\n`;
        }
        fs.writeFileSync(envPath, content);
      } catch (e) {
        console.warn("[SIMANTU] Gagal menyimpan GEMINI_API_KEY ke .env:", e);
      }
      return res.json({ success: true });
    }
    res.status(400).json({ message: "Key tidak valid" });
  });

  app.post("/api/tts/test-gemini-key", async (req, res) => {
    const { key } = req.body;
    const apiKey = (typeof key === "string" && key.trim()) ? key.trim() : (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(400).json({ valid: false, message: "API Key belum diisi." });
    }
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(url);
      if (resp.status === 200) {
        return res.json({ valid: true, message: "API Key valid dan berhasil terhubung ke Google AI!" });
      }
      const data: any = await resp.json().catch(() => ({}));
      const reason = data?.error?.details?.[0]?.reason || "";
      const errMsg = data?.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 401) {
        return res.status(400).json({
          valid: false,
          message: `API Key ditolak Google (HTTP 401: ${reason || "UNAUTHENTICATED"}). Ini terjadi jika project GCP belum mengaktifkan 'Generative Language API' atau menggunakan email institusi/kampus. Silakan buat API Key baru dengan opsi 'Create API key in new project' di aistudio.google.com (gunakan akun @gmail.com pribadi).`
        });
      }
      if (resp.status === 429) {
        return res.status(429).json({
          valid: false,
          message: "Batas kuota request Google API terlampaui (HTTP 429). Tunggu beberapa saat."
        });
      }
      return res.status(400).json({ valid: false, message: `Google API Error (${resp.status}): ${errMsg}` });
    } catch (e: any) {
      return res.status(500).json({ valid: false, message: `Gagal menghubungi server Google: ${e?.message || e}` });
    }
  });

  app.get("/api/tts/config", (_req, res) => {
    let raw = process.env.GEMINI_API_KEY || "";
    if (!raw.trim()) {
      try {
        const envPath = path.resolve(process.cwd(), ".env");
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, "utf-8");
          const match = content.match(/GEMINI_API_KEY\s*=\s*([^\r\n]+)/);
          if (match && match[1]) {
            raw = match[1].trim();
            process.env.GEMINI_API_KEY = raw;
          }
        }
      } catch {}
    }
    res.json({
      hasGeminiKey: Boolean(raw && raw.trim()),
      maskedGeminiKey: raw.trim() ? `${raw.trim().slice(0, 6)}...${raw.trim().slice(-4)}` : "",
    });
  });

  // --- Translate (Google Translate — free, no API key) ---
  // Improved with sentence-level translation and NLP-based phrase detection
  // to prevent word-by-word translation issues

  // Protected terms: proper nouns that should NOT be translated by Google Translate.
  // Add more terms here as needed. Longer phrases should come first to avoid partial matches.
  const PROTECTED_TERMS = [
    "Universitas Gadjah Mada Library and Archives",
    "Universitas Gadjah Mada",
    "Gadjah Mada",
    "UGM",
  ];





  // Utility function: Restore placeholders in translated text
  function restorePlaceholders(text: string, replacements: Map<string, string>): string {
    let result = text;
    for (const [placeholder, original] of replacements) {
      // Google Translate sometimes adds spaces around placeholders
      const flexibleRegex = new RegExp(
        placeholder.replace(/__/g, '(?:__|_ _)'),
        'gi'
      );
      result = result.replace(flexibleRegex, original);
    }
    return result;
  }

  app.post(api.translate.post.path, async (req, res) => {
    try {
      const input = api.translate.post.input.parse(req.body);
      if (!input.text.trim()) {
        return res.json({ translatedText: "" });
      }

      // Step 1: Extract and protect important phrases before translation
      let textToProcess = input.text;
      const allReplacements = new Map<string, string>();

      // Protect proper nouns first
      for (const term of PROTECTED_TERMS) {
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        textToProcess = textToProcess.replace(regex, (match) => {
          const placeholder = `__PROPER${allReplacements.size}__`;
          allReplacements.set(placeholder, match);
          return placeholder;
        });
      }

      // Protect language tags [en: ...] and [id: ...]
      const tagRegex = /\[\s*(en|id)\s*:\s*([^\]\}]+?)\s*[\]\}]/gi;
      textToProcess = textToProcess.replace(tagRegex, (match) => {
        const placeholder = `__TAG${allReplacements.size}__`;
        allReplacements.set(placeholder, match);
        return placeholder;
      });



      // Step 2: Translate while preserving paragraph structure (newlines)
      const { translate: gTranslate } = await import("google-translate-api-x");
      const paragraphs = textToProcess.split("\n");
      const translatedParagraphs: string[] = [];

      for (const p of paragraphs) {
        if (!p.trim()) {
          translatedParagraphs.push("");
          continue;
        }
        try {
          const result = await gTranslate(p, { from: input.from, to: input.to });
          let translated = Array.isArray(result)
            ? result.map((r: any) => r.text).join("")
            : result.text;
          
          translatedParagraphs.push(translated);
        } catch (err) {
          console.warn(`[SIMANTU] Translation failed for paragraph. Using fallback.`);
          translatedParagraphs.push(p);
        }
      }
      let translatedText = translatedParagraphs.join("\n");


      // Step 5: Restore all protected phrases and proper nouns
      translatedText = restorePlaceholders(translatedText, allReplacements);
      // Step 6: Convert 24-hour time (e.g. 18:00 WIB) to 12-hour (6:00 PM) for English
      if (input.to === "en") {
        translatedText = translatedText.replace(
          /(\d{1,2})[:.](\d{2})(\s*)(WIB|WITA|WIT|West Indonesia Time|Western Indonesian Time)?/gi,
          (match, hourStr, minStr, _spacing, timezone) => {
            const hour = parseInt(hourStr, 10);
            if (hour < 0 || hour > 23) return match;

            const period = hour >= 12 ? "PM" : "AM";
            const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

            // If the time was found with a timezone, we replace the timezone with AM/PM.
            // If it's just a raw 24h time, we convert it to 12h + AM/PM.
            return `${h12}:${minStr} ${period}`;
          }
        );

        // Clean up any double AM/PM if Google already added one
        translatedText = translatedText.replace(/(AM|PM)\s+(AM|PM)/gi, "$1");
      }



      // Step 7: Post-process to fix common word-by-word translation artifacts
      translatedText = translatedText
        // Fix spacing issues (remove space before punctuation)
        .replace(/\s+([,.!?;:])/g, "$1")
        // Fix spacing after punctuation (add one space after comma, period, etc.)
        .replace(/([,.!?;])\s*/g, "$1 ")
        // Ensure no spaces around colons when between digits (for times)
        .replace(/(\d)\s*:\s*(\d)/g, "$1:$2")
        .replace(/\s+/g, " ")
        .trim();

      res.json({ translatedText });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error("Translate Error:", err);
      res.status(500).json({ message: "Translation failed. Check internet connection." });
    }
  });

  // --- Status ---
  app.get(api.status.get.path, (req, res) => {
    res.json({ connected: true });
  });

  return httpServer;
}
