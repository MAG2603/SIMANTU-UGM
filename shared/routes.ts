import { z } from "zod";
import { insertAnnouncementSchema, insertScheduleSchema, announcements, schedules } from "./schema";

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
};

export const api = {
  announcements: {
    list: {
      method: "GET" as const,
      path: "/api/announcements" as const,
      responses: {
        200: z.array(z.custom<typeof announcements.$inferSelect>()),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/announcements" as const,
      input: insertAnnouncementSchema,
      responses: {
        201: z.custom<typeof announcements.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/announcements/:id" as const,
      input: insertAnnouncementSchema.partial(),
      responses: {
        200: z.custom<typeof announcements.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/announcements/:id" as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  schedules: {
    list: {
      method: "GET" as const,
      path: "/api/schedules" as const,
      responses: {
        200: z.array(z.custom<typeof schedules.$inferSelect>()),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/schedules" as const,
      input: insertScheduleSchema,
      responses: {
        201: z.custom<typeof schedules.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/schedules/:id" as const,
      input: insertScheduleSchema.partial(),
      responses: {
        200: z.custom<typeof schedules.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/schedules/:id" as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  status: {
    get: {
      method: "GET" as const,
      path: "/api/status" as const,
      responses: {
        200: z.object({ connected: z.boolean() }),
      },
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
