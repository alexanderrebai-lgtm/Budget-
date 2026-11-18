import { daysBetween, monthKey, normalize } from './format';
import type { Account, Category, Cents, ISODate, Rule, Transaction } from './types';

export function categorize(label: string, rules: Rule[]): string | null {
  const l = ` ${normalize(label).replace(/[*/_\-]/g, ' ')} `;
  // Le motif doit commencer un mot ; un espace final impose aussi une fin de mot.
  // La règle la plus spécifique (motif le plus long) l'emporte.
  let best: Rule | null = null;
  let bestLen = 0;
  for (const r of rules) {
    const p = normalize(r.pattern);
    if (!p) continue;
    const needle = ` ${p}${r.pattern.endsWith(' ') ? ' ' : ''}`;
    if (l.includes(needle) && p.length > bestLen) {
      best = r;
      bestLen = p.length;
    }
  }
  return best?.categoryId ?? null;
}

export function accountBalance(account: Account, txs: Transaction[]): Cents {
  if (account.valuation !== undefined) {
    // valorisation manuelle + mouvements postérieurs à la valorisation
    const after = account.valuationDate
      ? txs.filter((t) => t.accountId === account.id && t.date > account.valuationDate!)
      : [];
    return account.valuation + after.reduce((s, t) => s + t.amount, 0);
  }
  return account.openingBalance + txs.filter((t) => t.accountId === account.id).reduce((s, t) => s + t.amount, 0);
}

export interface MonthSummary {
  month: string;
  income: Cents;
  expense: Cents; // positif
  saved: Cents; // transferts vers l'épargne (positif)
  net: Cents;
}

export function monthlySummaries(txs: Transaction[], cats: Map<string, Category>): MonthSummary[] {
  const map = new Map<string, MonthSummary>();
  for (const t of txs) {
    const m = monthKey(t.date);
    let s = map.get(m);
    if (!s) map.set(m, (s = { month: m, income: 0, expense: 0, saved: 0, net: 0 }));
    const cat = t.categoryId ? cats.get(t.categoryId) : undefined;
    if (cat?.kind === 'transfer') {
      if (cat.group === 'epargne' && t.amount < 0) s.saved += -t.amount;
      continue;
    }
    if (t.amount >= 0) s.income += t.amount;
    else s.expense += -t.amount;
  }
  for (const s of map.values()) s.net = s.income - s.expense;
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function spendingByCategory(txs: Transaction[], cats: Map<string, Category>, month?: string) {
  const totals = new Map<string, Cents>();
  for (const t of txs) {
    if (month && monthKey(t.date) !== month) continue;
    const cat = t.categoryId ? cats.get(t.categoryId) : undefined;
    if (cat && cat.kind !== 'expense') continue;
    if (!cat && t.amount >= 0) continue;
    const key = cat?.id ?? 'uncategorized';
    totals.set(key, (totals.get(key) ?? 0) - t.amount);
  }
  return [...totals.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export interface Recurring {
  key: string;
  label: string;
  categoryId: string | null;
  averageAmount: Cents;
  frequency: 'mensuel' | 'trimestriel' | 'annuel' | 'hebdomadaire';
  occurrences: number;
  lastDate: ISODate;
  nextDate: ISODate;
  annualCost: Cents;
  isIncome: boolean;
}

/** Libellé réduit à son marchand : sans chiffres, dates ni références. */
export function merchantKey(label: string): string {
  return normalize(label)
    .replace(/\b(cb|prlv|prelevement|sepa|vir|virement|carte|paiement|achat|du|le|de|facture)\b/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
}

function addDays(d: ISODate, n: number): ISODate {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

/**
 * Détecte abonnements et revenus récurrents : même marchand, montant stable
 * (± 15 %) et intervalle régulier.
 */
export function detectRecurring(txs: Transaction[]): Recurring[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    const k = merchantKey(t.label);
    if (k.length < 3) continue;
    const key = `${k}|${t.amount < 0 ? '-' : '+'}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    list.sort((a, b) => a.date.localeCompare(b.date));
    const amounts = list.map((t) => Math.abs(t.amount));
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    if (amounts.some((a) => Math.abs(a - avg) > avg * 0.15)) continue;
    const gaps = list.slice(1).map((t, i) => daysBetween(list[i].date, t.date));
    const sorted = [...gaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    let frequency: Recurring['frequency'];
    let perYear: number;
    if (median >= 5 && median <= 9) { frequency = 'hebdomadaire'; perYear = 52; }
    else if (median >= 25 && median <= 35) { frequency = 'mensuel'; perYear = 12; }
    else if (median >= 85 && median <= 97) { frequency = 'trimestriel'; perYear = 4; }
    else if (median >= 350 && median <= 380) { frequency = 'annuel'; perYear = 1; }
    else continue;
    // la plupart des intervalles doivent être proches de la médiane
    const regular = gaps.filter((g) => Math.abs(g - median) <= Math.max(4, median * 0.2)).length;
    if (regular < gaps.length * 0.7) continue;
    const last = list[list.length - 1];
    out.push({
      key,
      label: last.label,
      categoryId: last.categoryId,
      averageAmount: Math.round(avg),
      frequency,
      occurrences: list.length,
      lastDate: last.date,
      nextDate: addDays(last.date, median),
      annualCost: Math.round(avg * perYear),
      isIncome: last.amount > 0,
    });
  }
  return out.sort((a, b) => b.annualCost - a.annualCost);
}

/** Totaux annuels par étiquette fiscale (pour pré-remplir le simulateur). */
export function taxTotals(txs: Transaction[], cats: Map<string, Category>, year: number) {
  const totals: Partial<Record<NonNullable<Category['taxTag']>, number>> = {};
  for (const t of txs) {
    if (!t.date.startsWith(String(year))) continue;
    const tag = t.categoryId ? cats.get(t.categoryId)?.taxTag : undefined;
    if (!tag) continue;
    totals[tag] = (totals[tag] ?? 0) + Math.abs(t.amount) / 100;
  }
  return totals;
}

/** Répartition 50/30/20 des sorties d'argent d'un mois. */
export function needsWantsSavings(txs: Transaction[], cats: Map<string, Category>, month: string) {
  const r = { besoins: 0, envies: 0, epargne: 0, income: 0 };
  for (const t of txs) {
    if (monthKey(t.date) !== month) continue;
    const cat = t.categoryId ? cats.get(t.categoryId) : undefined;
    if (t.amount > 0 && cat?.kind !== 'transfer') { r.income += t.amount; continue; }
    if (t.amount >= 0 || !cat?.group) continue;
    r[cat.group] += -t.amount;
  }
  return r;
}
