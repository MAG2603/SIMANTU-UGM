import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const VOICE_PRESETS: Record<string, { id: string; en: string }> = {
  "Pria": { id: "id-ID-ArdiNeural", en: "en-US-AndrewMultilingualNeural" },
  "Wanita": { id: "fr-FR-VivienneMultilingualNeural", en: "en-US-AvaMultilingualNeural" },
};

export interface SpellingRule {
  id: string;
  from: string;
  to: string;
  enabled: boolean;
  lang: 'id' | 'en' | 'both';
}

const DEFAULT_SPELLING_RULES: SpellingRule[] = [
  { id: "default-ugm", from: "UGM", to: "U G M", enabled: true, lang: "id" },
  { id: "default-l1", from: "L1", to: "L Satu", enabled: true, lang: "id" },
  { id: "default-l5", from: "L5", to: "L Lima", enabled: true, lang: "id" },
  { id: "default-etd", from: "ETD", to: "E T D", enabled: true, lang: "id" },
  { id: "default-wib", from: "WIB", to: "Waktu Indonesia Barat", enabled: true, lang: "id" },
];

function normalizeSpellingRules(rules: SpellingRule[]): SpellingRule[] {
  return rules.map((r) => ({ ...r, lang: r.lang || "id" }));
}

function mergeWithDefaultSpellingRules(rules: SpellingRule[]): SpellingRule[] {
  const merged = new Map<string, SpellingRule>();
  const defaultKeys = new Set<string>();

  for (const rule of DEFAULT_SPELLING_RULES) {
    const key = `${rule.from.trim().toLowerCase()}|${rule.lang}`;
    defaultKeys.add(key);
    merged.set(key, rule);
  }

  for (const rule of normalizeSpellingRules(rules)) {
    if (!rule.from.trim()) continue;
    const key = `${rule.from.trim().toLowerCase()}|${rule.lang}`;
    // Built-in defaults are system-owned: keep them stable and always present.
    if (rule.id.startsWith("default-") || defaultKeys.has(key)) continue;
    merged.set(key, rule);
  }

  return Array.from(merged.values());
}

export interface BellItem {
  id: string;
  name: string;
  data: string; // data URL
}

// Legacy alias kept so existing JSON in localStorage deserialises cleanly
export type CustomBell = BellItem;

export interface QueueItem {
  id: string;
  textId: string;
  textEn: string;
  voice: string;
  voiceEn: string;
  label: string; // short display text
}

export interface PendingScheduledPlayback {
  scheduleId: number;
  title: string;
  playTime: string;
  recurring: boolean;
}

type ScheduleNotificationStage = "five-min" | "one-min" | "start";

function getScheduleNotificationKey(scheduleId: number, playTime: string): string {
  return `${scheduleId}:${playTime}`;
}

function hasScheduleNotificationStage(
  notificationStore: Map<string, Set<ScheduleNotificationStage>>,
  key: string,
  stage: ScheduleNotificationStage,
): boolean {
  return notificationStore.get(key)?.has(stage) ?? false;
}

function markScheduleNotificationStage(
  notificationStore: Map<string, Set<ScheduleNotificationStage>>,
  key: string,
  stage: ScheduleNotificationStage,
): void {
  const existingStages = notificationStore.get(key) ?? new Set<ScheduleNotificationStage>();
  existingStages.add(stage);
  notificationStore.set(key, existingStages);
}

function pruneScheduleNotificationStore(
  notificationStore: Map<string, Set<ScheduleNotificationStage>>,
  activeKeys: Set<string>,
): void {
  notificationStore.forEach((_value, key) => {
    if (!activeKeys.has(key)) {
      notificationStore.delete(key);
    }
  });
}

