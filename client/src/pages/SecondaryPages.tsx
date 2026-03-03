import { Sidebar } from "@/components/layout/Sidebar";
import { RightPanel } from "@/components/layout/RightPanel";
import { Library } from "@/components/dashboard/Library";
import { useSchedules } from "@/hooks/use-schedules";
import { Clock, ListTodo, Zap } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

export default function LibraryPage() {
  return (
    <div className="h-screen w-screen bg-neutral-900 flex p-2 sm:p-4 font-sans selection:bg-[#F9BB00] selection:text-[#004175]">
      {/* Outer Fixed Frame */}
      <div className="flex-1 w-full max-w-[1920px] mx-auto bg-gray-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative ring-1 ring-white/10">
        <Sidebar />
        
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-yellow-500/5 rounded-full -ml-48 -mb-48 blur-3xl pointer-events-none" />

          <header className="h-24 flex items-center justify-between px-8 border-b border-gray-100 bg-white/50 backdrop-blur-md shrink-0 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#004175]" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Repository</span>
              </div>
              <h1 className="font-display text-3xl font-black text-[#004175] tracking-tight">Announcement Library</h1>
              <p className="text-xs text-gray-500 font-medium">Digital archive for bilingual announcements</p>
            </div>
            <div className="flex items-center gap-4">
               <div className="h-10 w-px bg-gray-200" />
               <div className="text-right hidden sm:block">
                 <p className="text-[10px] font-bold text-gray-400 uppercase">Total Items</p>
                 <p className="text-lg font-black text-[#004175]">24</p>
               </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8 relative z-10">
            <div className="max-w-6xl mx-auto">
              <Library />
            </div>
          </div>
        </main>

        <RightPanel />
      </div>
    </div>
  );
}

