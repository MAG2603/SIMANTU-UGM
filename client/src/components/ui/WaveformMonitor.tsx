import { useAppContext } from "@/context/AppContext";
import { Activity, Loader2 } from "lucide-react";
import { useRef, useEffect, useState } from "react";

const BAR_COUNT = 72;
const MIN_H = 0.03;
const ATTACK = 0.38;
const RELEASE = 0.1;
const PEAK_FALL = 0.018;

type SpectrumFrame = {
  levels: number[];
  peaks: number[];
};

type BarPalette = {
  track: string;
  fill: string;
  cap: string;
  glowClass: string;
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function emptyFrame(): SpectrumFrame {
  return {
    levels: new Array(BAR_COUNT).fill(MIN_H),
    peaks: new Array(BAR_COUNT).fill(MIN_H),
  };
}

function buildLogBins(analyser: AnalyserNode, count: number): Array<[number, number]> {
  const binCount = analyser.frequencyBinCount;
  const nyquist = analyser.context.sampleRate / 2;
  const minHz = 45;
  const maxHz = Math.min(12000, nyquist);
  const logMin = Math.log10(minHz);
  const logMax = Math.log10(maxHz);

  return Array.from({ length: count }, (_, i) => {
    const lowLog = logMin + (i / count) * (logMax - logMin);
    const highLog = logMin + ((i + 1) / count) * (logMax - logMin);
    const lowBin = Math.floor((Math.pow(10, lowLog) / nyquist) * binCount);
    const highBin = Math.ceil((Math.pow(10, highLog) / nyquist) * binCount);
    const lo = clamp(lowBin, 0, binCount - 1);
    const hi = clamp(Math.max(lo + 1, highBin), 1, binCount);
    return [lo, hi];
  });
}

function resolveBarPalette(isPlaying: boolean, isPreparing: boolean): BarPalette {
  if (isPlaying) {
    return {
      track: "rgba(255,255,255,0.07)",
      fill: "#95D8FF",
      cap: "#ECF8FF",
      glowClass: "drop-shadow-[0_0_4px_rgba(149,216,255,0.24)]",
    };
  }

  if (isPreparing) {
    return {
      track: "rgba(255,255,255,0.06)",
      fill: "#F9BB00",
      cap: "#FFE6A4",
      glowClass: "drop-shadow-[0_0_4px_rgba(249,187,0,0.22)]",
    };
  }

  return {
    track: "rgba(255,255,255,0.05)",
    fill: "#ACD6EF",
    cap: "#E0F3FF",
    glowClass: "",
  };
}

export function WaveformMonitor() {
  const { isPlaying, isPreparing, analyserNode } = useAppContext();
  const [frame, setFrame] = useState<SpectrumFrame>(emptyFrame);
  const rafRef = useRef<number>(0);
  const levelsRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const peaksRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const idleTextureRef = useRef<Float32Array>(
    Float32Array.from({ length: BAR_COUNT }, (_, i) => 0.5 + 0.5 * Math.sin(i * 1.618))
  );

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);

    if (isPlaying && analyserNode) {
      const bins = buildLogBins(analyserNode, BAR_COUNT);
      const freqData = new Uint8Array(analyserNode.frequencyBinCount);
      levelsRef.current.fill(0);
      peaksRef.current.fill(0);

      const tick = () => {
        analyserNode.getByteFrequencyData(freqData);

        const levels = new Array<number>(BAR_COUNT);
        const peaks = new Array<number>(BAR_COUNT);
        for (let i = 0; i < BAR_COUNT; i++) {
          const [lo, hi] = bins[i];
          let sqSum = 0;
          const count = hi - lo;
          for (let b = lo; b < hi; b++) {
            const n = freqData[b] / 255;
            sqSum += n * n;
          }

          const rms = count > 0 ? Math.sqrt(sqSum / count) : 0;
          const shaped = Math.pow(rms, 0.58);
          const target = clamp((shaped - 0.015) / 0.985, 0, 1);

          const prev = levelsRef.current[i];
          const level = target > prev
            ? prev + (target - prev) * ATTACK
            : prev + (target - prev) * RELEASE;

          const peak = level >= peaksRef.current[i]
            ? level
            : Math.max(level, peaksRef.current[i] - PEAK_FALL);

          levelsRef.current[i] = level;
          peaksRef.current[i] = peak;
          levels[i] = clamp(level, MIN_H, 1);
          peaks[i] = clamp(peak, MIN_H, 1);
        }

        setFrame({ levels, peaks });
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    }

    if (isPreparing) {
      const loading = (ts: number) => {
        const t = ts * 0.001;
        const cursor = (t * 16) % BAR_COUNT;
        const levels = new Array<number>(BAR_COUNT);
        const peaks = new Array<number>(BAR_COUNT);

        for (let i = 0; i < BAR_COUNT; i++) {
          const dist = Math.min(
            Math.abs(i - cursor),
            Math.abs(i - cursor + BAR_COUNT),
            Math.abs(i - cursor - BAR_COUNT)
          );
          const glow = Math.exp(-(dist * dist) / 28);
          const base = MIN_H + 0.01 * (0.5 + 0.5 * Math.sin(i * 0.41 + t * 2.3));
          const level = clamp(base + glow * 0.3, MIN_H, 0.42);
          levels[i] = level;
          peaks[i] = clamp(level + 0.03, MIN_H, 0.46);
        }

        setFrame({ levels, peaks });
        rafRef.current = requestAnimationFrame(loading);
      };

      rafRef.current = requestAnimationFrame(loading);
      return () => cancelAnimationFrame(rafRef.current);
    }

    const idle = (ts: number) => {
      const t = ts * 0.001;
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.55);
      const levels = new Array<number>(BAR_COUNT);
      const peaks = new Array<number>(BAR_COUNT);

      for (let i = 0; i < BAR_COUNT; i++) {
        const texture = 0.65 + 0.35 * idleTextureRef.current[i];
        const ripple =
          0.012 * Math.sin(i * 0.37 + t * 1.1) +
          0.008 * Math.sin(i * 0.91 - t * 0.8);
        const level = clamp(MIN_H + 0.015 + breathe * 0.035 * texture + ripple, MIN_H, 0.16);
        levels[i] = level;
        peaks[i] = clamp(level + 0.02, MIN_H, 0.2);
      }

      setFrame({ levels, peaks });
      rafRef.current = requestAnimationFrame(idle);
    };

    rafRef.current = requestAnimationFrame(idle);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, isPreparing, analyserNode]);

  const isActive = isPlaying || isPreparing;
  const statusText = isPreparing ? "MEMUAT AUDIO" : isPlaying ? "ON AIR" : "STANDBY";

  return (
    <div
      className="relative h-24 w-full shrink-0 flex items-center px-6 border-t overflow-hidden transition-colors duration-500 border-white/12 bg-gradient-to-r from-[#004175] via-[#003562] to-[#002a4d]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_58%)]" />

      {/* Status */}
      <div className="relative z-10 flex items-center gap-3 w-44 shrink-0">
        <div
          className={`p-1.5 rounded-full border ${isPlaying
            ? 'bg-white/14 text-white border-white/28'
            : isPreparing
              ? 'bg-white/12 text-white border-white/24'
              : 'bg-white/10 text-white border-white/20'}`}
        >
          {isPreparing
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Activity className={`w-4 h-4 ${isPlaying ? 'animate-pulse' : ''}`} />
          }
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">Status</p>
          <p className="text-xs font-semibold tracking-wide text-white">{statusText}</p>
        </div>
      </div>

      {/* Spectrum */}
      <div className="relative z-10 flex-1 h-full mx-3 py-2.5">
        <div className="pointer-events-none absolute inset-y-2.5 inset-x-0 rounded-md border border-white/18 bg-white/8" />
        <div className="relative h-full flex items-end gap-[1.5px] px-2">
          {frame.levels.map((h, i) => {
            const peak = frame.peaks[i];
            const barHeight = Math.max(h * 100, MIN_H * 100);
            const peakPos = Math.max(0, Math.min(100, peak * 100));
            const capY = Math.max(0, 100 - peakPos - 2);
            const palette = resolveBarPalette(isPlaying, isPreparing);
            const fillOpacity = isPlaying
              ? clamp(0.28 + h * 0.72, 0.28, 1)
              : isPreparing
                ? clamp(0.2 + h * 0.66, 0.2, 0.86)
                : clamp(0.24 + h * 0.56, 0.24, 0.72);
            const capOpacity = isPlaying
              ? clamp(0.42 + peak * 0.58, 0.42, 1)
              : isPreparing
                ? clamp(0.36 + peak * 0.44, 0.36, 0.88)
                : clamp(0.34 + peak * 0.42, 0.34, 0.78);

            return (
              <div key={i} className="relative h-full flex-1 min-w-[2px]">
                <svg
                  className={`absolute inset-0 h-full w-full ${palette.glowClass}`}
                  viewBox="0 0 10 100"
                  preserveAspectRatio="none"
                >
                  <rect
                    x="0"
                    y="0"
                    width="10"
                    height="100"
                    rx="1.5"
                    fill={palette.track}
                  />
                  <rect
                    x="0"
                    y={100 - barHeight}
                    width="10"
                    height={barHeight}
                    rx="1.5"
                    fill={palette.fill}
                    opacity={fillOpacity}
                  />
                  <rect
                    x="0"
                    y={capY}
                    width="10"
                    height="2"
                    rx="1"
                    fill={palette.cap}
                    opacity={capOpacity}
                  />
                </svg>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right indicator */}
      <div className="relative z-10 w-44 shrink-0 flex justify-end">
        {isPreparing && (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-white/90 animate-spin" />
            <span className="text-[10px] font-semibold text-white/90 uppercase tracking-[0.16em]">Loading</span>
          </div>
        )}
        {isPlaying && !isPreparing && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-[10px] font-semibold text-red-300 uppercase tracking-[0.16em]">Live</span>
          </div>
        )}
        {!isActive && (
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300/85" />
            <span className="text-[10px] font-semibold text-white/85 uppercase tracking-[0.16em]">Ready</span>
          </div>
        )}
      </div>
    </div>
  );
}
