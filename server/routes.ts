import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

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
    } catch (err) {
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
    } catch (err) {
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
      // Coerce playTime string to Date if needed
      const rawInput = req.body;
      if (typeof rawInput.playTime === 'string') {
        rawInput.playTime = new Date(rawInput.playTime);
      }
      const input = api.schedules.create.input.parse(rawInput);
      const item = await storage.createSchedule(input);
      res.status(201).json(item);
    } catch (err) {
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
      const rawInput = req.body;
      if (typeof rawInput.playTime === 'string') {
        rawInput.playTime = new Date(rawInput.playTime);
      }
      const input = api.schedules.update.input.parse(rawInput);
      const existing = await storage.getSchedule(id);
      if (!existing) {
        return res.status(404).json({ message: "Schedule not found" });
      }
      const updated = await storage.updateSchedule(id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
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

  // --- Status ---
  app.get(api.status.get.path, (req, res) => {
    res.json({ connected: true });
  });

  return httpServer;
}