interface AppContextType {
  textId: string;
  setTextId: (text: string) => void;
  textEn: string;
  setTextEn: (text: string) => void;
  voice: string;
  setVoice: (voice: string) => void;
  voiceEn: string;
  setVoiceEn: (voice: string) => void;
  isPlaying: boolean;
  isPreparing: boolean;
  bellEnabled: boolean;
  setBellEnabled: (enabled: boolean) => void;
  analyserNode: AnalyserNode | null;
  volume: number;
  setVolume: (v: number) => void;
  audioOutputId: string;
  setAudioOutputId: (id: string) => void;
  schedulerEnabled: boolean;
  setSchedulerEnabled: (v: boolean) => void;
  playAudio: (idText?: string, enText?: string, voiceName?: string, voiceEnName?: string) => Promise<void>;
  stopAudio: () => void;
  clearText: () => void;
  resetApp: () => void;
  spellingRules: SpellingRule[];
  setSpellingRules: (rules: SpellingRule[]) => void;
  bellLibrary: BellItem[];
  setBellLibrary: (bells: BellItem[]) => void;
  activeBellOpeningId: string | null;
  setActiveBellOpeningId: (id: string | null) => void;
  activeBellEndingId: string | null;
  setActiveBellEndingId: (id: string | null) => void;
  announcementQueue: QueueItem[];
  addToQueue: (item: Omit<QueueItem, 'id'>) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  pendingScheduledPlayback: PendingScheduledPlayback | null;
  deferScheduledPlayback: (scheduleId: number) => void;
  clearDeferredScheduledPlayback: () => void;
  confirmPendingScheduledPlayback: () => Promise<void>;
  skipPendingScheduledPlayback: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Module-level volume store so gain is correct even before first playback
let _pendingVolume = 1.0;

function getAudioContext(): AudioContext {
  if (!(window as any).__simantuAudioCtx) {
    (window as any).__simantuAudioCtx = new AudioContext();
  }
  return (window as any).__simantuAudioCtx;
}

function getGainNode(): GainNode {
  if (!(window as any).__simantuGain) {
    const ctx = getAudioContext();
    const gain = ctx.createGain();
    gain.gain.value = _pendingVolume;
    gain.connect(ctx.destination);
    (window as any).__simantuGain = gain;
  }
  return (window as any).__simantuGain;
}

function getAnalyserNode(): AnalyserNode {
  if (!(window as any).__simantuAnalyser) {
    const ctx = getAudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.3;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    analyser.connect(getGainNode()); // → GainNode → destination
    (window as any).__simantuAnalyser = analyser;
  }
  return (window as any).__simantuAnalyser;
}

// Fetch a URL and decode to AudioBuffer via Web Audio API.
// This completely bypasses the HTML Media Element, avoiding all codec/NotSupported errors.
async function fetchAndDecode(url: string): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${url}: ${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();
  return ctx.decodeAudioData(ab);
}

// Play a decoded AudioBuffer through the analyser to speakers.
function playBuffer(
  buffer: AudioBuffer,
  nodeRef: React.MutableRefObject<AudioBufferSourceNode | null>
): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") ctx.resume();
  const analyser = getAnalyserNode();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(analyser);
  nodeRef.current = source;
  return new Promise<void>((resolve) => {
    source.onended = () => {
      // Only clear ref if this exact source is still the active one.
      if (nodeRef.current === source) nodeRef.current = null;
      resolve();
    };
    source.start(0);
  });
}

// Send a desktop notification (silent if permission not granted yet)
function sendNotification(title: string, body: string, icon = '🔊', duration = 5500) {
  // Electron custom overlay notification (preferred — full design control)
  try {
    if ((window as any).electronAPI?.showNotification) {
      (window as any).electronAPI.showNotification({ title, body, icon, duration });
      return;
    }
  } catch (err) {
    console.warn('[SIMANTU] Electron notification failed:', err);
  }
  
  // Fallback: Web Notification API (browser / non-Electron)
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    try {
      const n = new Notification(title, {
        body,
        icon: '/logo_aplikasi.png',
        silent: false,
      });
      setTimeout(() => n.close(), duration);
    } catch (err) {
      console.warn('[SIMANTU] Web notification failed:', err);
    }
  }
}

// Cache decoded bell AudioBuffers so they're not re-fetched every playback
const bellCache = new Map<string, AudioBuffer>();
async function getBell(url: string): Promise<AudioBuffer> {
  if (!bellCache.has(url)) {
    bellCache.set(url, await fetchAndDecode(url));
  }
  return bellCache.get(url)!;
}

async function getBellFromLibrary(library: BellItem[], activeId: string | null, defaultUrl: string): Promise<AudioBuffer> {
  if (activeId) {
    const bell = library.find(b => b.id === activeId);
    if (bell) {
      const cacheKey = "bell:" + bell.id;
      if (!bellCache.has(cacheKey)) {
        const ctx = getAudioContext();
        const res = await fetch(bell.data);
        const ab = await res.arrayBuffer();
        bellCache.set(cacheKey, await ctx.decodeAudioData(ab));
      }
      return bellCache.get(cacheKey)!;
    }
  }
  return getBell(defaultUrl);
}

function applySpellingRules(text: string, rules: SpellingRule[], lang: 'id' | 'en'): string {
  let result = text;
  for (const rule of rules) {
    if (!rule.enabled || !rule.from.trim()) continue;
    if (rule.lang !== 'both' && rule.lang !== lang) continue;
    try {
      const escaped = rule.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isWordLike = /^[A-Za-z0-9]+$/.test(rule.from.trim());
      const pattern = isWordLike ? `\\b${escaped}\\b` : escaped;
      result = result.replace(new RegExp(pattern, 'gi'), () => rule.to);
    } catch { /* skip invalid pattern */ }
  }
  return result;
}

// Synthesize TTS on server (returns MPEG1 L3 after transcoding), decode via Web Audio API.
async function fetchTtsBuffer(text: string, voiceId: string): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: voiceId }),
  });
  if (!res.ok) throw new Error("TTS request failed: " + res.status);
  const ab = await res.arrayBuffer();
  return ctx.decodeAudioData(ab);
}

