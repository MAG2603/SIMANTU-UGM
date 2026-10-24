import { Star, PlayCircle, Search, Clock, FileText, CalendarClock, Megaphone, ListOrdered, X, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAnnouncements } from "@/hooks/use-announcements";
import { useSchedules } from "@/hooks/use-schedules";
import { useAppContext } from "@/context/AppContext";

function RealtimeClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");
  const dayName = now.toLocaleDateString("id-ID", { weekday: "long" });
  const dateStr = now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="p-5 bg-gradient-to-br from-[#004175] via-[#003562] to-[#002a4d] rounded-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-[#F9BB00]/10 rounded-full -mr-8 -mt-8 blur-2xl" />
      <div className="absolute bottom-0 left-0 w-16 h-16 bg-[#F9BB00]/5 rounded-full -ml-6 -mb-6 blur-xl" />
      <div className="relative flex flex-col items-center text-center">
        <div className="flex items-center gap-1.5 mb-3">
          <Clock className="w-3 h-3 text-[#F9BB00]" />
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">Live Clock</span>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ml-1" />
        </div>
        <div className="flex items-baseline font-display justify-center">
          <span className="text-5xl font-black text-white tabular-nums tracking-tight">{hours}</span>
          <span className="text-5xl font-black text-[#F9BB00] animate-pulse mx-0.5">:</span>
          <span className="text-5xl font-black text-white tabular-nums tracking-tight">{minutes}</span>
          <span className="text-2xl font-bold text-white/25 tabular-nums ml-2">{seconds}</span>
        </div>
        <div className="mt-2.5 text-[11px] text-white/40 font-medium">
          {dayName}, {dateStr}
        </div>
      </div>
    </div>
  );
}

