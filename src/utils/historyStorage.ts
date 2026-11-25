import type { ScriptExecutionRecord } from '../store/slices/scriptRunnerSlice';

const DB_NAME = 'wiscripts-history-db';
const DB_VERSION = 1;
const STORE_NAME = 'executionHistory';
const RECORD_KEY = 'records';
const LEGACY_LOCAL_STORAGE_KEY = 'wiscripts-app-store';

function openHistoryDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Migrates any legacy `executionHistory` stored in `localStorage` so preferences stay tiny.
 */
function popLegacyLocalStorageHistory(): ScriptExecutionRecord[] {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { state?: { executionHistory?: unknown } };
    const legacy = parsed?.state?.executionHistory;
    if (!Array.isArray(legacy) || legacy.length === 0) {
      return [];
    }
    delete parsed.state!.executionHistory;
    window.localStorage.setItem(LEGACY_LOCAL_STORAGE_KEY, JSON.stringify(parsed));
    return legacy as ScriptExecutionRecord[];
  } catch {
    return [];
  }
}

/**
 * Loads persisted script execution history asynchronously from IndexedDB (with legacy migration).
 */
export async function loadPersistedExecutionHistory(): Promise<ScriptExecutionRecord[]> {
  const legacyRecords = popLegacyLocalStorageHistory();
  const db = await openHistoryDatabase();

  if (!db) {
    return legacyRecords;
  }

  const stored = await new Promise<ScriptExecutionRecord[]>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(RECORD_KEY);
      req.onsuccess = () => {
        resolve(Array.isArray(req.result) ? (req.result as ScriptExecutionRecord[]) : []);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });

  if (legacyRecords.length > 0 && stored.length === 0) {
    await savePersistedExecutionHistory(legacyRecords);
    return legacyRecords;
  }

  return stored;
}

/**
 * Persists script execution history asynchronously to IndexedDB without blocking UI or `localStorage`.
 */
export async function savePersistedExecutionHistory(records: ScriptExecutionRecord[]): Promise<void> {
  const db = await openHistoryDatabase();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(records, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
