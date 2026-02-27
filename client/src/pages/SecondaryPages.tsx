import { Sidebar } from "@/components/layout/Sidebar";
import { RightPanel } from "@/components/layout/RightPanel";
import { Library } from "@/components/dashboard/Library";
import { useSchedules } from "@/hooks/use-schedules";
import { Clock, ListTodo, Zap } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

export default function LibraryPage() {
  return (
    <div className="flex h-screen w-full bg-[#f8fafc] overflow-hidden p-4">
      <div className="flex w-full h-full bg-white rounded-2xl shadow-xl shadow-blue-900/5 border border-gray-100 overflow-hidden">
        <Sidebar />
        
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-20 flex items-center justify-between px-8 border-b border-gray-100 shrink-0">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#004175]">Announcement Library</h1>
              <p className="text-sm text-gray-500">Manage your saved announcements</p>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8">
            <Library />
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
    <div className="flex h-screen w-full bg-[#f8fafc] overflow-hidden p-4">
      <div className="flex w-full h-full bg-white rounded-2xl shadow-xl shadow-blue-900/5 border border-gray-100 overflow-hidden">
        <Sidebar />
        
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-20 flex items-center justify-between px-8 border-b border-gray-100 shrink-0">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#004175]">Daily Scheduler</h1>
              <p className="text-sm text-gray-500">Timeline and queue management</p>
            </div>
            
            <div className="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
              <span className="text-sm font-bold text-[#004175]">Auto-Pilot Mode</span>
              <button 
                onClick={() => setAutoPilot(!autoPilot)}
                className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${autoPilot ? 'bg-[#F9BB00]' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 ${autoPilot ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-blue-50 rounded-xl text-[#004175]"><Clock className="w-6 h-6" /></div>
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase">Next Play</p>
                    <p className="text-lg font-bold text-[#004175]">16:00 PM</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-yellow-50 rounded-xl text-[#F9BB00]"><ListTodo className="w-6 h-6" /></div>
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase">In Queue</p>
                    <p className="text-lg font-bold text-[#004175]">{schedules?.filter(s => s.status === 'Waiting').length || 0} Items</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-green-50 rounded-xl text-green-600"><Zap className="w-6 h-6" /></div>
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase">System</p>
                    <p className="text-lg font-bold text-[#004175]">Ready</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                  <h3 className="font-bold text-[#004175]">Upcoming Queue</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {schedules?.map((schedule) => (
                    <div key={schedule.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="text-lg font-mono font-bold text-[#004175]">
                          {format(new Date(schedule.playTime), 'HH:mm')}
                        </div>
                        <div>
                          <p className="font-bold text-gray-800">Scheduled Announcement #{schedule.announcementId}</p>
                          <p className="text-xs text-gray-500">Status: {schedule.status}</p>
                        </div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${schedule.status === 'Waiting' ? 'bg-yellow-100 text-[#bd8e00]' : 'bg-gray-100 text-gray-500'}`}>
                        {schedule.status}
                      </div>
                    </div>
                  ))}
                  {(!schedules || schedules.length === 0) && (
                    <div className="p-12 text-center text-gray-400">No scheduled announcements</div>
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
    <div className="flex h-screen w-full bg-[#f8fafc] overflow-hidden p-4">
      <div className="flex w-full h-full bg-white rounded-2xl shadow-xl shadow-blue-900/5 border border-gray-100 overflow-hidden">
        <Sidebar />
        
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-20 flex items-center justify-between px-8 border-b border-gray-100 shrink-0">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#004175]">Settings</h1>
              <p className="text-sm text-gray-500">System configuration and preferences</p>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-2xl mx-auto space-y-8">
              <section className="space-y-4">
                <h3 className="font-bold text-[#004175] text-lg border-b pb-2">System Preferences</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-bold text-[#004175]">Auto-Detect Language</p>
                      <p className="text-sm text-gray-500">Automatically identify ID/EN text on input</p>
                    </div>
                    <div className="relative w-12 h-6 bg-[#004175] rounded-full"><div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full" /></div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-bold text-[#004175]">Dark Mode</p>
                      <p className="text-sm text-gray-500">Switch between light and dark themes</p>
                    </div>
                    <div className="relative w-12 h-6 bg-gray-200 rounded-full"><div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full" /></div>
                  </div>
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
