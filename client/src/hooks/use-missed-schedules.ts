import { useEffect, useRef } from "react";
import { useSchedules } from "./use-schedules";
import { useToast } from "./use-toast";
import { api } from "@shared/routes";
import type { Schedule } from "@shared/schema";

/**
 * CRITICAL: Fetch missed schedules on app startup
 * Handles recovery of schedules that should have run while app was offline
 * This prevents announcements from being lost
 */
export function useFetchMissedSchedules() {
  const { refetch } = useSchedules();
  const { toast } = useToast();
  const hasRunRef = useRef(false);

  useEffect(() => {
    // Only run once per app session
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    const fetchMissed = async () => {
      try {
        // Try to use Electron API if available
        if (typeof window !== "undefined" && (window as any).electronAPI?.fetchMissedSchedules) {
          const serverUrl = window.location.href.replace(/\/$/, "");
          const missed = await (window as any).electronAPI.fetchMissedSchedules(serverUrl);
          
          if (missed && missed.length > 0) {
            console.log(`[SIMANTU] Found ${missed.length} missed schedule(s)`);
            // Refetch schedules to update UI
            await refetch();
            
            // Show toast to user
            toast({
              title: "⏰ Jadwal Terlewat Ditemukan",
              description: `${missed.length} pengumuman perlu diputar. Periksa Scheduler untuk menjalankannya.`,
              duration: 8000,
            });
          }
        } else {
          // Fallback: direct API call if not in Electron
          const res = await fetch(api.schedules.missed.path, {
            signal: AbortSignal.timeout(5000),
          });
          
          if (res.ok) {
            const missed: Schedule[] = await res.json();
            if (missed && missed.length > 0) {
              console.log(`[SIMANTU] Found ${missed.length} missed schedule(s) via API`);
              await refetch();
              
              toast({
                title: "⏰ Jadwal Terlewat",
                description: `${missed.length} pengumuman perlu diputar.`,
                duration: 8000,
              });
            }
          }
        }
      } catch (err) {
        console.warn("[SIMANTU] Error fetching missed schedules:", err);
        // Silently fail - this is not critical for app operation
      }
    };

    // Give app a moment to stabilize before fetching
    const timer = setTimeout(fetchMissed, 1000);
    return () => clearTimeout(timer);
  }, [refetch, toast]);
}
