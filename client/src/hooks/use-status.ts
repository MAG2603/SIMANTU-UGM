import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useApiStatus() {
  return useQuery({
    queryKey: [api.status.get.path],
    queryFn: async () => {
      try {
        const res = await fetch(api.status.get.path, { credentials: "include" });
        if (!res.ok) return { connected: false };
        return api.status.get.responses[200].parse(await res.json());
      } catch (err) {
        return { connected: false };
      }
    },
    refetchInterval: 10000, // Poll every 10 seconds
  });
}
