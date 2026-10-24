import { LayoutDashboard, Library as LibraryIcon, Calendar, Settings, Info, X } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Sidebar() {
  const [location] = useLocation();
  const [showAbout, setShowAbout] = useState(false);

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: LibraryIcon, label: "Library", path: "/library" },
    { icon: Calendar, label: "Scheduler", path: "/scheduler" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ];

  return (
    <>
    <aside className="w-full md:w-24 lg:w-64 h-auto md:h-full ugm-gradient text-white flex flex-col items-center lg:items-start py-4 md:py-8 transition-all duration-300 z-10 shrink-0">
      <div className="px-4 lg:px-5 mb-3 md:mb-10 w-full">
        <div className="flex items-center gap-3 justify-center lg:justify-start">
          <img src="/logo_aplikasi.png" alt="SIMANTU" className="w-10 h-10 rounded-xl object-contain shadow-lg shadow-black/20" />
          <div className="hidden lg:block leading-none">
            <h1 className="font-display font-black text-[15px] tracking-wide text-white">
              SIMANTU<span className="text-[#F9BB00]">.</span>
            </h1>
            <p className="text-[8px] font-semibold text-white/50 uppercase tracking-[0.12em] mt-1">
              Perpustakaan &amp; Arsip UGM
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 w-full flex flex-row md:flex-col items-center md:items-stretch gap-2 px-3 lg:px-4 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = location === item.path;
          return (
            <Link key={idx} href={item.path}>
              <button
                className={`
                  flex items-center justify-center lg:justify-start gap-4 w-auto md:w-full min-w-[52px] md:min-w-0 p-3 lg:px-4 lg:py-3 rounded-xl transition-all duration-200 group relative
                  ${isActive 
                    ? 'bg-white/10 text-white' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'}
                `}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-[#F9BB00] rounded-r-full shadow-[0_0_10px_rgba(249,187,0,0.5)]" />
                )}
                <Icon className={`w-6 h-6 shrink-0 transition-transform duration-200 ${isActive ? 'scale-110 text-[#F9BB00]' : 'group-hover:scale-110'}`} />
                <span className="font-medium text-sm hidden lg:block">{item.label}</span>
              </button>
            </Link>
          );
        })}

      </nav>

      <div className="mt-2 md:mt-auto px-0 lg:px-8 w-full flex flex-row md:flex-col items-center lg:items-start justify-center md:justify-start gap-3 pb-1 md:pb-0">
        <div className="hidden md:block w-full h-px bg-white/10" />
        <button
          onClick={() => setShowAbout(true)}
          className="flex items-center gap-3 w-auto md:w-full p-2 lg:px-3 lg:py-2 rounded-lg transition-all duration-200 text-white/40 hover:text-white/70 hover:bg-white/5"
        >
          <Info className="w-4 h-4 shrink-0" />
          <span className="font-medium text-xs hidden lg:block">About</span>
        </button>
      </div>
    </aside>

    {/* About Modal */}
    <AnimatePresence>
      {showAbout && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
            onClick={() => setShowAbout(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-br from-[#004175] to-[#002a4d] p-6 text-center relative">
              <button
                onClick={() => setShowAbout(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                title="Tutup"
              >
                <X className="w-4 h-4 text-white/60" />
              </button>
              <img src="/logo_aplikasi.png" alt="SIMANTU" className="w-16 h-16 rounded-2xl shadow-lg mx-auto mb-4 border-2 border-white/20" />
              <h2 className="font-display text-2xl font-black text-white mb-1">SIMANTU</h2>
              <p className="text-white/70 text-xs font-medium">Sistem Informasi Pengumuman Terpadu</p>
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mt-1">Perpustakaan dan Arsip UGM</p>
            </div>

            {/* Developer */}
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-5">
                <img src="/foto.jpg" alt="Pengembang" className="w-20 h-20 rounded-2xl object-cover shadow-lg border-3 border-gray-100" />
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pengembang</p>
                  <h4 className="font-black text-[#004175] text-lg leading-tight">Mohammad Affan Ghoffar</h4>
                  <p className="text-gray-500 text-sm font-medium mt-0.5">NIM: 230213600320</p>
                </div>
              </div>

              {/* University */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <img src="/UM.png" alt="Universitas Negeri Malang" className="h-14 w-auto object-contain" />
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Universitas</p>
                  <p className="font-bold text-[#004175] text-sm">Universitas Negeri Malang</p>
                  <p className="text-gray-400 text-xs">Sarjana Terapan Perpustakaan Digital</p>
                </div>
              </div>

              {/* App Info */}
              <p className="text-gray-400 text-xs text-center leading-relaxed">
                Aplikasi desktop untuk manajemen dan penjadwalan pengumuman otomatis menggunakan teknologi Text-to-Speech bilingual Indonesia &amp; English.
              </p>

              <div className="text-center">
                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                  &copy; {new Date().getFullYear()} SIMANTU &mdash; Perpustakaan dan Arsip UGM
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </>
  );
}
