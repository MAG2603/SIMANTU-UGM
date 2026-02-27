import { useAppContext } from "@/context/AppContext";
import { Activity } from "lucide-react";

export function WaveformMonitor() {
  const { isPlaying } = useAppContext();

  // Create an array of 40 bars for the waveform
  const bars = Array.from({ length: 40 });

  return (
    <div className={`h-20 w-full shrink-0 transition-all duration-500 flex items-center justify-between px-8 border-t border-white/10
      ${isPlaying ? 'bg-[#004175]' : 'bg-[#004175] opacity-90'}`}
    >
      <div className="flex items-center gap-4 w-48">
        <div className={`p-2 rounded-full ${isPlaying ? 'bg-[#F9BB00]/20 text-[#F9BB00]' : 'bg-white/5 text-white/50'}`}>
          <Activity className={`w-5 h-5 ${isPlaying ? 'animate-pulse' : ''}`} />
        </div>
        <div>
          <p className="text-xs font-semibold text-white uppercase tracking-wider">Status</p>
          <p className={`text-sm font-bold ${isPlaying ? 'text-[#F9BB00]' : 'text-white/50'}`}>
            {isPlaying ? 'BROADCASTING...' : 'STANDBY'}
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center gap-[3px] h-full py-4">
        {bars.map((_, i) => {
          // Generate a deterministic pseudo-random height for variety
          const isHighlight = i % 7 === 0;
          const delayClass = `delay-${(i % 5) + 1}`;
          
          return (
            <div 
              key={i} 
              className={`w-1.5 rounded-full transition-all duration-300 wave-bar ${delayClass}
                ${isPlaying ? 'h-full' : 'h-[20%] opacity-20 !animation-none'}
                ${isHighlight ? 'bg-[#F9BB00]' : 'bg-white/80'}
              `}
              style={{
                animationPlayState: isPlaying ? 'running' : 'paused'
              }}
            />
          );
        })}
      </div>

      <div className="w-48 flex justify-end">
        {isPlaying && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Live</span>
          </div>
        )}
      </div>
    </div>
  );
}
