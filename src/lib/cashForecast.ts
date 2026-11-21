import { accountBalance, detectRecurring, merchantKey } from './analysis';
import { forecastBalance, upcomingEvents } from './planning';
import type { Account, Category, Provision, Transaction } from './types';

/** Prévision du solde des comptes courants (utilisée par la page Prévisions et les rappels). */
export function cashForecast(txs: Transaction[], accounts: Account[], categories: Category[], provisions: Provision[], today: string, horizon: number) {
  const cash = accounts.filter((a) => a.type === 'courant' && !a.archived);
  const cashIds = new Set(cash.map((a) => a.id));
  const cashTxs = txs.filter((t) => cashIds.has(t.accountId));
  const start = cash.reduce((s, a) => s + accountBalance(a, txs), 0);
  const recurring = detectRecurring(cashTxs);
  const recurringKeys = new Set(recurring.map((r) => r.key));
  const transferCats = new Set(categories.filter((c) => c.kind === 'transfer').map((c) => c.id));
  // dépenses courantes hors prélèvements récurrents, sur les 90 derniers jours
  const since = new Date(`${today}T12:00:00`);
  since.setDate(since.getDate() - 90);
  const sinceIso = since.toISOString().slice(0, 10);
  let variable = 0;
  for (const t of cashTxs) {
    if (t.date < sinceIso || t.date > today || t.amount >= 0) continue;
    if (t.categoryId && transferCats.has(t.categoryId)) continue;
    if (recurringKeys.has(`${merchantKey(t.label)}|-`)) continue;
    variable += -t.amount;
  }
  const daily = Math.round(variable / 90);
  const events = upcomingEvents(recurring, provisions, today, horizon);
  const points = forecastBalance(start, events, daily, today, horizon);
  const low = points.reduce((m, p) => (p.balance < m.balance ? p : m), points[0]);
  return { start, daily, events, points, low, hasCash: cash.length > 0 };
}
