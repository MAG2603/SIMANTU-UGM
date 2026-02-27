import { pgTable, text, serial, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  contentId: text("content_id").notNull(),
  contentEn: text("content_en").notNull(),
  voice: text("voice").notNull(),
  isFavorite: boolean("is_favorite").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  announcementId: integer("announcement_id").notNull(),
  playTime: timestamp("play_time").notNull(),
  status: text("status").notNull(), // 'Waiting', 'Done'
});

export const insertAnnouncementSchema = createInsertSchema(announcements).omit({ id: true, createdAt: true });
export const insertScheduleSchema = createInsertSchema(schedules).omit({ id: true });

export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type UpdateAnnouncementRequest = Partial<InsertAnnouncement>;

export type Schedule = typeof schedules.$inferSelect;
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type UpdateScheduleRequest = Partial<InsertSchedule>;