export function RightPanel() {
  const { data: announcements = [], isLoading } = useAnnouncements();
  const { data: schedules = [] } = useSchedules();
  const { setTextId, setTextEn, setVoice, setVoiceEn, isPreparing, announcementQueue, removeFromQueue, clearQueue } = useAppContext();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "favorites">("all");

  const favorites = announcements.filter(a => a.isFavorite);
  const waitingSchedules = schedules.filter((s: any) => s.status === "Waiting");
  const baseList = filter === "favorites" ? favorites : announcements;
  const filtered = baseList.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.contentId.toLowerCase().includes(search.toLowerCase()) ||
    a.contentEn.toLowerCase().includes(search.toLowerCase())
  );

  const handleLoad = (ann: typeof announcements[0]) => {
    if (isPreparing) return;
    setTextId(ann.contentId);
    setTextEn(ann.contentEn);
    const voiceParts = (ann.voice || "Pria").split("/");
    setVoice(voiceParts[0]);
    setVoiceEn(voiceParts[1] || voiceParts[0]);
  };

  return (
    <aside className="hidden lg:flex w-[300px] h-full bg-gray-50/80 border-l border-gray-200/60 flex-col shrink-0 z-10 overflow-hidden">
      {/* Clock */}
      <div className="p-4 pb-3 shrink-0">
        <RealtimeClock />
      </div>

      {/* Stats Row */}
      <div className="px-4 pb-3 shrink-0">
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center p-2.5 bg-white rounded-xl border border-gray-100">
            <FileText className="w-4 h-4 text-[#004175] mb-1" />
            <p className="text-sm font-black text-[#004175] leading-none">{announcements.length}</p>
            <p className="text-[8px] text-gray-400 font-semibold mt-1 uppercase">Template</p>
          </div>
          <div className="flex flex-col items-center p-2.5 bg-white rounded-xl border border-gray-100">
            <Star className="w-4 h-4 text-[#F9BB00] mb-1" />
            <p className="text-sm font-black text-[#F9BB00] leading-none">{favorites.length}</p>
            <p className="text-[8px] text-gray-400 font-semibold mt-1 uppercase">Favorit</p>
          </div>
          <div className="flex flex-col items-center p-2.5 bg-white rounded-xl border border-gray-100">
            <CalendarClock className="w-4 h-4 text-green-600 mb-1" />
            <p className="text-sm font-black text-green-600 leading-none">{waitingSchedules.length}</p>
            <p className="text-[8px] text-gray-400 font-semibold mt-1 uppercase">Jadwal</p>
          </div>
        </div>
      </div>

      {/* Antrian Pengumuman */}
      {announcementQueue.length > 0 && (
        <div className="px-4 pb-3 shrink-0">
          <div className="bg-blue-50/70 border border-blue-100 rounded-2xl overflow-hidden shadow-xs">
            <div className="flex items-center justify-between px-3 py-2 bg-[#004175]/10 border-b border-blue-100/60">
              <div className="flex items-center gap-1.5">
                <ListOrdered className="w-3.5 h-3.5 text-[#004175]" />
                <span className="text-[10px] font-black text-[#004175] uppercase tracking-wider">Antrian</span>
                <span className="text-[9px] font-bold text-white bg-[#004175] px-1.5 py-0.5 rounded-full">{announcementQueue.length}</span>
              </div>
              <button
                onClick={clearQueue}
                disabled={isPreparing}
                title="Bersihkan antrian"
                className="p-1 hover:bg-white rounded-lg transition-colors text-gray-400 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-blue-100/60 max-h-[160px] overflow-y-auto styled-scrollbar">
              {announcementQueue.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-white/50 hover:bg-white transition-colors">
                  <span className="text-[9px] font-black text-[#004175]/60 w-4 shrink-0">{idx + 1}</span>
                  <p className="flex-1 text-[10px] font-semibold text-[#004175] truncate">{item.label}</p>
                  <button
                    onClick={() => removeFromQueue(item.id)}
                    disabled={isPreparing}
                    title="Hapus dari antrian"
                    className="p-0.5 hover:bg-red-50 rounded transition-colors text-gray-400 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Templates Header + Filter + Search */}
      <div className="px-4 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Megaphone className="w-3.5 h-3.5 text-[#004175]" />
            <h2 className="text-[10px] font-black text-[#004175] uppercase tracking-[0.1em]">Templates</h2>
          </div>
          <span className="text-[9px] font-bold text-gray-400 bg-gray-200/60 px-1.5 py-0.5 rounded">
            {filtered.length}
          </span>
        </div>
        {/* Filter Tabs */}
        <div className="flex gap-1 mb-2 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setFilter("all")}
            disabled={isPreparing}
            className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[10px] font-bold transition-all
              ${filter === "all" ? "bg-white text-[#004175] shadow-sm" : "text-gray-400 hover:text-gray-600"}
              ${isPreparing ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <FileText className="w-3 h-3" />
            Semua
          </button>
          <button
            onClick={() => setFilter("favorites")}
            disabled={isPreparing}
            className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[10px] font-bold transition-all
              ${filter === "favorites" ? "bg-white text-[#F9BB00] shadow-sm" : "text-gray-400 hover:text-gray-600"}
              ${isPreparing ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <Star className="w-3 h-3" />
            Favorit
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            disabled={isPreparing}
            placeholder="Cari template..."
            aria-label="Search templates"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] text-gray-600 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#004175]/10 focus:border-[#004175]/30 transition-all"
          />
        </div>
      </div>

      {/* Template List */}
      <div className="flex-1 min-h-0 overflow-y-auto styled-scrollbar px-4 pb-4">
        <div className="flex flex-col gap-1.5">
          {isLoading ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-[#004175] rounded-full animate-spin" />
              <p className="text-[10px] text-gray-400">Memuat...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-7 h-7 text-gray-200 mx-auto mb-2" />
              <p className="text-[10px] text-gray-400">
                {search ? "Tidak ditemukan" : "Belum ada template"}
              </p>
            </div>
          ) : (
            filtered.map((ann) => (
              <motion.button
                key={ann.id}
                whileHover={{ x: 2 }}
                transition={{ duration: 0.15 }}
                disabled={isPreparing}
                className={`flex items-start gap-2.5 p-2.5 rounded-xl text-left w-full transition-all duration-150 group border
                  ${ann.isFavorite
                    ? 'bg-[#F9BB00]/5 border-[#F9BB00]/15 hover:bg-[#F9BB00]/10 hover:border-[#F9BB00]/30'
                    : 'bg-white border-gray-100 hover:border-[#004175]/20 hover:shadow-sm'}
                  ${isPreparing ? 'opacity-45 cursor-not-allowed pointer-events-none' : ''}`}
                onClick={() => handleLoad(ann)}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5
                  ${ann.isFavorite ? 'bg-[#F9BB00]/15' : 'bg-[#004175]/8'}`}>
                  <Megaphone className={`w-3.5 h-3.5 ${ann.isFavorite ? 'text-[#F9BB00]' : 'text-[#004175]/60'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-gray-700 text-[11px] truncate flex-1">{ann.title}</h4>
                    {ann.isFavorite && <Star className="w-2.5 h-2.5 fill-[#F9BB00] text-[#F9BB00] shrink-0" />}
                  </div>
                  <p className="text-gray-400 text-[9px] truncate mt-0.5">
                    <span className="font-semibold text-gray-500">ID:</span> {ann.contentId || "-"}
                  </p>
                  <p className="text-gray-400 text-[9px] truncate mt-0.5">
                    <span className="font-semibold text-gray-500">EN:</span> {ann.contentEn || "-"}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[8px] font-bold text-gray-300 uppercase tracking-wider bg-gray-100 px-1.5 py-0.5 rounded">
                      {(ann.voice || "Pria").split("/")[0]}
                    </span>
                    <span className="text-[8px] font-bold text-gray-300 uppercase tracking-wider bg-gray-100 px-1.5 py-0.5 rounded">
                      {ann.contentId ? "ID" : ""}{ann.contentId && ann.contentEn ? " + " : ""}{ann.contentEn ? "EN" : ""}
                    </span>
                  </div>
                </div>
                <PlayCircle className="w-4 h-4 text-gray-200 group-hover:text-[#004175] transition-colors shrink-0 mt-1" />
              </motion.button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
