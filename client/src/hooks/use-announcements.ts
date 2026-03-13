import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { Announcement, InsertAnnouncement } from "@shared/schema";

const ANNOUNCEMENTS_QUERY_KEY = [api.announcements.list.path] as const;

export function useAnnouncements() {
  return useQuery({
    queryKey: ANNOUNCEMENTS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(api.announcements.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch announcements");
      const data = await res.json();
      return api.announcements.list.responses[200].parse(data);
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
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
    onSuccess: (created) => {
      queryClient.setQueryData<Announcement[]>(ANNOUNCEMENTS_QUERY_KEY, (current = []) => {
        const exists = current.some((item) => item.id === created.id);
        if (exists) {
          return current.map((item) => (item.id === created.id ? created : item));
        }
        return [created, ...current];
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_QUERY_KEY, refetchType: "all" });
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
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: ANNOUNCEMENTS_QUERY_KEY });
      const previous = queryClient.getQueryData<Announcement[]>(ANNOUNCEMENTS_QUERY_KEY);

      if (previous) {
        queryClient.setQueryData<Announcement[]>(ANNOUNCEMENTS_QUERY_KEY, previous.map((item) => {
          if (item.id !== id) return item;
          return { ...item, ...updates };
        }));
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<Announcement[]>(ANNOUNCEMENTS_QUERY_KEY, context.previous);
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Announcement[]>(ANNOUNCEMENTS_QUERY_KEY, (current = []) => {
        const exists = current.some((item) => item.id === updated.id);
        if (exists) {
          return current.map((item) => (item.id === updated.id ? updated : item));
        }
        return [updated, ...current];
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_QUERY_KEY, refetchType: "all" });
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
      return id;
    },
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ANNOUNCEMENTS_QUERY_KEY });
      const previous = queryClient.getQueryData<Announcement[]>(ANNOUNCEMENTS_QUERY_KEY);

      if (previous) {
        queryClient.setQueryData<Announcement[]>(ANNOUNCEMENTS_QUERY_KEY, previous.filter((item) => item.id !== id));
      }

      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData<Announcement[]>(ANNOUNCEMENTS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_QUERY_KEY, refetchType: "all" });
    },
  });
}