export function AppProvider({ children }: { children: ReactNode }) {
  // Refs keep the latest text/voice values readable inside useCallback without
  // needing to list them as deps — prevents playAudio from being recreated on
  // every keystroke (which would reset the scheduler's 30-second interval).
  const [textId, setTextIdRaw] = useState("");
  const textIdRef = useRef("");
  const setTextId = useCallback((v: string) => { textIdRef.current = v; setTextIdRaw(v); }, []);

  const [textEn, setTextEnRaw] = useState("");
  const textEnRef = useRef("");
  const setTextEn = useCallback((v: string) => { textEnRef.current = v; setTextEnRaw(v); }, []);

  const [voice, setVoiceRaw] = useState("Pria");
  const voiceRef = useRef("Pria");
  const setVoice = useCallback((v: string) => { voiceRef.current = v; setVoiceRaw(v); }, []);

  const [voiceEn, setVoiceEnRaw] = useState("Pria");
  const voiceEnRef = useRef("Pria");
  const setVoiceEn = useCallback((v: string) => { voiceEnRef.current = v; setVoiceEnRaw(v); }, []);

  const [isPlaying, setIsPlayingRaw] = useState(false);
  const [isPreparing, setIsPreparingRaw] = useState(false);
  const isPlayingRef = useRef(false);
  const isPreparingRef = useRef(false);
  const setIsPlaying = (v: boolean) => { isPlayingRef.current = v; setIsPlayingRaw(v); };
  const setIsPreparing = (v: boolean) => { isPreparingRef.current = v; setIsPreparingRaw(v); };
  const [bellEnabled, setBellEnabled] = useState(true);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const stopRequested = useRef(false);
  const playbackSessionRef = useRef(0);
  const queuePlayTimeoutRef = useRef<number | null>(null);
  const schedulerCheckInFlightRef = useRef(false);
  const schedulerProcessingIdsRef = useRef<Set<number>>(new Set());
  const scheduleNotificationStagesRef = useRef<Map<string, Set<ScheduleNotificationStage>>>(new Map());
  const deferredScheduleIdRef = useRef<number | null>(null);
  const [announcementQueue, setAnnouncementQueueRaw] = useState<QueueItem[]>([]);
  const announcementQueueRef = useRef<QueueItem[]>([]);
  const [pendingScheduledPlaybackRaw, setPendingScheduledPlaybackRaw] = useState<PendingScheduledPlayback | null>(null);
  const pendingScheduledPlaybackRef = useRef<PendingScheduledPlayback | null>(null);
  const { toast } = useToast();

  const setPendingScheduledPlayback = (value: PendingScheduledPlayback | null) => {
    pendingScheduledPlaybackRef.current = value;
    setPendingScheduledPlaybackRaw(value);
  };

  const [volume, setVolumeState] = useState<number>(() => {
    const stored = localStorage.getItem("simantu_volume");
    return stored ? parseInt(stored, 10) : 100;
  });
  const [audioOutputId, setAudioOutputIdState] = useState<string>(() => {
    return localStorage.getItem("simantu_output_id") ?? "";
  });

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    _pendingVolume = v / 100;
    if ((window as any).__simantuGain) {
      (window as any).__simantuGain.gain.value = v / 100;
    }
    localStorage.setItem("simantu_volume", String(v));
  }, []);

  const setAudioOutputId = useCallback((id: string) => {
    setAudioOutputIdState(id);
    localStorage.setItem("simantu_output_id", id);
    // Apply to existing AudioContext if available, otherwise it will be picked up on next playback
    const ctx = (window as any).__simantuAudioCtx;
    if (ctx && typeof ctx.setSinkId === 'function') {
      ctx.setSinkId(id || "default").catch((e: Error) => console.warn("[SIMANTU] setSinkId failed:", e.message));
    }
  }, []);

  const [schedulerEnabled, setSchedulerEnabledState] = useState<boolean>(() => {
    const stored = localStorage.getItem("simantu_scheduler_enabled");
    return stored !== null ? stored === "true" : true;
  });
  const setSchedulerEnabled = useCallback((v: boolean) => {
    setSchedulerEnabledState(v);
    localStorage.setItem("simantu_scheduler_enabled", String(v));
  }, []);

  const [spellingRules, setSpellingRulesState] = useState<SpellingRule[]>(() => {
    try {
      const s = localStorage.getItem("simantu_spelling_rules");
      if (!s) return DEFAULT_SPELLING_RULES;
      const parsed: SpellingRule[] = JSON.parse(s);
      return mergeWithDefaultSpellingRules(parsed);
    } catch { return DEFAULT_SPELLING_RULES; }
  });
  const setSpellingRules = useCallback((rules: SpellingRule[]) => {
    const merged = mergeWithDefaultSpellingRules(rules);
    setSpellingRulesState(merged);
    localStorage.setItem("simantu_spelling_rules", JSON.stringify(merged));
  }, []);

  const [bellLibrary, setBellLibraryState] = useState<BellItem[]>(() => {
    try {
      // Migrate old single-bell storage
      const lib = localStorage.getItem("simantu_bell_library");
      if (lib) return JSON.parse(lib);
      const items: BellItem[] = [];
      const opening = localStorage.getItem("simantu_bell_opening");
      if (opening) { const b = JSON.parse(opening); items.push({ id: "migrated_opening", name: b.name, data: b.data }); }
      const ending = localStorage.getItem("simantu_bell_ending");
      if (ending) { const b = JSON.parse(ending); if (!items.find(x => x.data === b.data)) items.push({ id: "migrated_ending", name: b.name, data: b.data }); }
      return items;
    } catch { return []; }
  });
  const setBellLibrary = useCallback((bells: BellItem[]) => {
    setBellLibraryState(bells);
    localStorage.setItem("simantu_bell_library", JSON.stringify(bells));
    // Clear cache for removed bells
    bellCache.forEach((_value, key) => {
      if (key.startsWith("bell:") && !bells.find(b => "bell:" + b.id === key)) {
        bellCache.delete(key);
      }
    });
  }, []);

  const [activeBellOpeningId, setActiveBellOpeningIdState] = useState<string | null>(() => {
    try {
      const s = localStorage.getItem("simantu_active_bell_opening");
      if (s) return s;
      // Migrate
      const old = localStorage.getItem("simantu_bell_opening");
      return old ? "migrated_opening" : null;
    } catch { return null; }
  });
  const setActiveBellOpeningId = useCallback((id: string | null) => {
    setActiveBellOpeningIdState(id);
    if (id) localStorage.setItem("simantu_active_bell_opening", id);
    else localStorage.removeItem("simantu_active_bell_opening");
  }, []);

  const [activeBellEndingId, setActiveBellEndingIdState] = useState<string | null>(() => {
    try {
      const s = localStorage.getItem("simantu_active_bell_ending");
      if (s) return s;
      const old = localStorage.getItem("simantu_bell_ending");
      return old ? "migrated_ending" : null;
    } catch { return null; }
  });
  const setActiveBellEndingId = useCallback((id: string | null) => {
    setActiveBellEndingIdState(id);
    if (id) localStorage.setItem("simantu_active_bell_ending", id);
    else localStorage.removeItem("simantu_active_bell_ending");
  }, []);

  const addToQueue = useCallback((item: Omit<QueueItem, 'id'>) => {
    const qi: QueueItem = { ...item, id: crypto.randomUUID() };
    setAnnouncementQueueRaw(prev => {
      const next = [...prev, qi];
      announcementQueueRef.current = next;
      return next;
    });
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setAnnouncementQueueRaw(prev => {
      const next = prev.filter(x => x.id !== id);
      announcementQueueRef.current = next;
      return next;
    });
  }, []);

  const clearQueue = useCallback(() => {
    announcementQueueRef.current = [];
    setAnnouncementQueueRaw([]);
  }, []);

  const updateScheduleEntry = useCallback(async (id: number, updates: Record<string, unknown>) => {
    const res = await fetch(`/api/schedules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      throw new Error(`Failed to update schedule ${id}`);
    }
    return res.json();
  }, []);

  const finalizeSkippedSchedule = useCallback(async (schedule: { id: number; playTime: string; recurring?: boolean }) => {
    if (schedule.recurring) {
      const nextPlay = new Date(schedule.playTime);
      nextPlay.setDate(nextPlay.getDate() + 1);
      await updateScheduleEntry(schedule.id, { playTime: nextPlay.toISOString(), status: "Waiting" });
    } else {
      await updateScheduleEntry(schedule.id, { status: "Done" });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
  }, [updateScheduleEntry]);

  const fetchScheduleContext = useCallback(async (scheduleId: number) => {
    const [schedulesRes, announcementsRes] = await Promise.all([
      fetch("/api/schedules"),
      fetch("/api/announcements"),
    ]);

    if (!schedulesRes.ok || !announcementsRes.ok) {
      throw new Error("Failed to load schedule context");
    }

    const schedules = await schedulesRes.json();
    const announcements = await announcementsRes.json();
    const schedule = schedules.find((item: any) => item.id === scheduleId);
    const announcement = schedule
      ? announcements.find((item: any) => item.id === schedule.announcementId)
      : null;

    return { schedule, announcement };
  }, []);

  const clearDeferredScheduledPlayback = useCallback(() => {
    deferredScheduleIdRef.current = null;
    setPendingScheduledPlayback(null);
  }, []);

  const promptDeferredScheduledPlayback = useCallback(async () => {
    const deferredScheduleId = deferredScheduleIdRef.current;
    if (!schedulerEnabled || deferredScheduleId === null) return;
    if (isPlayingRef.current || isPreparingRef.current) return;
    if (announcementQueueRef.current.length > 0 || queuePlayTimeoutRef.current !== null) return;
    if (pendingScheduledPlaybackRef.current?.scheduleId === deferredScheduleId) return;

    try {
      const { schedule, announcement } = await fetchScheduleContext(deferredScheduleId);

      if (!schedule) {
        clearDeferredScheduledPlayback();
        return;
      }

      if (schedule.status === "Done") {
        clearDeferredScheduledPlayback();
        return;
      }

      if (schedule.status === "Playing") {
        await updateScheduleEntry(schedule.id, { status: "Waiting" });
        queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      }

      if (new Date(schedule.playTime).getTime() > Date.now()) {
        return;
      }

      setPendingScheduledPlayback({
        scheduleId: schedule.id,
        title: announcement?.title || "Pengumuman Terjadwal",
        playTime: schedule.playTime,
        recurring: Boolean(schedule.recurring),
      });
    } catch (err) {
      console.error("Failed to prepare deferred schedule prompt:", err);
    }
  }, [clearDeferredScheduledPlayback, fetchScheduleContext, schedulerEnabled, updateScheduleEntry]);

  const deferScheduledPlayback = useCallback((scheduleId: number) => {
    deferredScheduleIdRef.current = scheduleId;
    setPendingScheduledPlayback(null);
    void promptDeferredScheduledPlayback();
  }, [promptDeferredScheduledPlayback]);

  const skipPendingScheduledPlayback = useCallback(async () => {
    const pending = pendingScheduledPlaybackRef.current;
    if (!pending) return;

    try {
      const { schedule } = await fetchScheduleContext(pending.scheduleId);
      if (schedule) {
        await finalizeSkippedSchedule(schedule);
      }
    } catch (err) {
      console.error("Failed to skip deferred schedule:", err);
      toast({
        title: "Gagal Melewati Jadwal",
        description: "Jadwal tidak dapat diperbarui saat ini.",
        variant: "destructive",
      });
      return;
    }

    clearDeferredScheduledPlayback();
  }, [clearDeferredScheduledPlayback, fetchScheduleContext, finalizeSkippedSchedule, toast]);

  // Request notification permission on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    void promptDeferredScheduledPlayback();
  }, [isPlaying, isPreparing, promptDeferredScheduledPlayback]);

  const stopAudio = useCallback(() => {
    playbackSessionRef.current += 1; // invalidate all in-flight async playback work
    stopRequested.current = true;
    if (queuePlayTimeoutRef.current !== null) {
      window.clearTimeout(queuePlayTimeoutRef.current);
      queuePlayTimeoutRef.current = null;
    }
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (_) {}
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    setIsPreparing(false);
    announcementQueueRef.current = [];
    setAnnouncementQueueRaw([]);
  }, []);

  const clearText = useCallback(() => {
    setTextId("");
    setTextEn("");
  }, []);

  const resetApp = useCallback(() => {
    playbackSessionRef.current += 1; // invalidate all in-flight async playback work
    stopRequested.current = true;
    if (queuePlayTimeoutRef.current !== null) {
      window.clearTimeout(queuePlayTimeoutRef.current);
      queuePlayTimeoutRef.current = null;
    }
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (_) {}
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    setIsPreparing(false);
    announcementQueueRef.current = [];
    setAnnouncementQueueRaw([]);
    setTextId("");
    setTextEn("");
    setVoice("Pria");
    setVoiceEn("Pria");
    setBellEnabled(true);
  }, []);

  const playAudio = useCallback(async (idText?: string, enText?: string, voiceName?: string, voiceEnName?: string) => {
    const id = idText ?? textIdRef.current;
    const en = enText ?? textEnRef.current;
    const vId = voiceName ?? voiceRef.current;
    const vEn = voiceEnName ?? voiceEnRef.current;
    const presetId = VOICE_PRESETS[vId] || VOICE_PRESETS["Pria"];
    const presetEn = VOICE_PRESETS[vEn] || VOICE_PRESETS["Pria"];

    // While preparing, ignore new play requests to avoid duplicate starts/races.
    if (isPreparingRef.current) {
      toast({
        title: "Sedang Memuat",
        description: "Tunggu proses persiapan selesai sebelum menjalankan pengumuman lagi.",
      });
      return;
    }

    // If already playing, add to queue instead of interrupting.
    if (isPlayingRef.current) {
      const label = (id || en).slice(0, 50) || 'Pengumuman';
      addToQueue({ textId: id, textEn: en, voice: vId, voiceEn: vEn, label });
      toast({
        title: "📋 Ditambahkan ke Antrian",
        description: `"${label}" akan diputar setelah pengumuman saat ini selesai.`,
      });
      return;
    }

    // Start a new playback session and invalidate older in-flight sessions.
    const sessionId = playbackSessionRef.current + 1;
    playbackSessionRef.current = sessionId;
    if (queuePlayTimeoutRef.current !== null) {
      window.clearTimeout(queuePlayTimeoutRef.current);
      queuePlayTimeoutRef.current = null;
    }
    const isSessionActive = () => sessionId === playbackSessionRef.current && !stopRequested.current;

    // Phase 1: synthesize + decode TTS in parallel via Web Audio API
    stopRequested.current = false;
    setIsPreparing(true);
    let idBuffer: AudioBuffer | null = null;
    let enBuffer: AudioBuffer | null = null;
    try {
      const processedId = applySpellingRules(id, spellingRules, 'id');
      const processedEn = applySpellingRules(en, spellingRules, 'en');
      const fetches: Promise<void>[] = [];
      if (processedId.trim()) fetches.push(fetchTtsBuffer(processedId, presetId.id).then(b => { idBuffer = b; }));
      if (processedEn.trim()) fetches.push(fetchTtsBuffer(processedEn, presetEn.en).then(b => { enBuffer = b; }));
      await Promise.all(fetches);
    } catch (err) {
      if (sessionId !== playbackSessionRef.current) return;
      console.error("[SIMANTU] TTS preparation failed:", err);
      setIsPreparing(false);
      toast({
        title: "Gagal Memuat Pengumuman",
        description: (err as Error).message || "Terjadi kesalahan saat menghubungi server TTS.",
        variant: "destructive",
      });
      return;
    }
    if (!isSessionActive()) return;

    // Phase 2: play sequentially via AudioBufferSourceNode (also drives spectrum)
    setAnalyserNode(getAnalyserNode());
    setIsPreparing(false);
    setIsPlaying(true);
    try {
      if (bellEnabled && isSessionActive()) {
        const opening = await getBellFromLibrary(bellLibrary, activeBellOpeningId, "/Opening.mp3");
        if (!isSessionActive()) return;
        await playBuffer(opening, sourceNodeRef);
        if (!isSessionActive()) return;
      }
      if (idBuffer && isSessionActive()) {
        await playBuffer(idBuffer, sourceNodeRef);
        if (!isSessionActive()) return;
      }
      if (idBuffer && enBuffer && bellEnabled && isSessionActive()) {
        const middleBell = await getBellFromLibrary(bellLibrary, activeBellOpeningId, "/Opening.mp3");
        if (!isSessionActive()) return;
        await playBuffer(middleBell, sourceNodeRef);
        if (!isSessionActive()) return;
      }
      if (enBuffer && isSessionActive()) {
        await playBuffer(enBuffer, sourceNodeRef);
        if (!isSessionActive()) return;
      }
      if (bellEnabled && isSessionActive()) {
        const ending = await getBellFromLibrary(bellLibrary, activeBellEndingId, "/Ending.mp3");
        if (!isSessionActive()) return;
        await playBuffer(ending, sourceNodeRef);
      }
    } catch (err) {
      console.error("[SIMANTU] Playback error:", err);
    } finally {
      if (sessionId === playbackSessionRef.current) {
        setIsPlaying(false);
      }
      // Automatically play next item from queue (only if not manually stopped)
      if (sessionId === playbackSessionRef.current && !stopRequested.current) {
        const nextQueue = announcementQueueRef.current;
        if (nextQueue.length > 0) {
          const [next, ...rest] = nextQueue;
          announcementQueueRef.current = rest;
          setAnnouncementQueueRaw(rest);
          queuePlayTimeoutRef.current = window.setTimeout(() => {
            queuePlayTimeoutRef.current = null;
            if (sessionId !== playbackSessionRef.current || stopRequested.current) return;
            playAudio(next.textId, next.textEn, next.voice, next.voiceEn);
          }, 300);
        }
      }
    }
  }, [bellEnabled, spellingRules, bellLibrary, activeBellOpeningId, activeBellEndingId, toast, addToQueue]);

  const confirmPendingScheduledPlayback = useCallback(async () => {
    const pending = pendingScheduledPlaybackRef.current;
    if (!pending) return;

    if (
      isPlayingRef.current ||
      isPreparingRef.current ||
      announcementQueueRef.current.length > 0 ||
      queuePlayTimeoutRef.current !== null
    ) {
      toast({
        title: "Masih Ada Pengumuman Berjalan",
        description: "Selesaikan pengumuman aktif terlebih dahulu sebelum memutar jadwal tertunda.",
      });
      return;
    }

    try {
      const { schedule, announcement } = await fetchScheduleContext(pending.scheduleId);
      if (!schedule || !announcement) {
        clearDeferredScheduledPlayback();
        return;
      }

      let claimedNow = false;
      if (schedule.status === "Waiting") {
        const claimRes = await fetch(`/api/schedules/${schedule.id}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (claimRes.status === 404 || claimRes.status === 409) {
          clearDeferredScheduledPlayback();
          queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
          return;
        }
        if (!claimRes.ok) {
          throw new Error(`Failed to claim schedule ${schedule.id}`);
        }
        claimedNow = true;
      }

      const previousPrompt = pendingScheduledPlaybackRef.current;
      setPendingScheduledPlayback(null);

      const voiceParts = (announcement.voice || "Pria").split("/");
      const sessionBefore = playbackSessionRef.current;
      await playAudio(announcement.contentId, announcement.contentEn, voiceParts[0], voiceParts[1] || voiceParts[0]);

      const started = playbackSessionRef.current > sessionBefore;
      if (!started) {
        if (claimedNow) {
          await updateScheduleEntry(schedule.id, { status: "Waiting" });
          queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
        }
        setPendingScheduledPlayback(previousPrompt);
        return;
      }

      deferredScheduleIdRef.current = null;
      if (schedule.recurring) {
        const nextPlay = new Date(schedule.playTime);
        nextPlay.setDate(nextPlay.getDate() + 1);
        await updateScheduleEntry(schedule.id, { playTime: nextPlay.toISOString(), status: "Waiting" });
      } else {
        await updateScheduleEntry(schedule.id, { status: "Done" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
    } catch (err) {
      console.error("Failed to confirm deferred schedule playback:", err);
      toast({
        title: "Jadwal Tidak Dapat Diputar",
        description: "Terjadi kendala saat menyiapkan pengumuman terjadwal.",
        variant: "destructive",
      });
    }
  }, [clearDeferredScheduledPlayback, fetchScheduleContext, playAudio, toast, updateScheduleEntry]);

  // Surface Electron updater events into in-app toast feedback.
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.onUpdateStatus) return;

    const seenEvents = new Set<string>();

    const handleUpdateStatus = (_event: unknown, payload?: { type?: string; message?: string; version?: string }) => {
      const type = payload?.type;
      const message = payload?.message;
      if (!type || !message) return;

      // Skip noisy heartbeat events and only notify meaningful state changes.
      if (type === "checking" || type === "downloading") return;

      const dedupeKey = `${type}:${payload?.version ?? ""}:${message}`;
      if (seenEvents.has(dedupeKey)) return;
      seenEvents.add(dedupeKey);

      const title =
        type === "available"
          ? "Pembaruan Ditemukan"
          : type === "downloaded"
            ? "Pembaruan Siap Diinstal"
            : type === "not-available"
              ? "Tidak Ada Pembaruan"
              : type === "error"
                ? "Pembaruan Gagal"
                : "Status Pembaruan";

      toast({
        title,
        description: message,
        variant: type === "error" ? "destructive" : "default",
      });
    };

    electronAPI.onUpdateStatus(handleUpdateStatus);
    return () => {
      electronAPI.offUpdateStatus?.(handleUpdateStatus);
    };
  }, [toast]);

  // Stop audio when Electron window is hidden to tray
  useEffect(() => {
    const handleWindowHide = () => stopAudio();
    (window as any).electronAPI?.onWindowHide?.(handleWindowHide);
    return () => { (window as any).electronAPI?.offWindowHide?.(handleWindowHide); };
  }, [stopAudio]);

  // Always-active scheduler (alarm-like)
  useEffect(() => {
    const checkSchedules = async () => {
      if (schedulerCheckInFlightRef.current) return;
      if (!schedulerEnabled) return;
      if (isPlayingRef.current || isPreparingRef.current) return;
      if (announcementQueueRef.current.length > 0 || queuePlayTimeoutRef.current !== null) return;

      schedulerCheckInFlightRef.current = true;
      try {
        const schedulesRes = await fetch("/api/schedules");
        const schedules = await schedulesRes.json();
        const announcementsRes = await fetch("/api/announcements");
        const announcements = await announcementsRes.json();
        const now = new Date();

        const FIVE_MIN = 5 * 60 * 1000;
        const ONE_MIN = 1 * 60 * 1000;
        const GRACE_MS = 5 * 60 * 1000; // skip schedules missed by >5 minutes

        const activeScheduleNotificationKeys = new Set<string>();
        for (const schedule of schedules) {
          if (schedule.status === "Waiting" || schedule.status === "Playing") {
            activeScheduleNotificationKeys.add(
              getScheduleNotificationKey(schedule.id, String(schedule.playTime)),
            );
          }
        }
        pruneScheduleNotificationStore(
          scheduleNotificationStagesRef.current,
          activeScheduleNotificationKeys,
        );

        for (const schedule of schedules) {
          const scheduleNotificationKey = getScheduleNotificationKey(
            schedule.id,
            String(schedule.playTime),
          );
          const msUntil = new Date(schedule.playTime).getTime() - now.getTime();

          if (schedule.status === "Waiting" && msUntil > 0) {
            if (
              msUntil <= FIVE_MIN &&
              msUntil > ONE_MIN &&
              !hasScheduleNotificationStage(
                scheduleNotificationStagesRef.current,
                scheduleNotificationKey,
                "five-min",
              )
            ) {
              sendNotification("⏰ Pengingat Pengumuman", "Kurang 5 menit.", "⏰", 5000);
              markScheduleNotificationStage(
                scheduleNotificationStagesRef.current,
                scheduleNotificationKey,
                "five-min",
              );
            }

            if (
              msUntil <= ONE_MIN &&
              !hasScheduleNotificationStage(
                scheduleNotificationStagesRef.current,
                scheduleNotificationKey,
                "one-min",
              )
            ) {
              sendNotification("⏰ Pengingat Pengumuman", "Kurang 1 menit.", "⏰", 5000);
              markScheduleNotificationStage(
                scheduleNotificationStagesRef.current,
                scheduleNotificationKey,
                "one-min",
              );
            }
          }

          if (schedule.status === "Waiting" && new Date(schedule.playTime) <= now) {
            if (
              !hasScheduleNotificationStage(
                scheduleNotificationStagesRef.current,
                scheduleNotificationKey,
                "start",
              )
            ) {
              sendNotification("⏰ Pengingat Pengumuman", "Pengumuman akan dimulai.", "⏰", 6000);
              markScheduleNotificationStage(
                scheduleNotificationStagesRef.current,
                scheduleNotificationKey,
                "start",
              );
            }

            if (schedule.id === deferredScheduleIdRef.current) {
              if (pendingScheduledPlaybackRef.current?.scheduleId !== schedule.id) {
                const ann = announcements.find((a: any) => a.id === schedule.announcementId);
                setPendingScheduledPlayback({
                  scheduleId: schedule.id,
                  title: ann?.title || "Pengumuman Terjadwal",
                  playTime: schedule.playTime,
                  recurring: Boolean(schedule.recurring),
                });
              }
              continue;
            }

            // Guard against overlap between interval ticks / effect re-runs.
            if (schedulerProcessingIdsRef.current.has(schedule.id)) continue;
            schedulerProcessingIdsRef.current.add(schedule.id);

            const msPastDue = now.getTime() - new Date(schedule.playTime).getTime();
            // Grace period: if more than 5 minutes overdue, skip play and silently mark Done
            try {
              const setScheduleStatus = async (status: "Waiting" | "Done") => {
                await fetch(`/api/schedules/${schedule.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status }),
                });
              };

              // Claim schedule atomically so it cannot be played by overlapping checks/instances.
              const claimRes = await fetch(`/api/schedules/${schedule.id}/claim`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
              });
              if (claimRes.status === 404 || claimRes.status === 409) {
                continue; // already gone/claimed by another process
              }
              if (!claimRes.ok) {
                console.warn("[SIMANTU] Failed to claim schedule", schedule.id, claimRes.status);
                continue;
              }

              // If dashboard is currently busy, release claim back to Waiting and retry on next tick.
              if (
                isPlayingRef.current ||
                isPreparingRef.current ||
                announcementQueueRef.current.length > 0 ||
                queuePlayTimeoutRef.current !== null
              ) {
                await setScheduleStatus("Waiting");
                queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
                continue;
              }

              if (msPastDue > GRACE_MS) {
                await setScheduleStatus("Done");
                queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
                continue;
              }

              const ann = announcements.find((a: any) => a.id === schedule.announcementId);
              if (!ann) {
                // Announcement removed: mark as done to avoid endless re-claim loop.
                await setScheduleStatus("Done");
                queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
                continue;
              }

              const voiceParts = (ann.voice || "Pria").split("/");
              const sessionBefore = playbackSessionRef.current;
              await playAudio(ann.contentId, ann.contentEn, voiceParts[0], voiceParts[1] || voiceParts[0]);

              // If playback could not start (e.g. dashboard became busy), release claim.
              const started = playbackSessionRef.current > sessionBefore;
              if (!started) {
                await setScheduleStatus("Waiting");
                queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
                continue;
              }

              if (schedule.recurring) {
                // Reset to same time tomorrow
                const nextPlay = new Date(schedule.playTime);
                nextPlay.setDate(nextPlay.getDate() + 1);
                await fetch(`/api/schedules/${schedule.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ playTime: nextPlay.toISOString(), status: "Waiting" }),
                });
              } else {
                await setScheduleStatus("Done");
              }
              queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
            } finally {
              schedulerProcessingIdsRef.current.delete(schedule.id);
            }
          }
        }
      } catch (err) {
        console.error("Schedule check failed:", err);
      } finally {
        schedulerCheckInFlightRef.current = false;
      }
    };

    checkSchedules();
    const interval = window.setInterval(checkSchedules, 30000);
    return () => window.clearInterval(interval);
  }, [schedulerEnabled, playAudio]);

  return (
    <AppContext.Provider 
      value={{ 
        textId, setTextId, 
        textEn, setTextEn, 
        voice, setVoice, 
        voiceEn, setVoiceEn,
        isPlaying, isPreparing,
        bellEnabled, setBellEnabled,
        analyserNode,
        volume, setVolume,
        audioOutputId, setAudioOutputId,
        schedulerEnabled, setSchedulerEnabled,
        playAudio, stopAudio,
        clearText, resetApp,
        spellingRules, setSpellingRules,
        bellLibrary, setBellLibrary,
        activeBellOpeningId, setActiveBellOpeningId,
        activeBellEndingId, setActiveBellEndingId,
        announcementQueue, addToQueue, removeFromQueue, clearQueue,
        pendingScheduledPlayback: pendingScheduledPlaybackRaw,
        deferScheduledPlayback,
        clearDeferredScheduledPlayback,
        confirmPendingScheduledPlayback,
        skipPendingScheduledPlayback,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}
