/**
 * Rappels : gros prélèvement imminent, découvert prévu, budget dépassé ou presque atteint.
 * Calcul pur ; l'envoi des notifications est dans src/alerts/notify.ts.
 */
import { spendingByCategory } from './analysis';
import { cashForecast } from './cashForecast';
import { dateLabel, monthKey } from './format';
import type { Data } from '../store/store';
import type { Category } from './types';

export interface Alert {
  /** Identifiant stable : une alerte n'est envoyée qu'une fois. */
  id: string;
  level: 'info' | 'warn' | 'danger';
  title: string;
  body: string;
  to: string;
}

const eur = (c: number) => `${Math.round(c / 100).toLocaleString('fr-FR')} €`;

export function computeAlerts(d: Data, today: string, threshold = 5_000): Alert[] {
  const alerts: Alert[] = [];
  const f = cashForecast(d.transactions, d.accounts, d.categories, d.provisions, today, 30);
  if (!f.hasCash) return alerts;

  // Prélèvements importants dans les 3 prochains jours
  const in3 = new Date(`${today}T12:00:00`);
  in3.setDate(in3.getDate() + 3);
  const limit = in3.toISOString().slice(0, 10);
  for (const e of f.events) {
    if (e.amount >= 0 || e.date > limit || -e.amount < threshold) continue;
    alerts.push({ id: `debit:${e.date}:${e.label}`, level: 'info', title: `Prélèvement de ${eur(-e.amount)} le ${dateLabel(e.date)}`, body: e.label, to: '/previsions' });
  }

  // Découvert prévu dans les 30 jours
  if (f.low.balance < 0) {
    alerts.push({
      id: `decouvert:${monthKey(f.low.date)}`,
      level: 'danger',
      title: 'Découvert prévu',
      body: `Votre compte courant pourrait passer à ${eur(f.low.balance)} vers le ${dateLabel(f.low.date)}. Prévoyez un virement depuis l’épargne.`,
      to: '/previsions',
    });
  }

  // Budgets du mois
  const cats = new Map<string, Category>(d.categories.map((c) => [c.id, c]));
  const month = monthKey(today);
  const spent = new Map(spendingByCategory(d.transactions, cats, month).map((x) => [x.categoryId, x.amount]));
  for (const b of d.budgets) {
    const s = spent.get(b.categoryId) ?? 0;
    const name = cats.get(b.categoryId)?.name ?? 'Catégorie';
    if (s > b.monthly) {
      alerts.push({ id: `budget-over:${month}:${b.categoryId}`, level: 'warn', title: `Budget « ${name} » dépassé`, body: `${eur(s)} dépensés pour ${eur(b.monthly)} prévus ce mois-ci.`, to: '/budgets' });
    } else if (s >= b.monthly * 0.9) {
      alerts.push({ id: `budget-90:${month}:${b.categoryId}`, level: 'info', title: `Budget « ${name} » presque atteint`, body: `${eur(s)} sur ${eur(b.monthly)} (${Math.round((s / b.monthly) * 100)} %).`, to: '/budgets' });
    }
  }
  return alerts;
}