export function SchedulerPage() {
  const { data: schedules } = useSchedules();
  const [autoPilot, setAutoPilot] = useState(false);

  return (
    <div className="h-screen w-screen bg-neutral-900 flex p-2 sm:p-4 font-sans selection:bg-[#F9BB00] selection:text-[#004175]">
      {/* Outer Fixed Frame */}
      <div className="flex-1 w-full max-w-[1920px] mx-auto bg-gray-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative ring-1 ring-white/10">
        <Sidebar />
        
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
          
          <header className="h-24 flex items-center justify-between px-8 border-b border-gray-100 bg-white/50 backdrop-blur-md shrink-0 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#F9BB00]" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Automation</span>
              </div>
              <h1 className="font-display text-3xl font-black text-[#004175] tracking-tight">Daily Scheduler</h1>
              <p className="text-xs text-gray-500 font-medium">Timeline and queue management system</p>
            </div>
            
            <div className="flex items-center gap-4 bg-white/80 p-1.5 rounded-2xl border border-gray-100 shadow-sm backdrop-blur-sm">
              <div className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all duration-300 ${autoPilot ? 'bg-[#004175] text-white' : 'text-gray-400'}`}>
                <Zap className={`w-4 h-4 ${autoPilot ? 'fill-[#F9BB00] text-[#F9BB00]' : ''}`} />
                <span className="text-xs font-bold uppercase">Auto-Pilot</span>
              </div>
              <button 
                onClick={() => setAutoPilot(!autoPilot)}
                className={`relative w-14 h-8 rounded-full transition-colors duration-500 ${autoPilot ? 'bg-[#004175]' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-lg transition-transform duration-500 ${autoPilot ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8 relative z-10">
            <div className="max-w-4xl mx-auto space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { icon: Clock, label: "Next Play", val: "16:00 PM", color: "blue" },
                  { icon: ListTodo, label: "In Queue", val: `${schedules?.filter(s => s.status === 'Waiting').length || 0} Items`, color: "yellow" },
                  { icon: Zap, label: "System", val: "Ready", color: "green" }
                ].map((stat, i) => (
                  <div key={i} className="group bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center gap-5">
                    <div className={`p-4 rounded-2xl transition-colors duration-300 ${stat.color === 'blue' ? 'bg-blue-50 text-[#004175] group-hover:bg-[#004175] group-hover:text-white' : stat.color === 'yellow' ? 'bg-yellow-50 text-[#F9BB00] group-hover:bg-[#F9BB00] group-hover:text-[#004175]' : 'bg-green-50 text-green-600 group-hover:bg-green-600 group-hover:text-white'}`}>
                      <stat.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-0.5">{stat.label}</p>
                      <p className="text-xl font-black text-[#004175]">{stat.val}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-xl shadow-blue-900/5 overflow-hidden">
                <div className="p-8 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-[#004175] rounded-full" />
                    <h3 className="font-black text-[#004175] tracking-tight uppercase text-sm">Upcoming Queue</h3>
                  </div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Live Updates</div>
                </div>
                <div className="divide-y divide-gray-50">
                  {schedules?.map((schedule) => (
                    <div key={schedule.id} className="p-6 hover:bg-gray-50/80 transition-all duration-200 flex items-center justify-between group">
                      <div className="flex items-center gap-8">
                        <div className="relative">
                          <div className="text-2xl font-mono font-black text-[#004175] tabular-nums">
                            {format(new Date(schedule.playTime), 'HH:mm')}
                          </div>
                          <div className="absolute -bottom-1 left-0 w-full h-0.5 bg-[#F9BB00] scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-lg tracking-tight">Scheduled Announcement #{schedule.announcementId}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status: {schedule.status}</p>
                          </div>
                        </div>
                      </div>
                      <div className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm ${schedule.status === 'Waiting' ? 'bg-[#F9BB00] text-[#004175]' : 'bg-gray-100 text-gray-400'}`}>
                        {schedule.status}
                      </div>
                    </div>
                  ))}
                  {(!schedules || schedules.length === 0) && (
                    <div className="p-20 text-center flex flex-col items-center gap-4">
                       <div className="p-6 bg-gray-50 rounded-full text-gray-300">
                         <Clock className="w-12 h-12" />
                       </div>
                       <p className="font-bold text-gray-400 uppercase text-xs tracking-[0.2em]">No scheduled announcements found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>

        <RightPanel />
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="h-screen w-screen bg-neutral-900 flex p-2 sm:p-4 font-sans selection:bg-[#F9BB00] selection:text-[#004175]">
      {/* Outer Fixed Frame */}
      <div className="flex-1 w-full max-w-[1920px] mx-auto bg-gray-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative ring-1 ring-white/10">
        <Sidebar />
        
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(0,65,117,0.05),transparent)] pointer-events-none" />
          
          <header className="h-24 flex items-center justify-between px-8 border-b border-gray-100 bg-white/50 backdrop-blur-md shrink-0 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-gray-400" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Preferences</span>
              </div>
              <h1 className="font-display text-3xl font-black text-[#004175] tracking-tight">Settings</h1>
              <p className="text-xs text-gray-500 font-medium">System configuration and user preferences</p>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8 relative z-10">
            <div className="max-w-2xl mx-auto space-y-12">
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#004175] text-white flex items-center justify-center font-bold text-sm">01</div>
                  <h3 className="font-black text-[#004175] text-lg uppercase tracking-tight">System Preferences</h3>
                </div>
                <div className="grid gap-4">
                  {[
                    { title: "Auto-Detect Language", desc: "Automatically identify ID/EN text on input", active: true },
                    { title: "Dark Mode", desc: "Switch between light and dark themes", active: false },
                    { title: "Voice Acceleration", desc: "Speed up processing for long texts", active: true }
                  ].map((setting, i) => (
                    <div key={i} className="flex items-center justify-between p-6 bg-white rounded-[1.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                      <div>
                        <p className="font-black text-[#004175] tracking-tight">{setting.title}</p>
                        <p className="text-xs text-gray-400 font-medium">{setting.desc}</p>
                      </div>
                      <button className={`relative w-14 h-8 rounded-full transition-colors duration-500 ${setting.active ? 'bg-[#004175]' : 'bg-gray-200'}`}>
                        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-500 ${setting.active ? 'right-1' : 'left-1'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </main>

        <RightPanel />
      </div>
    </div>
  );
}
