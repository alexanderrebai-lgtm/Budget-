/** Petit magasin clé/valeur IndexedDB. Chaque base est ouverte une seule fois. */
const opened = new Map<string, Promise<IDBDatabase>>();

function open(dbName: string): Promise<IDBDatabase> {
  let p = opened.get(dbName);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB bloquée'));
    });
    opened.set(dbName, p);
    p.catch(() => opened.delete(dbName));
  }
  return p;
}

export interface Kv {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export function kv(dbName: string): Kv {
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const d = await open(dbName);
    return new Promise((resolve, reject) => {
      const t = d.transaction('kv', mode);
      const req = fn(t.objectStore('kv'));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error ?? req.error);
      t.onabort = () => reject(t.error ?? new Error('Transaction annulée'));
    });
  };
  return {
    get: <T>(key: string) => tx<T>('readonly', (s) => s.get(key) as IDBRequest<T>),
    set: async (key, value) => {
      await tx('readwrite', (s) => s.put(value, key));
    },
    del: async (key) => {
      await tx('readwrite', (s) => s.delete(key));
    },
    keys: async () => (await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())).map(String),
  };
}

export const hasIndexedDb = () => typeof indexedDB !== 'undefined';
