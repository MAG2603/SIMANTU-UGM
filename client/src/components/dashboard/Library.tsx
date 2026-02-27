import { useState } from "react";
import { Star, PlayCircle, Trash2, CalendarClock, MoreHorizontal } from "lucide-react";
import { useAnnouncements, useUpdateAnnouncement, useDeleteAnnouncement } from "@/hooks/use-announcements";
import { useCreateSchedule } from "@/hooks/use-schedules";
import { useAppContext } from "@/context/AppContext";
import { format, addHours, roundToNearestMinutes } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

export function Library() {
  const { data: announcements = [], isLoading } = useAnnouncements();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();
  const createSchedule = useCreateSchedule();
  const { setText, setVoice } = useAppContext();

  const [scheduleModalId, setScheduleModalId] = useState<number | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");

  const handleLoad = (ann: any) => {
    setText(ann.contentEn);
    setVoice(ann.voice);
  };

  const toggleFavorite = (ann: any) => {
    updateAnnouncement.mutate({ id: ann.id, isFavorite: !ann.isFavorite });
  };

  const handleSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleModalId || !scheduleTime) return;

    const [hours, minutes] = scheduleTime.split(':');
    const playTime = new Date();
    playTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    // If selected time is in the past, schedule for tomorrow
    if (playTime < new Date()) {
      playTime.setDate(playTime.getDate() + 1);
    }

    createSchedule.mutate({
      announcementId: scheduleModalId,
      playTime,
      status: "Waiting"
    });

    setScheduleModalId(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display font-bold text-2xl text-[#004175]">Announcement Library</h2>
        <div className="text-sm font-medium text-gray-500 bg-white px-4 py-2 rounded-full border border-gray-200 shadow-sm">
          {announcements.length} Saved Items
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1,2,3,4].map(i => <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {announcements.map((ann) => (
              <motion.div 
                key={ann.id}
                whileHover={{ y: -4, scale: 1.01 }}
                className={`relative group p-5 rounded-2xl border transition-all duration-300 flex flex-col
                  ${ann.isFavorite 
                    ? 'bg-[#F9BB00]/5 border-[#F9BB00]/30 shadow-md shadow-[#F9BB00]/5' 
                    : 'bg-white border-gray-200 shadow-sm hover:shadow-lg hover:border-gray-300'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-[#004175] text-lg pr-8 line-clamp-1">{ann.title}</h3>
                  <button 
                    onClick={() => toggleFavorite(ann)}
                    className="absolute top-5 right-5 text-gray-400 hover:text-[#F9BB00] transition-colors"
                  >
                    <Star className={`w-5 h-5 ${ann.isFavorite ? 'fill-[#F9BB00] text-[#F9BB00]' : ''}`} />
                  </button>
                </div>

                <p className="text-gray-500 text-sm line-clamp-3 mb-4 flex-1">
                  {ann.contentEn}
                </p>

                <div className="flex items-center gap-2 mb-4">
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded text-xs font-bold uppercase tracking-wider">
                    {ann.voice.split('-')[0]}
                  </span>
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded text-xs font-bold uppercase tracking-wider">
                    ID / EN
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-gray-100 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300">
                  <button 
                    onClick={() => handleLoad(ann)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#004175] text-white rounded-lg text-sm font-semibold hover:bg-[#003159] transition-colors"
                  >
                    <PlayCircle className="w-4 h-4" /> Load
                  </button>
                  <button 
                    onClick={() => setScheduleModalId(ann.id)}
                    className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                    title="Schedule"
                  >
                    <CalendarClock className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => {
                      if(confirm("Are you sure you want to delete this announcement?")) {
                        deleteAnnouncement.mutate(ann.id);
                      }
                    }}
                    className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Schedule Modal */}
      <AnimatePresence>
        {scheduleModalId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setScheduleModalId(null)}
            />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6"
            >
              <h3 className="font-display text-2xl font-bold text-[#004175] mb-2">Schedule Broadcast</h3>
              <p className="text-gray-500 text-sm mb-6">Choose a time to automatically play this announcement.</p>
              <form onSubmit={handleSchedule}>
                <input 
                  type="time" 
                  required
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-lg font-semibold text-center text-[#004175] focus:outline-none focus:ring-2 focus:ring-[#004175]/20 mb-6"
                />
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setScheduleModalId(null)} className="px-5 py-2.5 rounded-xl font-semibold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
                  <button type="submit" disabled={createSchedule.isPending || !scheduleTime} className="px-6 py-2.5 rounded-xl font-semibold bg-[#F9BB00] text-[#004175] shadow-lg shadow-[#F9BB00]/20 hover:bg-[#e0a800] disabled:opacity-50 transition-all">
                    {createSchedule.isPending ? 'Scheduling...' : 'Set Schedule'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
