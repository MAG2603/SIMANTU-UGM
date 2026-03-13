import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useAppContext } from "@/context/AppContext";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import LibraryPage, { SchedulerPage, SettingsPage } from "@/pages/SecondaryPages";
import { OpeningAnimation } from "@/components/ui/OpeningAnimation";
import { TitleBar } from "@/components/layout/TitleBar";
import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, WifiOff } from "lucide-react";
import { format } from "date-fns";

function NetworkBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-[#F9BB00] text-[#004175] flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold overflow-hidden shrink-0"
        >
          <WifiOff className="w-3.5 h-3.5" />
          <span>Tidak ada koneksi internet — Fitur Text-to-Speech tidak dapat digunakan</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard}/>
      <Route path="/library" component={LibraryPage}/>
      <Route path="/scheduler" component={SchedulerPage}/>
      <Route path="/settings" component={SettingsPage}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function DeferredScheduleDialog() {
  const {
    pendingScheduledPlayback,
    confirmPendingScheduledPlayback,
    skipPendingScheduledPlayback,
  } = useAppContext();
  const [action, setAction] = useState<"play" | "skip" | null>(null);

  const handlePlay = async () => {
    setAction("play");
    try {
      await confirmPendingScheduledPlayback();
    } finally {
      setAction(null);
    }
  };

  const handleSkip = async () => {
    setAction("skip");
    try {
      await skipPendingScheduledPlayback();
    } finally {
      setAction(null);
    }
  };

  return (
    <AnimatePresence>
      {pendingScheduledPlayback && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gray-950/45 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 24 }}
            className="relative w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="bg-gradient-to-br from-[#004175] via-[#00508d] to-[#0062ad] px-6 py-5 text-white">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                  <AlarmClock className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold">Konfirmasi Pengumuman Dari Jadwal</h3>
                  <p className="mt-1 text-sm text-white/75">
                    Anda baru saja memutar pengumuman dari dashboard. Jadwal yang ditahan siap diputar sekarang.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5 p-6">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-[#24445d]">
                <p className="text-sm font-black text-[#004175]">{pendingScheduledPlayback.title}</p>
                <p className="mt-1 text-sm text-[#42627c]">
                  Jadwal ini seharusnya diputar pada {format(new Date(pendingScheduledPlayback.playTime), "HH:mm")}. Sistem menunggu keputusan Anda sebelum melanjutkan.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => void handleSkip()}
                  disabled={action !== null}
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-3 font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Lewati Jadwal Ini
                </button>
                <button
                  type="button"
                  onClick={() => void handlePlay()}
                  disabled={action !== null}
                  className="rounded-2xl bg-[#004175] px-5 py-3 font-bold text-white shadow-lg shadow-[#004175]/20 transition-colors hover:bg-[#003159] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Putar Jadwal Sekarang
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function App() {
  const [showOpening, setShowOpening] = useState(true);

  // Use session storage to only show opening once per session
  useEffect(() => {
    const hasSeen = sessionStorage.getItem("simantu_opening_seen");
    if (hasSeen) {
      setShowOpening(false);
    }
  }, []);

  const handleComplete = () => {
    setShowOpening(false);
    sessionStorage.setItem("simantu_opening_seen", "true");
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <TooltipProvider>
          <AnimatePresence>
            {showOpening && <OpeningAnimation onComplete={handleComplete} />}
          </AnimatePresence>
          <DeferredScheduleDialog />
          <Toaster />
          <div className="h-screen w-screen flex flex-col overflow-hidden">
            <TitleBar />
            <NetworkBanner />
            <div className="flex-1 min-h-0 w-full">
              <Router />
            </div>
          </div>
        </TooltipProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}

export default App;
