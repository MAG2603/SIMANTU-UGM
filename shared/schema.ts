import { z } from "zod";

export interface Announcement {
  id: number;
  title: string;
  contentId: string;
  contentEn: string;
  voice: string;
  isFavorite: boolean;
  createdAt: string;
}

export interface Schedule {
  id: number;
  announcementId: number;
  playTime: string;
  status: string;
  recurring?: boolean;
}

export const announcementSchema = z.object({
  id: z.number(),
  title: z.string(),
  contentId: z.string(),
  contentEn: z.string(),
  voice: z.string(),
  isFavorite: z.boolean(),
  createdAt: z.string(),
});

export const scheduleSchema = z.object({
  id: z.number(),
  announcementId: z.number(),
  playTime: z.string(),
  status: z.string(),
  recurring: z.boolean().optional().default(false),
});

export const insertAnnouncementSchema = z.object({
  title: z.string().min(1),
  contentId: z.string(),
  contentEn: z.string(),
  voice: z.string(),
  isFavorite: z.boolean().optional().default(false),
});

export const insertScheduleSchema = z.object({
  announcementId: z.number(),
  playTime: z.union([z.string(), z.date().transform((d: Date) => d.toISOString())]),
  status: z.string().default("Waiting"),
  recurring: z.boolean().optional().default(false),
});

export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type UpdateAnnouncementRequest = Partial<InsertAnnouncement>;
export type UpdateScheduleRequest = Partial<InsertSchedule>;
