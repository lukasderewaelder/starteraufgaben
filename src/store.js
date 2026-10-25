// Lokaler Speicher (IndexedDB). Fällt auf einen Arbeitsspeicher-Speicher zurück, wenn IndexedDB
// nicht nutzbar ist (z. B. manche privaten Fenster) – dann zeigt die App eine Warnung.
import { DEFAULT_SETTINGS, normalizeSheet } from './model.js';

const DB_NAME = 'starteraufgaben';
const DB_VERSION = 1;
const STORES = ['sheets', 'images', 'bank', 'settings'];

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaktion abgebrochen'));
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Datenbank ist blockiert (andere Registerkarte mit alter Version offen)'));
  });
}

/** Gemeinsame Schnittstelle für IndexedDB- und Arbeitsspeicher-Speicher. */
function buildApi(backend, persistent) {
  return {
    persistent,
    async listSheets() {
      const all = await backend.getAll('sheets');
      return all.map((s) => normalizeSheet(s)).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async getSheet(id) {
      return normalizeSheet(await backend.get('sheets', id));
    },
    saveSheet: (sheet) => backend.put('sheets', structuredClone(sheet)),
    deleteSheet: (id) => backend.delete('sheets', id),

    saveImage: (image) => backend.put('images', image), // { id, blob, width, height }
    getImage: (id) => backend.get('images', id),
    deleteImage: (id) => backend.delete('images', id),
    listImageIds: async () => (await backend.getAll('images')).map((i) => i.id),

    async getSettings() {
      const rows = await backend.getAll('settings');
      return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
    },
    setSetting: (key, value) => backend.put('settings', { key, value }),
  };
}

function idbBackend(db) {
  return {
    async get(store, key) {
      return request(db.transaction(store).objectStore(store).get(key));
    },
    async getAll(store) {
      return request(db.transaction(store).objectStore(store).getAll());
    },
    async put(store, value) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      return done(tx);
    },
    async delete(store, key) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      return done(tx);
    },
  };
}

function memoryBackend() {
  const data = Object.fromEntries(STORES.map((s) => [s, new Map()]));
  const keyOf = (store, value) => (store === 'settings' ? value.key : value.id);
  return {
    async get(store, key) {
      return data[store].get(key);
    },
    async getAll(store) {
      return [...data[store].values()];
    },
    async put(store, value) {
      data[store].set(keyOf(store, value), value);
    },
    async delete(store, key) {
      data[store].delete(key);
    },
  };
}

export function createMemoryStore() {
  return buildApi(memoryBackend(), false);
}

export async function openStore() {
  try {
    if (!globalThis.indexedDB) throw new Error('IndexedDB fehlt');
    const db = await openDb();
    db.onversionchange = () => db.close();
    return buildApi(idbBackend(db), true);
  } catch (err) {
    console.warn('IndexedDB nicht nutzbar, arbeite nur im Arbeitsspeicher:', err);
    return createMemoryStore();
  }
}
