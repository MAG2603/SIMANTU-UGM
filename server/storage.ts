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

/**
 * Check if a schedule should run on the given day (0=Sunday, 1=Monday...6=Saturday)
 * If daysOfWeek is empty, it runs daily. Otherwise, only on specified days.
 */
function shouldScheduleRunOnDay(schedule: Schedule, dayOfWeek: number): boolean {
  const daysOfWeek = schedule.daysOfWeek ?? [];
  if (daysOfWeek.length === 0) return true; // Empty = daily
  return daysOfWeek.includes(dayOfWeek);
}

/**
 * Calculate next playTime for a recurring schedule
 * Used to reschedule after a schedule is played and for missed schedule recovery
 */
function getNextPlayTime(schedule: Schedule, fromDate: Date = new Date()): Date | null {
  if (!schedule.recurring) return null;

  try {
    const daysOfWeek = schedule.daysOfWeek ?? [];
    const timePart = schedule.playTime.split('T')[1];
    if (!timePart) return null; // Invalid format
    
    const [hoursStr, minutesStr] = timePart.split(':');
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);
    
    if (isNaN(hours) || isNaN(minutes)) return null; // Invalid hours/minutes

  // If no specific days set, daily recurring
  if (daysOfWeek.length === 0) {
    const next = new Date(fromDate);
    next.setDate(next.getDate() + 1);
    next.setHours(hours, minutes, 0, 0);
    return next;
  }

  // Find next day that matches daysOfWeek
  let nextDate = new Date(fromDate);
  for (let i = 0; i < 7; i++) {
    nextDate.setDate(nextDate.getDate() + 1);
    const dayOfWeek = nextDate.getDay();
    if (daysOfWeek.includes(dayOfWeek)) {
      nextDate.setHours(hours, minutes, 0, 0);
      return nextDate;
    }
  }
  return null;
  } catch (err) {
    console.error('[SIMANTU] Error calculating next play time:', err, schedule);
    return null;
  }
}

/**
 * CRITICAL: Detect and register missed schedules that should have run while app was offline
 * This prevents announcements from being lost when the app is not running
 */
function processMissedSchedules(data: StorageData): void {
  const now = new Date();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  data.schedules.forEach((schedule, idx) => {
    const playTime = new Date(schedule.playTime);
    const timePassed = now.getTime() - playTime.getTime();

    // Check if schedule should have run
    // IMPORTANT: Check the DAY OF THE PLAYTIME, not today
    const scheduleDay = playTime.getDay();
    const shouldRun =
      schedule.status === "Waiting" && // Not yet executed
      timePassed > 0 && // Time has passed
      timePassed < TWENTY_FOUR_HOURS && // Within 24 hours (avoid old schedules)
      shouldScheduleRunOnDay(schedule, scheduleDay); // Check if that scheduled day is active

    if (shouldRun) {
      // IMPORTANT: Mark as "Missed" so frontend/scheduler can handle it
      // Keep status as "Waiting" but the scheduler will recognize it as missed
      // and execute it immediately with visual indicator
      // (no action needed here - scheduler will handle it)
    }

    // For recurring schedules that passed their time, generate next occurrence
    if (schedule.recurring && timePassed > 0) {
      const nextPlayTime = getNextPlayTime(schedule, now);
      if (nextPlayTime) {
        // Auto-reschedule for next occurrence
        if (schedule.status === "Done") {
          // Reset done status for recurring schedules
          data.schedules[idx] = {
            ...schedule,
            playTime: nextPlayTime.toISOString(),
            status: "Waiting",
          };
        }
      }
    }
  });
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
  getMissedSchedules(): Promise<Schedule[]>;
  getNextOccurrence(schedule: Schedule): Date | null;
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
    
    // CRITICAL: Process missed schedules first (for recovery while app was offline)
    processMissedSchedules(data);

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
      daysOfWeek: input.daysOfWeek ?? [], // Default to empty array (daily)
      lastPlayedAt: input.lastPlayedAt,
      outroMusicId: input.outroMusicId ?? (input.outroMusicIds && input.outroMusicIds.length > 0 ? input.outroMusicIds[0] : null),
      outroMusicIds: input.outroMusicIds ?? (input.outroMusicId ? [input.outroMusicId] : []),
      outroMusicDuration: input.outroMusicDuration ?? 0,
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

  /**
   * Get schedules that were missed while the app was offline
   * Used by the scheduler to immediately play them on app startup
   */
  async getMissedSchedules(): Promise<Schedule[]> {
    const data = loadData();
    const now = new Date();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    return data.schedules.filter((schedule) => {
      const playTime = new Date(schedule.playTime);
      const timePassed = now.getTime() - playTime.getTime();
      const scheduleDay = playTime.getDay(); // Check the day the schedule was for, not today

      return (
        schedule.status === "Waiting" &&
        timePassed > 0 &&
        timePassed < TWENTY_FOUR_HOURS &&
        shouldScheduleRunOnDay(schedule, scheduleDay)
      );
    });
  }

  /**
   * Get the next occurrence time for a recurring schedule
   * Public method for frontend to display next scheduled time
   */
  getNextOccurrence(schedule: Schedule): Date | null {
    return getNextPlayTime(schedule, new Date());
  }
}

export const storage = new JsonFileStorage();