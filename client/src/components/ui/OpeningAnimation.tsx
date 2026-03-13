import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const shimmerKeyframes = {
  initial: { x: "-150%", opacity: 0 },
  animate: { x: "150%", opacity: [0, 1, 1, 0] },
};

export function OpeningAnimation({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 2500),
      setTimeout(() => setPhase(2), 5500),
      setTimeout(() => onComplete(), 8000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#004175] flex items-center justify-center overflow-hidden">
      <AnimatePresence mode="wait">
        {phase === 0 && (
          <motion.div
            key="logo"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.3, opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="flex flex-col items-center gap-6"
          >
            <div className="relative">
              <img src="/logo_aplikasi.png" alt="SIMANTU" className="w-36 h-36 rounded-3xl shadow-2xl shadow-black/30 object-contain" />
              {/* Shimmer overlay */}
              <div className="absolute inset-0 rounded-3xl overflow-hidden">
                <motion.div
                  initial={shimmerKeyframes.initial}
                  animate={shimmerKeyframes.animate}
                  transition={{ duration: 1.8, delay: 0.6, ease: "easeInOut" }}
                  className="absolute inset-0 w-1/2"
                  style={{
                    background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)",
                  }}
                />
              </div>
              {/* Glow ring */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: [0, 0.6, 0], scale: [0.8, 1.4, 1.6] }}
                transition={{ duration: 2, delay: 0.3, ease: "easeOut" }}
                className="absolute inset-0 rounded-3xl border-2 border-[#F9BB00]"
              />
            </div>
          </motion.div>
        )}

        {phase === 1 && (
          <motion.div
            key="text"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="text-center px-6"
          >
            <div className="relative inline-block">
              <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-4">
                SIMANTU<span className="text-[#F9BB00]">.</span>
              </h1>
              {/* Text shimmer */}
              <div className="absolute inset-0 overflow-hidden">
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "200%" }}
                  transition={{ duration: 2, delay: 0.5, ease: "easeInOut" }}
                  className="absolute inset-0 w-1/3"
                  style={{
                    background: "linear-gradient(105deg, transparent 20%, rgba(249,187,0,0.3) 50%, transparent 80%)",
                  }}
                />
              </div>
            </div>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: 96 }}
              transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
              className="h-px bg-[#F9BB00] mx-auto mb-4 overflow-hidden"
            />
            <motion.p
              initial={{ opacity: 0, letterSpacing: "0.1em" }}
              animate={{ opacity: 1, letterSpacing: "0.3em" }}
              transition={{ duration: 1.2, delay: 0.6, ease: "easeOut" }}
              className="text-[#F9BB00] font-bold text-sm md:text-base uppercase"
            >
              Sistem Informasi Pengumuman Terpadu
            </motion.p>
          </motion.div>
        )}

        {phase === 2 && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden relative">
              <motion.div
                initial={{ left: "-100%" }}
                animate={{ left: "100%" }}
                transition={{ duration: 2, ease: "easeInOut" }}
                className="absolute inset-0 bg-[#F9BB00]"
              />
            </div>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
              Initializing System
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background patterns */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-400/5 rounded-full blur-3xl" />
        <motion.div
          animate={{ opacity: [0.03, 0.08, 0.03], scale: [1, 1.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#F9BB00]/10 rounded-full blur-3xl"
        />
      </div>
    </div>
  );
}
