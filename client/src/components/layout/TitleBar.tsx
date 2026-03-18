import { Minus, Square, X, Bell } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAnnouncements } from "@/hooks/use-announcements";
import { useSchedules } from "@/hooks/use-schedules";
import { useAppContext } from "@/context/AppContext";
import { format } from "date-fns";

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      showNotification: (title: string, body: string) => void;
    };
  }
}

function UpcomingNotification() {
  const { data: announcements = [] } = useAnnouncements();
  const { data: schedules = [] } = useSchedules();
  const { schedulerEnabled } = useAppContext();
  const [upcoming, setUpcoming] = useState<{
    mode: "upcoming" | "processing";
    schedule: any;
    announcement: any;
    msLeft: number;
  } | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());

  const formatCountdown = (ms: number) => {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const mins = Math.floor(totalSec / 60)
      .toString()
      .padStart(2, "0");
    const secs = (totalSec % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  useEffect(() => {
    const check = () => {
      if (!schedulerEnabled) {
        setUpcoming(null);
        return;
      }

      const now = new Date();
      const nowMs = now.getTime();
      let nearest: {
        mode: "upcoming";
        schedule: any;
        announcement: any;
        msLeft: number;
      } | null = null;

      // If a schedule is already claimed (Playing), show loading/starting warning first.
      const processing = schedules
        .filter((s: any) => s.status === "Playing")
        .sort((a: any, b: any) => new Date(a.playTime).getTime() - new Date(b.playTime).getTime())[0];

      if (processing) {
        const ann = announcements.find((a: any) => a.id === processing.announcementId) ?? {
          title: "Pengumuman Terjadwal",
        };
        setUpcoming({ mode: "processing", schedule: processing, announcement: ann, msLeft: 0 });
        return;
      }

      for (const s of schedules) {
        if (s.status !== "Waiting") continue;
        const playTime = new Date(s.playTime);
        const diffMs = playTime.getTime() - nowMs;
        if (diffMs > 0 && diffMs <= 5 * 60 * 1000) {
          const ann = announcements.find((a: any) => a.id === s.announcementId);
          if (ann && (!nearest || diffMs < nearest.msLeft)) {
            nearest = { mode: "upcoming", schedule: s, announcement: ann, msLeft: diffMs };
          }

          // Send system notification via Electron native API (once per schedule per minute)
          if (ann) {
            const minuteBucket = Math.ceil(diffMs / 60000);
            const notifKey = `${s.id}-${minuteBucket}`;
            if (!notifiedRef.current.has(notifKey)) {
              notifiedRef.current.add(notifKey);
              const title = "SIMANTU - Pengumuman Segera";
              const body = `"${ann.title}" akan diputar dalam ${formatCountdown(diffMs)} (${format(playTime, "HH:mm")})`;
              if (window.electronAPI?.showNotification) {
                window.electronAPI.showNotification(title, body);
              } else if ("Notification" in window && Notification.permission === "granted") {
                new Notification(title, { body });
              }
            }
          }
        }
      }
      setUpcoming(nearest);
    };

    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [schedules, announcements, schedulerEnabled]);

  return (
    <AnimatePresence>
      {upcoming && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 flex items-center"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties & Record<string, string>}
        >
          <div
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 shadow-md border ${
              upcoming.mode === "processing"
                ? "bg-[#8A1D1D] border-[#F9BB00]/30"
                : "bg-[#004175] border-[#F9BB00]/30"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                upcoming.mode === "processing" ? "bg-[#F9BB00] animate-pulse" : "bg-[#F9BB00]"
              }`}
            >
              <Bell className="w-2.5 h-2.5 text-[#004175]" />
            </div>
            <span className="text-[10px] font-bold text-white whitespace-nowrap">
              {upcoming.mode === "processing"
                ? "Menyiapkan Jadwal"
                : formatCountdown(upcoming.msLeft)}
            </span>
            <div className="w-px h-3 bg-white/20" />
            <span className="text-[10px] font-medium text-white/80 max-w-[140px] truncate">
              {upcoming.announcement.title}
            </span>
            <span className="text-[9px] font-mono text-white/50">
              {format(new Date(upcoming.schedule.playTime), "HH:mm")}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function TitleBar() {
  const isElectron = !!window.electronAPI;
  const titleBarRef = useRef<HTMLDivElement>(null);
  const windowControlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    titleBarRef.current?.style.setProperty("-webkit-app-region", "drag");
    windowControlsRef.current?.style.setProperty("-webkit-app-region", "no-drag");
  }, []);

  return (
    <div
      ref={titleBarRef}
      className="h-10 bg-gradient-to-r from-[#F9BB00] via-[#f5c623] to-[#F9BB00] flex items-center justify-between px-4 shrink-0 select-none shadow-md shadow-[#F9BB00]/20 relative z-50"
    >
      {/* Left: UGM Logo + App Name */}
      <div className="flex items-center gap-3">
        <img src="/UGM.png" alt="UGM" className="h-7 w-auto object-contain drop-shadow-sm" />
        <div className="w-px h-5 bg-[#004175]/20" />
        <div className="flex items-center gap-2">
          <span className="font-display font-black text-[#004175] text-sm tracking-wide">SIMANTU</span>
          <span className="text-[9px] font-bold text-[#004175]/50 uppercase tracking-widest hidden sm:block">
            Sistem Informasi Pengumuman Terpadu
          </span>
        </div>
      </div>

      {/* Center: Upcoming Notification (absolutely positioned for true centering) */}
      <UpcomingNotification />

      {/* Right: Window Controls */}
      {isElectron && (
        <div
          ref={windowControlsRef}
          className="flex items-center gap-0.5"
        >
          <button
            onClick={() => window.electronAPI?.minimize()}
            className="w-10 h-8 flex items-center justify-center hover:bg-[#004175]/10 rounded-lg transition-colors"
            title="Minimize"
          >
            <Minus className="w-4 h-4 text-[#004175]" />
          </button>
          <button
            onClick={() => window.electronAPI?.maximize()}
            className="w-10 h-8 flex items-center justify-center hover:bg-[#004175]/10 rounded-lg transition-colors"
            title="Maximize"
          >
            <Square className="w-3.5 h-3.5 text-[#004175]" />
          </button>
          <button
            onClick={() => window.electronAPI?.close()}
            className="w-10 h-8 flex items-center justify-center hover:bg-red-500 rounded-lg transition-colors group"
            title="Close"
          >
            <X className="w-4 h-4 text-[#004175] group-hover:text-white" />
          </button>
        </div>
      )}
    </div>
  );
}
