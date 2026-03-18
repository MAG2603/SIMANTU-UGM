import { useState } from "react";
import { Mic, Play, Square, Bookmark, Bell, BellOff, Info, CheckCircle2, Trash2, RotateCcw, AlertTriangle, Clock3 } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { useCreateAnnouncement, useAnnouncements } from "@/hooks/use-announcements";
import { useSchedules, useUpdateSchedule } from "@/hooks/use-schedules";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";

const MANUAL_PLAY_SCHEDULE_GUARD_MS = 2 * 60 * 1000;
const SCHEDULE_CONFLICT_STALE_MS = 5 * 60 * 1000;

type ScheduleConflict = {
  schedule: any;
  title: string;
  mode: "starting" | "imminent";
  countdown: string;
};

export function InputArea() {
  const { 
    textId, setTextId, 
    textEn, setTextEn, 
    voice, setVoice, 
    voiceEn, setVoiceEn,
    isPlaying, isPreparing, playAudio, stopAudio,
    bellEnabled, setBellEnabled,
    clearText, resetApp,
    schedulerEnabled,
    deferScheduledPlayback,
    clearDeferredScheduledPlayback,
  } = useAppContext();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [scheduleConflict, setScheduleConflict] = useState<ScheduleConflict | null>(null);
  const [conflictAction, setConflictAction] = useState<"cancel-and-play" | "queue-after-manual" | null>(null);
  
  const createAnnouncement = useCreateAnnouncement();
  const { data: announcements = [] } = useAnnouncements();
  const { data: schedules = [] } = useSchedules();
  const updateSchedule = useUpdateSchedule();
  const playbackBusy = isPlaying || isPreparing;
  const controlsLocked = isPreparing;

  // Detect if the current text pair is already saved in the library
  const alreadySaved = (textId.trim() || textEn.trim()) && announcements.some(
    (a: any) => a.contentId.trim() === textId.trim() && a.contentEn.trim() === textEn.trim()
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveTitle.trim() || (!textId.trim() && !textEn.trim())) return;
    
    await createAnnouncement.mutateAsync({
      title: saveTitle,
      contentId: textId,
      contentEn: textEn,
      voice: `${voice}/${voiceEn}`,
      isFavorite: false,
    });
    
    setIsSaveModalOpen(false);
    setSaveTitle("");
  };

  const formatConflictCountdown = (ms: number) => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes > 0) {
      return `${minutes} menit ${seconds.toString().padStart(2, "0")} detik lagi`;
    }

    return `${seconds} detik lagi`;
  };

  const getScheduleConflict = () => {
    if (!schedulerEnabled) return null;

    const nowMs = Date.now();
    const candidate = schedules
      .filter((schedule: any) => {
        const playTimeMs = new Date(schedule.playTime).getTime();
        const diffMs = playTimeMs - nowMs;

        if (schedule.status === "Playing") return true;
        if (schedule.status !== "Waiting") return false;
        return diffMs <= MANUAL_PLAY_SCHEDULE_GUARD_MS && diffMs >= -SCHEDULE_CONFLICT_STALE_MS;
      })
      .sort((left: any, right: any) => {
        const leftPriority = left.status === "Playing" ? -1 : 0;
        const rightPriority = right.status === "Playing" ? -1 : 0;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return new Date(left.playTime).getTime() - new Date(right.playTime).getTime();
      })[0];

    if (!candidate) return null;

    const announcement = announcements.find((item: any) => item.id === candidate.announcementId);
    const diffMs = new Date(candidate.playTime).getTime() - nowMs;
    const mode = candidate.status === "Playing" || diffMs <= 0 ? "starting" : "imminent";

    return {
      schedule: candidate,
      title: announcement?.title || "Pengumuman Terjadwal",
      mode,
      countdown: mode === "starting" ? "sedang dipersiapkan" : formatConflictCountdown(diffMs),
    } satisfies ScheduleConflict;
  };

  const skipScheduleOccurrence = async (schedule: any) => {
    if (schedule.recurring) {
      const nextPlay = new Date(schedule.playTime);
      nextPlay.setDate(nextPlay.getDate() + 1);
      await updateSchedule.mutateAsync({ id: schedule.id, playTime: nextPlay.toISOString(), status: "Waiting" });
      return;
    }

    await updateSchedule.mutateAsync({ id: schedule.id, status: "Done" });
  };

  const handlePlayRequest = async () => {
    const conflict = getScheduleConflict();
    if (conflict) {
      setScheduleConflict(conflict);
      return;
    }

    await playAudio();
  };

  const handlePlayAndCancelSchedule = async () => {
    if (!scheduleConflict) return;

    setConflictAction("cancel-and-play");
    try {
      clearDeferredScheduledPlayback();
      await skipScheduleOccurrence(scheduleConflict.schedule);
      setScheduleConflict(null);
      await playAudio();
    } finally {
      setConflictAction(null);
    }
  };

  const handlePlayAndDeferSchedule = async () => {
    if (!scheduleConflict) return;

    setConflictAction("queue-after-manual");
    try {
      deferScheduledPlayback(scheduleConflict.schedule.id);
      if (scheduleConflict.schedule.status === "Playing") {
        await updateSchedule.mutateAsync({ id: scheduleConflict.schedule.id, status: "Waiting" });
      }
      setScheduleConflict(null);
      await playAudio();
    } finally {
      setConflictAction(null);
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-200 flex-1 flex flex-col min-h-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Mic className="w-5 h-5 text-[#004175]" />
            </div>
            <h2 className="font-display font-bold text-xl text-[#004175]">Broadcast Input</h2>
          </div>

          <div className="flex w-full sm:w-auto items-center gap-2 flex-wrap">
            <button
              onClick={clearText}
              disabled={playbackBusy || (!textId.trim() && !textEn.trim())}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
              title="Hapus teks"
            >
              <Trash2 className="w-4 h-4" />
              Hapus
            </button>
            <button
              onClick={resetApp}
              disabled={playbackBusy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
              title="Reset aplikasi ke kondisi awal"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button 
              onClick={() => setBellEnabled(!bellEnabled)}
              disabled={playbackBusy}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300
                ${bellEnabled ? 'bg-[#F9BB00] text-[#004175]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
                ${playbackBusy ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={bellEnabled ? 'Bell aktif' : 'Bell nonaktif'}
            >
              {bellEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              Bell
            </button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">
          <div className="relative group flex flex-col min-h-0">
            <div className="absolute top-3 left-3 bg-[#004175]/10 text-[#004175] px-2 py-0.5 rounded text-[10px] font-bold uppercase z-10">
              Indonesian
            </div>
            <textarea
              value={textId}
              onChange={(e) => setTextId(e.target.value)}
              disabled={controlsLocked}
              placeholder="Masukkan teks pengumuman bahasa Indonesia..."
              className="w-full flex-1 p-5 pt-10 bg-gray-50 border border-gray-200 rounded-xl resize-none text-gray-800 text-base 
                         focus:outline-none focus:ring-4 focus:ring-[#004175]/10 focus:border-[#004175]/30 
                         transition-all duration-300 min-h-[120px] disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <div className="relative group flex flex-col min-h-0">
            <div className="absolute top-3 left-3 bg-[#004175]/10 text-[#004175] px-2 py-0.5 rounded text-[10px] font-bold uppercase z-10">
              English
            </div>
            <textarea
              value={textEn}
              onChange={(e) => setTextEn(e.target.value)}
              disabled={controlsLocked}
              placeholder="Enter English announcement text here..."
              className="w-full flex-1 p-5 pt-10 bg-gray-50 border border-gray-200 rounded-xl resize-none text-gray-800 text-base 
                         focus:outline-none focus:ring-4 focus:ring-[#004175]/10 focus:border-[#004175]/30 
                         transition-all duration-300 min-h-[120px] disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>
        {/* Hint spanning both columns */}
        <div className="mt-1.5 px-1 flex items-start gap-1.5 text-[11px] text-gray-400">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          <span className="break-words">
            Singkatan <span className="font-semibold tracking-wide">KAPITAL</span> (UGM, WIB, ETD) dieja otomatis. Untuk kata Inggris di kolom ID, gunakan <code className="bg-gray-100 px-1 rounded">[en: kata]</code>.
            Untuk sisipan Indonesia di kolom EN, gunakan <code className="bg-gray-100 px-1 rounded">[id: kata]</code>.
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-4 border-t border-gray-100 pt-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex flex-row flex-wrap w-full gap-3 2xl:w-auto 2xl:flex 2xl:flex-wrap 2xl:items-center 2xl:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ID:</span>
              <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-gray-100 p-0.5">
                {["Pria", "Wanita"].map((v) => (
                  <label
                    key={v}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all duration-300 cursor-pointer sm:px-3 ${
                      voice === v
                        ? 'bg-[#004175] text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/60'
                    } ${isPlaying || isPreparing ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                  >
                    <input
                      type="radio"
                      name="voice-id"
                      value={v}
                      checked={voice === v}
                      disabled={playbackBusy}
                      onChange={() => setVoice(v)}
                      className="sr-only"
                    />
                    {v}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">EN:</span>
              <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-gray-100 p-0.5">
                {["Pria", "Wanita"].map((v) => (
                  <label
                    key={v}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all duration-300 cursor-pointer sm:px-3 ${
                      voiceEn === v
                        ? 'bg-[#004175] text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/60'
                    } ${isPlaying || isPreparing ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                  >
                    <input
                      type="radio"
                      name="voice-en"
                      value={v}
                      checked={voiceEn === v}
                      disabled={playbackBusy}
                      onChange={() => setVoiceEn(v)}
                      className="sr-only"
                    />
                    {v}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full min-w-0 2xl:ml-auto 2xl:max-w-[320px] sm:flex-row sm:gap-3">
            {/* Save to Library Button */}
            <div className="flex-1">
              {alreadySaved ? (
                <div className="flex w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-6 py-3 text-sm font-semibold text-green-700 text-center">
                  <CheckCircle2 className="w-5 h-5" />
                  Tersimpan
                </div>
              ) : (
                <button
                  onClick={() => setIsSaveModalOpen(true)}
                  disabled={controlsLocked || (!textId.trim() && !textEn.trim())}
                  className="flex w-full min-w-0 items-center justify-center gap-2 rounded-xl bg-[#F9BB00]/10 px-6 py-3 text-sm font-semibold text-[#bd8e00] text-center transition-colors hover:bg-[#F9BB00]/20 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap overflow-hidden"
                >
                  <Bookmark className="w-5 h-5" />
                  <span className="whitespace-nowrap">Save to Library</span>
                </button>
              )}
            </div>

            {/* Play Button */}
            <div className="flex-1">
              {playbackBusy ? (
                <button
                  onClick={stopAudio}
                  className="flex w-full min-w-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-6 py-3 text-sm font-semibold text-white text-center shadow-lg shadow-red-600/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
                >
                  <Square className="w-5 h-5 fill-current" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => void handlePlayRequest()}
                  disabled={controlsLocked || (!textId.trim() && !textEn.trim())}
                  className="flex w-full min-w-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#004175] to-[#002a4d] px-6 py-3 text-sm font-semibold text-white text-center shadow-lg shadow-[#004175]/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span className="whitespace-nowrap">Play Now</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {scheduleConflict && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/45 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 24 }}
              className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="bg-gradient-to-br from-[#8A1D1D] via-[#a72626] to-[#d14a0c] px-6 py-5 text-white">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-bold">Jadwal Pengumuman Sedang Prioritas</h3>
                    <p className="mt-1 text-sm text-white/75">
                      Pengumuman dashboard Anda bentrok dengan jadwal yang {scheduleConflict.mode === "starting" ? "sudah mulai diproses" : "akan segera dimulai"}.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-5 p-6">
                <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4 text-[#5b4310]">
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[#bd8e00]" />
                    <div>
                      <p className="text-sm font-bold text-[#6e4d00]">{scheduleConflict.title}</p>
                      <p className="mt-1 text-sm text-[#7d6223]">
                        {scheduleConflict.mode === "starting"
                          ? "Jadwal ini sedang loading atau menunggu dimulai sekarang."
                          : `Jadwal ini akan mulai ${scheduleConflict.countdown}.`}
                      </p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[#8b6f2d]">
                        Jam jadwal {format(new Date(scheduleConflict.schedule.playTime), "HH:mm")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={() => void handlePlayAndCancelSchedule()}
                    disabled={conflictAction !== null}
                    className="rounded-2xl border border-[#F9BB00]/50 bg-[#F9BB00]/15 px-5 py-4 text-left transition-all hover:bg-[#F9BB00]/25 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="block text-sm font-black text-[#6b5200]">Lanjutkan Pengumuman + Batalkan Jadwal Ini</span>
                    <span className="mt-1 block text-xs text-[#7d6223]">
                      Pengumuman dashboard langsung diputar, sedangkan jadwal bentrok ini dilewati.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handlePlayAndDeferSchedule()}
                    disabled={conflictAction !== null}
                    className="rounded-2xl border border-[#004175]/20 bg-[#004175]/5 px-5 py-4 text-left transition-all hover:bg-[#004175]/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="block text-sm font-black text-[#004175]">Lanjutkan Tanpa Membatalkan Jadwal</span>
                    <span className="mt-1 block text-xs text-[#335b7c]">
                      Jadwal akan ditahan sampai pengumuman dashboard selesai, lalu sistem meminta konfirmasi lagi sebelum jadwal benar-benar diputar.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScheduleConflict(null)}
                    disabled={conflictAction !== null}
                    className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-left transition-all hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="block text-sm font-black text-gray-700">Urungkan Pengumuman</span>
                    <span className="mt-1 block text-xs text-gray-500">
                      Pengumuman dashboard tidak jadi diputar dan jadwal tetap diprioritaskan.
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Save Modal */}
      <AnimatePresence>
        {isSaveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={() => setIsSaveModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 overflow-hidden"
            >
              <h3 className="font-display text-2xl font-bold text-[#004175] mb-2">Save Announcement</h3>
              <p className="text-gray-500 text-sm mb-6">Give your announcement a recognizable title to easily find it later.</p>
              
              <form onSubmit={handleSave}>
                <input
                  type="text"
                  autoFocus
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder="e.g., Morning Greeting"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#004175]/20 focus:border-[#004175]/50 transition-all mb-6"
                />
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setIsSaveModalOpen(false)} className="px-5 py-2.5 rounded-xl font-semibold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
                  <button 
                    type="submit" 
                    disabled={controlsLocked || !saveTitle.trim() || createAnnouncement.isPending}
                    className="px-6 py-2.5 rounded-xl font-semibold bg-[#004175] text-white shadow-lg shadow-[#004175]/20 hover:bg-[#003159] disabled:opacity-50 transition-all"
                  >
                    {createAnnouncement.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
