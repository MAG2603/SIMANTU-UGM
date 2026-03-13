import {
  type Announcement,
  type InsertAnnouncement,
  type UpdateAnnouncementRequest,
  type Schedule,
  type InsertSchedule,
  type UpdateScheduleRequest,
} from "@shared/schema";
import fs from "fs";
import path from "path";

interface StorageData {
  announcements: Announcement[];
  schedules: Schedule[];
  nextAnnouncementId: number;
  nextScheduleId: number;
}

function getDataDir(): string {
  return process.env.SIMANTU_DATA_DIR || path.resolve(process.cwd(), "data");
}

function getDataPath(): string {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "simantu-data.json");
}

function loadData(): StorageData {
  const filePath = getDataPath();
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  }
  return { announcements: [], schedules: [], nextAnnouncementId: 1, nextScheduleId: 1 };
}

function saveData(data: StorageData): void {
  const filePath = getDataPath();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export interface IStorage {
  getAnnouncements(): Promise<Announcement[]>;
  getAnnouncement(id: number): Promise<Announcement | undefined>;
  createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement>;
  updateAnnouncement(id: number, updates: UpdateAnnouncementRequest): Promise<Announcement>;
  deleteAnnouncement(id: number): Promise<void>;
  getSchedules(): Promise<Schedule[]>;
  getSchedule(id: number): Promise<Schedule | undefined>;
  createSchedule(schedule: InsertSchedule): Promise<Schedule>;
  claimScheduleIfWaiting(id: number): Promise<Schedule | null>;
  updateSchedule(id: number, updates: UpdateScheduleRequest): Promise<Schedule>;
  deleteSchedule(id: number): Promise<void>;
}

export class JsonFileStorage implements IStorage {
  async getAnnouncements(): Promise<Announcement[]> {
    const data = loadData();
    return data.announcements.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getAnnouncement(id: number): Promise<Announcement | undefined> {
    const data = loadData();
    return data.announcements.find((a) => a.id === id);
  }

  async createAnnouncement(input: InsertAnnouncement): Promise<Announcement> {
    const data = loadData();
    const announcement: Announcement = {
      id: data.nextAnnouncementId++,
      title: input.title,
      contentId: input.contentId,
      contentEn: input.contentEn,
      voice: input.voice,
      isFavorite: input.isFavorite ?? false,
      createdAt: new Date().toISOString(),
    };
    data.announcements.push(announcement);
    saveData(data);
    return announcement;
  }

  async updateAnnouncement(id: number, updates: UpdateAnnouncementRequest): Promise<Announcement> {
    const data = loadData();
    const idx = data.announcements.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error("Announcement not found");
    data.announcements[idx] = { ...data.announcements[idx], ...updates };
    saveData(data);
    return data.announcements[idx];
  }

  async deleteAnnouncement(id: number): Promise<void> {
    const data = loadData();
    data.announcements = data.announcements.filter((a) => a.id !== id);
    saveData(data);
  }

  async getSchedules(): Promise<Schedule[]> {
    const data = loadData();
    // Auto-cleanup: remove non-recurring "Done" schedules older than 24 hours
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const before = data.schedules.length;
    data.schedules = data.schedules.filter((s) => {
      if (s.status === "Done" && !s.recurring) {
        const playTime = new Date(s.playTime).getTime();
        return (now - playTime) < TWENTY_FOUR_HOURS;
      }
      return true;
    });
    if (data.schedules.length < before) {
      saveData(data);
    }
    return data.schedules.sort(
      (a, b) => new Date(a.playTime).getTime() - new Date(b.playTime).getTime()
    );
  }

  async getSchedule(id: number): Promise<Schedule | undefined> {
    const data = loadData();
    return data.schedules.find((s) => s.id === id);
  }

  async createSchedule(input: InsertSchedule): Promise<Schedule> {
    const data = loadData();
    const playTime = String(input.playTime);
    const schedule: Schedule = {
      id: data.nextScheduleId++,
      announcementId: input.announcementId,
      playTime,
      status: input.status ?? "Waiting",
      recurring: input.recurring ?? false,
    };
    data.schedules.push(schedule);
    saveData(data);
    return schedule;
  }

  async claimScheduleIfWaiting(id: number): Promise<Schedule | null> {
    const data = loadData();
    const idx = data.schedules.findIndex((s) => s.id === id);
    if (idx === -1) return null;

    const current = data.schedules[idx];
    if (current.status !== "Waiting") return null;

    data.schedules[idx] = { ...current, status: "Playing" };
    saveData(data);
    return data.schedules[idx];
  }

  async updateSchedule(id: number, updates: UpdateScheduleRequest): Promise<Schedule> {
    const data = loadData();
    const idx = data.schedules.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error("Schedule not found");
    if (updates.playTime) {
      updates = { ...updates, playTime: String(updates.playTime) };
    }
    data.schedules[idx] = { ...data.schedules[idx], ...updates };
    saveData(data);
    return data.schedules[idx];
  }

  async deleteSchedule(id: number): Promise<void> {
    const data = loadData();
    data.schedules = data.schedules.filter((s) => s.id !== id);
    saveData(data);
  }
}

export const storage = new JsonFileStorage();