import { LayoutDashboard, Library as LibraryIcon, Calendar, Settings, Activity } from "lucide-react";
import { useApiStatus } from "@/hooks/use-status";
import { useLocation, Link } from "wouter";

export function Sidebar() {
  const { data: status } = useApiStatus();
  const isConnected = status?.connected ?? false;
  const [location] = useLocation();

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: LibraryIcon, label: "Library", path: "/library" },
    { icon: Calendar, label: "Scheduler", path: "/scheduler" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ];

  return (
    <aside className="w-20 md:w-24 lg:w-64 h-full ugm-gradient text-white flex flex-col items-center lg:items-start py-8 transition-all duration-300 z-10 shrink-0">
      <div className="px-0 lg:px-8 mb-12 flex items-center justify-center lg:justify-start w-full gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#F9BB00] flex items-center justify-center shadow-lg shadow-[#F9BB00]/20">
          <Activity className="w-6 h-6 text-[#004175]" />
        </div>
        <div className="hidden lg:block">
          <h1 className="font-display font-bold text-2xl tracking-wide leading-none">
            SIMANTU<span className="text-[#F9BB00]">.</span>
          </h1>
          <p className="text-[10px] font-medium text-white/50 uppercase tracking-tighter mt-1">
            Univ. Gadjah Mada
          </p>
        </div>
      </div>

      <nav className="flex-1 w-full flex flex-col gap-2 px-3 lg:px-4">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = location === item.path;
          return (
            <Link key={idx} href={item.path}>
              <a
                className={`
                  flex items-center gap-4 w-full p-3 lg:px-4 lg:py-3 rounded-xl transition-all duration-200 group relative
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
              </a>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-0 lg:px-8 w-full flex flex-col items-center lg:items-start gap-4">
        <div className="w-full h-px bg-white/10 mb-2" />
        <div className="flex items-center gap-3 bg-black/20 px-3 py-2 rounded-lg border border-white/5 backdrop-blur-sm">
          <div className="relative flex items-center justify-center w-3 h-3">
            {isConnected && <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-75" />}
            <div className={`relative w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>
          <span className="text-xs font-medium text-white/80 hidden lg:block">
            {isConnected ? 'System Online' : 'Connecting...'}
          </span>
        </div>
      </div>
    </aside>
  );
}
