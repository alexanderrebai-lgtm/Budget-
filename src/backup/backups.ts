/**
 * Sauvegardes automatiques.
 * - Partout : une copie par jour dans IndexedDB (14 jours) et une copie avant chaque
 *   action risquée (restauration, effacement, remplacement par la synchronisation).
 * - Logiciel PC : en plus, un fichier par jour dans Documents/Cap Budget/Sauvegardes (30 jours).
 */
import { hasIndexedDb, kv } from '../lib/kv';
import { todayISO } from '../lib/format';
import { exportData, useStore, whenHydrated } from '../store/store';

export interface LocalBackup {
  id: string;
  createdAt: string;
  reason: string;
  transactions: number;
  accounts: number;
  size: number;
}

interface StoredBackup extends LocalBackup {
  json: string;
}

interface DesktopBackupApi {
  write: (name: string, json: string) => Promise<{ path: string; kept: number }>;
  list: () => Promise<{ name: string; size: number; mtime: string }[]>;
  read: (name: string) => Promise<string>;
  openFolder: () => Promise<void>;
  folder: () => Promise<string>;
}

export const desktopBackup = (): DesktopBackupApi | null =>
  (window as unknown as { capBudgetDesktop?: { backup?: DesktopBackupApi } }).capBudgetDesktop?.backup ?? null;

const store = kv('cap-budget-backups');
const KEEP_DAILY = 14;
const KEEP_MANUAL = 10;

function summary(json: string) {
  try {
    const d = JSON.parse(json).data;
    return { transactions: d.transactions?.length ?? 0, accounts: d.accounts?.length ?? 0 };
  } catch {
    return { transactions: 0, accounts: 0 };
  }
}

/** Copie immédiate de toutes les données (avant une action risquée, ou à la demande). */
export async function snapshotNow(reason: string, id = `manual:${new Date().toISOString()}`): Promise<LocalBackup | null> {
  if (!hasIndexedDb()) return null;
  await whenHydrated();
  if (!useStore.getState().settings.onboarded && !useStore.getState().transactions.length) return null;
  const json = exportData();
  const meta: LocalBackup = { id, createdAt: new Date().toISOString(), reason, size: json.length, ...summary(json) };
  await store.set(id, { ...meta, json } satisfies StoredBackup);
  await prune();
  return meta;
}

async function prune() {
  const keys = (await store.keys()).sort().reverse();
  const daily = keys.filter((k) => k.startsWith('daily:'));
  const manual = keys.filter((k) => k.startsWith('manual:'));
  for (const k of [...daily.slice(KEEP_DAILY), ...manual.slice(KEEP_MANUAL)]) await store.del(k);
}

export async function listBackups(): Promise<LocalBackup[]> {
  if (!hasIndexedDb()) return [];
  const keys = await store.keys();
  const out: LocalBackup[] = [];
  for (const k of keys) {
    const b = await store.get<StoredBackup>(k);
    if (b) out.push({ id: b.id, createdAt: b.createdAt, reason: b.reason, transactions: b.transactions, accounts: b.accounts, size: b.size });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readBackup(id: string): Promise<string | null> {
  return (await store.get<StoredBackup>(id))?.json ?? null;
}

/** Sauvegarde du jour (une seule par jour), appelée au démarrage. */
export async function dailyBackup(): Promise<void> {
  try {
    await whenHydrated();
    const s = useStore.getState();
    if (!s.settings.onboarded || (!s.transactions.length && !s.accounts.length)) return;
    const day = todayISO();
    if (hasIndexedDb() && !(await store.get(`daily:${day}`))) await snapshotNow('Sauvegarde quotidienne', `daily:${day}`);
    const desktop = desktopBackup();
    if (desktop) {
      const files = await desktop.list();
      const name = `cap-budget-${day}.json`;
      if (!files.some((f) => f.name === name)) await desktop.write(name, exportData());
    }
  } catch (e) {
    console.error('[sauvegarde]', e);
  }
}
