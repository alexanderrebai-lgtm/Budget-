import type { StateStorage } from 'zustand/middleware';
import { hasIndexedDb, kv } from '../lib/kv';

/**
 * Stockage des données de l'application dans IndexedDB (plusieurs centaines de Mo
 * possibles, contre ~5 Mo pour localStorage). Les anciennes données de localStorage
 * sont déplacées automatiquement au premier lancement. Si IndexedDB est indisponible
 * (navigation privée de certains navigateurs), on reste sur localStorage.
 */
const db = kv('cap-budget-data');

let pending: { name: string; value: string } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> = Promise.resolve();

function flush() {
  if (!pending) return writing;
  const { name, value } = pending;
  pending = null;
  writing = writing.then(() => db.set(name, value)).catch((e) => {
    console.error('[stockage] écriture impossible, repli sur localStorage', e);
    try {
      localStorage.setItem(name, value);
    } catch {
      /* stockage plein ou indisponible */
    }
  });
  return writing;
}

if (typeof window !== 'undefined') {
  // ne rien perdre si l'onglet ou l'application se ferme juste après une modification
  window.addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flush());
}

/** Attend que la dernière modification soit écrite (sauvegardes, tests). */
export const flushStorage = () => {
  clearTimeout(timer);
  return flush();
};

export const indexedDbStorage: StateStorage = {
  getItem: async (name) => {
    if (!hasIndexedDb()) return localStorage.getItem(name);
    try {
      const value = await db.get<string>(name);
      if (value !== undefined) return value;
      // migration depuis localStorage
      const legacy = localStorage.getItem(name);
      if (legacy !== null) {
        await db.set(name, legacy);
        localStorage.removeItem(name);
      }
      return legacy;
    } catch {
      return localStorage.getItem(name);
    }
  },
  setItem: (name, value) => {
    if (!hasIndexedDb()) return localStorage.setItem(name, value);
    pending = { name, value };
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 400);
  },
  removeItem: async (name) => {
    localStorage.removeItem(name);
    if (hasIndexedDb()) await db.del(name).catch(() => {});
  },
};
