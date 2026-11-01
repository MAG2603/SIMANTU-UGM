import type { Express } from "express";
import type { Server } from "http";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { synthesizeSpeech, synthesizeSupertonicTts, VOICE_PRESETS, getSupertonicUrl, getVoxcpm2Url, getSupertonicVoiceMale, getSupertonicVoiceFemale, setSupertonicVoices, getSupertonicSpeed, setSupertonicSpeed, clampSupertonicSpeed, resolveEnvWritePath, readEnvFileContent } from "./tts";
import { getServicesStatus, startService, stopService, startAllServices, stopAllServices } from "./servicesManager";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  function applyDefaultSpelling(text: string, lang: 'id' | 'en'): string {
    return text
      .replace(/\s*&\s*/g, lang === 'en' ? " and " : " dan ")
      .replace(/\bUGM\b/gi, lang === 'en' ? "U G M" : "Universitas Gadjah Mada")
      .replace(/\bL1\b/gi, lang === 'en' ? "Level One" : "Lantai Satu")
      .replace(/\bL2\b/gi, lang === 'en' ? "Level Two" : "Lantai Dua")
      .replace(/\bL3\b/gi, lang === 'en' ? "Level Three" : "Lantai Tiga")
      .replace(/\bL4\b/gi, lang === 'en' ? "Level Four" : "Lantai Empat")
      .replace(/\bL5\b/gi, lang === 'en' ? "Level Five" : "Lantai Lima")
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

  // --- Supertonic 3 & VoxCPM 2 Microservice Config & Health ---
  app.get("/api/tts/config", (_req, res) => {
    res.json({
      supertonicUrl: getSupertonicUrl(),
      supertonicVoiceMale: getSupertonicVoiceMale(),
      supertonicVoiceFemale: getSupertonicVoiceFemale(),
      supertonicSpeedId: getSupertonicSpeed(false),
      supertonicSpeedEn: getSupertonicSpeed(true),
      voxcpm2Url: getVoxcpm2Url(),
    });
  });

  app.post("/api/tts/config", async (req, res) => {
    const { supertonicUrl, supertonicVoiceMale, supertonicVoiceFemale, supertonicSpeedId, supertonicSpeedEn, voxcpm2Url } = req.body;
    try {
      const envPath = resolveEnvWritePath();
      let content = readEnvFileContent();

      const upsertEnv = (key: string, val: string) => {
        const re = new RegExp(`^${key}=.*$`, "m");
        if (re.test(content)) {
          content = content.replace(re, `${key}=${val}`);
        } else {
          content += `${content.endsWith("\n") || content === "" ? "" : "\n"}${key}=${val}\n`;
        }
      };

      if (supertonicSpeedId !== undefined && supertonicSpeedId !== null) {
        upsertEnv("SUPERTONIC_SPEED_ID", setSupertonicSpeed(false, supertonicSpeedId).toString());
      }
      if (supertonicSpeedEn !== undefined && supertonicSpeedEn !== null) {
        upsertEnv("SUPERTONIC_SPEED_EN", setSupertonicSpeed(true, supertonicSpeedEn).toString());
      }

      if (typeof supertonicUrl === "string") {
        const val = supertonicUrl.trim();
        process.env.SUPERTONIC_URL = val;
        if (content.includes("SUPERTONIC_URL=")) {
          content = content.replace(/SUPERTONIC_URL=.*/, `SUPERTONIC_URL=${val}`);
        } else {
          content += `\nSUPERTONIC_URL=${val}\n`;
        }
      }

      if (typeof supertonicVoiceMale === "string") {
        const val = supertonicVoiceMale.trim().toUpperCase();
        process.env.SUPERTONIC_VOICE_MALE = val;
        setSupertonicVoices(val, undefined);
        if (content.includes("SUPERTONIC_VOICE_MALE=")) {
          content = content.replace(/SUPERTONIC_VOICE_MALE=.*/, `SUPERTONIC_VOICE_MALE=${val}`);
        } else {
          content += `\nSUPERTONIC_VOICE_MALE=${val}\n`;
        }
      }

      if (typeof supertonicVoiceFemale === "string") {
        const val = supertonicVoiceFemale.trim().toUpperCase();
        process.env.SUPERTONIC_VOICE_FEMALE = val;
        setSupertonicVoices(undefined, val);
        if (content.includes("SUPERTONIC_VOICE_FEMALE=")) {
          content = content.replace(/SUPERTONIC_VOICE_FEMALE=.*/, `SUPERTONIC_VOICE_FEMALE=${val}`);
        } else {
          content += `\nSUPERTONIC_VOICE_FEMALE=${val}\n`;
        }
      }

      if (typeof voxcpm2Url === "string") {
        const val = voxcpm2Url.trim();
        process.env.VOXCPM_URL = val;
        if (content.includes("VOXCPM_URL=")) {
          content = content.replace(/VOXCPM_URL=.*/, `VOXCPM_URL=${val}`);
        } else {
          content += `\nVOXCPM_URL=${val}\n`;
        }
      }

      fs.writeFileSync(envPath, content);
      return res.json({
        success: true,
        supertonicUrl: getSupertonicUrl(),
        supertonicVoiceMale: getSupertonicVoiceMale(),
        supertonicVoiceFemale: getSupertonicVoiceFemale(),
        supertonicSpeedId: getSupertonicSpeed(false),
        supertonicSpeedEn: getSupertonicSpeed(true),
        voxcpm2Url: getVoxcpm2Url(),
      });
    } catch (e: any) {
      console.warn("[SIMANTU] Gagal menyimpan konfigurasi TTS ke .env:", e);
      return res.status(500).json({ message: "Gagal menyimpan konfigurasi" });
    }
  });

  app.post("/api/tts/supertonic-sample", async (req, res) => {
    const { voiceStyle, lang, speed } = req.body;
    const style = typeof voiceStyle === "string" ? voiceStyle.trim().toUpperCase() : "M1";
    const isEn = lang === "en";
    const sampleText = isEn
      ? "Attention, this is a sample of the Supertonic voice for the Universitas Gadjah Mada Library and Archives announcements."
      : "Perhatian, ini adalah contoh suara Supertonic untuk pengumuman Perpustakaan dan Arsip Universitas Gadjah Mada.";
    try {
      const speedOverride = speed !== undefined && speed !== null ? clampSupertonicSpeed(speed) : undefined;
      const audio = await synthesizeSupertonicTts(sampleText, style, isEn, style, speedOverride, "wav");
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Length", audio.length.toString());
      res.end(audio);
    } catch (err: any) {
      console.error("[TTS] Supertonic sample failed:", err);
      res.status(500).json({ message: "Gagal memutar sampel suara" });
    }
  });

  app.post("/api/tts/test-connection", async (req, res) => {
    const { url, engine } = req.body;
    const isVoxcpm = engine === "voxcpm2";
    const defaultUrl = isVoxcpm ? getVoxcpm2Url() : getSupertonicUrl();
    const targetUrl = typeof url === "string" && url.trim() ? url.trim().replace(/\/+$/, "") : defaultUrl;
    const engineName = isVoxcpm ? "VoxCPM 2" : "Supertonic 3";

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      let isOnline = false;
      let serviceTitle = engineName;

      for (const checkPath of ["/health", "/v1/models", ""]) {
        try {
          const resp = await fetch(`${targetUrl}${checkPath}`, { signal: controller.signal });
          if (resp.ok || resp.status === 404 || resp.status === 405) {
            isOnline = true;
            try {
              const info: any = await resp.json();
              if (info?.service) serviceTitle = info.service;
            } catch {}
            break;
          }
        } catch {}
      }
      clearTimeout(timer);

      if (isOnline) {
        return res.json({
          online: true,
          message: `Berhasil terhubung ke ${serviceTitle} (${targetUrl})`,
          url: targetUrl,
        });
      } else {
        return res.json({
          online: false,
          message: `Tidak dapat terhubung ke ${targetUrl}. Pastikan server microservice sudah aktif.`,
          url: targetUrl,
        });
      }
    } catch (e: any) {
      return res.json({
        online: false,
        message: `Koneksi gagal: ${e?.message || e}`,
        url: targetUrl,
      });
    }
  });

  // TTS background services status and controls
  app.get("/api/tts/services/status", (_req, res) => {
    res.json(getServicesStatus());
  });

  app.post("/api/tts/services/start", async (req, res) => {
    const service = req.body?.service;
    if (service === "supertonic" || service === "voxcpm2") {
      const ok = await startService(service);
      return res.json({ success: ok, status: getServicesStatus() });
    }
    await startAllServices();
    return res.json({ success: true, status: getServicesStatus() });
  });

  app.post("/api/tts/services/stop", async (req, res) => {
    const service = req.body?.service;
    if (service === "supertonic" || service === "voxcpm2") {
      await stopService(service);
      return res.json({ success: true, status: getServicesStatus() });
    }
    await stopAllServices();
    return res.json({ success: true, status: getServicesStatus() });
  });

  // --- Translation Engine Config & DeepL Integration ---
  function getDeeplApiKey(): string {
    if (process.env.DEEPL_API_KEY && process.env.DEEPL_API_KEY.trim()) {
      return process.env.DEEPL_API_KEY.trim();
    }
    try {
      const content = readEnvFileContent();
      const match = content.match(/DEEPL_API_KEY\s*=\s*([^\r\n]+)/);
      if (match && match[1]) return match[1].trim();
    } catch {}
    return "";
  }

  function getTranslateEngine(): "google" | "deepl" {
    let raw = process.env.TRANSLATE_ENGINE || "";
    if (!raw.trim()) {
      try {
        const content = readEnvFileContent();
        const match = content.match(/TRANSLATE_ENGINE\s*=\s*([^\r\n]+)/);
        if (match && match[1]) raw = match[1].trim();
      } catch {}
    }
    const val = (raw || "google").toLowerCase();
    return val === "deepl" ? "deepl" : "google";
  }

  async function translateWithDeepL(
    text: string,
    from: string,
    to: string,
    apiKey: string
  ): Promise<string> {
    const isFreeKey = apiKey.endsWith(":fx");
    const baseUrl = process.env.DEEPL_API_URL || (isFreeKey ? "https://api-free.deepl.com/v2" : "https://api.deepl.com/v2");
    let targetLang = to.toUpperCase();
    if (targetLang === "EN") targetLang = "EN-US";
    const sourceLang = from.toUpperCase();

    const response = await fetch(`${baseUrl}/translate`, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: [text],
        source_lang: sourceLang,
        target_lang: targetLang,
        preserve_formatting: true,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepL API error (${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    const translated = data?.translations?.[0]?.text;
    if (typeof translated !== "string") {
      throw new Error("Invalid response from DeepL");
    }
    return translated;
  }

  async function checkDeeplUsage(apiKey: string): Promise<{ valid: boolean; message: string; characterCount?: number; characterLimit?: number }> {
    if (!apiKey) {
      return { valid: false, message: "DeepL API Key belum diisi" };
    }
    const isFreeKey = apiKey.endsWith(":fx");
    const baseUrl = process.env.DEEPL_API_URL || (isFreeKey ? "https://api-free.deepl.com/v2" : "https://api.deepl.com/v2");
    try {
      const res = await fetch(`${baseUrl}/usage`, {
        method: "GET",
        headers: {
          "Authorization": `DeepL-Auth-Key ${apiKey}`,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        if (res.status === 403) {
          return { valid: false, message: "DeepL API Key tidak valid (403 Forbidden)" };
        }
        return { valid: false, message: `DeepL error (HTTP ${res.status})` };
      }

      const data: any = await res.json();
      const count = data.character_count ?? 0;
      const limit = data.character_limit ?? 0;
      return {
        valid: true,
        characterCount: count,
        characterLimit: limit,
        message: `Koneksi DeepL ${isFreeKey ? "Free" : "Pro"} Berhasil! Kuota: ${count.toLocaleString()} / ${limit.toLocaleString()} karakter terpakai.`,
      };
    } catch (err: any) {
      return { valid: false, message: `Gagal menghubungi DeepL API: ${err?.message || err}` };
    }
  }

  app.get("/api/translate/config", (_req, res) => {
    res.json({
      engine: getTranslateEngine(),
    });
  });

  app.post("/api/translate/config", async (req, res) => {
    const { engine } = req.body;
    try {
      const envPath = resolveEnvWritePath();
      let content = readEnvFileContent();

      if (typeof engine === "string") {
        const val = engine === "deepl" ? "deepl" : "google";
        process.env.TRANSLATE_ENGINE = val;
        if (content.includes("TRANSLATE_ENGINE=")) {
          content = content.replace(/TRANSLATE_ENGINE=.*/, `TRANSLATE_ENGINE=${val}`);
        } else {
          content += `\nTRANSLATE_ENGINE=${val}\n`;
        }
      }

      fs.writeFileSync(envPath, content);
      return res.json({
        success: true,
        engine: getTranslateEngine(),
      });
    } catch (e: any) {
      console.warn("[SIMANTU] Gagal menyimpan konfigurasi Translate ke .env:", e);
      return res.status(500).json({ message: "Gagal menyimpan konfigurasi translate" });
    }
  });

  app.post("/api/translate/test-deepl", async (_req, res) => {
    // Key selalu dibaca dari .env — tidak diterima dari client
    const key = getDeeplApiKey();
    const result = await checkDeeplUsage(key);
    res.json(result);
  });

  // Backward compatibility stubs
  app.post("/api/tts/gemini-key", (_req, res) => res.json({ success: true }));
  app.post("/api/tts/test-gemini-key", (_req, res) => res.json({ valid: true, message: "OK" }));

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

      // Step 1: Normalize newlines and extract/protect important phrases
      let textToProcess = input.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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
      const requestedEngine = (input.engine || getTranslateEngine()).toLowerCase();
      const deeplKey = getDeeplApiKey();
      let usedEngine = "google";

      const paragraphs = textToProcess.split("\n");
      const translatedParagraphs: string[] = [];

      // If DeepL engine requested and API key is provided, try DeepL first!
      if (requestedEngine === "deepl" && deeplKey) {
        try {
          for (const p of paragraphs) {
            if (!p.trim()) {
              translatedParagraphs.push("");
              continue;
            }
            const translated = await translateWithDeepL(p, input.from, input.to, deeplKey);
            translatedParagraphs.push(translated);
          }
          usedEngine = "deepl";
        } catch (deeplErr: any) {
          console.warn("[SIMANTU] DeepL translation failed, falling back to Google Translate:", deeplErr?.message || deeplErr);
          translatedParagraphs.length = 0;
        }
      }

      // If Google Translate is chosen or DeepL failed / not configured:
      if (translatedParagraphs.length === 0) {
        const { translate: gTranslate } = await import("google-translate-api-x");
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
        usedEngine = "google";
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

        // Clean up any double AM/PM or mixed lowercase p.m./a.m. artifacts
        translatedText = translatedText
          .replace(/(AM|PM)\s*(p\.m\.|a\.m\.|pm|am)/gi, "$1")
          .replace(/(p\.m\.|a\.m\.|pm|am)\s*(AM|PM)/gi, "$2")
          .replace(/(AM|PM)\s+(AM|PM)/gi, "$1");
      }



      // Step 7: Post-process to fix common word-by-word translation artifacts
      // Note: process line by line to preserve newlines/formatting from original text
      translatedText = translatedText
        .split("\n")
        .map((line: string) => {
          return line
            // Fix spacing issues (remove space before punctuation)
            .replace(/\s+([,.!?;:])/g, "$1")
            // Fix spacing after punctuation (add one space after comma, period, etc.)
            .replace(/([,.!?;])\s*/g, "$1 ")
            // Ensure no spaces around colons when between digits (for times)
            .replace(/(\d)\s*:\s*(\d)/g, "$1:$2")
            // Collapse multiple horizontal spaces only (not newlines)
            .replace(/[^\S\n]+/g, " ")
            .trim();
        })
        .join("\n");

      res.json({ translatedText, engine: usedEngine });
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
