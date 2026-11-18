import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import { initialData, useStore, type Data } from '../store/store';
import { open, PassphraseRequiredError, seal, WrongPassphraseError, type Payload } from './crypto';
import { idbDelete, idbGet, idbSet } from './idb';
import { fingerprint, mergeData } from './merge';

/* ---------- Configuration ---------- */

const CONFIG_KEY = 'cap-budget-sync-config';

export interface SyncConfig {
  url: string;
  key: string;
  /** Phrase secrète de chiffrement de bout en bout (facultative), conservée sur cet appareil. */
  passphrase: string | null;
  auto: boolean;
}

function readConfig(): SyncConfig {
  const defaults: SyncConfig = {
    url: import.meta.env.VITE_SUPABASE_URL ?? '',
    key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    passphrase: null,
    auto: true,
  };
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<SyncConfig>;
      return { ...defaults, ...saved, url: saved.url || defaults.url, key: saved.key || defaults.key };
    }
  } catch {
    /* stockage indisponible */
  }
  return defaults;
}

function writeConfig(c: SyncConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

/* ---------- État observable ---------- */

export type SyncStatus = 'disabled' | 'signed-out' | 'idle' | 'syncing' | 'error' | 'locked' | 'offline' | 'needs-choice';

interface SyncState {
  config: SyncConfig;
  status: SyncStatus;
  email: string | null;
  lastSyncedAt: string | null;
  lastDevice: string | null;
  revision: number;
  error: string | null;
  /** Lien de réinitialisation du mot de passe ouvert : afficher le formulaire de nouveau mot de passe. */
  recovery: boolean;
}

export const useSync = create<SyncState>(() => ({
  config: readConfig(),
  status: 'signed-out',
  email: null,
  lastSyncedAt: null,
  lastDevice: null,
  revision: 0,
  error: null,
  recovery: false,
}));

const patch = (p: Partial<SyncState>) => useSync.setState(p);

/* ---------- Client Supabase ---------- */

let client: SupabaseClient | null = null;
let clientFor = '';

export function getClient(): SupabaseClient | null {
  const { url, key } = useSync.getState().config;
  if (!url || !key) return null;
  const id = `${url}|${key}`;
  if (!client || clientFor !== id) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cap-budget-auth', detectSessionInUrl: true, flowType: 'pkce' },
    });
    clientFor = id;
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') patch({ recovery: true });
      // différé : onAuthStateChange ne doit pas appeler d'autres méthodes auth de façon synchrone
      setTimeout(() => onSession(session), 0);
    });
  }
  return client;
}

export function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
  const app = /Electron/.test(ua) ? 'application PC' : window.matchMedia?.('(display-mode: standalone)').matches ? 'application' : 'navigateur';
  return `${os} · ${app}`;
}

/* ---------- Données synchronisées ---------- */

const SYNC_KEYS = ['accounts', 'transactions', 'categories', 'budgets', 'rules', 'goals', 'snapshots', 'provisions', 'taxProfile', 'csvMapping', 'settings'] as const;

function localData(): Data {
  const s = useStore.getState();
  const d = {} as Record<string, unknown>;
  for (const k of SYNC_KEYS) d[k] = s[k];
  return d as unknown as Data;
}

function normalizeRemote(raw: unknown): Data {
  const d = (raw ?? {}) as Partial<Data>;
  return { ...initialData(), ...d, settings: { ...initialData().settings, ...d.settings, onboarded: true } };
}

interface Base {
  revision: number;
  data: Data;
}
const baseKey = (uid: string) => `base:${uid}`;

/* ---------- Session ---------- */

let userId: string | null = null;

function onSession(session: Session | null) {
  const uid = session?.user.id ?? null;
  const changed = uid !== userId;
  userId = uid;
  if (!uid) {
    patch({ status: getClient() ? 'signed-out' : 'disabled', email: null });
    return;
  }
  patch({ email: session!.user.email ?? null, status: useSync.getState().status === 'syncing' ? 'syncing' : 'idle' });
  if (changed) void syncNow();
}

