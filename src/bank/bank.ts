import { create } from 'zustand';
import { accountBalance } from '../lib/analysis';
import { toCents } from '../lib/format';
import { useStore } from '../store/store';
import { getClient, useSync } from '../sync/engine';

export interface BankAccountInfo {
  uid: string;
  name: string;
  iban_masked: string | null;
  currency: string;
  identification_hash: string | null;
}
export interface BankConnection {
  id: string;
  aspsp_name: string;
  aspsp_country: string;
  valid_until: string | null;
  accounts: BankAccountInfo[];
  status: string;
  created_at: string;
  last_sync_at: string | null;
}
export interface Aspsp {
  name: string;
  country: string;
  logo: string | null;
  beta: boolean;
  maxDays: number;
}

export class BankError extends Error {
  constructor(message: string, public code: string | null = null) {
    super(message);
  }
}

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const c = getClient();
  if (!c) throw new BankError('La synchronisation n’est pas configurée.');
  const { data, error } = await c.functions.invoke('bank', { body: { action, ...body } });
  if (error) {
    // le corps de la réponse d'erreur contient le message en français
    let message = error.message;
    let code: string | null = null;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = await ctx.json();
        message = j.error ?? message;
        code = j.code ?? null;
      } catch {
        /* ignore */
      }
    }
    throw new BankError(message, code);
  }
  return data as T;
}

export const bankStatus = () => call<{ configured: boolean }>('status');
export const listAspsps = (country = 'FR') => call<{ aspsps: Aspsp[] }>('aspsps', { country }).then((r) => r.aspsps);
export const startConnection = (aspsp: Aspsp, returnTo: string | null) =>
  call<{ url: string }>('start', { aspsp: { name: aspsp.name, country: aspsp.country }, days: Math.min(180, aspsp.maxDays || 90), return_to: returnTo });
export const deleteConnection = (id: string) => call<{ ok: boolean }>('delete', { connection_id: id });

export async function listConnections(): Promise<BankConnection[]> {
  const c = getClient();
  if (!c) return [];
  const { data, error } = await c
    .from('bank_connections')
    .select('id, aspsp_name, aspsp_country, valid_until, accounts, status, created_at, last_sync_at')
    .order('created_at');
  if (error) throw new BankError(error.message);
  return (data ?? []) as BankConnection[];
}

/* ---------------- Synchronisation d'un compte lié ---------------- */

export interface SyncReport {
  accountId: string;
  added: number;
  duplicates: number;
  balanceAligned: boolean;
  error?: string;
  expired?: boolean;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/**
 * Récupère les opérations comptabilisées d'un compte bancaire lié, les importe
 * (dédoublonnage par référence bancaire) puis aligne le solde sur celui de la banque.
 */
export async function syncLinkedAccount(accountId: string, interactive: boolean): Promise<SyncReport> {
  const store = useStore.getState();
  const account = store.accounts.find((a) => a.id === accountId);
  if (!account?.bank) throw new BankError('Ce compte n’est pas relié à une banque.');
  const { connectionId, accountUid, lastSync } = account.bank;
  // première synchro : 90 jours (limite habituelle des banques) ; ensuite, une semaine de recouvrement
  const from = lastSync ? daysAgo(Math.max(7, Math.ceil((Date.now() - new Date(lastSync).getTime()) / 86_400_000) + 7)) : daysAgo(89);
  try {
    const res = await call<{ rows: { date: string; label: string; amount: number; ref: string | null; pending: boolean }[]; balance: number | null }>(
      'transactions',
      { connection_id: connectionId, account_uid: accountUid, date_from: from, interactive },
    );
    const booked = res.rows.filter((r) => !r.pending);
    const { added, duplicates } = store.importRows(booked, accountId);
    let balanceAligned = false;
    const fresh = useStore.getState();
    const acc = fresh.accounts.find((a) => a.id === accountId)!;
    const patch: Partial<typeof acc> = { bank: { ...acc.bank!, lastSync: new Date().toISOString() } };
    if (res.balance !== null && acc.valuation === undefined) {
      // solde de départ recalculé pour que le solde affiché égale celui de la banque
      const computed = accountBalance(acc, fresh.transactions);
      patch.openingBalance = acc.openingBalance + (toCents(res.balance) - computed);
      balanceAligned = true;
    }
    fresh.updateAccount(accountId, patch);
    return { accountId, added, duplicates, balanceAligned };
  } catch (e) {
    const err = e as BankError;
    return { accountId, added: 0, duplicates: 0, balanceAligned: false, error: err.message, expired: err.code === 'EXPIRED_SESSION' };
  }
}

/* ---------------- Synchronisation automatique ---------------- */

export const useBankSync = create<{ running: boolean; lastRun: string | null }>(() => ({ running: false, lastRun: null }));

/** Synchronise les comptes liés si la dernière mise à jour date de plus de 6 heures (limite des banques : ~4 par jour). */
export async function autoBankSync() {
  if (!useSync.getState().email || useBankSync.getState().running) return;
  const stale = useStore
    .getState()
    .accounts.filter((a) => a.bank && (!a.bank.lastSync || Date.now() - new Date(a.bank.lastSync).getTime() > 6 * 3_600_000));
  if (!stale.length) return;
  useBankSync.setState({ running: true });
  try {
    for (const a of stale) await syncLinkedAccount(a.id, false);
  } finally {
    useBankSync.setState({ running: false, lastRun: new Date().toISOString() });
  }
}
