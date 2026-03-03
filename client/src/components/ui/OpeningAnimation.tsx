import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity } from "lucide-react";

export function OpeningAnimation({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => onComplete(), 3200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#004175] flex items-center justify-center overflow-hidden">
      <AnimatePresence mode="wait">
        {phase === 0 && (
          <motion.div
            key="logo"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="w-20 h-20 rounded-2xl bg-[#F9BB00] flex items-center justify-center shadow-2xl shadow-black/20">
              <Activity className="w-10 h-10 text-[#004175]" />
            </div>
          </motion.div>
        )}

        {phase === 1 && (
          <motion.div
            key="text"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="text-center px-6"
          >
            <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-4">
              SIMANTU<span className="text-[#F9BB00]">.</span>
            </h1>
            <div className="h-px w-24 bg-[#F9BB00] mx-auto mb-4" />
            <p className="text-[#F9BB00] font-bold text-sm md:text-base tracking-[0.3em] uppercase">
              Sistem Informasi Pengumuman Terpadu
            </p>
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
                transition={{ duration: 1, ease: "easeInOut" }}
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
      </div>
    </div>
  );
}
