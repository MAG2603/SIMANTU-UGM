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
    <aside className="w-full md:w-20 xl:w-60 h-auto md:h-full ugm-gradient text-white flex flex-row md:flex-col items-center justify-between md:justify-start xl:items-start px-3 py-2.5 md:px-0 md:py-6 transition-all duration-300 z-10 shrink-0 gap-2">
      <div className="px-1 md:px-3 xl:px-5 md:mb-6 xl:mb-8 w-auto md:w-full shrink-0">
        <div className="flex items-center gap-2.5 justify-center xl:justify-start">
          <img src="/logo_aplikasi.png" alt="SIMANTU" className="w-9 h-9 md:w-10 md:h-10 rounded-xl object-contain shadow-lg shadow-black/20 shrink-0" />
          <div className="hidden sm:block md:hidden xl:block leading-none">
            <h1 className="font-display font-black text-sm xl:text-[15px] tracking-wide text-white">
              SIMANTU<span className="text-[#F9BB00]">.</span>
            </h1>
            <p className="text-[8px] font-semibold text-white/50 uppercase tracking-[0.12em] mt-1 hidden xl:block">
              Perpustakaan &amp; Arsip UGM
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 md:w-full flex flex-row md:flex-col items-center justify-center md:justify-start md:items-stretch gap-1 sm:gap-1.5 md:gap-2 px-1 md:px-2.5 xl:px-4 overflow-x-auto md:overflow-visible">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = location === item.path;
          return (
            <Link key={idx} href={item.path}>
              <button
                title={item.label}
                className={`
                  flex items-center justify-center xl:justify-start gap-2 xl:gap-3.5 w-auto md:w-full min-w-[42px] sm:min-w-[48px] md:min-w-0 p-2 sm:p-2.5 md:p-3 xl:px-4 xl:py-3 rounded-xl transition-all duration-200 group relative
                  ${isActive 
                    ? 'bg-white/10 text-white' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'}
                `}
              >
                {isActive && (
                  <div className="hidden md:block absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-7 bg-[#F9BB00] rounded-r-full shadow-[0_0_10px_rgba(249,187,0,0.5)]" />
                )}
                {isActive && (
                  <div className="md:hidden absolute bottom-0 left-1/2 -translate-x-1/2 h-1 w-6 bg-[#F9BB00] rounded-t-full shadow-[0_0_8px_rgba(249,187,0,0.5)]" />
                )}
                <Icon className={`w-5 h-5 md:w-6 md:h-6 shrink-0 transition-transform duration-200 ${isActive ? 'scale-110 text-[#F9BB00]' : 'group-hover:scale-110'}`} />
                <span className="font-medium text-xs xl:text-sm hidden xl:block truncate">{item.label}</span>
              </button>
            </Link>
          );
        })}

      </nav>

      <div className="md:mt-auto px-1 md:px-2.5 xl:px-6 w-auto md:w-full flex flex-row md:flex-col items-center xl:items-start justify-center md:justify-start gap-2 shrink-0">
        <div className="hidden md:block w-full h-px bg-white/10" />
        <button
          onClick={() => setShowAbout(true)}
          title="Tentang Aplikasi"
          className="flex items-center justify-center xl:justify-start gap-2.5 w-auto md:w-full p-2 xl:px-3 xl:py-2 rounded-lg transition-all duration-200 text-white/50 hover:text-white/80 hover:bg-white/5"
        >
          <Info className="w-4 h-4 shrink-0" />
          <span className="font-medium text-xs hidden xl:block">About</span>
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
