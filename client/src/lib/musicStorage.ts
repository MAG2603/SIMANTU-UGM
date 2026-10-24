// IndexedDB storage for outro music tracks (large audio files)
export interface MusicTrack {
  id: string;
  name: string;
  size: number;
  duration?: number; // seconds
  data: string; // Data URL
  createdAt: string;
}

const DB_NAME = "simantu_outro_music";
const STORE_NAME = "tracks";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not supported"));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllMusicTracks(): Promise<MusicTrack[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = (request.result as MusicTrack[]) || [];
        // Sort newest first
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("[SIMANTU] Failed to get music tracks from IndexedDB:", err);
    return [];
  }
}

export async function getMusicTrack(id: string): Promise<MusicTrack | undefined> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result as MusicTrack | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`[SIMANTU] Failed to get track ${id}:`, err);
    return undefined;
  }
}

export async function saveMusicTrack(track: MusicTrack): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(track);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteMusicTrack(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Helper to process an uploaded audio File into a MusicTrack object
 */
export async function processAudioFile(file: File): Promise<MusicTrack> {
  return new Promise((resolve, reject) => {
    // 1. Read duration via temporary HTML5 audio
    const objectUrl = URL.createObjectURL(file);
    const tempAudio = new Audio(objectUrl);

    const onAudioMetadata = () => {
      const duration = tempAudio.duration && isFinite(tempAudio.duration) ? Math.round(tempAudio.duration) : undefined;
      URL.revokeObjectURL(objectUrl);

      // 2. Read as Data URL for robust storage
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result as string;
        resolve({
          id: `music-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name.replace(/\.[^/.]+$/, ""), // remove extension for nice title
          size: file.size,
          duration,
          data,
          createdAt: new Date().toISOString(),
        });
      };
      reader.onerror = () => reject(new Error("Gagal membaca data file"));
      reader.readAsDataURL(file);
    };

    tempAudio.onloadedmetadata = onAudioMetadata;
    tempAudio.onerror = () => {
      // Fallback if metadata fails to load (still proceed)
      URL.revokeObjectURL(objectUrl);
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result as string;
        resolve({
          id: `music-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name.replace(/\.[^/.]+$/, ""),
          size: file.size,
          data,
          createdAt: new Date().toISOString(),
        });
      };
      reader.onerror = () => reject(new Error("Gagal membaca file"));
      reader.readAsDataURL(file);
    };
  });
}
