import { Sidebar } from "@/components/layout/Sidebar";
import { RightPanel } from "@/components/layout/RightPanel";
import { useSchedules, useCreateSchedule, useUpdateSchedule, useDeleteSchedule } from "@/hooks/use-schedules";
import { useAnnouncements, useCreateAnnouncement, useUpdateAnnouncement, useDeleteAnnouncement } from "@/hooks/use-announcements";
import { useAppContext } from "@/context/AppContext";
import { useState, useRef, useEffect, useMemo } from "react";
import { Clock, Plus, Pencil, Trash2, Star, X, Save, ListTodo, CheckCircle2, ChevronUp, ChevronDown, AlarmClock, Repeat, Speaker, SlidersHorizontal, Languages, Bell, Upload, ToggleLeft, ToggleRight, RefreshCw, Download, FileInput, FileCheck2, Mic, Eye, EyeOff, AlertTriangle, ShieldCheck, Lock, Copy, XCircle, History, Play, Music, Square, Disc, Pause, Volume2 } from "lucide-react";
import { SpellingRule, BellItem, getDailyPlaybackLogs, saveDailyPlaybackLog, DailyPlaybackLog } from "@/context/AppContext";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { APP_VERSION } from "../lib/appVersion";
import { useToast } from "@/hooks/use-toast";

// ==================== LIBRARY PAGE (CRUD Templates — Table) ====================