export async function initSync() {
  const c = getClient();
  if (!c) {
    patch({ status: 'disabled' });
    return;
  }
  const { data } = await c.auth.getSession();
  // nettoie le ?code=… laissé par le lien de confirmation
  if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
  onSession(data.session);
  startWatchers();
}

export function updateConfig(p: Partial<SyncConfig>) {
  const config = { ...useSync.getState().config, ...p };
  writeConfig(config);
  patch({ config });
}

export async function signUp(email: string, password: string) {
  const c = getClient();
  if (!c) throw new Error('Synchronisation non configurée.');
  const redirect = location.protocol.startsWith('http') ? location.origin + location.pathname : undefined;
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
  if (error) throw new Error(translateAuthError(error.message));
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  const c = getClient();
  if (!c) throw new Error('Synchronisation non configurée.');
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(translateAuthError(error.message));
}

export async function resetPassword(email: string) {
  const c = getClient();
  if (!c) throw new Error('Synchronisation non configurée.');
  const redirect = location.protocol.startsWith('http') ? location.origin + location.pathname : undefined;
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: redirect });
  if (error) throw new Error(translateAuthError(error.message));
}

export async function updatePassword(password: string) {
  const c = getClient();
  if (!c) throw new Error('Synchronisation non configurée.');
  const { error } = await c.auth.updateUser({ password });
  if (error) throw new Error(translateAuthError(error.message));
  patch({ recovery: false });
}

export async function signOut() {
  const c = getClient();
  if (userId) await idbDelete(baseKey(userId)).catch(() => {});
  await c?.auth.signOut();
  patch({ lastSyncedAt: null, revision: 0, lastDevice: null, error: null });
}

function translateAuthError(m: string): string {
  if (/invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  if (/email not confirmed/i.test(m)) return 'Confirmez d’abord votre adresse e-mail (lien reçu par e-mail).';
  if (/already registered/i.test(m)) return 'Un compte existe déjà avec cette adresse.';
  if (/password should be at least/i.test(m)) return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (/rate limit/i.test(m)) return 'Trop de tentatives, réessayez dans quelques minutes.';
  if (/failed to fetch|network/i.test(m)) return 'Connexion impossible au serveur.';
  return m;
}

/* ---------- Synchronisation ---------- */

let running: Promise<void> | null = null;
let rerun = false;
/** Choix demandé à l'utilisateur au premier couplage d'un appareil déjà rempli. */
let pendingChoice: 'merge' | 'replace-local' | 'replace-remote' | null = null;

export function resolveFirstSync(choice: 'merge' | 'replace-local' | 'replace-remote') {
  pendingChoice = choice;
  void syncNow();
}

export function syncNow(): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    do {
      rerun = false;
      await syncOnce();
    } while (rerun);
  })().finally(() => {
    running = null;
  });
  return running;
}

function hasUserContent(d: Data) {
  return d.transactions.length > 0 || d.accounts.length > 1 || d.goals.length > 0;
}

