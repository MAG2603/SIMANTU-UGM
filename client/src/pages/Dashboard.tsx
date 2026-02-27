import { Sidebar } from "@/components/layout/Sidebar";
import { RightPanel } from "@/components/layout/RightPanel";
import { WaveformMonitor } from "@/components/ui/WaveformMonitor";
import { InputArea } from "@/components/dashboard/InputArea";
import { Library } from "@/components/dashboard/Library";

export default function Dashboard() {
  return (
    <div className="h-screen w-screen bg-neutral-900 flex p-2 sm:p-4 font-sans selection:bg-[#F9BB00] selection:text-[#004175]">
      {/* Outer Fixed Frame */}
      <div className="flex-1 w-full max-w-[1920px] mx-auto bg-gray-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative ring-1 ring-white/10">
        
        <Sidebar />
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-transparent relative z-0">
          
          <main className="flex-1 overflow-hidden flex flex-col p-6 lg:p-8 gap-8">
            <InputArea />
            <Library />
          </main>
          
          {/* Bottom Waveform Monitor */}
          <WaveformMonitor />
        </div>

        <RightPanel />

      </div>
    </div>
  );
}
