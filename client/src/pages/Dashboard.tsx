import { Sidebar } from "@/components/layout/Sidebar";
import { RightPanel } from "@/components/layout/RightPanel";
import { WaveformMonitor } from "@/components/ui/WaveformMonitor";
import { InputArea } from "@/components/dashboard/InputArea";
import { useState, useEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import { Music, SkipForward, Square, Volume2 } from "lucide-react";

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
  const { isOutroPlaying, currentOutro, stopOutroMusic, skipOutroTrack, outroVolume, setOutroVolume } = useAppContext();

  return (
    <div className="h-full w-full bg-neutral-900 flex p-2 sm:p-4 font-sans selection:bg-[#F9BB00] selection:text-[#004175]">
      {/* Outer Fixed Frame */}
      <div className="flex-1 w-full max-w-[1920px] mx-auto bg-gray-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative ring-1 ring-white/10">
        
        <Sidebar />
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-transparent relative z-0">
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-yellow-500/5 rounded-full -ml-48 -mb-48 blur-3xl pointer-events-none" />
          
          <main className="flex-1 overflow-hidden flex flex-col p-3 sm:p-4 md:p-5 lg:p-8 gap-3 sm:gap-4 md:gap-5 lg:gap-6 relative z-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em]">Workspace</h2>
                <h1 className="text-2xl sm:text-3xl font-black text-[#004175] tracking-tight">Control Dashboard</h1>
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border shadow-sm transition-all duration-500 ${
                  isOnline
                    ? 'bg-white border-gray-100'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${
                    isOnline
                      ? 'bg-green-500 animate-pulse'
                      : 'bg-red-500 animate-pulse'
                  }`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-500 ${
                    isOnline
                      ? 'text-[#004175]'
                      : 'text-red-600'
                  }`}>
                    {isOnline ? 'System Ready' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>

            {/* Outro Music Playing Banner */}
            {isOutroPlaying && currentOutro && (
              <div className="bg-gradient-to-r from-indigo-900 via-[#004175] to-[#002a4d] text-white p-3.5 sm:p-4 rounded-2xl shadow-xl border border-indigo-400/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
                    <Music className="w-5 h-5 text-[#F9BB00] animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-[#F9BB00] text-[#004175] px-2 py-0.5 rounded-full shrink-0">
                        Musik Penutup
                      </span>
                      {currentOutro.totalTracks && currentOutro.totalTracks > 1 ? (
                        <span className="text-[10px] font-bold bg-indigo-500/40 text-indigo-100 px-2 py-0.5 rounded-full">
                          Lagu {(currentOutro.currentIndex ?? 0) + 1} dari {currentOutro.totalTracks}
                        </span>
                      ) : null}
                      {currentOutro.scheduleTitle && (
                        <span className="text-xs text-indigo-200/80 truncate">
                          Jadwal: {currentOutro.scheduleTitle}
                        </span>
                      )}
                    </div>
                    <p className="font-bold text-sm text-white truncate mt-0.5">
                      🎵 {currentOutro.name}
                    </p>
                    {currentOutro.nextTrackName && (
                      <p className="text-[10px] text-indigo-200/70 truncate mt-0.5">
                        Berikutnya: <span className="text-white/90 font-medium">{currentOutro.nextTrackName}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto w-full sm:w-auto justify-between sm:justify-end shrink-0">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-indigo-200 shrink-0" />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={outroVolume}
                      onChange={e => setOutroVolume(parseFloat(e.target.value))}
                      className="w-16 sm:w-20 accent-[#F9BB00] h-1.5 bg-indigo-950/60 rounded-lg cursor-pointer"
                      title={`Volume Musik: ${Math.round(outroVolume * 100)}%`}
                    />
                  </div>

                  <div className="text-right font-mono shrink-0">
                    <span className="text-xs font-black text-indigo-200">
                      {Math.floor(currentOutro.remainingSeconds / 60)}:
                      {(currentOutro.remainingSeconds % 60).toString().padStart(2, '0')}
                    </span>
                    <span className="text-[9px] text-white/50 block">sisa lagu</span>
                  </div>

                  {Boolean(currentOutro.totalTracks && currentOutro.totalTracks > 1 && (currentOutro.currentIndex ?? 0) + 1 < currentOutro.totalTracks) && (
                    <button
                      onClick={skipOutroTrack}
                      className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white font-bold text-xs shadow-md transition-all active:scale-95 shrink-0"
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

        <RightPanel />

      </div>
    </div>
  );
}
