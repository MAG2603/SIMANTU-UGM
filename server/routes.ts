import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { synthesizeSpeech, VOICE_PRESETS } from "./tts";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // --- Announcements ---
  app.get(api.announcements.list.path, async (req, res) => {
    const items = await storage.getAnnouncements();
    res.json(items);
  });

  app.post(api.announcements.create.path, async (req, res) => {
    try {
      const input = api.announcements.create.input.parse(req.body);
      const item = await storage.createAnnouncement(input);
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
    const { text, voice } = req.body;
    if (!text || typeof text !== "string" || !voice || typeof voice !== "string") {
      return res.status(400).json({ message: "text and voice are required" });
    }
    try {
      const audio = await synthesizeSpeech(text, voice);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audio.length.toString());
      res.end(audio);
    } catch (err) {
      console.error("TTS Error:", err);
      res.status(500).json({ message: "TTS synthesis failed. Check internet connection." });
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

  // --- Status ---
  app.get(api.status.get.path, (req, res) => {
    res.json({ connected: true });
  });

  return httpServer;
}
