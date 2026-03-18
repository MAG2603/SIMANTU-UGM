import { Sidebar } from "@/components/layout/Sidebar";
import { RightPanel } from "@/components/layout/RightPanel";
import { useSchedules, useCreateSchedule, useUpdateSchedule, useDeleteSchedule } from "@/hooks/use-schedules";
import { useAnnouncements, useCreateAnnouncement, useUpdateAnnouncement, useDeleteAnnouncement } from "@/hooks/use-announcements";
import { useAppContext } from "@/context/AppContext";
import { useState, useRef, useEffect } from "react";
import { Clock, Plus, Pencil, Trash2, Star, X, Save, ListTodo, CheckCircle2, ChevronUp, ChevronDown, AlarmClock, Repeat, Speaker, SlidersHorizontal, Languages, Bell, Upload, ToggleLeft, ToggleRight, RefreshCw, Download } from "lucide-react";
import { SpellingRule, BellItem } from "@/context/AppContext";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { APP_VERSION } from "../lib/appVersion";

// ==================== LIBRARY PAGE (CRUD Templates — Table) ====================

export default function LibraryPage() {
  const { data: announcements = [], isLoading } = useAnnouncements();
  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", contentId: "", contentEn: "", voiceId: "Pria", voiceEn: "Pria" });
  const [deleteAnnId, setDeleteAnnId] = useState<number | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm({ title: "", contentId: "", contentEn: "", voiceId: "Pria", voiceEn: "Pria" });
    setShowForm(true);
  };

  const openEdit = (ann: typeof announcements[0]) => {
    setEditingId(ann.id);
    const voiceParts = (ann.voice || "Pria").split("/");
    setForm({ title: ann.title, contentId: ann.contentId, contentEn: ann.contentEn, voiceId: voiceParts[0], voiceEn: voiceParts[1] || voiceParts[0] });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    if (editingId) {
      await updateAnnouncement.mutateAsync({ id: editingId, title: form.title, contentId: form.contentId, contentEn: form.contentEn, voice: `${form.voiceId}/${form.voiceEn}` });
    } else {
      await createAnnouncement.mutateAsync({ title: form.title, contentId: form.contentId, contentEn: form.contentEn, voice: `${form.voiceId}/${form.voiceEn}`, isFavorite: false });
    }
    setShowForm(false);
  };

  return (
    <div className="h-full w-full bg-neutral-900 flex p-2 sm:p-4 font-sans selection:bg-[#F9BB00] selection:text-[#004175]">
      <div className="flex-1 w-full max-w-[1920px] mx-auto bg-gray-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative ring-1 ring-white/10">
        <Sidebar />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />

          <header className="min-h-24 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-8 py-4 border-b border-gray-100 bg-white/50 backdrop-blur-md shrink-0 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#004175]" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Template Manager</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-black text-[#004175] tracking-tight">Announcement Library</h1>
            </div>
            <button
              onClick={openCreate}
              className="flex w-full sm:w-auto items-center justify-center gap-2 px-5 py-2.5 bg-[#004175] text-white rounded-xl font-semibold text-sm hover:bg-[#003159] transition-colors shadow-lg shadow-[#004175]/20"
            >
              <Plus className="w-4 h-4" /> Buat Template
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 relative z-10 styled-scrollbar">
            <div className="max-w-6xl mx-auto">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : announcements.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-gray-400 font-bold uppercase text-xs tracking-[0.2em] mb-2">Belum ada template</p>
                  <p className="text-gray-300 text-sm">Klik "Buat Template" untuk menambah pengumuman baru</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 xl:hidden">
                    {announcements.map((ann) => {
                      const parts = (ann.voice || "Pria").split("/");
                      const vId = parts[0];
                      const vEn = parts[1] || parts[0];

                      return (
                        <article key={ann.id} className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-[#004175]">{ann.title}</p>
                            </div>
                            <button
                              onClick={() => updateAnnouncement.mutate({ id: ann.id, isFavorite: !ann.isFavorite })}
                              title={ann.isFavorite ? 'Hapus dari favorit' : 'Tambah ke favorit'}
                              className="shrink-0 text-gray-300 transition-colors hover:text-[#F9BB00]"
                            >
                              <Star className={`h-4 w-4 ${ann.isFavorite ? 'fill-[#F9BB00] text-[#F9BB00]' : ''}`} />
                            </button>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2">
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                              <p className="mb-0.5 text-[10px] font-black uppercase tracking-wider text-gray-400">Teks Indonesia</p>
                              <p className="line-clamp-2 break-words text-xs text-gray-600">{ann.contentId || '—'}</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                              <p className="mb-0.5 text-[10px] font-black uppercase tracking-wider text-gray-400">Teks English</p>
                              <p className="line-clamp-2 break-words text-xs text-gray-600">{ann.contentEn || '—'}</p>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">ID: {vId}</span>
                            <span className="inline-block rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">EN: {vEn}</span>
                          </div>

                          <div className="mt-4 flex items-center justify-end gap-2 pt-1">
                            <button
                              onClick={() => openEdit(ann)}
                              className="rounded-lg bg-blue-50 p-2 text-[#004175] transition-colors hover:bg-blue-100"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteAnnId(ann.id)}
                              className="rounded-lg bg-red-50 p-2 text-red-500 transition-colors hover:bg-red-100"
                              title="Hapus"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="hidden overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm xl:block">
                    <table className="w-full min-w-[1040px] table-fixed text-left">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/80">
                          <th className="w-[5%] px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400"></th>
                          <th className="w-[21%] px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Judul</th>
                          <th className="w-[26%] px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Teks Indonesia</th>
                          <th className="w-[26%] px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Teks English</th>
                          <th className="w-[12%] px-4 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Suara</th>
                          <th className="w-[10%] px-4 py-4 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {announcements.map((ann) => (
                          <tr key={ann.id} className="group align-top transition-colors hover:bg-gray-50/60">
                            <td className="px-4 py-4">
                              <button
                                onClick={() => updateAnnouncement.mutate({ id: ann.id, isFavorite: !ann.isFavorite })}
                                title={ann.isFavorite ? 'Hapus dari favorit' : 'Tambah ke favorit'}
                                className="text-gray-300 transition-colors hover:text-[#F9BB00]"
                              >
                                <Star className={`h-4 w-4 ${ann.isFavorite ? 'fill-[#F9BB00] text-[#F9BB00]' : ''}`} />
                              </button>
                            </td>
                            <td className="px-4 py-4">
                              <p className="line-clamp-2 break-words text-sm font-bold text-[#004175]">{ann.title}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="line-clamp-2 break-words text-sm text-gray-500">{ann.contentId || '—'}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="line-clamp-2 break-words text-sm text-gray-500">{ann.contentEn || '—'}</p>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-col gap-1">
                                {(() => {
                                  const parts = (ann.voice || "Pria").split("/");
                                  const vId = parts[0];
                                  const vEn = parts[1] || parts[0];
                                  return (
                                    <>
                                      <span className="inline-block w-fit rounded bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">ID: {vId}</span>
                                      <span className="inline-block w-fit rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">EN: {vEn}</span>
                                    </>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                                <button onClick={() => openEdit(ann)} className="rounded-lg bg-blue-50 p-2 text-[#004175] transition-colors hover:bg-blue-100" title="Edit">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteAnnId(ann.id)}
                                  className="rounded-lg bg-red-50 p-2 text-red-500 transition-colors hover:bg-red-100" title="Hapus"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>

        <RightPanel />
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-6xl max-h-[92vh] bg-white rounded-2xl shadow-2xl p-6 overflow-hidden flex flex-col"
            >
              <div className="flex items-start sm:items-center justify-between gap-3 mb-6">
                <h3 className="font-display text-2xl font-bold text-[#004175]">
                  {editingId ? 'Edit Template' : 'Buat Template Baru'}
                </h3>
                <button onClick={() => setShowForm(false)} title="Tutup form" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1 styled-scrollbar">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Judul</label>
                  <input type="text" required autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="contoh: Sapaan Pagi"
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#004175]/20 transition-all" />
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Teks Indonesia</label>
                    <textarea value={form.contentId} onChange={e => setForm(f => ({ ...f, contentId: e.target.value }))}
                      placeholder="Masukkan teks bahasa Indonesia..."
                      className="w-full min-h-[220px] px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 resize-y focus:outline-none focus:ring-2 focus:ring-[#004175]/20 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Teks English</label>
                    <textarea value={form.contentEn} onChange={e => setForm(f => ({ ...f, contentEn: e.target.value }))}
                      placeholder="Enter English text..."
                      className="w-full min-h-[220px] px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 resize-y focus:outline-none focus:ring-2 focus:ring-[#004175]/20 transition-all" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Suara Indonesia</label>
                  <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
                    {["Pria", "Wanita"].map((v) => (
                      <label
                        key={v}
                        className={`flex-1 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 cursor-pointer text-center ${
                          form.voiceId === v
                            ? 'bg-[#004175] text-white shadow-md shadow-[#004175]/20'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/60'
                        }`}
                      >
                        <input
                          type="radio"
                          name="form-voice-id"
                          value={v}
                          checked={form.voiceId === v}
                          onChange={() => setForm(f => ({ ...f, voiceId: v }))}
                          className="sr-only"
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Suara English</label>
                  <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
                    {["Pria", "Wanita"].map((v) => (
                      <label
                        key={v}
                        className={`flex-1 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 cursor-pointer text-center ${
                          form.voiceEn === v
                            ? 'bg-[#004175] text-white shadow-md shadow-[#004175]/20'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/60'
                        }`}
                      >
                        <input
                          type="radio"
                          name="form-voice-en"
                          value={v}
                          checked={form.voiceEn === v}
                          onChange={() => setForm(f => ({ ...f, voiceEn: v }))}
                          className="sr-only"
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold text-gray-500 hover:bg-gray-100 transition-colors">Batal</button>
                  <button type="submit" disabled={createAnnouncement.isPending || updateAnnouncement.isPending}
                    className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold bg-[#004175] text-white shadow-lg shadow-[#004175]/20 hover:bg-[#003159] disabled:opacity-50 transition-all">
                    <Save className="w-4 h-4" /> {editingId ? 'Simpan' : 'Buat'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={deleteAnnId !== null}
        onOpenChange={(open) => !open && setDeleteAnnId(null)}
        onConfirm={() => { if (deleteAnnId) deleteAnnouncement.mutate(deleteAnnId); setDeleteAnnId(null); }}
        title="Hapus Template"
        description="Apakah Anda yakin ingin menghapus template ini? Tindakan ini tidak dapat dibatalkan."
      />
    </div>
  );
}

// ==================== TIME PICKER COMPONENT ====================

function TimePicker({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [hours, minutes] = value ? value.split(':').map(Number) : [0, 0];
  const hourRef = useRef<HTMLInputElement>(null);
  const minRef = useRef<HTMLInputElement>(null);

  const pad = (n: number) => n.toString().padStart(2, '0');

  const update = (h: number, m: number) => {
    const hh = ((h % 24) + 24) % 24;
    const mm = ((m % 60) + 60) % 60;
    onChange(`${pad(hh)}:${pad(mm)}`);
  };

  const handleHourInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    const h = Math.min(parseInt(raw || '0'), 23);
    update(h, minutes);
    if (raw.length === 2) minRef.current?.focus();
  };

  const handleMinInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    const m = Math.min(parseInt(raw || '0'), 59);
    update(hours, m);
  };

  const handleKeyDown = (unit: 'h' | 'm') => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); update(unit === 'h' ? hours + 1 : hours, unit === 'm' ? minutes + 1 : minutes); }
    if (e.key === 'ArrowDown') { e.preventDefault(); update(unit === 'h' ? hours - 1 : hours, unit === 'm' ? minutes - 1 : minutes); }
    if (e.key === ':' || e.key === 'Tab') { if (unit === 'h') { e.preventDefault(); minRef.current?.focus(); } }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        {/* Hours */}
        <div className="flex flex-col items-center gap-1">
          <button type="button" onClick={() => update(hours + 1, minutes)} tabIndex={-1} title="Tambah jam"
            className="p-1 text-gray-400 hover:text-[#004175] hover:bg-blue-50 rounded-lg transition-colors">
            <ChevronUp className="w-5 h-5" />
          </button>
          <input
            ref={hourRef}
            type="text"
            inputMode="numeric"
            value={pad(hours)}
            onChange={handleHourInput}
            onKeyDown={handleKeyDown('h')}
            aria-label="Hours"
            className="w-16 h-16 text-center text-3xl font-black text-[#004175] bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-[#004175] focus:ring-4 focus:ring-[#004175]/10 transition-all"
          />
          <button type="button" onClick={() => update(hours - 1, minutes)} tabIndex={-1} title="Kurangi jam"
            className="p-1 text-gray-400 hover:text-[#004175] hover:bg-blue-50 rounded-lg transition-colors">
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        <span className="text-3xl font-black text-gray-300 mt-0">:</span>

        {/* Minutes */}
        <div className="flex flex-col items-center gap-1">
          <button type="button" onClick={() => update(hours, minutes + 1)} tabIndex={-1} title="Tambah menit"
            className="p-1 text-gray-400 hover:text-[#004175] hover:bg-blue-50 rounded-lg transition-colors">
            <ChevronUp className="w-5 h-5" />
          </button>
          <input
            ref={minRef}
            type="text"
            inputMode="numeric"
            value={pad(minutes)}
            onChange={handleMinInput}
            onKeyDown={handleKeyDown('m')}
            aria-label="Minutes"
            className="w-16 h-16 text-center text-3xl font-black text-[#004175] bg-gray-50 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-[#004175] focus:ring-4 focus:ring-[#004175]/10 transition-all"
          />
          <button type="button" onClick={() => update(hours, minutes - 1)} tabIndex={-1} title="Kurangi menit"
            className="p-1 text-gray-400 hover:text-[#004175] hover:bg-blue-50 rounded-lg transition-colors">
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      </div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ketik atau gunakan tombol ▲▼</p>
    </div>
  );
}

// ==================== SCHEDULER PAGE (CRUD Schedules) ====================

export function SchedulerPage() {
  const { data: schedules = [], isLoading: loadingSchedules } = useSchedules();
  const { data: announcements = [] } = useAnnouncements();
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formAnnId, setFormAnnId] = useState<number>(0);
  const [formTime, setFormTime] = useState("08:00");
  const [formRecurring, setFormRecurring] = useState(false);
  const [deleteSchId, setDeleteSchId] = useState<number | null>(null);

  const sortedSchedules = [...schedules].sort((a, b) => new Date(a.playTime).getTime() - new Date(b.playTime).getTime());
  const waitingCount = schedules.filter(s => s.status === 'Waiting').length;
  const doneCount = schedules.filter(s => s.status === 'Done').length;

  const openCreate = () => {
    setEditingId(null);
    setFormAnnId(announcements[0]?.id || 0);
    setFormTime("08:00");
    setFormRecurring(false);
    setShowForm(true);
  };

  const openEdit = (schedule: typeof schedules[0]) => {
    setEditingId(schedule.id);
    setFormAnnId(schedule.announcementId);
    setFormTime(format(new Date(schedule.playTime), 'HH:mm'));
    setFormRecurring(schedule.recurring ?? false);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAnnId || !formTime) return;

    const [h, m] = formTime.split(':');
    const playTime = new Date();
    playTime.setHours(parseInt(h), parseInt(m), 0, 0);
    if (playTime < new Date()) playTime.setDate(playTime.getDate() + 1);

    if (editingId) {
      await updateSchedule.mutateAsync({ id: editingId, announcementId: formAnnId, playTime: playTime.toISOString(), status: "Waiting", recurring: formRecurring });
    } else {
      await createSchedule.mutateAsync({ announcementId: formAnnId, playTime: playTime.toISOString(), status: "Waiting", recurring: formRecurring });
    }
    setShowForm(false);
  };

  return (
    <div className="h-full w-full bg-neutral-900 flex p-2 sm:p-4 font-sans selection:bg-[#F9BB00] selection:text-[#004175]">
      <div className="flex-1 w-full max-w-[1920px] mx-auto bg-gray-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative ring-1 ring-white/10">
        <Sidebar />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

          <header className="min-h-24 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-8 py-4 border-b border-gray-100 bg-white/50 backdrop-blur-md shrink-0 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#F9BB00]" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Automation</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-black text-[#004175] tracking-tight">Daily Scheduler</h1>
            </div>
            <button
              onClick={openCreate}
              disabled={announcements.length === 0}
              className="flex w-full sm:w-auto items-center justify-center gap-2 px-5 py-2.5 bg-[#F9BB00] text-[#004175] rounded-xl font-bold text-sm hover:bg-[#e0a800] transition-colors shadow-lg shadow-[#F9BB00]/20 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Tambah Jadwal
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 relative z-10 styled-scrollbar">
            <div className="max-w-4xl mx-auto space-y-8">
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { icon: Clock, label: "Total Jadwal", val: `${schedules.length}`, color: "blue" },
                  { icon: ListTodo, label: "Menunggu", val: `${waitingCount}`, color: "yellow" },
                  { icon: CheckCircle2, label: "Selesai", val: `${doneCount}`, color: "green" },
                ].map((stat, i) => (
                  <div key={i} className="group bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center gap-5">
                    <div className={`p-4 rounded-2xl transition-colors duration-300 ${stat.color === 'blue' ? 'bg-blue-50 text-[#004175]' : stat.color === 'yellow' ? 'bg-yellow-50 text-[#F9BB00]' : 'bg-green-50 text-green-600'}`}>
                      <stat.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-0.5">{stat.label}</p>
                      <p className="text-xl font-black text-[#004175]">{stat.val}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Schedule List */}
              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-xl shadow-blue-900/5 overflow-hidden">
                <div className="p-4 sm:p-8 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-[#004175] rounded-full" />
                    <h3 className="font-black text-[#004175] tracking-tight uppercase text-sm">Daftar Jadwal</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Auto-Play Aktif</span>
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {loadingSchedules ? (
                    <div className="p-12 text-center text-gray-400 text-sm">Memuat jadwal...</div>
                  ) : sortedSchedules.length === 0 ? (
                    <div className="p-20 text-center flex flex-col items-center gap-4">
                      <div className="p-6 bg-gray-50 rounded-full text-gray-300"><Clock className="w-12 h-12" /></div>
                      <p className="font-bold text-gray-400 uppercase text-xs tracking-[0.2em]">Belum ada jadwal</p>
                      <p className="text-gray-300 text-sm">Jadwal akan otomatis memutar pengumuman pada waktu yang ditentukan</p>
                    </div>
                  ) : (
                    sortedSchedules.map((schedule) => {
                      const ann = announcements.find(a => a.id === schedule.announcementId);
                      const isDone = schedule.status === 'Done';
                      return (
                        <div key={schedule.id} className="p-4 sm:p-6 hover:bg-gray-50/80 transition-all duration-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between group">
                          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-mono text-lg font-black
                              ${isDone ? 'bg-gray-100 text-gray-400' : 'bg-[#004175]/10 text-[#004175]'}`}>
                              {format(new Date(schedule.playTime), 'HH:mm')}
                            </div>
                            <div>
                              <p className={`font-bold text-base sm:text-lg tracking-tight ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                {ann?.title || 'Pengumuman tidak ditemukan'}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider
                                  ${isDone ? 'bg-gray-100 text-gray-400' : 'bg-[#F9BB00]/20 text-[#004175]'}`}>
                                  {isDone ? 'Selesai' : 'Menunggu'}
                                </span>
                                {schedule.recurring && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-[#004175] text-[10px] font-black uppercase tracking-wider">
                                    <Repeat className="w-3 h-3" /> Harian
                                  </span>
                                )}
                                <span className="text-[10px] text-gray-400">{format(new Date(schedule.playTime), 'dd MMM yyyy')}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 self-end sm:self-auto opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            {!isDone && (
                              <button onClick={() => openEdit(schedule)} className="p-2 bg-blue-50 text-[#004175] rounded-lg hover:bg-blue-100 transition-colors" title="Edit">
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteSchId(schedule.id)}
                              className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors" title="Hapus"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>

        <RightPanel />
      </div>

      {/* Create/Edit Schedule Modal — Modern */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-br from-[#004175] to-[#002a4d] p-6 text-white">
                <div className="flex items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm">
                      <AlarmClock className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-bold">
                        {editingId ? 'Edit Jadwal' : 'Jadwal Baru'}
                      </h3>
                      <p className="text-white/60 text-xs">Atur waktu pemutaran otomatis</p>
                    </div>
                  </div>
                  <button onClick={() => setShowForm(false)} title="Tutup form" className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                    <X className="w-5 h-5 text-white/60" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* Time Picker */}
                <div className="flex justify-center py-2">
                  <TimePicker value={formTime} onChange={setFormTime} />
                </div>

                {/* Announcement Select */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Pilih Pengumuman</label>
                  <select
                    value={formAnnId}
                    onChange={e => setFormAnnId(parseInt(e.target.value))}
                    required
                    aria-label="Select announcement"
                    className="w-full px-4 py-3.5 rounded-xl bg-gray-50 border-2 border-gray-200 text-[#004175] font-semibold focus:outline-none focus:border-[#004175] focus:ring-4 focus:ring-[#004175]/10 cursor-pointer transition-all"
                  >
                    <option value={0} disabled>-- Pilih pengumuman --</option>
                    {announcements.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </div>

                {/* Recurring Toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-3">
                    <Repeat className={`w-5 h-5 ${formRecurring ? 'text-[#004175]' : 'text-gray-400'}`} />
                    <div>
                      <p className="text-sm font-bold text-gray-700">Ulangi Setiap Hari</p>
                      <p className="text-[10px] text-gray-400">Jadwal otomatis aktif kembali setiap hari</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormRecurring(!formRecurring)}
                    aria-label="Toggle recurring"
                    className={`relative w-14 h-8 rounded-full transition-colors duration-300 ${formRecurring ? 'bg-[#004175]' : 'bg-gray-200'}`}
                  >
                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 ${formRecurring ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                <p className="text-xs text-gray-400 bg-gray-50 p-3 rounded-xl flex items-center gap-2">
                  <AlarmClock className="w-4 h-4 text-gray-400 shrink-0" />
                  Pengumuman akan diputar otomatis pada waktu yang ditentukan.
                </p>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                  <button type="button" onClick={() => setShowForm(false)} className="w-full sm:w-auto px-5 py-3 rounded-xl font-semibold text-gray-500 hover:bg-gray-100 transition-colors">Batal</button>
                  <button type="submit" disabled={createSchedule.isPending || updateSchedule.isPending || !formAnnId}
                    className="flex w-full sm:w-auto items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-[#F9BB00] text-[#004175] shadow-lg shadow-[#F9BB00]/20 hover:bg-[#e0a800] disabled:opacity-50 transition-all">
                    <Save className="w-4 h-4" /> {editingId ? 'Simpan' : 'Set Jadwal'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={deleteSchId !== null}
        onOpenChange={(open) => !open && setDeleteSchId(null)}
        onConfirm={() => { if (deleteSchId) deleteSchedule.mutate(deleteSchId); setDeleteSchId(null); }}
        title="Hapus Jadwal"
        description="Apakah Anda yakin ingin menghapus jadwal ini? Tindakan ini tidak dapat dibatalkan."
      />
    </div>
  );
}

// ==================== SETTINGS PAGE (Audio & Device) ====================

export function SettingsPage() {
  const {
    volume, setVolume, audioOutputId, setAudioOutputId,
    spellingRules, setSpellingRules,
    bellLibrary, setBellLibrary,
    activeBellOpeningId, setActiveBellOpeningId,
    activeBellEndingId, setActiveBellEndingId,
  } = useAppContext();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [updateInfo, setUpdateInfo] = useState<{ type: string; message: string; version?: string } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [newLang, setNewLang] = useState<'id' | 'en' | 'both'>('id');
  const customSpellingRules = spellingRules.filter(r => !r.id.startsWith('default-'));

  // --- Spelling rules helpers ---
  const addRule = () => {
    if (!newFrom.trim()) return;
    const from = newFrom.trim();
    const exists = customSpellingRules.some(r => r.from.toLowerCase() === from.toLowerCase() && r.lang === newLang);
    if (exists) return;
    const rule: SpellingRule = { id: crypto.randomUUID(), from: newFrom.trim(), to: newTo.trim(), enabled: true, lang: newLang };
    setSpellingRules([...customSpellingRules, rule]);
    setNewFrom(""); setNewTo(""); setNewLang('id');
  };
  const deleteRule = (id: string) => setSpellingRules(customSpellingRules.filter(r => r.id !== id));
  const toggleRule = (id: string) => setSpellingRules(customSpellingRules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  const updateRule = (id: string, field: 'from' | 'to' | 'lang', value: string) =>
    setSpellingRules(customSpellingRules.map(r => r.id === id ? { ...r, [field]: value } : r));

  // --- Bell library helpers ---
  const addBellToLibrary = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Ukuran file audio maksimal 2MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const item: import("@/context/AppContext").BellItem = { id: crypto.randomUUID(), name: file.name, data: ev.target?.result as string };
      setBellLibrary([...bellLibrary, item]);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const deleteBellFromLibrary = (id: string) => {
    setBellLibrary(bellLibrary.filter(b => b.id !== id));
    if (activeBellOpeningId === id) setActiveBellOpeningId(null);
    if (activeBellEndingId === id) setActiveBellEndingId(null);
  };

  const previewBell = (id: string | null, defaultUrl: string) => {
    const src = id ? (bellLibrary.find(b => b.id === id)?.data ?? defaultUrl) : defaultUrl;
    const audio = new Audio(src);
    audio.volume = volume / 100;
    audio.play().catch(console.warn);
  };

  // Update status listener
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.onUpdateStatus) return;
    const handleSignal = (_event: unknown, payload?: { type?: string; message?: string; version?: string }) => {
      if (!payload) return;
      setUpdateInfo({ type: payload.type ?? "", message: payload.message ?? "", version: payload.version });
      setCheckingUpdate(payload.type === "checking");
    };
    electronAPI.onUpdateStatus(handleSignal);
    return () => electronAPI.offUpdateStatus?.(handleSignal);
  }, []);

  // Load audio output devices
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const load = () => navigator.mediaDevices.enumerateDevices().then(all => {
      const outputs = all.filter(d => d.kind === 'audiooutput');
      setDevices(outputs);
    }).catch(() => {});
    // Enumerate once immediately; re-enumerate after user grants microphone
    // permission so device labels become available
    load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener('devicechange', load);
  }, []);

  return (
    <div className="h-full w-full bg-neutral-900 flex p-2 sm:p-4 font-sans selection:bg-[#F9BB00] selection:text-[#004175]">
      <div className="flex-1 w-full max-w-[1920px] mx-auto bg-gray-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative ring-1 ring-white/10">
        <Sidebar />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(0,65,117,0.05),transparent)] pointer-events-none" />

          <header className="min-h-24 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-8 py-4 border-b border-gray-100 bg-white/50 backdrop-blur-md shrink-0 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-gray-400" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Audio Config</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-black text-[#004175] tracking-tight">Pengaturan Suara</h1>
              <p className="text-xs text-gray-500 font-medium">Konfigurasi suara dan perangkat output audio</p>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 relative z-10 styled-scrollbar">
            <div className="max-w-2xl mx-auto space-y-8">

              {/* Output Device */}
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#F9BB00] text-[#004175] flex items-center justify-center">
                    <Speaker className="w-4 h-4" />
                  </div>
                  <h3 className="font-black text-[#004175] text-lg uppercase tracking-tight">Output Device</h3>
                </div>
                <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm space-y-4">
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Perangkat Output Audio</p>
                  <select
                    value={audioOutputId}
                    onChange={e => setAudioOutputId(e.target.value)}
                    aria-label="Select audio output device"
                    className="w-full px-4 py-3.5 rounded-xl bg-gray-50 border-2 border-gray-200 text-[#004175] font-semibold focus:outline-none focus:border-[#004175] focus:ring-4 focus:ring-[#004175]/10 cursor-pointer transition-all"
                  >
                    <option value="">Default — System Output</option>
                    {devices.filter(d => d.deviceId !== "default" && d.deviceId !== "").map(d => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Speaker (${d.deviceId.slice(0, 8)})`}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400">Pilih perangkat speaker/headphone untuk output pengumuman. Perubahan berlaku saat play berikutnya.</p>
                </div>
              </section>

              {/* Volume */}
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-500 text-white flex items-center justify-center">
                    <SlidersHorizontal className="w-4 h-4" />
                  </div>
                  <h3 className="font-black text-[#004175] text-lg uppercase tracking-tight">Volume</h3>
                </div>
                <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm space-y-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Volume Output</p>
                    <div className="bg-[#004175] text-white text-sm font-black px-3 py-1 rounded-lg min-w-[52px] text-center">
                      {volume}%
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={e => setVolume(parseInt(e.target.value))}
                    aria-label="Volume"
                    className="w-full h-2 rounded-full cursor-pointer accent-[#004175] bg-gray-200"
                  />
                  <div className="flex justify-between text-[10px] text-gray-300 font-bold">
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>
              </section>

              {/* Aturan Ejaan */}
              <section className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center shrink-0">
                      <Languages className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-black text-[#004175] text-lg uppercase tracking-tight">Aturan Pengucapan</h3>
                      <p className="text-[11px] text-gray-400 font-medium">Ganti kata sebelum dikirim ke TTS</p>
                    </div>
                  </div>
                  {customSpellingRules.length > 0 && (
                    <span className="shrink-0 mt-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-black uppercase tracking-widest">
                      {customSpellingRules.filter(r => r.enabled).length}/{customSpellingRules.length} aktif
                    </span>
                  )}
                </div>

                {/* How it works box */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-bold text-indigo-700">Cara kerja:</p>
                  <p className="text-[11px] text-indigo-500 leading-relaxed">
                    Setiap kata di kolom <span className="font-bold">"Teks Asli"</span> otomatis diganti sebelum dikirim ke TTS. Kolom <span className="font-bold">Bahasa</span> menentukan apakah aturan berlaku untuk teks Indonesia (<span className="font-bold">ID</span>), Inggris (<span className="font-bold">EN</span>), atau keduanya (<span className="font-bold">ID+EN</span>).
                  </p>
                  <p className="text-[10px] text-indigo-400 pt-1">
                    Aturan bawaan sistem (UGM, L1, L5, ETD, WIB) diterapkan otomatis dan tidak ditampilkan di daftar ini.
                  </p>
                </div>

                <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-x-auto">
                  {/* Column headers */}
                  {customSpellingRules.length > 0 && (
                    <div className="min-w-[620px] flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                      <div className="w-5 shrink-0" />
                      <p className="flex-[2] text-[10px] font-black text-gray-400 uppercase tracking-widest">Teks Asli</p>
                      <div className="w-4 shrink-0" />
                      <p className="flex-[2] text-[10px] font-black text-gray-400 uppercase tracking-widest">Dibacakan Sebagai</p>
                      <p className="w-[72px] shrink-0 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Bahasa</p>
                      <div className="w-7 shrink-0" />
                    </div>
                  )}
                  {customSpellingRules.length > 0 && (
                    <div className="min-w-[620px] max-h-[240px] overflow-y-auto styled-scrollbar divide-y divide-gray-50">
                      {customSpellingRules.map(rule => (
                        <div key={rule.id} className={`flex items-center gap-2 px-4 py-2 transition-colors ${rule.enabled ? '' : 'opacity-50'}`}>
                          {(() => {
                            const isDefaultRule = rule.id.startsWith('default-');
                            return (
                              <>
                          <button
                            onClick={() => toggleRule(rule.id)}
                            title={rule.enabled ? "Aktif — klik untuk nonaktifkan" : "Nonaktif — klik untuk aktifkan"}
                            className={`shrink-0 transition-colors ${rule.enabled ? 'text-indigo-500' : 'text-gray-300'}`}
                          >
                            {rule.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                          <input
                            value={rule.from}
                            onChange={e => updateRule(rule.id, 'from', e.target.value)}
                            placeholder="teks asli"
                            disabled={isDefaultRule}
                            className="flex-[2] min-w-0 px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm text-[#004175] font-mono font-medium focus:outline-none focus:border-indigo-400 disabled:bg-gray-100 disabled:text-gray-400"
                          />
                          <span className="text-gray-300 text-sm font-bold shrink-0">→</span>
                          <input
                            value={rule.to}
                            onChange={e => updateRule(rule.id, 'to', e.target.value)}
                            placeholder="dibacakan sebagai"
                            disabled={isDefaultRule}
                            className="flex-[2] min-w-0 px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm text-[#004175] font-medium focus:outline-none focus:border-indigo-400 disabled:bg-gray-100 disabled:text-gray-400"
                          />
                          <select
                            value={rule.lang ?? 'id'}
                            onChange={e => updateRule(rule.id, 'lang', e.target.value)}
                            aria-label="Bahasa aturan"
                            disabled={isDefaultRule}
                            className="w-[72px] shrink-0 px-1.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs font-bold text-[#004175] focus:outline-none focus:border-indigo-400 cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                          >
                            <option value="id">ID</option>
                            <option value="en">EN</option>
                            <option value="both">ID+EN</option>
                          </select>
                          {isDefaultRule ? (
                            <span className="shrink-0 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 text-[9px] font-black uppercase tracking-widest">
                              Default
                            </span>
                          ) : (
                            <button onClick={() => deleteRule(rule.id)} title="Hapus aturan" className="shrink-0 p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                              </>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Add row */}
                  <div className="min-w-[620px] px-4 py-3 border-t border-gray-50 space-y-2">
                    {customSpellingRules.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">Belum ada aturan custom. Tambahkan aturan Anda di bawah.</p>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="w-5 shrink-0" />
                      <input
                        value={newFrom}
                        onChange={e => setNewFrom(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addRule()}
                        placeholder='Teks asli, misal: "Dr"'
                        className="flex-[2] min-w-0 px-2 py-1.5 rounded-lg bg-gray-50 border-2 border-dashed border-gray-200 text-sm font-mono focus:outline-none focus:border-indigo-400"
                      />
                      <span className="text-gray-300 text-sm font-bold shrink-0">→</span>
                      <input
                        value={newTo}
                        onChange={e => setNewTo(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addRule()}
                        placeholder='Dibaca sebagai, misal: "Dokter"'
                        className="flex-[2] min-w-0 px-2 py-1.5 rounded-lg bg-gray-50 border-2 border-dashed border-gray-200 text-sm focus:outline-none focus:border-indigo-400"
                      />
                      <select
                        value={newLang}
                        onChange={e => setNewLang(e.target.value as 'id' | 'en' | 'both')}
                        aria-label="Bahasa aturan baru"
                        className="w-[72px] shrink-0 px-1.5 py-1.5 rounded-lg bg-gray-50 border-2 border-dashed border-gray-200 text-xs font-bold text-[#004175] focus:outline-none focus:border-indigo-400 cursor-pointer"
                      >
                        <option value="id">ID</option>
                        <option value="en">EN</option>
                        <option value="both">ID+EN</option>
                      </select>
                      <button
                        onClick={addRule}
                        disabled={!newFrom.trim()}
                        title="Tambah aturan"
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-bold hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Tambah
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Bell Kustom */}
              <section className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-black text-[#004175] text-lg uppercase tracking-tight">Bell Kustom</h3>
                      <p className="text-[11px] text-gray-400 font-medium">Perpustakaan bell pengumuman</p>
                    </div>
                  </div>
                  <label className="flex w-full sm:w-auto items-center justify-center gap-1.5 px-3 py-2 bg-[#004175] text-white rounded-xl font-semibold text-xs cursor-pointer hover:bg-[#003159] transition-colors">
                    <Upload className="w-3.5 h-3.5" /> Upload Bell
                    <input type="file" accept="audio/*" className="hidden" onChange={addBellToLibrary} />
                  </label>
                </div>

                {/* Library list */}
                {bellLibrary.length > 0 ? (
                  <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                      <p className="flex-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nama File</p>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Aksi</p>
                    </div>
                    <div className="max-h-[180px] overflow-y-auto styled-scrollbar divide-y divide-gray-50">
                      {bellLibrary.map(bell => (
                        <div key={bell.id} className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          <p className="flex-1 min-w-0 text-sm font-medium text-[#004175] truncate font-mono">{bell.name}</p>
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={() => previewBell(bell.id, '/Opening.mp3')}
                              title="Preview bell ini"
                              className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-bold hover:bg-amber-200 transition-colors"
                            >
                              ▶ Preview
                            </button>
                            <button
                              onClick={() => deleteBellFromLibrary(bell.id)}
                              title="Hapus dari perpustakaan"
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-[1.5rem] border border-dashed border-gray-200 p-6 text-center">
                    <p className="text-sm text-gray-400 font-medium">Perpustakaan bell kosong.</p>
                    <p className="text-xs text-gray-300 mt-1">Upload file audio untuk menambah bell ke perpustakaan.</p>
                  </div>
                )}

                {/* Bell Pembuka selection */}
                <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center px-5 py-3 bg-amber-50 border-b border-amber-100">
                    <span className="text-base">🔔</span>
                    <div className="flex-1">
                      <p className="text-xs font-black text-amber-700 uppercase tracking-widest">Bell Pembuka</p>
                      <p className="text-[10px] text-amber-500">Diputar sebelum teks pengumuman</p>
                    </div>
                    <button
                      onClick={() => previewBell(activeBellOpeningId, '/Opening.mp3')}
                      title="Preview bell pembuka aktif"
                      className="self-start sm:self-auto flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-bold hover:bg-amber-200 transition-colors"
                    >
                      <Bell className="w-3 h-3" /> Preview
                    </button>
                  </div>
                  <div className="p-4 space-y-2">
                    <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${!activeBellOpeningId ? 'bg-amber-50 ring-2 ring-amber-300' : 'bg-gray-50 hover:bg-gray-100'}`}>
                      <input type="radio" checked={!activeBellOpeningId} onChange={() => setActiveBellOpeningId(null)} className="accent-amber-500" />
                      <div>
                        <p className="text-sm font-bold text-[#004175]">Bell Bawaan</p>
                        <p className="text-[10px] text-gray-400">Opening.mp3 (bawaan sistem)</p>
                      </div>
                      {!activeBellOpeningId && <span className="ml-auto text-[10px] font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">AKTIF</span>}
                    </label>
                    {bellLibrary.map(bell => (
                      <label key={bell.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${activeBellOpeningId === bell.id ? 'bg-amber-50 ring-2 ring-amber-300' : 'bg-gray-50 hover:bg-gray-100'}`}>
                        <input type="radio" checked={activeBellOpeningId === bell.id} onChange={() => setActiveBellOpeningId(bell.id)} className="accent-amber-500" />
                        <p className="text-sm font-medium text-[#004175] truncate flex-1 font-mono">{bell.name}</p>
                        {activeBellOpeningId === bell.id && <span className="shrink-0 text-[10px] font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">AKTIF</span>}
                      </label>
                    ))}
                    {bellLibrary.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-1">Upload bell ke perpustakaan untuk dapat memilih</p>
                    )}
                  </div>
                </div>

                {/* Bell Penutup selection */}
                <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center px-5 py-3 bg-blue-50 border-b border-blue-100">
                    <span className="text-base">🔕</span>
                    <div className="flex-1">
                      <p className="text-xs font-black text-blue-700 uppercase tracking-widest">Bell Penutup</p>
                      <p className="text-[10px] text-blue-400">Diputar setelah seluruh teks selesai</p>
                    </div>
                    <button
                      onClick={() => previewBell(activeBellEndingId, '/Ending.mp3')}
                      title="Preview bell penutup aktif"
                      className="self-start sm:self-auto flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold hover:bg-blue-200 transition-colors"
                    >
                      <Bell className="w-3 h-3" /> Preview
                    </button>
                  </div>
                  <div className="p-4 space-y-2">
                    <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${!activeBellEndingId ? 'bg-blue-50 ring-2 ring-blue-300' : 'bg-gray-50 hover:bg-gray-100'}`}>
                      <input type="radio" checked={!activeBellEndingId} onChange={() => setActiveBellEndingId(null)} className="accent-blue-500" />
                      <div>
                        <p className="text-sm font-bold text-[#004175]">Bell Bawaan</p>
                        <p className="text-[10px] text-gray-400">Ending.mp3 (bawaan sistem)</p>
                      </div>
                      {!activeBellEndingId && <span className="ml-auto text-[10px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">AKTIF</span>}
                    </label>
                    {bellLibrary.map(bell => (
                      <label key={bell.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${activeBellEndingId === bell.id ? 'bg-blue-50 ring-2 ring-blue-300' : 'bg-gray-50 hover:bg-gray-100'}`}>
                        <input type="radio" checked={activeBellEndingId === bell.id} onChange={() => setActiveBellEndingId(bell.id)} className="accent-blue-500" />
                        <p className="text-sm font-medium text-[#004175] truncate flex-1 font-mono">{bell.name}</p>
                        {activeBellEndingId === bell.id && <span className="shrink-0 text-[10px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">AKTIF</span>}
                      </label>
                    ))}
                    {bellLibrary.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-1">Upload bell ke perpustakaan untuk dapat memilih</p>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-gray-400">Bell Pembuka dan Penutup dapat dipilih secara terpisah. Klik Preview untuk mendengarkan bell yang sedang aktif.</p>
              </section>

              {/* App Info */}
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-800 text-white flex items-center justify-center">
                    <span className="text-xs font-black">i</span>
                  </div>
                  <h3 className="font-black text-[#004175] text-lg uppercase tracking-tight">Informasi Aplikasi</h3>
                </div>
                <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-4 px-6 pt-6 pb-5">
                    <img src="/logo_aplikasi.png" alt="SIMANTU" className="w-14 h-14 rounded-2xl border border-gray-100 shadow-md" />
                    <div>
                      <h4 className="font-display font-black text-xl text-[#004175]">SIMANTU<span className="text-gray-300">.</span></h4>
                      <p className="text-gray-400 text-xs font-medium">Sistem Informasi Pengumuman Terpadu</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-gray-100 border-t border-gray-100">
                    <div className="p-4 bg-gray-50">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Versi</p>
                      <p className="text-sm font-bold text-[#004175]">{APP_VERSION}</p>
                    </div>
                    <div className="p-4 bg-gray-50">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Platform</p>
                      <p className="text-sm font-bold text-[#004175]">Electron Desktop</p>
                    </div>
                    <div className="p-4 bg-gray-50">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Framework</p>
                      <p className="text-sm font-bold text-[#004175]">React + Express</p>
                    </div>
                    <div className="p-4 bg-gray-50">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Institusi</p>
                      <p className="text-sm font-bold text-[#004175]">UGM</p>
                    </div>
                  </div>
                  <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
                    <p className="text-gray-300 text-[10px] font-bold uppercase tracking-widest text-center">
                      &copy; {new Date().getFullYear()} SIMANTU &mdash; Universitas Gadjah Mada
                    </p>
                  </div>
                </div>
              </section>

              {/* Pembaruan Aplikasi */}
              {(window as any).electronAPI && (
                <section className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-500 text-white flex items-center justify-center">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <h3 className="font-black text-[#004175] text-lg uppercase tracking-tight">Pembaruan Aplikasi</h3>
                  </div>
                  <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm space-y-4">
                    {updateInfo && (
                      <div className={`p-3 rounded-xl text-sm font-medium flex items-start gap-2 ${
                        updateInfo.type === 'downloaded' || updateInfo.type === 'not-available' ? 'bg-green-50 text-green-700' :
                        updateInfo.type === 'available' || updateInfo.type === 'downloading' ? 'bg-sky-50 text-sky-700' :
                        updateInfo.type === 'error' ? 'bg-red-50 text-red-700' :
                        'bg-gray-50 text-gray-500'
                      }`}>
                        <span className="mt-0.5 shrink-0 font-black text-base leading-none">
                          {updateInfo.type === 'downloaded' || updateInfo.type === 'not-available' ? '✓' :
                           updateInfo.type === 'error' ? '!' : '↻'}
                        </span>
                        <span className="flex-1 leading-relaxed">{updateInfo.message}</span>
                        {updateInfo.version && (
                          <span className="shrink-0 font-black text-[11px] opacity-60 ml-2">{updateInfo.version}</span>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => {
                          setCheckingUpdate(true);
                          (window as any).electronAPI?.checkForUpdates?.();
                        }}
                        disabled={checkingUpdate}
                        className="flex items-center gap-2 px-4 py-2.5 bg-[#004175] text-white rounded-xl text-sm font-bold hover:bg-[#003159] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        <RefreshCw className={`w-4 h-4 transition-transform ${
                          checkingUpdate ? 'animate-spin' : ''
                        }`} />
                        {checkingUpdate ? 'Memeriksa...' : 'Periksa Pembaruan'}
                      </button>
                      {updateInfo?.type === 'downloaded' && (
                        <button
                          onClick={() => (window as any).electronAPI?.installUpdateNow?.()}
                          className="flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-all"
                        >
                          <Download className="w-4 h-4" />
                          Pasang &amp; Restart
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 leading-relaxed">
                      Pembaruan diperiksa otomatis setiap aplikasi dijalankan. Proses unduh berjalan di latar belakang dan tidak mengganggu penggunaan aktif.
                    </p>
                  </div>
                </section>
              )}

            </div>
          </div>
        </main>

        <RightPanel />
      </div>
    </div>
  );
}
