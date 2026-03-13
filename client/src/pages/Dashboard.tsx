import { Sidebar } from "@/components/layout/Sidebar";
import { RightPanel } from "@/components/layout/RightPanel";
import { WaveformMonitor } from "@/components/ui/WaveformMonitor";
import { InputArea } from "@/components/dashboard/InputArea";
export default function Dashboard() {

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
          
          <main className="flex-1 overflow-hidden flex flex-col p-4 sm:p-6 lg:p-8 gap-6 relative z-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em]">Workspace</h2>
                <h1 className="text-2xl sm:text-3xl font-black text-[#004175] tracking-tight">Control Dashboard</h1>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-2xl border border-gray-100 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-[#004175] uppercase tracking-wider">System Ready</span>
                </div>
              </div>
            </div>
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