export default function LibraryPage() {
  const { data: announcements = [], isLoading } = useAnnouncements();
  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();
  const {
    autoTranslateEnabled,
    setAutoTranslateEnabled,
    musicTracks,
    addMusicTrack,
    removeMusicTrack,
    previewMusicTrack,
    stopMusicPreview,
    activeMusicPreviewId,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState<'templates' | 'music'>('templates');
  const [deleteMusicTarget, setDeleteMusicTarget] = useState<import("@/lib/musicStorage").MusicTrack | null>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", contentId: "", contentEn: "", voiceId: "Pria", voiceEn: "Pria" });
  const [deleteAnnId, setDeleteAnnId] = useState<number | null>(null);

  // --- Auto-translate debounce for library modal ---
  const [isTranslatingLib, setIsTranslatingLib] = useState(false);
  const translateAbortLibRef = useRef<AbortController | null>(null);
  const lastTranslatedLibRef = useRef<string>("");

  useEffect(() => {
    if (!autoTranslateEnabled || !showForm) return;
    const trimmed = form.contentId.trim();
    if (!trimmed) return;
    if (trimmed === lastTranslatedLibRef.current) return;

    const timer = setTimeout(async () => {
      if (translateAbortLibRef.current) translateAbortLibRef.current.abort();
      const controller = new AbortController();
      translateAbortLibRef.current = controller;

      setIsTranslatingLib(true);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, from: "id", to: "en" }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Translate failed");
        const data = await res.json();
        if (!controller.signal.aborted) {
          lastTranslatedLibRef.current = trimmed;
          setForm(f => ({ ...f, contentEn: data.translatedText || "" }));
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("[SIMANTU] Library auto-translate failed:", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsTranslatingLib(false);
        }
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [form.contentId, autoTranslateEnabled, showForm]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ title: "", contentId: "", contentEn: "", voiceId: "Pria", voiceEn: "Pria" });
    lastTranslatedLibRef.current = "";  // Reset translate tracking for new form
    setShowForm(true);
  };

  const openEdit = (ann: typeof announcements[0]) => {
    setEditingId(ann.id);
    const voiceParts = (ann.voice || "Pria").split("/");
    setForm({ title: ann.title, contentId: ann.contentId, contentEn: ann.contentEn, voiceId: voiceParts[0], voiceEn: voiceParts[1] || voiceParts[0] });
    lastTranslatedLibRef.current = ann.contentId.trim();  // Prevent auto-translate from overwriting existing English text
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

  // --- Export / Import handlers ---
  const { toast } = useToast();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleExport = () => {
    if (announcements.length === 0) {
      toast({ title: "Tidak ada template", description: "Belum ada template untuk diekspor.", variant: "destructive" });
      return;
    }
    const exportData = announcements.map((a: any) => ({
      title: a.title,
      contentId: a.contentId,
      contentEn: a.contentEn,
      voice: a.voice,
      isFavorite: a.isFavorite,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `simantu-announcements-${format(new Date(), "yyyy-MM-dd")}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "✅ Export Berhasil", description: `${exportData.length} template telah diekspor.` });
  };

  // --- Import Conflict Resolution ---
  type ImportConflictAction = 'overwrite' | 'skip' | null;
  const [importConflicts, setImportConflicts] = useState<{ duplicates: any[]; newItems: any[] } | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be imported again if needed
    e.target.value = "";

    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!Array.isArray(imported)) throw new Error("Format file tidak valid");

      const existingTitles = new Set(announcements.map((a: any) => a.title.trim().toLowerCase()));
      const existingContents = new Set(announcements.map((a: any) => a.contentId?.trim().toLowerCase()).filter(Boolean));
      const duplicates: any[] = [];
      const newItems: any[] = [];

      for (const item of imported) {
        if (!item.title || typeof item.title !== "string") continue;
        const isTitleMatch = existingTitles.has(item.title.trim().toLowerCase());
        const isContentMatch = Boolean(item.contentId?.trim() && existingContents.has(item.contentId.trim().toLowerCase()));

        if (isTitleMatch || isContentMatch) {
          duplicates.push({
            ...item,
            _conflictReason: isTitleMatch && isContentMatch
              ? "Judul & Naskah sama"
              : isTitleMatch
                ? "Judul sama"
                : "Isi naskah sama",
          });
        } else {
          newItems.push(item);
        }
      }

      if (duplicates.length > 0) {
        // Tampilkan dialog pilihan konflik
        setImportConflicts({ duplicates, newItems });
      } else {
        // Tidak ada yang sama — langsung import semua
        await executeImportStrategy('skip', newItems);
      }
    } catch (err: any) {
      console.error("[SIMANTU] Import failed:", err);
      toast({ title: "Gagal Import", description: err.message || "File JSON tidak valid.", variant: "destructive" });
    }
  };

  const executeImportStrategy = async (strategy: 'overwrite' | 'keep-both' | 'skip', directItems?: any[]) => {
    setIsImporting(true);
    try {
      let added = 0;
      let overwritten = 0;
      let duplicated = 0;
      let skipped = 0;

      const itemsToAdd = directItems || importConflicts?.newItems || [];
      const duplicateItems = directItems ? [] : (importConflicts?.duplicates || []);

      // 1. Tambahkan item yang benar-benar baru
      for (const item of itemsToAdd) {
        await createAnnouncement.mutateAsync({
          title: item.title,
          contentId: item.contentId || "",
          contentEn: item.contentEn || "",
          voice: item.voice || "Pria/Pria",
          isFavorite: item.isFavorite ?? false,
        });
        added++;
      }

      // 2. Eksekusi strategi untuk naskah kembar/duplikat
      if (strategy === 'overwrite') {
        // TIMPA: Perbarui naskah lama dengan naskah dari file import
        for (const item of duplicateItems) {
          const existing = announcements.find((a: any) =>
            a.title.trim().toLowerCase() === item.title.trim().toLowerCase() ||
            (item.contentId?.trim() && a.contentId?.trim().toLowerCase() === item.contentId.trim().toLowerCase())
          );
          if (existing) {
            await updateAnnouncement.mutateAsync({
              id: existing.id,
              title: item.title,
              contentId: item.contentId || "",
              contentEn: item.contentEn || "",
              voice: item.voice || "Pria/Pria",
              isFavorite: item.isFavorite ?? existing.isFavorite,
            });
            overwritten++;
          } else {
            await createAnnouncement.mutateAsync({
              title: item.title,
              contentId: item.contentId || "",
              contentEn: item.contentEn || "",
              voice: item.voice || "Pria/Pria",
              isFavorite: item.isFavorite ?? false,
            });
            added++;
          }
        }
      } else if (strategy === 'keep-both') {
        // TETAP MASUKKAN DUPLIKAT: Simpan sebagai naskah baru dengan akhiran (Salinan)
        for (const item of duplicateItems) {
          await createAnnouncement.mutateAsync({
            title: `${item.title} (Salinan)`,
            contentId: item.contentId || "",
            contentEn: item.contentEn || "",
            voice: item.voice || "Pria/Pria",
            isFavorite: item.isFavorite ?? false,
          });
          duplicated++;
        }
      } else if (strategy === 'skip') {
        // HAPUS / LEWATI: Buang naskah duplikat, tidak dimasukkan
        skipped = duplicateItems.length;
      }

      const parts: string[] = [];
      if (added > 0) parts.push(`${added} naskah baru ditambahkan`);
      if (overwritten > 0) parts.push(`${overwritten} naskah lama ditimpa`);
      if (duplicated > 0) parts.push(`${duplicated} naskah duplikat disimpan sebagai salinan baru`);
      if (skipped > 0) parts.push(`${skipped} naskah duplikat dilewati (tidak dimasukkan)`);

      toast({
        title: "📥 Import Selesai",
        description: parts.join(", ") + ".",
      });
    } catch (err: any) {
      console.error("[SIMANTU] Import failed:", err);
      toast({ title: "Gagal Import", description: err.message || "Terjadi kesalahan saat import.", variant: "destructive" });
    } finally {
      setIsImporting(false);
      setImportConflicts(null);
    }
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
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pustaka Media</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-black text-[#004175] tracking-tight">Announcement Library</h1>
              <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">Kelola template siaran dan koleksi musik pengiring jam tutup</p>
            </div>

            {activeTab === 'templates' ? (
              <div className="flex w-full sm:w-auto items-center gap-2 flex-wrap">
                <button
                  onClick={handleExport}
                  disabled={announcements.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Export semua template ke JSON"
                >
                  <Download className="w-4 h-4" /> Export
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  disabled={isImporting}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Import template dari file JSON"
                >
                  <Upload className="w-4 h-4" /> {isImporting ? "Importing..." : "Import"}
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImport}
                />
                <button
                  onClick={openCreate}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#004175] text-white rounded-xl font-semibold text-sm hover:bg-[#003159] transition-colors shadow-lg shadow-[#004175]/20"
                >
                  <Plus className="w-4 h-4" /> Buat Template
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  ref={musicInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    e.target.value = "";
                    try {
                      await addMusicTrack(file);
                    } catch (err: any) {
                      toast({ title: "Gagal Mengunggah Musik", description: err.message || "Pastikan format file audio valid.", variant: "destructive" });
                    }
                  }}
                />
                <button
                  onClick={() => musicInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20"
                >
                  <Upload className="w-4 h-4" /> Upload Lagu (MP3/WAV)
                </button>
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 relative z-10 styled-scrollbar">
            <div className="max-w-6xl mx-auto">
              {/* Segmented Pill Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-gray-200/60 rounded-2xl w-fit mb-6 border border-gray-200/80">
                <button
                  onClick={() => setActiveTab('templates')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'templates'
                      ? 'bg-white text-[#004175] shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <FileInput className="w-3.5 h-3.5" />
                  Template Pengumuman
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    activeTab === 'templates' ? 'bg-blue-50 text-[#004175]' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {announcements.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('music')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    activeTab === 'music'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Music className="w-3.5 h-3.5 text-indigo-600" />
                  Musik Penutup (Jam Tutup)
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    activeTab === 'music' ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {musicTracks.length}
                  </span>
                </button>
              </div>

              {activeTab === 'music' ? (
                /* ==================== OUTRO MUSIC TAB ==================== */
                <div className="space-y-6">
                  {/* Clean Info Banner */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-white border border-gray-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                        <Music className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm sm:text-base text-gray-900">
                          Koleksi Lagu Penutup Gedung & Kantor
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Tersimpan secara lokal di komputer ini. Musik akan berputar otomatis setelah pembacaan pengumuman jam tutup selesai.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                        ✓ Siap Offline & Bebas Iklan
                      </span>
                    </div>
                  </div>

                  {/* Music Track List — Clean Table Format */}
                  {musicTracks.length === 0 ? (
                    <div className="py-16 px-6 text-center rounded-2xl bg-white border border-dashed border-gray-300 shadow-xs">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center mb-3">
                        <Disc className="w-7 h-7" />
                      </div>
                      <h4 className="font-bold text-sm sm:text-base text-gray-800">Belum Ada Lagu Tersimpan</h4>
                      <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                        Klik tombol <strong>"Upload Lagu (MP3/WAV)"</strong> untuk menambahkan file musik. Lagu akan muncul di daftar pilihan saat menyetel jadwal jam tutup.
                      </p>
                      <button
                        onClick={() => musicInputRef.current?.click()}
                        className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors inline-flex items-center gap-1.5 shadow-sm"
                      >
                        <Upload className="w-3.5 h-3.5" /> Pilih File Musik Sekarang
                      </button>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/60 text-[10px] font-black uppercase tracking-wider text-gray-400">
                              <th className="py-3 px-4 w-12 text-center">#</th>
                              <th className="py-3 px-4">Nama Lagu</th>
                              <th className="py-3 px-4 w-32 text-center">Durasi</th>
                              <th className="py-3 px-4 w-28 text-center">Ukuran</th>
                              <th className="py-3 px-4 w-40 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-xs">
                            {musicTracks.map((track, idx) => {
                              const isPreviewing = activeMusicPreviewId === track.id;
                              return (
                                <tr
                                  key={track.id}
                                  className={`hover:bg-indigo-50/30 transition-colors ${
                                    isPreviewing ? 'bg-indigo-50/50' : ''
                                  }`}
                                >
                                  <td className="py-3 px-4 text-center text-gray-400 font-mono text-[11px]">
                                    {idx + 1}
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={() => previewMusicTrack(track.id)}
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                          isPreviewing
                                            ? 'bg-red-500 text-white shadow-sm'
                                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                        }`}
                                        title={isPreviewing ? "Stop Pratinjau" : "Putar Pratinjau"}
                                      >
                                        {isPreviewing ? (
                                          <Square className="w-3.5 h-3.5 fill-white" />
                                        ) : (
                                          <Play className="w-3.5 h-3.5 fill-indigo-700" />
                                        )}
                                      </button>
                                      <div className="min-w-0">
                                        <p className="font-bold text-gray-900 truncate max-w-sm sm:max-w-md" title={track.name}>
                                          {track.name}
                                        </p>
                                        <span className="text-[10px] text-gray-400">
                                          Diunggah: {format(new Date(track.createdAt), 'dd MMM yyyy, HH:mm')}
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md text-[11px]">
                                      {track.duration
                                        ? `${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, '0')}`
                                        : 'Audio'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-center font-mono text-gray-500 text-[11px]">
                                    {(track.size / (1024 * 1024)).toFixed(1)} MB
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        onClick={() => previewMusicTrack(track.id)}
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 ${
                                          isPreviewing
                                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                        }`}
                                      >
                                        {isPreviewing ? (
                                          <>
                                            <Square className="w-3 h-3 fill-red-600" /> Stop
                                          </>
                                        ) : (
                                          <>
                                            <Play className="w-3 h-3 fill-indigo-700" /> Dengar
                                          </>
                                        )}
                                      </button>
                                      <button
                                        onClick={() => setDeleteMusicTarget(track)}
                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Hapus lagu"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : isLoading ? (
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
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        Teks English
                        {isTranslatingLib && (
                          <span className="text-emerald-600 font-semibold normal-case animate-pulse">Translating...</span>
                        )}
                      </label>
                      <button
                        type="button"
                        onClick={() => setAutoTranslateEnabled(!autoTranslateEnabled)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-300
                          ${autoTranslateEnabled ? 'bg-[#F9BB00] text-[#004175] shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                        title={autoTranslateEnabled ? 'Auto-Translate aktif' : 'Auto-Translate nonaktif'}
                      >
                        <Languages className="w-3 h-3" />
                        Auto-Translate {autoTranslateEnabled ? 'On' : 'Off'}
                      </button>
                    </div>
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

      {/* Import Conflict Resolution Modal */}
      <AnimatePresence>
        {importConflicts && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setImportConflicts(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100"
            >
              <div className="bg-gradient-to-br from-[#004175] via-[#003866] to-[#002a4d] p-6 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#F9BB00]/10 rounded-full -mr-10 -mt-10 blur-2xl pointer-events-none" />
                <div className="flex items-start justify-between gap-3 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/10 text-[#F9BB00] rounded-xl backdrop-blur-sm">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-bold">Template Duplikat Ditemukan</h3>
                      <p className="text-white/70 text-xs mt-0.5">
                        {importConflicts.duplicates.length} template sudah ada • {importConflicts.newItems.length} template baru
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setImportConflicts(null)}
                    disabled={isImporting}
                    title="Tutup dialog"
                    className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-[#004175]/5 border border-[#004175]/15 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-xs font-bold text-[#004175] uppercase tracking-wider">Naskah yang sudah ada di database:</p>
                    <span className="text-[10px] font-bold bg-[#004175]/10 text-[#004175] px-2 py-0.5 rounded-full">
                      {importConflicts.duplicates.length} item
                    </span>
                  </div>
                  <div className="max-h-32 overflow-y-auto styled-scrollbar space-y-1.5">
                    {importConflicts.duplicates.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs text-gray-700 bg-white px-3 py-1.5 rounded-lg border border-gray-200/80 shadow-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F9BB00] shrink-0" />
                          <span className="font-semibold text-gray-800 truncate">{item.title}</span>
                        </div>
                        {item._conflictReason && (
                          <span className="text-[10px] bg-blue-50 text-[#004175] border border-blue-200/60 px-2 py-0.5 rounded-md font-semibold shrink-0 ml-2">
                            {item._conflictReason}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Pilih tindakan penanganan naskah duplikat:
                </p>

                <div className="space-y-2.5">
                  {/* OPSI 1: TIMPA */}
                  <button
                    type="button"
                    onClick={() => executeImportStrategy('overwrite')}
                    disabled={isImporting}
                    className="w-full flex items-start gap-3.5 p-3.5 bg-white hover:bg-blue-50/50 border border-gray-200 hover:border-[#004175] text-left rounded-xl transition-all group disabled:opacity-50 shadow-xs hover:shadow-sm"
                  >
                    <div className="p-2 bg-[#004175] text-white rounded-lg group-hover:scale-105 transition-transform shrink-0 mt-0.5 shadow-sm">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#004175]">1. Timpa Naskah Lama</span>
                        <span className="text-[10px] bg-[#F9BB00] text-[#004175] px-2 py-0.5 rounded-full font-black">Perbarui</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                        Perbarui isi naskah lama yang ada di aplikasi dengan data terbaru dari file import.
                      </p>
                    </div>
                  </button>

                  {/* OPSI 2: TETAP MASUKKAN DUPLIKAT */}
                  <button
                    type="button"
                    onClick={() => executeImportStrategy('keep-both')}
                    disabled={isImporting}
                    className="w-full flex items-start gap-3.5 p-3.5 bg-white hover:bg-blue-50/50 border border-gray-200 hover:border-[#004175] text-left rounded-xl transition-all group disabled:opacity-50 shadow-xs hover:shadow-sm"
                  >
                    <div className="p-2 bg-[#004175]/10 text-[#004175] group-hover:bg-[#004175] group-hover:text-white rounded-lg group-hover:scale-105 transition-all shrink-0 mt-0.5 shadow-sm">
                      <Copy className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-800 group-hover:text-[#004175] transition-colors">2. Tetap Masukkan Duplikat</span>
                        <span className="text-[10px] bg-blue-100 text-[#004175] px-2 py-0.5 rounded-full font-bold">Simpan Keduanya</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                        Naskah lama tetap utuh, dan naskah dari file import dimasukkan sebagai naskah baru berlabel <span className="font-semibold text-[#004175]">(Salinan)</span>.
                      </p>
                    </div>
                  </button>

                  {/* OPSI 3: HAPUS / BUANG DUPLIKAT */}
                  <button
                    type="button"
                    onClick={() => executeImportStrategy('skip')}
                    disabled={isImporting}
                    className="w-full flex items-start gap-3.5 p-3.5 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 text-left rounded-xl transition-all group disabled:opacity-50 shadow-xs"
                  >
                    <div className="p-2 bg-gray-100 text-gray-600 rounded-lg group-hover:scale-105 transition-transform shrink-0 mt-0.5 shadow-sm">
                      <XCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-700">3. Buang Duplikat (Lewati)</span>
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">Hanya Yang Baru</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                        Jangan masukkan naskah yang kembar. Hanya tambahkan naskah yang benar-benar belum ada di database.
                      </p>
                    </div>
                  </button>

                  {/* BATAL */}
                  <button
                    type="button"
                    onClick={() => setImportConflicts(null)}
                    disabled={isImporting}
                    className="w-full py-2.5 rounded-xl font-bold text-gray-500 hover:text-[#004175] hover:bg-gray-100 border border-gray-200 transition-colors text-xs text-center mt-2"
                  >
                    Batalkan Seluruh Proses Import
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Music Confirmation Dialog */}
      <ConfirmDialog
        open={deleteMusicTarget !== null}
        onOpenChange={(open) => !open && setDeleteMusicTarget(null)}
        onConfirm={async () => {
          if (deleteMusicTarget) {
            await removeMusicTrack(deleteMusicTarget.id);
          }
          setDeleteMusicTarget(null);
        }}
        title="Hapus Lagu Penutup"
        description={`Apakah Anda yakin ingin menghapus lagu "${deleteMusicTarget?.name}" dari koleksi musik penutup?`}
      />
    </div>
  );
}

// ==================== TIME PICKER COMPONENT ====================

function TimePicker({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-4 bg-gradient-to-b from-gray-50/80 to-gray-50/30 rounded-2xl border border-gray-100">
      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-[#004175]" />
        <span>Waktu Pemutaran (WIB)</span>
      </label>
      <input
        type="time"
        value={value || "08:00"}
        onChange={(e) => {
          if (e.target.value) {
            onChange(e.target.value);
          }
        }}
        required
        aria-label="Waktu Pemutaran"
        className="w-48 py-2.5 px-4 text-center rounded-2xl bg-white border-2 border-gray-200 text-[#004175] font-black text-2xl font-mono tracking-widest focus:outline-none focus:border-[#004175] focus:ring-4 focus:ring-[#004175]/10 cursor-pointer transition-all shadow-sm"
      />
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
  const [formDaysOfWeek, setFormDaysOfWeek] = useState<number[]>([]); // [0-6] where 0=Sunday
  const [formOutroMusicIds, setFormOutroMusicIds] = useState<string[]>([]);
  const [formHasOutro, setFormHasOutro] = useState<boolean>(false);
  const [deleteSchId, setDeleteSchId] = useState<number | null>(null);

  const toggleTrackInSchedule = (id: string) => {
    setFormOutroMusicIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const DAYS_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  const toggleDay = (day: number) => {
    setFormDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const getInitialSchedulePlayTime = (time: string, recurring: boolean, daysOfWeek: number[]) => {
    const [h, m] = time.split(':');
    const now = new Date();
    const candidate = new Date(now);
    candidate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);

    if (!recurring || daysOfWeek.length === 0) {
      if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
      return candidate;
    }

    const activeDays = Array.from(new Set(daysOfWeek.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)));
    for (let i = 0; i < 14; i += 1) {
      if (candidate > now && activeDays.includes(candidate.getDay())) {
        return candidate;
      }
      candidate.setDate(candidate.getDate() + 1);
    }

    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  };

  const {
    playAudio,
    isPlaying,
    isPreparing,
    activeScheduleId,
    musicTracks,
    startOutroMusic,
    previewMusicTrack,
    stopMusicPreview,
    activeMusicPreviewId,
  } = useAppContext();
  const { toast } = useToast();
  const [dailyLogs, setDailyLogs] = useState<DailyPlaybackLog[]>(() => getDailyPlaybackLogs());
  const [playingScheduleId, setPlayingScheduleId] = useState<number | null>(null);

  useEffect(() => {
    const handleUpdate = () => {
      setDailyLogs(getDailyPlaybackLogs());
    };
    window.addEventListener("simantu:playback-log-updated", handleUpdate);
    return () => window.removeEventListener("simantu:playback-log-updated", handleUpdate);
  }, []);

  const isPlayedToday = (dateVal?: string | Date) => {
    if (!dateVal) return false;
    const d = new Date(dateVal);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate();
  };

  const allTodayPlayed = useMemo(() => {
    const map = new Map<string, {
      id: string;
      title: string;
      playedAt: string;
      recurring?: boolean;
      daysOfWeek?: number[];
    }>();

    // 1. Data dari schedules server
    schedules.forEach(s => {
      const ann = announcements.find(a => a.id === s.announcementId);
      const title = ann?.title || 'Pengumuman';
      const playTimeIso = typeof s.playTime === 'string' ? s.playTime : new Date(s.playTime).toISOString();

      if (s.lastPlayedAt && isPlayedToday(s.lastPlayedAt)) {
        const key = `sch-${s.id}-${s.lastPlayedAt.slice(0, 16)}`;
        map.set(key, {
          id: key,
          title,
          playedAt: s.lastPlayedAt,
          recurring: s.recurring,
          daysOfWeek: s.daysOfWeek,
        });
      } else if (s.status === 'Done' && isPlayedToday(s.playTime)) {
        const key = `sch-${s.id}-${playTimeIso.slice(0, 16)}`;
        map.set(key, {
          id: key,
          title,
          playedAt: playTimeIso,
          recurring: false,
          daysOfWeek: s.daysOfWeek,
        });
      }
    });

    // 2. Data dari dailyLogs (localStorage)
    dailyLogs.forEach(log => {
      const key = `log-${log.scheduleId || 'manual'}-${log.playedAt.slice(0, 16)}`;
      if (!map.has(key)) {
        map.set(key, {
          id: log.id,
          title: log.title,
          playedAt: log.playedAt,
          recurring: log.recurring,
          daysOfWeek: log.daysOfWeek,
        });
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime()
    );
  }, [schedules, announcements, dailyLogs]);

  const sortedSchedules = [...schedules].sort((a, b) => new Date(a.playTime).getTime() - new Date(b.playTime).getTime());
  const waitingCount = schedules.filter(s => s.status === 'Waiting').length;
  const doneTodayCount = allTodayPlayed.length;

  const handlePlayNow = async (schedule: typeof schedules[0]) => {
    const ann = announcements.find(a => a.id === schedule.announcementId);
    if (!ann) {
      toast({
        title: "Pengumuman Tidak Ditemukan",
        description: "Template pengumuman untuk jadwal ini tidak tersedia.",
        variant: "destructive",
      });
      return;
    }

    if (isPlaying || isPreparing) {
      toast({
        title: "Pemutaran Sedang Berjalan",
        description: "Harap tunggu pengumuman saat ini selesai sebelum memutar jadwal.",
      });
      return;
    }

    setPlayingScheduleId(schedule.id);
    const nowIso = new Date().toISOString();

    // Catat ke daily log lokal seketika
    saveDailyPlaybackLog({
      scheduleId: schedule.id,
      announcementId: schedule.announcementId,
      title: ann.title || "Pengumuman",
      playedAt: nowIso,
      recurring: schedule.recurring,
      daysOfWeek: schedule.daysOfWeek,
    });

    try {
      const voiceParts = (ann.voice || "Pria").split("/");
      await playAudio(ann.contentId, ann.contentEn, voiceParts[0], voiceParts[1] || voiceParts[0]);

      const outroIds = schedule.outroMusicIds && schedule.outroMusicIds.length > 0
        ? schedule.outroMusicIds
        : (schedule.outroMusicId ? [schedule.outroMusicId] : []);
      if (outroIds.length > 0) {
        void startOutroMusic(outroIds, ann.title);
      }

      // Perbarui server
      if (schedule.recurring) {
        await updateSchedule.mutateAsync({
          id: schedule.id,
          playTime: typeof schedule.playTime === 'string' ? schedule.playTime : new Date(schedule.playTime).toISOString(),
          status: "Waiting",
          lastPlayedAt: nowIso,
        });
      } else {
        await updateSchedule.mutateAsync({
          id: schedule.id,
          status: "Done",
          lastPlayedAt: nowIso,
        });
      }

      toast({
        title: "Jadwal Diputar",
        description: `Pengumuman "${ann.title}" telah diputar dan dicatat dalam log hari ini.`,
      });
    } catch (err: any) {
      toast({
        title: "Gagal Memutar Pengumuman",
        description: err?.message || "Terjadi kendala saat memutar jadwal.",
        variant: "destructive",
      });
    } finally {
      setPlayingScheduleId(null);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormAnnId(announcements[0]?.id || 0);
    setFormTime("08:00");
    setFormRecurring(false);
    setFormDaysOfWeek([]); // Empty = daily
    setFormOutroMusicIds([]);
    setFormHasOutro(false);
    setShowForm(true);
  };

  const openEdit = (schedule: typeof schedules[0]) => {
    setEditingId(schedule.id);
    setFormAnnId(schedule.announcementId);
    setFormTime(format(new Date(schedule.playTime), 'HH:mm'));
    setFormRecurring(schedule.recurring ?? false);
    setFormDaysOfWeek(schedule.daysOfWeek ?? []);
    const ids = schedule.outroMusicIds && schedule.outroMusicIds.length > 0
      ? schedule.outroMusicIds
      : (schedule.outroMusicId ? [schedule.outroMusicId] : []);
    setFormOutroMusicIds(ids);
    setFormHasOutro(ids.length > 0);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAnnId || !formTime) return;

    const playTime = getInitialSchedulePlayTime(formTime, formRecurring, formDaysOfWeek);

    const scheduleData = {
      announcementId: formAnnId,
      playTime: playTime.toISOString(),
      status: "Waiting" as const,
      recurring: formRecurring,
      daysOfWeek: formRecurring ? formDaysOfWeek : [], // Only use daysOfWeek if recurring
      outroMusicId: formHasOutro && formOutroMusicIds.length > 0 ? formOutroMusicIds[0] : null,
      outroMusicIds: formHasOutro ? formOutroMusicIds : [],
      outroMusicDuration: 0,
    };

    if (editingId) {
      await updateSchedule.mutateAsync({ id: editingId, ...scheduleData });
    } else {
      await createSchedule.mutateAsync(scheduleData);
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
                  { icon: ListTodo, label: "Menunggu Hari Ini", val: `${waitingCount}`, color: "yellow" },
                  { icon: CheckCircle2, label: "Selesai Hari Ini", val: `${doneTodayCount}`, color: "green" },
                ].map((stat, i) => (
                  <div key={i} className="group bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center gap-5">
                    <div className={`p-4 rounded-2xl transition-colors duration-300 ${stat.color === 'blue' ? 'bg-blue-50 text-[#004175]' : stat.color === 'yellow' ? 'bg-[#F9BB00]/15 text-[#9e7600]' : 'bg-green-50 text-green-600'}`}>
                      <stat.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-0.5">{stat.label}</p>
                      <p className="text-xl font-black text-[#004175]">{stat.val}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Schedule List (Daftar Jadwal) — Berada di ATAS sesuai permintaan pengguna */}
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
                      const isCurrentlyPlaying = playingScheduleId === schedule.id;
                      const isAnnouncing = isCurrentlyPlaying || activeScheduleId === schedule.id || schedule.status === 'Playing';

                      return (
                        <div key={schedule.id} className="p-4 sm:p-6 hover:bg-gray-50/80 transition-all duration-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between group">
                          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-mono text-lg font-black shrink-0 transition-all duration-300
                              ${isAnnouncing
                                ? 'bg-blue-50 text-[#004175] ring-2 ring-blue-500 shadow-md shadow-blue-500/15'
                                : isDone 
                                  ? 'bg-gray-100 text-gray-400' 
                                  : 'bg-[#004175]/10 text-[#004175]'}`}>
                              {format(new Date(schedule.playTime), 'HH:mm')}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className={`font-bold text-base sm:text-lg tracking-tight truncate ${
                                  isDone ? 'text-gray-400 line-through' : isAnnouncing ? 'text-[#004175] font-black' : 'text-gray-900'
                                }`}>
                                  {ann?.title || 'Pengumuman tidak ditemukan'}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                {isAnnouncing ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider shadow-sm shadow-blue-600/30">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#F9BB00] animate-ping" />
                                    <Speaker className="w-3 h-3 text-[#F9BB00] animate-pulse" />
                                    Diumumkan
                                  </span>
                                ) : (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider
                                    ${isDone ? 'bg-gray-100 text-gray-400' : 'bg-[#F9BB00]/20 text-[#004175]'}`}>
                                    {isDone ? 'Selesai' : 'Menunggu'}
                                  </span>
                                )}
                                {schedule.recurring && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-[#004175] text-[10px] font-black uppercase tracking-wider">
                                    <Repeat className="w-3 h-3" /> 
                                    {schedule.daysOfWeek && schedule.daysOfWeek.length > 0 
                                      ? `${schedule.daysOfWeek.map(d => DAYS[d]).join(',')}` 
                                      : 'Harian'}
                                  </span>
                                )}
                                {Boolean((schedule.outroMusicIds && schedule.outroMusicIds.length > 0) || schedule.outroMusicId) && (() => {
                                  const ids = schedule.outroMusicIds && schedule.outroMusicIds.length > 0
                                    ? schedule.outroMusicIds
                                    : [schedule.outroMusicId!];
                                  const names = ids.map(id => musicTracks.find(m => m.id === id)?.name || "Lagu").join(", ");
                                  return (
                                    <span
                                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-100/80"
                                      title={`Musik Penutup: ${names}`}
                                    >
                                      <Music className="w-3 h-3 text-indigo-600 shrink-0" />
                                      <span className="max-w-[130px] truncate">
                                        {ids.length === 1
                                          ? (musicTracks.find(m => m.id === ids[0])?.name || 'Musik Penutup')
                                          : `${ids.length} Lagu`}
                                      </span>
                                    </span>
                                  );
                                })()}
                                <span className="text-[10px] text-gray-400">
                                  {format(new Date(schedule.playTime), 'dd MMM yyyy')}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 self-end sm:self-auto opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            {/* Tombol Putar Sekarang */}
                            <button
                              onClick={() => handlePlayNow(schedule)}
                              disabled={isPlaying || isPreparing || isAnnouncing}
                              className="p-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 font-bold text-xs"
                              title={isAnnouncing ? "Sedang Diumumkan" : "Putar Jadwal Sekarang"}
                            >
                              <Play className={`w-4 h-4 ${isAnnouncing ? 'animate-pulse text-emerald-500' : 'fill-emerald-700'}`} />
                              <span className="hidden md:inline">{isAnnouncing ? 'Diumumkan' : 'Putar'}</span>
                            </button>

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

              {/* Log Pemutaran Hari Ini — Berada di BAWAH Daftar Jadwal */}
              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-gray-100 bg-gradient-to-r from-emerald-50/40 via-white to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100/80">
                      <History className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm sm:text-base text-gray-900">Log Pemutaran Hari Ini</h3>
                        <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                          {allTodayPlayed.length} Selesai
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Rekam jejak pemutaran terjadwal hari ini. Otomatis dibersihkan setiap pergantian hari.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-6">
                  {allTodayPlayed.length === 0 ? (
                    <div className="py-6 px-4 text-center rounded-2xl bg-gray-50/70 border border-dashed border-gray-200">
                      <p className="text-xs font-semibold text-gray-500">Belum ada pengumuman terjadwal yang diputar hari ini.</p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        Ketika jadwal terputar otomatis (atau melalui tombol Putar), riwayat dan jam putarnya akan langsung tercatat di sini.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto styled-scrollbar">
                      {allTodayPlayed.map((item) => (
                        <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex flex-col items-center justify-center font-mono font-black text-xs shrink-0 border border-emerald-100">
                              <span>{format(new Date(item.playedAt), 'HH:mm')}</span>
                              <span className="text-[8px] font-medium text-emerald-600/75">WIB</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">
                                {item.title}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-gray-400">
                                  Selesai diputar: {format(new Date(item.playedAt), 'HH:mm:ss')} WIB
                                </span>
                                {item.recurring ? (
                                  <span className="text-[9px] font-bold text-[#004175] bg-blue-50 px-2 py-0.5 rounded-md">
                                    Berulang ({item.daysOfWeek && item.daysOfWeek.length > 0 ? item.daysOfWeek.map(d => DAYS[d]).join(',') : 'Harian'})
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                                    Sekali Putar
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200/60">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden sm:inline">Terputar</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>

        <RightPanel />
      </div>

      {/* Create/Edit Schedule Modal — Modern & Scrollable */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-br from-[#004175] via-[#003866] to-[#002a4d] p-5 sm:p-6 text-white shrink-0">
                <div className="flex items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/10">
                      <AlarmClock className="w-5 h-5 text-[#F9BB00]" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg sm:text-xl font-bold">
                        {editingId ? 'Edit Jadwal Siaran' : 'Pasang Jadwal Baru'}
                      </h3>
                      <p className="text-white/60 text-xs mt-0.5">Atur waktu pemutaran otomatis dan musik penutup</p>
                    </div>
                  </div>
                  <button onClick={() => setShowForm(false)} title="Tutup form" className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                    <X className="w-5 h-5 text-white/60" />
                  </button>
                </div>
              </div>

              {/* Form Body — Scrollable */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 styled-scrollbar">
                {/* Time Picker */}
                <TimePicker value={formTime} onChange={setFormTime} />

                {/* Announcement Select */}
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                    Pilih Pengumuman
                  </label>
                  <select
                    value={formAnnId}
                    onChange={e => setFormAnnId(parseInt(e.target.value))}
                    required
                    aria-label="Select announcement"
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[#004175] font-semibold text-sm focus:outline-none focus:border-[#004175] focus:ring-4 focus:ring-[#004175]/10 cursor-pointer transition-all"
                  >
                    <option value={0} disabled>-- Pilih pengumuman --</option>
                    {announcements.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </div>

                {/* Recurring Toggle */}
                <div className="flex items-center justify-between gap-3 p-3.5 bg-gray-50/80 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-3">
                    <Repeat className={`w-5 h-5 ${formRecurring ? 'text-[#004175]' : 'text-gray-400'}`} />
                    <div>
                      <p className="text-xs font-bold text-gray-800">Ulangi Berkala</p>
                      <p className="text-[10px] text-gray-400">Jadwal otomatis aktif kembali sesuai hari yang dipilih</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormRecurring(!formRecurring)}
                    aria-label="Toggle recurring"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      formRecurring ? 'bg-[#004175]' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        formRecurring ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Day of Week Selector - Only show when recurring */}
                {formRecurring && (
                  <div className="space-y-2.5 p-3.5 bg-blue-50/60 rounded-2xl border border-blue-100/80 animate-in fade-in duration-200">
                    <label className="text-[11px] font-bold text-[#004175] uppercase tracking-wider block">
                      Hari-hari Aktif (Kosongkan = Setiap Hari)
                    </label>
                    <div className="grid grid-cols-7 gap-1.5">
                      {DAYS.map((day, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleDay(idx)}
                          title={DAYS_FULL[idx]}
                          className={`py-2 rounded-xl font-bold text-xs transition-all duration-200 ${
                            formDaysOfWeek.includes(idx)
                              ? 'bg-[#004175] text-white shadow-sm'
                              : 'bg-white text-gray-400 border border-gray-200 hover:border-[#004175]/30'
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1">
                      {formDaysOfWeek.length === 0
                        ? '📅 Akan berjalan setiap hari'
                        : `📅 Berjalan pada: ${formDaysOfWeek.map(d => DAYS_FULL[d]).join(', ')}`}
                    </p>
                  </div>
                )}

                {/* Musik Penutup / Outro (Jam Tutup Gedung/Kantor) */}
                <div className="rounded-2xl border border-gray-200/80 bg-white shadow-xs overflow-hidden transition-all">
                  <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3 bg-gray-50/70">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl transition-colors ${formHasOutro ? 'bg-indigo-600 text-white shadow-xs' : 'bg-gray-100 text-gray-400'}`}>
                        <Music className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-900">Musik Penutup (Jam Tutup)</p>
                        <p className="text-[10px] text-gray-400">Putar lagu otomatis setelah siaran selesai</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !formHasOutro;
                        setFormHasOutro(nextVal);
                        if (nextVal && formOutroMusicIds.length === 0 && musicTracks.length > 0) {
                          setFormOutroMusicIds([musicTracks[0].id]);
                        }
                      }}
                      aria-label="Toggle Outro Music"
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        formHasOutro ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          formHasOutro ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {formHasOutro && (
                    <div className="p-4 border-t border-gray-100 space-y-3 bg-white animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-[11px] font-bold text-gray-700 block">
                            Pilih Lagu yang Akan Diputar:
                          </label>
                          <span className="text-[10px] text-gray-400">
                            Diputar berurutan sesuai panjang asli lagu masing-masing.
                          </span>
                        </div>
                        {musicTracks.length > 1 && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setFormOutroMusicIds(musicTracks.map(m => m.id))}
                              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors"
                            >
                              Pilih Semua
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormOutroMusicIds([])}
                              className="text-[10px] font-semibold text-gray-500 hover:text-gray-700 px-2 py-0.5 rounded hover:bg-gray-100 transition-colors"
                            >
                              Hapus Pilihan
                            </button>
                          </div>
                        )}
                      </div>

                      {musicTracks.length === 0 ? (
                        <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-800 flex items-center justify-between">
                          <span>Belum ada lagu di koleksi musik.</span>
                          <span className="font-bold underline text-indigo-700 cursor-pointer" onClick={() => setShowForm(false)}>
                            Upload di Pustaka
                          </span>
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto space-y-1.5 p-1 bg-gray-50/70 rounded-xl border border-gray-200/80">
                          {musicTracks.map(m => {
                            const isSelected = formOutroMusicIds.includes(m.id);
                            const orderIndex = formOutroMusicIds.indexOf(m.id);
                            return (
                              <div
                                key={m.id}
                                onClick={() => toggleTrackInSchedule(m.id)}
                                className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                                  isSelected
                                    ? 'bg-indigo-50/90 border-indigo-300 text-indigo-950 shadow-xs'
                                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-[10px] font-black transition-all ${
                                      isSelected
                                        ? 'bg-indigo-600 text-white'
                                        : 'border border-gray-300 bg-white'
                                    }`}
                                  >
                                    {isSelected ? `#${orderIndex + 1}` : ''}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold truncate leading-tight">
                                      {m.name}
                                    </p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                      {m.duration
                                        ? `${Math.floor(m.duration / 60)}:${(m.duration % 60).toString().padStart(2, '0')}`
                                        : 'Durasi penuh'}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => previewMusicTrack(m.id)}
                                    className={`p-1.5 rounded-lg transition-all ${
                                      activeMusicPreviewId === m.id
                                        ? 'bg-red-500 text-white'
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                    }`}
                                    title={activeMusicPreviewId === m.id ? "Hentikan pratinjau" : "Dengarkan pratinjau"}
                                  >
                                    {activeMusicPreviewId === m.id ? (
                                      <Square className="w-3.5 h-3.5 fill-white" />
                                    ) : (
                                      <Play className="w-3.5 h-3.5 fill-gray-700" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Summary */}
                      {musicTracks.length > 0 && (
                        <div className="pt-0.5">
                          {formOutroMusicIds.length === 0 ? (
                            <div className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200/70 font-medium">
                              ⚠️ Belum ada lagu yang dipilih. Centang lagu di atas untuk diputar.
                            </div>
                          ) : (() => {
                            const totalDurationSec = formOutroMusicIds.reduce((sum, id) => {
                              const tr = musicTracks.find(m => m.id === id);
                              return sum + (tr?.duration || 180);
                            }, 0);
                            const totalMin = Math.floor(totalDurationSec / 60);
                            const totalRemSec = totalDurationSec % 60;
                            return (
                              <div className="flex items-center justify-between p-2.5 bg-indigo-50/80 border border-indigo-100 rounded-xl text-xs text-indigo-900 font-semibold">
                                <span>🎵 {formOutroMusicIds.length} lagu terpilih</span>
                                <span className="font-mono text-indigo-700">
                                  Total Durasi: ~{totalMin}m {totalRemSec.toString().padStart(2, '0')}s
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-400 bg-gray-50/80 p-3 rounded-2xl flex items-center gap-2 border border-gray-100">
                  <AlarmClock className="w-4 h-4 text-gray-400 shrink-0" />
                  Pengumuman akan diputar otomatis pada waktu yang ditentukan.
                </p>
              </form>

              {/* Modal Footer — Fixed at Bottom */}
              <div className="p-4 sm:p-5 bg-gray-50/90 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-gray-500 hover:bg-gray-200/60 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={createSchedule.isPending || updateSchedule.isPending || !formAnnId}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs bg-[#F9BB00] text-[#004175] shadow-md hover:bg-[#e0a800] disabled:opacity-50 transition-all"
                >
                  <Save className="w-4 h-4" /> {editingId ? 'Simpan Jadwal' : 'Pasang Jadwal'}
                </button>
              </div>
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
    ttsEngine, setTtsEngine,
    geminiApiKey, setGeminiApiKey,
  } = useAppContext();
  const { toast } = useToast();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [updateInfo, setUpdateInfo] = useState<{ type: string; message: string; version?: string } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [newLang, setNewLang] = useState<'id' | 'en' | 'both'>('id');
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [activePreviewKey, setActivePreviewKey] = useState<string | null>(null);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [isEditingGeminiKey, setIsEditingGeminiKey] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(false);
  const [testingGeminiKey, setTestingGeminiKey] = useState(false);
  const [geminiKeyTestResult, setGeminiKeyTestResult] = useState<{ valid: boolean; message: string } | null>(null);

  const testGeminiKey = async (keyToTest?: string) => {
    setTestingGeminiKey(true);
    setGeminiKeyTestResult(null);
    try {
      const res = await fetch("/api/tts/test-gemini-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyToTest !== undefined ? keyToTest : geminiApiKey }),
      });
      const data = await res.json();
      setGeminiKeyTestResult({ valid: Boolean(data.valid), message: data.message || (data.valid ? "API Key valid" : "API Key tidak valid") });
      if (data.valid) {
        toast({ title: "Koneksi Berhasil", description: data.message });
      } else {
        toast({ title: "Koneksi Gagal", description: data.message, variant: "destructive" });
      }
    } catch (err: any) {
      const msg = err?.message || "Gagal menghubungi server";
      setGeminiKeyTestResult({ valid: false, message: msg });
      toast({ title: "Koneksi Gagal", description: msg, variant: "destructive" });
    } finally {
      setTestingGeminiKey(false);
    }
  };
  const [deleteBellTarget, setDeleteBellTarget] = useState<import("@/context/AppContext").BellItem | null>(null);
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<SpellingRule | null>(null);
  const hideKeyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const toggleShowGeminiKey = () => {
    if (!showGeminiKey) {
      setShowGeminiKey(true);
      if (hideKeyTimeoutRef.current) clearTimeout(hideKeyTimeoutRef.current);
      hideKeyTimeoutRef.current = setTimeout(() => {
        setShowGeminiKey(false);
      }, 4000);
    } else {
      if (hideKeyTimeoutRef.current) clearTimeout(hideKeyTimeoutRef.current);
      setShowGeminiKey(false);
    }
  };

  useEffect(() => {
    return () => {
      if (hideKeyTimeoutRef.current) clearTimeout(hideKeyTimeoutRef.current);
    };
  }, []);
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

  const stopBellPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      previewAudioRef.current = null;
    }
    setActivePreviewKey(null);
  };

  const previewBell = (id: string | null, defaultUrl: string, key: string) => {
    if (activePreviewKey === key && previewAudioRef.current && !previewAudioRef.current.paused) {
      stopBellPreview();
      return;
    }

    stopBellPreview();
    const src = id ? (bellLibrary.find(b => b.id === id)?.data ?? defaultUrl) : defaultUrl;
    const audio = new Audio(src);
    audio.volume = volume / 100;
    previewAudioRef.current = audio;
    setActivePreviewKey(key);
    audio.onended = () => {
      if (previewAudioRef.current === audio) {
        previewAudioRef.current = null;
        setActivePreviewKey(null);
      }
    };
    audio.play().catch((err) => {
      console.warn(err);
      if (previewAudioRef.current === audio) {
        previewAudioRef.current = null;
        setActivePreviewKey(null);
      }
    });
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

  useEffect(() => {
    return () => stopBellPreview();
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

              {/* 1. KARTU MESIN SUARA (TTS ENGINE) */}
              <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#004175] to-[#002a4d] text-[#F9BB00] flex items-center justify-center shadow-sm shrink-0">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-[#004175] text-lg uppercase tracking-tight">Mesin Suara (Text-to-Speech)</h3>
                    <p className="text-[11px] text-gray-400 font-medium">Pilih mesin teknologi untuk sintesis suara pengumuman</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {[
                    { value: 'edge', label: 'Edge TTS', desc: 'Neural voices, kualitas terbaik', badge: 'Utama' },
                    { value: 'gemini', label: 'Gemini Flash', desc: 'Google AI, natural & ekspresif', badge: 'AI' },
                    { value: 'google', label: 'Google Translate', desc: 'Tanpa API key, sederhana', badge: 'Gratis' },
                  ].map(eng => (
                    <button
                      key={eng.value}
                      onClick={() => setTtsEngine(eng.value)}
                      className={`relative p-4 rounded-xl border-2 transition-all duration-300 text-left ${
                        ttsEngine === eng.value
                          ? 'border-[#004175] bg-[#004175]/5 shadow-md shadow-[#004175]/10'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className={`text-sm font-bold ${ttsEngine === eng.value ? 'text-[#004175]' : 'text-gray-700'}`}>{eng.label}</p>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                          ttsEngine === eng.value
                            ? 'bg-[#004175] text-white'
                            : 'bg-gray-100 text-gray-500'
                        }`}>{eng.badge}</span>
                      </div>
                      <p className="text-[10px] text-gray-400">{eng.desc}</p>
                      {ttsEngine === eng.value && (
                        <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#F9BB00] shadow-[0_0_6px_rgba(249,187,0,0.8)]" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3.5">
                  <p className="text-[11px] text-[#004175] leading-relaxed">
                    <span className="font-bold">Catatan:</span> Edge TTS adalah engine utama dengan kualitas paling jernih. Jika gagal karena koneksi, sistem secara otomatis beralih ke Gemini → Google Translate → Windows SAPI secara berurutan.
                  </p>
                </div>

                {/* Gemini API Key Form - Hanya jika mode Gemini aktif */}
                {ttsEngine === 'gemini' && (
                  <div className="space-y-3 pt-3 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-gray-400" /> Gemini API Key
                      </p>
                      <span className="text-[10px] text-[#004175] bg-blue-50 px-2.5 py-0.5 rounded-full font-bold">Khusus Mode Gemini</span>
                    </div>

                    {geminiApiKey.trim() && !isEditingGeminiKey ? (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-[#004175]/10 text-[#004175] flex items-center justify-center shrink-0">
                              <ShieldCheck className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-[#004175]">API Key Tersimpan &amp; Terkunci</p>
                              <p className="text-[11px] font-mono text-gray-400 tracking-wider">
                                {geminiApiKey.slice(0, 4)}••••••••••••{geminiApiKey.slice(-4)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => testGeminiKey()}
                              disabled={testingGeminiKey}
                              className="px-3 py-1.5 text-xs font-bold bg-[#004175]/10 hover:bg-[#004175]/20 text-[#004175] rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-60"
                            >
                              {testingGeminiKey ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                              Uji Koneksi
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingGeminiKey(true);
                                setShowGeminiKey(false);
                                setGeminiKeyTestResult(null);
                              }}
                              className="px-3.5 py-1.5 text-xs font-bold bg-white border border-gray-200 hover:bg-gray-100 text-[#004175] rounded-lg shadow-sm transition-all"
                            >
                              Ganti Key
                            </button>
                          </div>
                        </div>

                        {geminiKeyTestResult && (
                          <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in duration-200 ${
                            geminiKeyTestResult.valid
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-red-50 border-red-200 text-red-700'
                          }`}>
                            {geminiKeyTestResult.valid ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 leading-relaxed">
                              <p className="font-bold">{geminiKeyTestResult.valid ? 'Koneksi Berhasil' : 'Koneksi Gagal'}</p>
                              <p className="text-[11px] mt-0.5">{geminiKeyTestResult.message}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-[#004175] leading-relaxed">
                          <p className="font-bold mb-1 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#004175]" />
                            Panduan API Key Gemini:
                          </p>
                          <p className="text-[11px] text-gray-600">
                            1. Buka <strong>aistudio.google.com/app/apikey</strong> lalu login akun Google.<br/>
                            2. Buat API key baru (biasanya berawalan <code className="bg-white px-1 py-0.5 rounded border border-gray-200 font-mono text-[10px]">AIzaSy...</code>).<br/>
                            3. Tempel di bawah dan klik <strong>Uji</strong> untuk memastikan koneksi aktif.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type={showGeminiKey ? 'text' : 'password'}
                              value={geminiApiKey}
                              onChange={e => {
                                setGeminiApiKey(e.target.value);
                                setGeminiKeyTestResult(null);
                              }}
                              placeholder="Masukkan API key Gemini (misal: AIzaSy...)..."
                              autoComplete="off"
                              spellCheck={false}
                              className="w-full px-4 py-3 pr-10 rounded-xl bg-gray-50 border-2 border-gray-200 text-[#004175] font-mono text-sm focus:outline-none focus:border-[#004175] focus:ring-4 focus:ring-[#004175]/10 transition-all"
                            />
                            <button
                              type="button"
                              onClick={toggleShowGeminiKey}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#004175] transition-colors p-1"
                              title={showGeminiKey ? 'Sembunyikan' : 'Tampilkan sejenak (4 detik)'}
                            >
                              {showGeminiKey ? <EyeOff className="w-4 h-4 text-[#004175]" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {geminiApiKey.trim() && (
                            <>
                              <button
                                type="button"
                                onClick={() => testGeminiKey(geminiApiKey)}
                                disabled={testingGeminiKey}
                                className="px-3.5 py-3 bg-[#004175]/10 hover:bg-[#004175]/20 text-[#004175] text-xs font-bold rounded-xl transition-all shadow-sm shrink-0 flex items-center gap-1.5 disabled:opacity-60"
                              >
                                {testingGeminiKey ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3.5 h-3.5" />
                                )}
                                Uji
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditingGeminiKey(false);
                                  setShowGeminiKey(false);
                                }}
                                className="px-4 py-3 bg-[#004175] text-[#F9BB00] text-xs font-bold rounded-xl hover:bg-[#003159] transition-all shadow-sm shrink-0"
                              >
                                Kunci &amp; Selesai
                              </button>
                            </>
                          )}
                        </div>

                        {geminiKeyTestResult && (
                          <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in duration-200 ${
                            geminiKeyTestResult.valid
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-red-50 border-red-200 text-red-700'
                          }`}>
                            {geminiKeyTestResult.valid ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 leading-relaxed">
                              <p className="font-bold">{geminiKeyTestResult.valid ? 'Koneksi Berhasil' : 'Koneksi Gagal'}</p>
                              <p className="text-[11px] mt-0.5">{geminiKeyTestResult.message}</p>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] text-gray-400">
                          <p>
                            {showGeminiKey
                              ? '⚠️ Ditampilkan sementara (otomatis disembunyikan dalam 4 detik)'
                              : '🔒 Nilai disembunyikan demi keamanan privasi'}
                          </p>
                          <div className="flex items-center gap-3">
                            {geminiApiKey.trim() && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteKey(true)}
                                className="text-gray-400 hover:text-red-500 hover:underline transition-colors"
                              >
                                Hapus API Key
                              </button>
                            )}
                            {isEditingGeminiKey && geminiApiKey.trim() && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditingGeminiKey(false);
                                  setShowGeminiKey(false);
                                }}
                                className="text-gray-500 hover:text-[#004175] hover:underline"
                              >
                                Batal
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. KARTU OUTPUT AUDIO & VOLUME (GABUNGAN SATU FITUR) */}
              <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#004175] to-[#002a4d] text-[#F9BB00] flex items-center justify-center shadow-sm shrink-0">
                    <Speaker className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-[#004175] text-lg uppercase tracking-tight">Perangkat &amp; Volume Audio</h3>
                    <p className="text-[11px] text-gray-400 font-medium">Pilih speaker output dan tingkat kenyaringan suara</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
                  {/* Pilihan Speaker */}
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400 font-bold uppercase tracking-widest block">Speaker Output</label>
                    <select
                      value={audioOutputId}
                      onChange={e => setAudioOutputId(e.target.value)}
                      aria-label="Select audio output device"
                      className="w-full px-4 py-3 rounded-xl bg-gray-50 border-2 border-gray-200 text-[#004175] font-semibold text-sm focus:outline-none focus:border-[#004175] focus:ring-4 focus:ring-[#004175]/10 cursor-pointer transition-all"
                    >
                      <option value="">Default — System Output</option>
                      {devices.filter(d => d.deviceId !== "default" && d.deviceId !== "").map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Speaker (${d.deviceId.slice(0, 8)})`}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-400">Pilih speaker/headphone target untuk output siaran.</p>
                  </div>

                  {/* Pengatur Volume */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-gray-400 font-bold uppercase tracking-widest">Tingkat Volume</label>
                      <div className="bg-[#004175] text-[#F9BB00] text-xs font-black px-2.5 py-0.5 rounded-lg text-center shadow-sm">
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
                      className="w-full h-2 rounded-full cursor-pointer accent-[#004175] bg-gray-200 mt-2"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                      <span>0%</span>
                      <span>25%</span>
                      <span>50%</span>
                      <span>75%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. KARTU BELL & JINGLE PENGUMUMAN (GABUNGAN SATU FITUR) */}
              <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#004175] to-[#002a4d] text-[#F9BB00] flex items-center justify-center shadow-sm shrink-0">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-black text-[#004175] text-lg uppercase tracking-tight">Bell &amp; Jingle Pengumuman</h3>
                      <p className="text-[11px] text-gray-400 font-medium">Atur nada pembuka dan penutup pengumuman</p>
                    </div>
                  </div>
                  <label className="flex w-full sm:w-auto items-center justify-center gap-1.5 px-3.5 py-2 bg-[#004175] text-[#F9BB00] rounded-xl font-bold text-xs cursor-pointer hover:bg-[#003159] shadow-sm transition-colors shrink-0">
                    <Upload className="w-3.5 h-3.5" /> Upload File Bell
                    <input type="file" accept="audio/*" className="hidden" onChange={addBellToLibrary} />
                  </label>
                </div>

                {/* Dua Kolom: Bell Pembuka & Bell Penutup */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {/* Bell Pembuka */}
                  <div className="bg-gray-50/70 border border-gray-200/80 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🔔</span>
                        <div>
                          <p className="text-xs font-black text-[#004175] uppercase tracking-wider">Bell Pembuka</p>
                          <p className="text-[10px] text-gray-400">Diputar sebelum teks pengumuman</p>
                        </div>
                      </div>
                      <button
                        onClick={() => previewBell(activeBellOpeningId, '/Opening.mp3', `opening:${activeBellOpeningId ?? 'default'}`)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-[#F9BB00] text-[#004175] rounded-lg text-[10px] font-bold hover:bg-[#e0a800] shadow-sm transition-colors"
                      >
                        <Bell className="w-3 h-3" /> {activePreviewKey === `opening:${activeBellOpeningId ?? 'default'}` ? 'Stop' : 'Preview'}
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto styled-scrollbar pr-1">
                      <label className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer text-xs transition-colors ${!activeBellOpeningId ? 'bg-white border-2 border-[#004175] shadow-sm' : 'bg-white/60 border border-gray-200 hover:bg-white'}`}>
                        <input type="radio" checked={!activeBellOpeningId} onChange={() => setActiveBellOpeningId(null)} className="accent-[#004175]" />
                        <span className="font-bold text-[#004175] truncate flex-1">Opening.mp3 (Bawaan)</span>
                        {!activeBellOpeningId && <span className="text-[9px] font-black text-[#004175] bg-[#F9BB00]/30 px-2 py-0.5 rounded-full">AKTIF</span>}
                      </label>
                      {bellLibrary.map(bell => (
                        <label key={bell.id} className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer text-xs transition-colors ${activeBellOpeningId === bell.id ? 'bg-white border-2 border-[#004175] shadow-sm' : 'bg-white/60 border border-gray-200 hover:bg-white'}`}>
                          <input type="radio" checked={activeBellOpeningId === bell.id} onChange={() => setActiveBellOpeningId(bell.id)} className="accent-[#004175]" />
                          <span className="font-medium text-[#004175] truncate flex-1 font-mono">{bell.name}</span>
                          {activeBellOpeningId === bell.id && <span className="text-[9px] font-black text-[#004175] bg-[#F9BB00]/30 px-2 py-0.5 rounded-full">AKTIF</span>}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Bell Penutup */}
                  <div className="bg-gray-50/70 border border-gray-200/80 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🔕</span>
                        <div>
                          <p className="text-xs font-black text-[#004175] uppercase tracking-wider">Bell Penutup</p>
                          <p className="text-[10px] text-gray-400">Diputar setelah pengumuman selesai</p>
                        </div>
                      </div>
                      <button
                        onClick={() => previewBell(activeBellEndingId, '/Ending.mp3', `ending:${activeBellEndingId ?? 'default'}`)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-[#004175] text-[#F9BB00] rounded-lg text-[10px] font-bold hover:bg-[#003159] shadow-sm transition-colors"
                      >
                        <Bell className="w-3 h-3" /> {activePreviewKey === `ending:${activeBellEndingId ?? 'default'}` ? 'Stop' : 'Preview'}
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto styled-scrollbar pr-1">
                      <label className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer text-xs transition-colors ${!activeBellEndingId ? 'bg-white border-2 border-[#004175] shadow-sm' : 'bg-white/60 border border-gray-200 hover:bg-white'}`}>
                        <input type="radio" checked={!activeBellEndingId} onChange={() => setActiveBellEndingId(null)} className="accent-[#004175]" />
                        <span className="font-bold text-[#004175] truncate flex-1">Ending.mp3 (Bawaan)</span>
                        {!activeBellEndingId && <span className="text-[9px] font-black text-[#004175] bg-[#F9BB00]/30 px-2 py-0.5 rounded-full">AKTIF</span>}
                      </label>
                      {bellLibrary.map(bell => (
                        <label key={bell.id} className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer text-xs transition-colors ${activeBellEndingId === bell.id ? 'bg-white border-2 border-[#004175] shadow-sm' : 'bg-white/60 border border-gray-200 hover:bg-white'}`}>
                          <input type="radio" checked={activeBellEndingId === bell.id} onChange={() => setActiveBellEndingId(bell.id)} className="accent-[#004175]" />
                          <span className="font-medium text-[#004175] truncate flex-1 font-mono">{bell.name}</span>
                          {activeBellEndingId === bell.id && <span className="text-[9px] font-black text-[#004175] bg-[#F9BB00]/30 px-2 py-0.5 rounded-full">AKTIF</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Koleksi File Kustom (jika ada) */}
                {bellLibrary.length > 0 && (
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Daftar File Bell Terunggah ({bellLibrary.length})</p>
                    <div className="max-h-[130px] overflow-y-auto styled-scrollbar divide-y divide-gray-100 border border-gray-200 rounded-xl bg-gray-50/50">
                      {bellLibrary.map(bell => (
                        <div key={bell.id} className="flex items-center gap-2 px-3.5 py-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F9BB00] shrink-0" />
                          <p className="flex-1 min-w-0 text-xs font-medium text-[#004175] truncate font-mono">{bell.name}</p>
                          <button
                            onClick={() => previewBell(bell.id, '/Opening.mp3', `library:${bell.id}`)}
                            className="px-2 py-0.5 bg-[#F9BB00]/20 text-[#004175] rounded text-[10px] font-bold hover:bg-[#F9BB00]/30 transition-colors"
                          >
                            {activePreviewKey === `library:${bell.id}` ? '■ Stop' : '▶ Tes'}
                          </button>
                          <button
                            onClick={() => setDeleteBellTarget(bell)}
                            className="p-1 rounded text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Hapus file ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 4. KARTU ATURAN PENGUCAPAN (SATU FITUR) */}
              <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#004175] to-[#002a4d] text-[#F9BB00] flex items-center justify-center shadow-sm shrink-0">
                      <Languages className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-black text-[#004175] text-lg uppercase tracking-tight">Aturan Pengucapan</h3>
                      <p className="text-[11px] text-gray-400 font-medium">Ganti kata atau singkatan sebelum naskah dikirim ke suara TTS</p>
                    </div>
                  </div>
                  {customSpellingRules.length > 0 && (
                    <span className="shrink-0 mt-1 px-2.5 py-0.5 rounded-full bg-[#004175]/10 text-[#004175] text-[10px] font-black uppercase tracking-widest">
                      {customSpellingRules.filter(r => r.enabled).length}/{customSpellingRules.length} aktif
                    </span>
                  )}
                </div>

                <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 space-y-1.5">
                  <p className="text-xs font-bold text-[#004175]">Cara Kerja:</p>
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    Setiap kata di kolom <span className="font-bold text-[#004175]">"Teks Asli"</span> otomatis dibacakan sesuai kolom <span className="font-bold text-[#004175]">"Dibacakan Sebagai"</span>. Aturan sistem bawaan (UGM, WIB, L1, L5, ETD) sudah berjalan otomatis.
                  </p>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-x-auto">
                  {customSpellingRules.length > 0 && (
                    <div className="min-w-[620px] flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
                      <div className="w-5 shrink-0" />
                      <p className="flex-[2] text-[10px] font-black text-gray-400 uppercase tracking-widest">Teks Asli</p>
                      <div className="w-4 shrink-0" />
                      <p className="flex-[2] text-[10px] font-black text-gray-400 uppercase tracking-widest">Dibacakan Sebagai</p>
                      <p className="w-[72px] shrink-0 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Bahasa</p>
                      <div className="w-7 shrink-0" />
                    </div>
                  )}

                  {customSpellingRules.length > 0 && (
                    <div className="min-w-[620px] max-h-[220px] overflow-y-auto styled-scrollbar divide-y divide-gray-100">
                      {customSpellingRules.map(rule => (
                        <div key={rule.id} className={`flex items-center gap-2 px-4 py-2 transition-colors ${rule.enabled ? '' : 'opacity-50'}`}>
                          {(() => {
                            const isDefaultRule = rule.id.startsWith('default-');
                            return (
                              <>
                                <button
                                  onClick={() => toggleRule(rule.id)}
                                  title={rule.enabled ? "Aktif — klik untuk nonaktifkan" : "Nonaktif — klik untuk aktifkan"}
                                  className={`shrink-0 transition-colors ${rule.enabled ? 'text-[#004175]' : 'text-gray-300'}`}
                                >
                                  {rule.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                </button>
                                <input
                                  value={rule.from}
                                  onChange={e => updateRule(rule.id, 'from', e.target.value)}
                                  placeholder="teks asli"
                                  disabled={isDefaultRule}
                                  className="flex-[2] min-w-0 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm text-[#004175] font-mono font-medium focus:outline-none focus:border-[#004175] disabled:bg-gray-100 disabled:text-gray-400"
                                />
                                <span className="text-gray-300 text-sm font-bold shrink-0">→</span>
                                <input
                                  value={rule.to}
                                  onChange={e => updateRule(rule.id, 'to', e.target.value)}
                                  placeholder="dibacakan sebagai"
                                  disabled={isDefaultRule}
                                  className="flex-[2] min-w-0 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm text-[#004175] font-medium focus:outline-none focus:border-[#004175] disabled:bg-gray-100 disabled:text-gray-400"
                                />
                                <select
                                  value={rule.lang ?? 'id'}
                                  onChange={e => updateRule(rule.id, 'lang', e.target.value)}
                                  aria-label="Bahasa aturan"
                                  disabled={isDefaultRule}
                                  className="w-[72px] shrink-0 px-1.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs font-bold text-[#004175] focus:outline-none focus:border-[#004175] cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                                >
                                  <option value="id">ID</option>
                                  <option value="en">EN</option>
                                  <option value="both">ID+EN</option>
                                </select>
                                {isDefaultRule ? (
                                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-100/60 text-[#004175] text-[9px] font-black uppercase tracking-widest">
                                    Default
                                  </span>
                                ) : (
                                  <button onClick={() => setDeleteRuleTarget(rule)} title="Hapus aturan" className="shrink-0 p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
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

                  {/* Input Tambah Aturan Baru */}
                  <div className="min-w-[620px] px-4 py-3 border-t border-gray-200 bg-gray-50/30">
                    <div className="flex items-center gap-2">
                      <div className="w-5 shrink-0" />
                      <input
                        value={newFrom}
                        onChange={e => setNewFrom(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addRule()}
                        placeholder='Teks asli, misal: "Dr"'
                        className="flex-[2] min-w-0 px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-sm font-mono focus:outline-none focus:border-[#004175]"
                      />
                      <span className="text-gray-300 text-sm font-bold shrink-0">→</span>
                      <input
                        value={newTo}
                        onChange={e => setNewTo(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addRule()}
                        placeholder='Dibaca sebagai, misal: "Dokter"'
                        className="flex-[2] min-w-0 px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-sm focus:outline-none focus:border-[#004175]"
                      />
                      <select
                        value={newLang}
                        onChange={e => setNewLang(e.target.value as 'id' | 'en' | 'both')}
                        aria-label="Bahasa aturan baru"
                        className="w-[72px] shrink-0 px-1.5 py-1.5 rounded-lg bg-white border border-gray-300 text-xs font-bold text-[#004175] focus:outline-none focus:border-[#004175] cursor-pointer"
                      >
                        <option value="id">ID</option>
                        <option value="en">EN</option>
                        <option value="both">ID+EN</option>
                      </select>
                      <button
                        onClick={addRule}
                        disabled={!newFrom.trim()}
                        title="Tambah aturan"
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-[#004175] text-[#F9BB00] rounded-lg text-xs font-bold hover:bg-[#003159] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                      >
                        <Plus className="w-3 h-3" /> Tambah
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. KARTU INFORMASI SISTEM & PEMBARUAN (GABUNGAN SATU FITUR) */}
              <div className="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden space-y-0">
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                      <img src="/logo_aplikasi.png" alt="SIMANTU" className="w-12 h-12 rounded-2xl border border-gray-100 shadow-sm" />
                      <div>
                        <h4 className="font-display font-black text-xl text-[#004175]">SIMANTU<span className="text-[#F9BB00]">.</span></h4>
                        <p className="text-gray-400 text-xs font-medium">Sistem Informasi Pengumuman Terpadu</p>
                      </div>
                    </div>
                    {(window as any).electronAPI && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setCheckingUpdate(true);
                            (window as any).electronAPI?.checkForUpdates?.();
                          }}
                          disabled={checkingUpdate}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#004175] text-[#F9BB00] rounded-xl text-xs font-bold hover:bg-[#003159] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 transition-transform ${checkingUpdate ? 'animate-spin' : ''}`} />
                          {checkingUpdate ? 'Memeriksa...' : 'Periksa Update'}
                        </button>
                        {updateInfo?.type === 'downloaded' && (
                          <button
                            onClick={() => (window as any).electronAPI?.installUpdateNow?.()}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#F9BB00] text-[#004175] rounded-xl text-xs font-bold hover:bg-[#e0a800] shadow-sm transition-all"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Pasang &amp; Restart
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status Pembaruan (jika ada respons update) */}
                  {updateInfo && (
                    <div className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2 ${
                      updateInfo.type === 'downloaded' || updateInfo.type === 'not-available' ? 'bg-blue-50 text-[#004175] border border-blue-100' :
                      updateInfo.type === 'available' || updateInfo.type === 'downloading' ? 'bg-blue-50 text-[#004175] border border-blue-100' :
                      updateInfo.type === 'error' ? 'bg-red-50 text-red-700' :
                      'bg-gray-50 text-gray-500'
                    }`}>
                      <span className="mt-0.5 shrink-0 font-black text-sm leading-none">
                        {updateInfo.type === 'downloaded' || updateInfo.type === 'not-available' ? '✓' :
                         updateInfo.type === 'error' ? '!' : '↻'}
                      </span>
                      <span className="flex-1 leading-relaxed">{updateInfo.message}</span>
                      {updateInfo.version && (
                        <span className="shrink-0 font-bold text-[10px] opacity-70 ml-2">{updateInfo.version}</span>
                      )}
                    </div>
                  )}

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-200/60 rounded-xl overflow-hidden border border-gray-200/60">
                    <div className="p-3 bg-gray-50">
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Versi</p>
                      <p className="text-xs font-bold text-[#004175]">{APP_VERSION}</p>
                    </div>
                    <div className="p-3 bg-gray-50">
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Platform</p>
                      <p className="text-xs font-bold text-[#004175]">Electron Desktop</p>
                    </div>
                    <div className="p-3 bg-gray-50">
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Framework</p>
                      <p className="text-xs font-bold text-[#004175]">React + Express</p>
                    </div>
                    <div className="p-3 bg-gray-50">
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Lokus</p>
                      <p className="text-xs font-bold text-[#004175] truncate" title="Perpustakaan dan Arsip UGM">Perpustakaan &amp; Arsip</p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
                  <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest text-center">
                    &copy; {new Date().getFullYear()} SIMANTU &mdash; Perpustakaan dan Arsip UGM
                  </p>
                </div>
              </div>

            </div>
          </div>
        </main>

        <RightPanel />
      </div>

      {/* Konfirmasi Hapus API Key */}
      <ConfirmDialog
        open={confirmDeleteKey}
        onOpenChange={setConfirmDeleteKey}
        onConfirm={() => {
          setGeminiApiKey("");
          setIsEditingGeminiKey(false);
          setShowGeminiKey(false);
          setConfirmDeleteKey(false);
          toast({ title: "API Key Dihapus", description: "Konfigurasi Gemini API key telah dihapus dari aplikasi." });
        }}
        title="Hapus Gemini API Key"
        description="Apakah Anda yakin ingin menghapus API key ini? Anda tidak akan dapat menggunakan engine suara Gemini sampai API key baru dimasukkan."
      />

      {/* Konfirmasi Hapus File Bell Kustom */}
      <ConfirmDialog
        open={deleteBellTarget !== null}
        onOpenChange={(open) => !open && setDeleteBellTarget(null)}
        onConfirm={() => {
          if (deleteBellTarget) {
            deleteBellFromLibrary(deleteBellTarget.id);
            toast({
              title: "File Bell Dihapus",
              description: `File bell "${deleteBellTarget.name}" telah dihapus dari daftar.`,
            });
          }
          setDeleteBellTarget(null);
        }}
        title="Hapus File Bell"
        description={`Apakah Anda yakin ingin menghapus file bell "${deleteBellTarget?.name}"? Tindakan ini tidak dapat dibatalkan.`}
      />

      {/* Konfirmasi Hapus Aturan Pengucapan */}
      <ConfirmDialog
        open={deleteRuleTarget !== null}
        onOpenChange={(open) => !open && setDeleteRuleTarget(null)}
        onConfirm={() => {
          if (deleteRuleTarget) {
            deleteRule(deleteRuleTarget.id);
            toast({
              title: "Aturan Dihapus",
              description: `Aturan pengucapan untuk "${deleteRuleTarget.from}" telah dihapus.`,
            });
          }
          setDeleteRuleTarget(null);
        }}
        title="Hapus Aturan Pengucapan"
        description={`Apakah Anda yakin ingin menghapus aturan pengucapan untuk "${deleteRuleTarget?.from}"?`}
      />
    </div>
  );
}
