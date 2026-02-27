import { useState } from "react";
import { Clock, CheckCircle2, MoreVertical, Trash2, Zap } from "lucide-react";
import { format, isBefore, addHours } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useSchedules, useDeleteSchedule } from "@/hooks/use-schedules";
import { useAnnouncements } from "@/hooks/use-announcements";

export function RightPanel() {
  const [autoPilot, setAutoPilot] = useState(true);
  const { data: schedules = [], isLoading } = useSchedules();
  const { data: announcements = [] } = useAnnouncements();
  const deleteSchedule = useDeleteSchedule();

  // Sort schedules by playTime
  const sortedSchedules = [...schedules].sort((a, b) => a.playTime.getTime() - b.playTime.getTime());

  return (
    <aside className="w-80 h-full bg-white border-l border-gray-100 flex flex-col shrink-0 z-10 shadow-[-10px_0_30px_rgba(0,0,0,0.02)]">
      <div className="p-6 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display font-bold text-xl text-[#004175]">Scheduler</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">AUTO-PILOT</span>
            <button 
              onClick={() => setAutoPilot(!autoPilot)}
              className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${autoPilot ? 'bg-[#004175]' : 'bg-gray-300'}`}
            >
              <motion.div 
                layout
                className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm ${autoPilot ? 'right-1' : 'left-1'}`}
              />
            </button>
          </div>
        </div>
        
        {autoPilot && (
          <div className="flex items-center gap-3 bg-[#F9BB00]/10 border border-[#F9BB00]/20 text-[#004175] p-3 rounded-xl">
            <Zap className="w-5 h-5 text-[#F9BB00]" />
            <p className="text-sm font-medium">System will automatically play scheduled announcements.</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-6">
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-[2px] bg-gray-100 rounded-full" />
          
          <div className="flex flex-col gap-6">
            {isLoading ? (
              <div className="text-center text-sm text-gray-400 py-10">Loading schedules...</div>
            ) : sortedSchedules.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-10">No upcoming announcements</div>
            ) : (
              <AnimatePresence>
                {sortedSchedules.map((schedule) => {
                  const ann = announcements.find(a => a.id === schedule.announcementId);
                  const isDone = schedule.status === 'Done';
                  const isSoon = !isDone && isBefore(schedule.playTime, addHours(new Date(), 1));

                  return (
                    <motion.div 
                      key={schedule.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="relative pl-10"
                    >
                      {/* Timeline Dot */}
                      <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-4 border-white flex items-center justify-center z-10 
                        ${isDone ? 'bg-gray-300' : isSoon ? 'bg-[#F9BB00] shadow-[0_0_10px_rgba(249,187,0,0.5)]' : 'bg-[#004175]'}`}
                      >
                        {isDone && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>

                      <div className={`p-4 rounded-xl border transition-all duration-300 
                        ${isSoon && !isDone ? 'border-[#F9BB00]/50 bg-[#F9BB00]/5 box-glow' : 'border-gray-100 bg-white shadow-sm hover:shadow-md'}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
                            <Clock className="w-3.5 h-3.5" />
                            {format(schedule.playTime, "HH:mm")}
                          </div>
                          {!isDone && (
                            <button 
                              onClick={() => deleteSchedule.mutate(schedule.id)}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                              title="Remove schedule"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <h4 className={`font-semibold text-sm line-clamp-2 ${isDone ? 'text-gray-400 line-through' : 'text-[#004175]'}`}>
                          {ann?.title || 'Unknown Announcement'}
                        </h4>
                        <span className={`inline-block mt-3 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide
                          ${isDone ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-[#004175]'}`}
                        >
                          {schedule.status}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
