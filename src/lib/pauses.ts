import { needGroupOf } from './analysis';
import { monthKey } from './format';
import type { Category, Cents, Pause, Transaction } from './types';

/** Délais de réflexion proposés, en heures. */
export const PAUSE_DELAYS = [
  { hours: 24, label: '24 h' },
  { hours: 48, label: '48 h' },
  { hours: 24 * 7, label: '7 jours' },
  { hours: 24 * 30, label: '30 jours' },
] as const;

/** Plus l'achat est cher, plus la pause est longue (règle des 24 h, puis des 30 jours pour les gros achats). */
export function suggestedDelay(amount: Cents): number {
  if (amount < 5_000) return 24;
  if (amount < 20_000) return 48;
  if (amount < 100_000) return 24 * 7;
  return 24 * 30;
}

export const REFLECTION_QUESTIONS = [
  'Avez-vous déjà quelque chose de similaire ?',
  'C’est pour combler quoi, là, maintenant : ennui, fatigue, stress, récompense ?',
  'L’achèteriez-vous s’il n’était pas en promotion ?',
  'Dans un mois, vous en servirez-vous encore ?',
  'Si vous deviez payer en liquide, le prendriez-vous quand même ?',
];

export type PauseState = 'waiting' | 'ready' | 'bought' | 'dropped';

export function pauseState(p: Pause, now = new Date()): PauseState {
  if (p.status !== 'waiting') return p.status;
  return new Date(p.until).getTime() <= now.getTime() ? 'ready' : 'waiting';
}

/** Temps restant lisible : « 3 j 4 h », « 5 h 12 min », « 8 min ». */
export function remaining(p: Pause, now = new Date()): string {
  const ms = new Date(p.until).getTime() - now.getTime();
  if (ms <= 0) return 'terminée';
  const min = Math.ceil(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d) return h ? `${d} j ${h} h` : `${d} j`;
  if (h) return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
  return `${m} min`;
}

/** Avancement du délai, entre 0 et 1. */
export function progress(p: Pause, now = new Date()): number {
  const start = new Date(p.createdAt).getTime();
  const end = new Date(p.until).getTime();
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

export interface PauseStats {
  /** Montant des achats abandonnés après réflexion. */
  saved: Cents;
  dropped: number;
  bought: number;
  boughtTotal: Cents;
  /** Montant en attente de décision. */
  pending: Cents;
  ready: number;
  /** Part des envies abandonnées parmi celles décidées. */
  resistRate: number | null;
}

export function pauseStats(pauses: Pause[], now = new Date()): PauseStats {
  const s: PauseStats = { saved: 0, dropped: 0, bought: 0, boughtTotal: 0, pending: 0, ready: 0, resistRate: null };
  for (const p of pauses) {
    const st = pauseState(p, now);
    if (st === 'dropped') {
      s.saved += p.amount;
      s.dropped++;
    } else if (st === 'bought') {
      s.bought++;
      s.boughtTotal += p.amount;
    } else {
      s.pending += p.amount;
      if (st === 'ready') s.ready++;
    }
  }
  const decided = s.dropped + s.bought;
  s.resistRate = decided ? s.dropped / decided : null;
  return s;
}

/** Heures de travail que représente un achat, d'après le revenu net mensuel (base 151,67 h). */
export function workHours(amount: Cents, monthlyIncome: Cents): number | null {
  if (monthlyIncome <= 0) return null;
  return amount / (monthlyIncome / 151.67);
}

export interface WantsLine {
  categoryId: string | null;
  total: Cents;
  count: number;
  /** Achats de moins de 30 €, les plus faciles à oublier. */
  small: number;
}

export interface WantsSummary {
  month: string;
  total: Cents;
  count: number;
  income: Cents;
  /** Toutes les dépenses du mois (hors virements), pour situer les envies. */
  expense: Cents;
  lines: WantsLine[];
}

/** Ce que les envies ont coûté sur un mois, catégorie par catégorie, d'après les vraies opérations. */
export function wantsSummary(txs: Transaction[], cats: Map<string, Category>, month: string): WantsSummary {
  const by = new Map<string | null, WantsLine>();
  const out: WantsSummary = { month, total: 0, count: 0, income: 0, expense: 0, lines: [] };
  for (const t of txs) {
    if (monthKey(t.date) !== month) continue;
    const cat = t.categoryId ? cats.get(t.categoryId) : undefined;
    if (t.transferId || cat?.kind === 'transfer') continue;
    if (t.amount > 0) {
      out.income += t.amount;
      continue;
    }
    out.expense += -t.amount;
    if (needGroupOf(t, cat) !== 'envies') continue;
    const key = t.categoryId ?? null;
    const line = by.get(key) ?? { categoryId: key, total: 0, count: 0, small: 0 };
    line.total += -t.amount;
    line.count++;
    if (-t.amount < 3_000) line.small++;
    by.set(key, line);
    out.total += -t.amount;
    out.count++;
  }
  out.lines = [...by.values()].sort((a, b) => b.total - a.total);
  return out;
}

/** Pauses dont le délai vient de se terminer et pour lesquelles aucune notification n'a encore été envoyée. */
export function duePauses(pauses: Pause[], sent: Record<string, string>, now = new Date()): Pause[] {
  return pauses.filter((p) => pauseState(p, now) === 'ready' && !sent[`pause:${p.id}`]);
}
