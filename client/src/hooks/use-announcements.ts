import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertAnnouncement } from "@shared/schema";

export function useAnnouncements() {
  return useQuery({
    queryKey: [api.announcements.list.path],
    queryFn: async () => {
      const res = await fetch(api.announcements.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch announcements");
      const data = await res.json();
      return api.announcements.list.responses[200].parse(data);
    },
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: InsertAnnouncement) => {
      const res = await fetch(api.announcements.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create announcement");
      }
      return api.announcements.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.announcements.list.path] });
    },
  });
}

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertAnnouncement>) => {
      const url = buildUrl(api.announcements.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to update announcement");
      return api.announcements.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.announcements.list.path] });
    },
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.announcements.delete.path, { id });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete announcement");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.announcements.list.path] });
    },
  });
}
