import { useState } from "react";
import { Mic, Play, Bookmark, Languages, Loader2 } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { useCreateAnnouncement } from "@/hooks/use-announcements";
import { motion, AnimatePresence } from "framer-motion";

export function InputArea() {
  const { text, setText, voice, setVoice, isLangDetected, setIsLangDetected, isPlaying, playAudio } = useAppContext();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  
  const createAnnouncement = useCreateAnnouncement();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveTitle.trim() || !text.trim()) return;
    
    await createAnnouncement.mutateAsync({
      title: saveTitle,
      contentId: text, // Simulating detection, saving same text
      contentEn: text,
      voice: voice,
      isFavorite: false,
    });
    
    setIsSaveModalOpen(false);
    setSaveTitle("");
  };

  return (
    <>
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Mic className="w-5 h-5 text-[#004175]" />
            </div>
            <h2 className="font-display font-bold text-xl text-[#004175]">Broadcast Input</h2>
          </div>

          <button 
            onClick={() => setIsLangDetected(!isLangDetected)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300
              ${isLangDetected ? 'bg-[#004175] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            <Languages className="w-4 h-4" />
            Auto-Detect ID/EN
          </button>
        </div>

        <div className="relative group">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter your announcement text here..."
            className="w-full h-40 p-5 bg-gray-50 border border-gray-200 rounded-xl resize-none text-gray-800 text-lg 
                       focus:outline-none focus:ring-4 focus:ring-[#004175]/10 focus:border-[#004175]/30 
                       transition-all duration-300"
          />
          {isLangDetected && text && (
             <div className="absolute top-4 right-4 bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold uppercase">
               Detected: {text.length % 2 === 0 ? 'EN' : 'ID'}
             </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between mt-6 pt-6 border-t border-gray-100 gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-sm font-semibold text-gray-500">Voice:</span>
            <select 
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="bg-gray-50 border border-gray-200 text-[#004175] font-semibold text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#004175]/20 cursor-pointer"
            >
              <option value="Nova - Friendly">Nova - Friendly</option>
              <option value="Shimmer - Formal">Shimmer - Formal</option>
              <option value="Onyx - Deep">Onyx - Deep</option>
            </select>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => setIsSaveModalOpen(true)}
              disabled={!text.trim()}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold bg-[#F9BB00]/10 text-[#bd8e00] hover:bg-[#F9BB00]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Bookmark className="w-5 h-5" />
              Save to Library
            </button>
            <button
              onClick={playAudio}
              disabled={!text.trim() || isPlaying}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-[#004175] to-[#002a4d] text-white shadow-lg shadow-[#004175]/30 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:transform-none disabled:cursor-not-allowed transition-all duration-300"
            >
              {isPlaying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
              {isPlaying ? 'Playing...' : 'Play Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Save Modal */}
      <AnimatePresence>
        {isSaveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={() => setIsSaveModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 overflow-hidden"
            >
              <h3 className="font-display text-2xl font-bold text-[#004175] mb-2">Save Announcement</h3>
              <p className="text-gray-500 text-sm mb-6">Give your announcement a recognizable title to easily find it later.</p>
              
              <form onSubmit={handleSave}>
                <input
                  type="text"
                  autoFocus
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder="e.g., Morning Greeting"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#004175]/20 focus:border-[#004175]/50 transition-all mb-6"
                />
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setIsSaveModalOpen(false)} className="px-5 py-2.5 rounded-xl font-semibold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
                  <button 
                    type="submit" 
                    disabled={!saveTitle.trim() || createAnnouncement.isPending}
                    className="px-6 py-2.5 rounded-xl font-semibold bg-[#004175] text-white shadow-lg shadow-[#004175]/20 hover:bg-[#003159] disabled:opacity-50 transition-all"
                  >
                    {createAnnouncement.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
