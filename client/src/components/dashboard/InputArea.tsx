import { useState, useEffect, useRef } from "react";
import {
  Mic,
  Play,
  Square,
  Bookmark,
  Bell,
  BellOff,
  Info,
  CheckCircle2,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Clock3,
  Languages,
  RefreshCw,
  Copy,
  X,
} from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { useCreateAnnouncement, useUpdateAnnouncement, useAnnouncements } from "@/hooks/use-announcements";
import { useSchedules, useUpdateSchedule } from "@/hooks/use-schedules";
import { useToast } from "@/hooks/use-toast";
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
    autoTranslateEnabled, setAutoTranslateEnabled,
    translationEngine,
  } = useAppContext();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveConflict, setSaveConflict] = useState<{ existing: any; reason: string } | null>(null);
  const [scheduleConflict, setScheduleConflict] = useState<ScheduleConflict | null>(null);
  const [conflictAction, setConflictAction] = useState<"cancel-and-play" | "queue-after-manual" | null>(null);
  
  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const { data: announcements = [] } = useAnnouncements();
  const { data: schedules = [] } = useSchedules();
  const updateSchedule = useUpdateSchedule();
  const { toast } = useToast();
  const playbackBusy = isPlaying || isPreparing;
  const controlsLocked = isPreparing;

  // --- Auto-translate debounce logic ---
  const [isTranslating, setIsTranslating] = useState(false);
  const translateAbortRef = useRef<AbortController | null>(null);
  const lastTranslatedTextRef = useRef<string>("");
  const isUserEditingIdRef = useRef<boolean>(false);

  // Sync tracking on initial mount so reopening or navigating back never triggers auto-translate
  useEffect(() => {
    lastTranslatedTextRef.current = textId.trim();
  }, []);

  useEffect(() => {
    if (!autoTranslateEnabled) return;
    const trimmed = textId.trim();
    if (!trimmed) return;

    // CRITICAL: Only translate if the change was directly initiated by user typing in Indonesian textarea
    if (!isUserEditingIdRef.current) {
      lastTranslatedTextRef.current = trimmed;
      return;
    }

    // Don't re-translate if text hasn't actually changed
    if (trimmed === lastTranslatedTextRef.current) return;

    const timer = setTimeout(async () => {
      isUserEditingIdRef.current = false;

      // Abort any previous in-flight request
      if (translateAbortRef.current) translateAbortRef.current.abort();
      const controller = new AbortController();
      translateAbortRef.current = controller;

      setIsTranslating(true);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, from: "id", to: "en", engine: translationEngine }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Translate failed");
        const data = await res.json();
        if (!controller.signal.aborted) {
          lastTranslatedTextRef.current = trimmed;
          setTextEn(data.translatedText || "");
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("[SIMANTU] Auto-translate failed:", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsTranslating(false);
        }
      }
    }, 1000); // 1-second debounce

    return () => clearTimeout(timer);
  }, [textId, autoTranslateEnabled, setTextEn, translationEngine]);

  // When textEn changes externally (e.g. from template load or manual clear),
  // sync tracking and clear editing flag so auto-translate never overwrites it
  useEffect(() => {
    lastTranslatedTextRef.current = textId.trim();
    isUserEditingIdRef.current = false;
  }, [textEn]);

  // Detect if the current text pair is already saved in the library
  const alreadySaved = (textId.trim() || textEn.trim()) && announcements.some(
    (a: any) => a.contentId.trim() === textId.trim() && a.contentEn.trim() === textEn.trim()
  );

  const getUniqueCopyTitle = (baseTitle: string) => {
    const existingLower = new Set(announcements.map((a: any) => a.title.trim().toLowerCase()));
    let candidate = `${baseTitle.trim()} (Salinan)`;
    let idx = 2;
    while (existingLower.has(candidate.toLowerCase())) {
      candidate = `${baseTitle.trim()} (Salinan ${idx})`;
      idx++;
    }
    return candidate;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = saveTitle.trim();
    if (!trimmedTitle || (!textId.trim() && !textEn.trim())) return;

    const titleLower = trimmedTitle.toLowerCase();
    const contentLower = textId.trim().toLowerCase();

    const matched = announcements.find((a: any) => {
      const isTitleMatch = a.title.trim().toLowerCase() === titleLower;
      const isContentMatch = Boolean(contentLower && a.contentId?.trim().toLowerCase() === contentLower);
      return isTitleMatch || isContentMatch;
    });

    if (matched) {
      const isTitleMatch = matched.title.trim().toLowerCase() === titleLower;
      const isContentMatch = Boolean(contentLower && matched.contentId?.trim().toLowerCase() === contentLower);
      const reason = isTitleMatch && isContentMatch
        ? "Judul & Naskah sama"
        : isTitleMatch
          ? "Judul sama"
          : "Isi naskah sama";
      setSaveConflict({ existing: matched, reason });
      return;
    }

    await createAnnouncement.mutateAsync({
      title: trimmedTitle,
      contentId: textId,
      contentEn: textEn,
      voice: `${voice}/${voiceEn}`,
      isFavorite: false,
    });

    toast({
      title: "✅ Naskah Disimpan",
      description: `Naskah "${trimmedTitle}" berhasil disimpan ke pustaka.`,
    });
    setIsSaveModalOpen(false);
    setSaveTitle("");
  };

  const executeSaveConflictStrategy = async (strategy: "overwrite" | "keep-both") => {
    if (!saveConflict) return;
    const trimmedTitle = saveTitle.trim();
    const { existing } = saveConflict;

    try {
      if (strategy === "overwrite") {
        await updateAnnouncement.mutateAsync({
          id: existing.id,
          title: trimmedTitle,
          contentId: textId,
          contentEn: textEn,
          voice: `${voice}/${voiceEn}`,
          isFavorite: existing.isFavorite ?? false,
        });
        toast({
          title: "✅ Naskah Lama Diperbarui",
          description: `Naskah "${existing.title}" telah ditimpa dengan isi terbaru.`,
        });
      } else {
        const copyTitle = getUniqueCopyTitle(trimmedTitle);
        await createAnnouncement.mutateAsync({
          title: copyTitle,
          contentId: textId,
          contentEn: textEn,
          voice: `${voice}/${voiceEn}`,
          isFavorite: false,
        });
        toast({
          title: "✅ Disimpan Sebagai Salinan",
          description: `Naskah baru disimpan dengan judul "${copyTitle}".`,
        });
      }
      setSaveConflict(null);
      setIsSaveModalOpen(false);
      setSaveTitle("");
    } catch (err: any) {
      toast({
        title: "Gagal Menyimpan Naskah",
        description: err?.message || "Terjadi kesalahan saat menyimpan ke pustaka.",
        variant: "destructive",
      });
    }
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
      <div className="bg-white rounded-2xl p-3 sm:p-4 md:p-5 lg:p-6 shadow-sm border border-gray-200 flex-1 flex flex-col min-h-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-blue-50 rounded-lg shrink-0">
              <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-[#004175]" />
            </div>
            <h2 className="font-display font-bold text-lg sm:text-xl text-[#004175]">Broadcast Input</h2>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:justify-end">
            <button
              onClick={clearText}
              disabled={playbackBusy || (!textId.trim() && !textEn.trim())}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 whitespace-nowrap"
              title="Hapus teks"
            >
              <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Hapus</span>
            </button>
            <button
              onClick={resetApp}
              disabled={playbackBusy}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-[#004175] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 whitespace-nowrap"
              title="Reset aplikasi ke kondisi awal"
            >
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Reset</span>
            </button>
            <button 
              onClick={() => setBellEnabled(!bellEnabled)}
              disabled={playbackBusy}
              className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300
                ${bellEnabled ? 'bg-[#F9BB00] text-[#004175]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
                ${playbackBusy ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={bellEnabled ? 'Bell aktif' : 'Bell nonaktif'}
            >
              {bellEnabled ? <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <BellOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              <span className="hidden sm:inline">Bell</span>
            </button>
            <button
              onClick={() => setAutoTranslateEnabled(!autoTranslateEnabled)}
              disabled={playbackBusy}
              className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300
                ${autoTranslateEnabled ? 'bg-[#F9BB00] text-[#004175]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
                ${playbackBusy ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={autoTranslateEnabled ? 'Auto-Translate aktif' : 'Auto-Translate nonaktif'}
            >
              <Languages className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Translate</span>
            </button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 min-h-0">
          <div className="relative group flex flex-col min-h-0">
            <div className="absolute top-3 left-3 bg-[#004175]/10 text-[#004175] px-2 py-0.5 rounded text-[10px] font-bold uppercase z-10">
              Indonesian
            </div>
            <textarea
              value={textId}
              onChange={(e) => {
                isUserEditingIdRef.current = true;
                setTextId(e.target.value);
              }}
              disabled={controlsLocked}
              placeholder="Masukkan teks pengumuman bahasa Indonesia..."
              className="w-full flex-1 p-3 sm:p-4 pt-8 sm:pt-10 bg-gray-50 border border-gray-200 rounded-xl resize-none text-gray-800 text-sm sm:text-base 
                         focus:outline-none focus:ring-4 focus:ring-[#004175]/10 focus:border-[#004175]/30 
                         transition-all duration-300 min-h-[100px] sm:min-h-[120px] disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <div className="relative group flex flex-col min-h-0">
            <div className="absolute top-3 left-3 bg-[#004175]/10 text-[#004175] px-2 py-0.5 rounded text-[10px] font-bold uppercase z-10 flex items-center gap-1.5">
              English
              {isTranslating && (
                <span className="text-emerald-600 font-semibold normal-case animate-pulse">
                  Translating ({translationEngine === "deepl" ? "DeepL" : "Google"})...
                </span>
              )}
            </div>
            <textarea
              value={textEn}
              onChange={(e) => {
                isUserEditingIdRef.current = false;
                setTextEn(e.target.value);
              }}
              disabled={controlsLocked}
              placeholder="Enter English announcement text here..."
              className="w-full flex-1 p-3 sm:p-4 pt-8 sm:pt-10 bg-gray-50 border border-gray-200 rounded-xl resize-none text-gray-800 text-sm sm:text-base 
                         focus:outline-none focus:ring-4 focus:ring-[#004175]/10 focus:border-[#004175]/30 
                         transition-all duration-300 min-h-[100px] sm:min-h-[120px] disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>
        {/* Hint spanning both columns */}
        <div className="mt-1 sm:mt-1.5 px-1 flex items-start gap-1 sm:gap-1.5 text-[10px] sm:text-[11px] text-gray-400">
          <Info className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0 mt-0.5" />
          <span className="break-words">
            Singkatan <span className="font-semibold tracking-wide">KAPITAL</span> (UGM, WIB, ETD) dieja otomatis. Untuk kata Inggris di kolom ID, gunakan <code className="bg-gray-100 px-1 rounded">[en: kata]</code>.
            Untuk sisipan Indonesia di kolom EN, gunakan <code className="bg-gray-100 px-1 rounded">[id: kata]</code>.
          </span>
        </div>

        <div className="mt-3 sm:mt-4 flex flex-col gap-3 border-t border-gray-100 pt-3 sm:pt-4 md:flex-row md:items-center md:justify-between shrink-0">
          <div className="flex flex-row flex-wrap w-full gap-2 sm:gap-3 md:w-auto md:flex md:flex-wrap md:items-center">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider">ID:</span>
              <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-gray-100 p-0.5">
                {["Pria", "Wanita"].map((v) => (
                  <label
                    key={v}
                    className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-xs font-bold transition-all duration-300 cursor-pointer ${
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
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider">EN:</span>
              <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-gray-100 p-0.5">
                {["Pria", "Wanita"].map((v) => (
                  <label
                    key={v}
                    className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-xs font-bold transition-all duration-300 cursor-pointer ${
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

          <div className="flex flex-row gap-2 sm:gap-2.5 w-full min-w-0 md:ml-auto md:w-auto md:min-w-[260px] lg:min-w-[300px]">
            {/* Save to Library Button */}
            <div className="flex-1">
              {alreadySaved ? (
                <div className="flex w-full min-w-0 items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-green-200 bg-green-50 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold text-green-700 text-center">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                  <span className="whitespace-nowrap">Tersimpan</span>
                </div>
              ) : (
                <button
                  onClick={() => setIsSaveModalOpen(true)}
                  disabled={controlsLocked || (!textId.trim() && !textEn.trim())}
                  className="flex w-full min-w-0 items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-[#F9BB00]/10 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold text-[#bd8e00] text-center transition-colors hover:bg-[#F9BB00]/20 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap overflow-hidden"
                >
                  <Bookmark className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                  <span className="hidden sm:inline">Save to Library</span>
                  <span className="sm:hidden">Save</span>
                </button>
              )}
            </div>

            {/* Play Button */}
            <div className="flex-1">
              {playbackBusy ? (
                <button
                  onClick={stopAudio}
                  className="flex w-full min-w-0 items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold text-white text-center shadow-lg shadow-red-600/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
                >
                  <Square className="w-4 h-4 sm:w-5 sm:h-5 fill-current shrink-0" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => void handlePlayRequest()}
                  disabled={controlsLocked || (!textId.trim() && !textEn.trim())}
                  className="flex w-full min-w-0 items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-gradient-to-r from-[#004175] to-[#002a4d] px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold text-white text-center shadow-lg shadow-[#004175]/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none"
                >
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current shrink-0" />
                  <span className="hidden sm:inline whitespace-nowrap">Play Now</span>
                  <span className="sm:hidden">Play</span>
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
              <div className="bg-gradient-to-br from-[#004175] via-[#003866] to-[#002a4d] px-6 py-5 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#F9BB00]/10 rounded-full -mr-10 -mt-10 blur-2xl pointer-events-none" />
                <div className="flex items-center gap-4 relative z-10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-[#F9BB00] backdrop-blur-sm">
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
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-4 text-[#004175]">
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[#004175]" />
                    <div>
                      <p className="text-sm font-bold text-[#004175]">{scheduleConflict.title}</p>
                      <p className="mt-1 text-sm text-gray-600">
                        {scheduleConflict.mode === "starting"
                          ? "Jadwal ini sedang loading atau menunggu dimulai sekarang."
                          : `Jadwal ini akan mulai ${scheduleConflict.countdown}.`}
                      </p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[#004175]/80">
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
                    className="rounded-2xl border border-[#F9BB00] bg-[#F9BB00]/10 px-5 py-4 text-left transition-all hover:bg-[#F9BB00]/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="block text-sm font-black text-[#004175]">Lanjutkan Pengumuman + Batalkan Jadwal Ini</span>
                    <span className="mt-1 block text-xs text-gray-600">
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
                    <span className="mt-1 block text-xs text-gray-500">
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
        {isSaveModalOpen && !saveConflict && (
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
              <h3 className="font-display text-2xl font-bold text-[#004175] mb-2">Simpan Naskah</h3>
              <p className="text-gray-500 text-sm mb-6">Beri judul pengumuman agar mudah ditemukan kembali di pustaka.</p>
              
              <form onSubmit={handleSave}>
                <input
                  type="text"
                  autoFocus
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder="Contoh: Pengumuman Barang Hilang"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#004175]/20 focus:border-[#004175]/50 transition-all mb-6"
                />
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setIsSaveModalOpen(false)} className="px-5 py-2.5 rounded-xl font-semibold text-gray-500 hover:bg-gray-100 transition-colors">Batal</button>
                  <button 
                    type="submit" 
                    disabled={controlsLocked || !saveTitle.trim() || createAnnouncement.isPending || updateAnnouncement.isPending}
                    className="px-6 py-2.5 rounded-xl font-semibold bg-[#004175] text-white shadow-lg shadow-[#004175]/20 hover:bg-[#003159] disabled:opacity-50 transition-all"
                  >
                    {createAnnouncement.isPending ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Save Duplicate Conflict Modal */}
      <AnimatePresence>
        {saveConflict && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={() => setSaveConflict(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100"
            >
              <div className="bg-gradient-to-br from-[#004175] via-[#003866] to-[#002a4d] p-6 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#F9BB00]/10 rounded-full -mr-10 -mt-10 blur-2xl pointer-events-none" />
                <div className="flex items-start justify-between gap-3 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/10 text-[#F9BB00] rounded-xl backdrop-blur-sm">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-bold">Naskah Serupa Ditemukan</h3>
                      <p className="text-white/70 text-xs mt-0.5">
                        Naskah dengan judul atau isi serupa sudah terdaftar di Pustaka
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSaveConflict(null)}
                    disabled={createAnnouncement.isPending || updateAnnouncement.isPending}
                    title="Tutup dialog"
                    className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-[#004175]/5 border border-[#004175]/15 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-[#004175] uppercase tracking-wider">Naskah yang sudah ada di Pustaka:</p>
                    <span className="text-[10px] bg-blue-50 text-[#004175] border border-blue-200/60 px-2 py-0.5 rounded-md font-semibold">
                      {saveConflict.reason}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-700 bg-white px-3 py-2 rounded-lg border border-gray-200/80 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#F9BB00] shrink-0" />
                    <span className="font-semibold text-gray-800 truncate">{saveConflict.existing.title}</span>
                  </div>
                </div>

                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Pilih tindakan penyimpanan:
                </p>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => void executeSaveConflictStrategy("overwrite")}
                    disabled={createAnnouncement.isPending || updateAnnouncement.isPending}
                    className="w-full flex items-start gap-3.5 p-3.5 bg-white hover:bg-blue-50/50 border border-gray-200 hover:border-[#004175] text-left rounded-xl transition-all group disabled:opacity-50 shadow-xs hover:shadow-sm"
                  >
                    <div className="p-2 bg-[#004175] text-white rounded-lg group-hover:scale-105 transition-transform shrink-0 mt-0.5 shadow-sm">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#004175]">1. Timpa Naskah Lama</span>
                        <span className="text-[10px] bg-[#F9BB00] text-[#004175] px-2 py-0.5 rounded-full font-black">Perbarui</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                        Perbarui naskah <span className="font-semibold text-gray-700">"{saveConflict.existing.title}"</span> di Pustaka dengan isi dan pengaturan suara saat ini.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => void executeSaveConflictStrategy("keep-both")}
                    disabled={createAnnouncement.isPending || updateAnnouncement.isPending}
                    className="w-full flex items-start gap-3.5 p-3.5 bg-white hover:bg-blue-50/50 border border-gray-200 hover:border-[#004175] text-left rounded-xl transition-all group disabled:opacity-50 shadow-xs hover:shadow-sm"
                  >
                    <div className="p-2 bg-[#004175]/10 text-[#004175] group-hover:bg-[#004175] group-hover:text-white rounded-lg group-hover:scale-105 transition-all shrink-0 mt-0.5 shadow-sm">
                      <Copy className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-800 group-hover:text-[#004175] transition-colors">2. Simpan Sebagai Salinan Baru</span>
                        <span className="text-[10px] bg-blue-100 text-[#004175] px-2 py-0.5 rounded-full font-bold">Simpan Keduanya</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                        Naskah lama tetap utuh, dan naskah ini disimpan sebagai item baru dengan akhiran <span className="font-semibold text-[#004175]">(Salinan)</span>.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSaveConflict(null)}
                    disabled={createAnnouncement.isPending || updateAnnouncement.isPending}
                    className="w-full py-2.5 rounded-xl font-bold text-gray-500 hover:text-[#004175] hover:bg-gray-100 border border-gray-200 transition-colors text-xs text-center mt-2"
                  >
                    Kembali &amp; Ubah Judul Naskah
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