async function syncOnce(attempt = 0): Promise<void> {
  const c = getClient();
  if (!c || !userId) return;
  if (!navigator.onLine) {
    patch({ status: 'offline' });
    return;
  }
  const uid = userId;
  const { passphrase } = useSync.getState().config;
  patch({ status: 'syncing', error: null });

  try {
    const { data: row, error } = await c.from('vaults').select('payload, revision, device, updated_at').maybeSingle();
    if (error) throw error;

    const base = (await idbGet<Base>(baseKey(uid))) ?? null;
    const local = localData();

    const push = async (data: Data, baseRevision: number) => {
      const payload = await seal(data, passphrase);
      const { data: res, error: e } = await c.rpc('push_vault', { p_payload: payload, p_base_revision: baseRevision, p_device: deviceName() });
      if (e) throw e;
      const r = (Array.isArray(res) ? res[0] : res) as { ok: boolean; revision: number };
      if (!r.ok) return null; // un autre appareil a écrit entre-temps
      await idbSet(baseKey(uid), { revision: r.revision, data } satisfies Base);
      return r.revision;
    };

    const done = (revision: number, device: string | null) =>
      patch({ status: 'idle', revision, lastSyncedAt: new Date().toISOString(), lastDevice: device });

    // 1. Rien à distance : premier envoi.
    if (!row) {
      const rev = await push(local, 0);
      if (rev === null) return attempt < 2 ? syncOnce(attempt + 1) : undefined;
      return done(rev, deviceName());
    }

    // 2. Déchiffrement de la version distante.
    let remote: Data;
    try {
      remote = normalizeRemote(await open(row.payload as Payload, passphrase));
    } catch (e) {
      if (e instanceof PassphraseRequiredError || e instanceof WrongPassphraseError) {
        patch({ status: 'locked', error: e.message });
        return;
      }
      throw e;
    }
    // Si le distant est chiffré et que la phrase locale manque, on l'aurait signalé ; si le distant est en clair
    // alors qu'une phrase est définie, le prochain envoi le chiffrera.
    const remoteEncrypted = (row.payload as Payload).enc !== 'none';
    const encryptionChanged = remoteEncrypted !== Boolean(passphrase);

    // 3. Premier couplage de cet appareil.
    if (!base) {
      if (hasUserContent(local) && hasUserContent(remote) && !pendingChoice) {
        patch({ status: 'needs-choice' });
        return;
      }
      const choice = pendingChoice ?? (hasUserContent(local) ? 'merge' : 'replace-local');
      pendingChoice = null;
      if (choice === 'replace-local') {
        applyLocal(remote);
        await idbSet(baseKey(uid), { revision: row.revision, data: remote } satisfies Base);
        if (encryptionChanged) await push(remote, row.revision);
        return done(row.revision, row.device);
      }
      const next = choice === 'replace-remote' ? local : mergeData(null, local, remote);
      applyLocal(next);
      const rev = await push(next, row.revision);
      if (rev === null) return attempt < 2 ? syncOnce(attempt + 1) : undefined;
      return done(rev, deviceName());
    }

    const localChanged = fingerprint(local) !== fingerprint(base.data);

    // 4. Distant inchangé depuis notre dernière synchro.
    if (row.revision === base.revision) {
      if (!localChanged && !encryptionChanged) return done(row.revision, row.device);
      const rev = await push(local, row.revision);
      if (rev === null) return attempt < 2 ? syncOnce(attempt + 1) : undefined;
      return done(rev, deviceName());
    }

    // 5. Le distant a avancé : fusion à trois voies.
    const merged = localChanged ? mergeData(base.data, local, remote) : remote;
    applyLocal(merged);
    if (fingerprint(merged) === fingerprint(remote) && !encryptionChanged) {
      await idbSet(baseKey(uid), { revision: row.revision, data: merged } satisfies Base);
      return done(row.revision, row.device);
    }
    const rev = await push(merged, row.revision);
    if (rev === null) return attempt < 2 ? syncOnce(attempt + 1) : undefined;
    return done(rev, deviceName());
  } catch (e) {
    const msg = (e as { message?: string }).message ?? String(e);
    patch({ status: navigator.onLine ? 'error' : 'offline', error: translateAuthError(msg) });
  }
}

let applying = false;
function applyLocal(d: Data) {
  applying = true;
  try {
    const current = useStore.getState();
    useStore.setState({ ...d, settings: { ...d.settings, theme: current.settings.theme, onboarded: true } });
  } finally {
    applying = false;
  }
}

/* ---------- Déclencheurs automatiques ---------- */

let watchersStarted = false;
function startWatchers() {
  if (watchersStarted) return;
  watchersStarted = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  useStore.subscribe(() => {
    if (applying || !userId || !useSync.getState().config.auto) return;
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 2_500);
  });
  window.addEventListener('online', () => userId && void syncNow());
  window.addEventListener('offline', () => userId && patch({ status: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && userId && useSync.getState().config.auto) void syncNow();
  });
  // Vérification périodique des modifications faites sur un autre appareil.
  setInterval(() => {
    if (userId && document.visibilityState === 'visible' && useSync.getState().config.auto) void syncNow();
  }, 60_000);
}
