import { Sidebar } from "@/components/layout/Sidebar";
import { RightPanel, CompactClock } from "@/components/layout/RightPanel";
import { WaveformMonitor } from "@/components/ui/WaveformMonitor";
import { InputArea } from "@/components/dashboard/InputArea";
import { useState, useEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import { Music, SkipForward, Square, Volume2, Megaphone } from "lucide-react";

function useInternetStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch("https://www.google.com/generate_204", {
          mode: "no-cors",
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        setIsOnline(true);
      } catch {
        setIsOnline(false);
      }
    };

    check();
    const interval = setInterval(check, 15000);
    const goOnline = () => { check(); };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}

export default function Dashboard() {
  const isOnline = useInternetStatus();
  const { isOutroPlaying, currentOutro, stopOutroMusic, skipOutroTrack, outroVolume, setOutroVolume, announcementQueue } = useAppContext();
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);

  return (
    <div className="h-full w-full bg-neutral-900 flex p-1.5 sm:p-3 lg:p-4 font-sans selection:bg-[#F9BB00] selection:text-[#004175]">
      {/* Outer Fixed Frame */}
      <div className="flex-1 w-full max-w-[2560px] mx-auto bg-gray-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative ring-1 ring-white/10">
        
        <Sidebar />
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-transparent relative z-0">
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-yellow-500/5 rounded-full -ml-48 -mb-48 blur-3xl pointer-events-none" />
          
          <main className="flex-1 overflow-y-auto md:overflow-hidden flex flex-col p-3 sm:p-4 md:p-5 lg:p-6 xl:p-8 gap-3 sm:gap-4 relative z-10 styled-scrollbar">
            <div className="flex flex-row items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h2 className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Workspace</h2>
                <h1 className="text-lg sm:text-2xl lg:text-3xl font-black text-[#004175] tracking-tight truncate">Control Dashboard</h1>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* Jam ringkas: tampil saat panel kanan (berisi jam besar) tersembunyi */}
                <CompactClock className="xl:hidden" />
                <div
                  title={isOnline ? 'System Ready' : 'Offline'}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2 rounded-2xl border shadow-sm transition-all duration-500 ${
                  isOnline
                    ? 'bg-white border-gray-100'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${
                    isOnline
                      ? 'bg-green-500 animate-pulse'
                      : 'bg-red-500 animate-pulse'
                  }`} />
                  <span className={`hidden sm:inline text-[10px] font-bold uppercase tracking-wider transition-colors duration-500 ${
                    isOnline
                      ? 'text-[#004175]'
                      : 'text-red-600'
                  }`}>
                    {isOnline ? 'System Ready' : 'Offline'}
                  </span>
                </div>
                {/* Tombol Template: hanya di layar < xl saat panel kanan tersembunyi */}
                <button
                  type="button"
                  onClick={() => setTemplateDrawerOpen(true)}
                  aria-label="Buka template pengumuman"
                  title="Template Pengumuman"
                  className="xl:hidden relative flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl bg-[#004175] hover:bg-[#003562] text-white shadow-sm transition-all active:scale-95"
                >
                  <Megaphone className="w-3.5 h-3.5 text-[#F9BB00]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Template</span>
                  {announcementQueue.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[9px] font-black bg-[#F9BB00] text-[#004175] rounded-full ring-2 ring-gray-50">
                      {announcementQueue.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Outro Music Playing Banner */}
            {isOutroPlaying && currentOutro && (
              <div className="bg-gradient-to-r from-[#004175] via-[#003159] to-[#002a4d] text-white p-3.5 sm:p-4 rounded-2xl shadow-xl border border-blue-400/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                    <Music className="w-5 h-5 text-[#F9BB00] animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-[#F9BB00] text-[#004175] px-2 py-0.5 rounded-full shrink-0">
                        Musik Penutup
                      </span>
                      {currentOutro.totalTracks && currentOutro.totalTracks > 1 ? (
                        <span className="text-[10px] font-bold bg-white/15 text-blue-100 px-2 py-0.5 rounded-full">
                          Lagu {(currentOutro.currentIndex ?? 0) + 1} dari {currentOutro.totalTracks}
                        </span>
                      ) : null}
                      {currentOutro.scheduleTitle && (
                        <span className="text-xs text-blue-200/80 truncate">
                          Jadwal: {currentOutro.scheduleTitle}
                        </span>
                      )}
                    </div>
                    <p className="font-bold text-sm text-white truncate mt-0.5">
                      🎵 {currentOutro.name}
                    </p>
                    {currentOutro.nextTrackName && (
                      <p className="text-[10px] text-blue-200/70 truncate mt-0.5">
                        Berikutnya: <span className="text-white/90 font-medium">{currentOutro.nextTrackName}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto w-full sm:w-auto justify-between sm:justify-end shrink-0">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-blue-200 shrink-0" />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={outroVolume}
                      onChange={e => setOutroVolume(parseFloat(e.target.value))}
                      className="w-16 sm:w-20 accent-[#F9BB00] h-1.5 bg-blue-950/60 rounded-lg cursor-pointer"
                      title={`Volume Musik: ${Math.round(outroVolume * 100)}%`}
                    />
                  </div>

                  <div className="text-right font-mono shrink-0">
                    <span className="text-xs font-black text-blue-200">
                      {Math.floor(currentOutro.remainingSeconds / 60)}:
                      {(currentOutro.remainingSeconds % 60).toString().padStart(2, '0')}
                    </span>
                    <span className="text-[9px] text-white/50 block">sisa lagu</span>
                  </div>

                  {Boolean(currentOutro.totalTracks && currentOutro.totalTracks > 1 && (currentOutro.currentIndex ?? 0) + 1 < currentOutro.totalTracks) && (
                    <button
                      onClick={skipOutroTrack}
                      className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs shadow-md transition-all active:scale-95 shrink-0"
                      title="Lewati ke lagu berikutnya"
                    >
                      <SkipForward className="w-3.5 h-3.5 fill-white" />
                      <span className="hidden sm:inline">Lewati</span>
                    </button>
                  )}

                  <button
                    onClick={stopOutroMusic}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs shadow-md transition-all active:scale-95 shrink-0"
                    title="Hentikan pemutaran musik penutup"
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                    <span>Hentikan</span>
                  </button>
                </div>
              </div>
            )}

            <InputArea />
          </main>

          
          {/* Bottom Waveform Monitor */}
          <WaveformMonitor />
        </div>

        <RightPanel drawerOpen={templateDrawerOpen} onDrawerOpenChange={setTemplateDrawerOpen} />

      </div>
    </div>
  );
}
