// Persistent storage: IndexedDB (primary) mirrored to localStorage (fallback).
// On load we keep whichever copy is the most recent. We also ask the browser
// for persistent storage so the save is not evicted (Android/Chrome PWA).

const DB_NAME = 'frotefrote';
const STORE = 'kv';
export const SAVE_KEY = 'frotefrote.save';

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
const db = () => (dbPromise ||= openDB());

export async function idbGet(key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbSet(key, value) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(key) {
  const d = await db();
  return new Promise((resolve) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** Load the most recent save (object) or null. */
export async function loadSave() {
  let fromLS = null, fromIDB = null;
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (s) fromLS = JSON.parse(s);
  } catch { /* corrupted or blocked */ }
  try {
    const s = await idbGet(SAVE_KEY);
    if (s) fromIDB = typeof s === 'string' ? JSON.parse(s) : s;
  } catch { /* unavailable */ }
  if (fromLS && fromIDB) return (fromIDB.savedAt || 0) >= (fromLS.savedAt || 0) ? fromIDB : fromLS;
  return fromIDB || fromLS;
}

/** Write the save to both stores. Returns true if at least one succeeded. */
export async function writeSave(obj) {
  obj.savedAt = Date.now();
  const json = JSON.stringify(obj);
  let ok = false;
  try { localStorage.setItem(SAVE_KEY, json); ok = true; } catch { /* quota */ }
  try { await idbSet(SAVE_KEY, json); ok = true; } catch { /* unavailable */ }
  return ok;
}

export async function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  try { await idbDelete(SAVE_KEY); } catch { /* ignore */ }
}

/** Ask the browser not to evict our data. Returns the persisted state. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* ignore */ }
  return false;
}

/** Encode a save object as a portable text code (for manual backups). */
export function exportCode(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return 'FF1:' + btoa(s);
}

export function importCode(code) {
  code = code.trim();
  if (!code.startsWith('FF1:')) throw new Error('Code de sauvegarde invalide');
  const s = atob(code.slice(4));
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}
