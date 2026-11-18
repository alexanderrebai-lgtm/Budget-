/** Prévision de trésorerie, remboursement de dettes, indépendance financière. */
import type { Recurring } from './analysis';
import type { Cents, ISODate, Provision } from './types';

/* ---------------- Prévision de trésorerie ---------------- */

export interface ForecastEvent {
  date: ISODate;
  label: string;
  amount: Cents;
  kind: 'recurring' | 'provision';
}

export interface ForecastPoint {
  date: ISODate;
  balance: Cents;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: ISODate) => new Date(`${s}T12:00:00`);

function addInterval(d: Date, freq: Recurring['frequency']): Date {
  const n = new Date(d);
  if (freq === 'hebdomadaire') n.setDate(n.getDate() + 7);
  else if (freq === 'mensuel') n.setMonth(n.getMonth() + 1);
  else if (freq === 'trimestriel') n.setMonth(n.getMonth() + 3);
  else n.setFullYear(n.getFullYear() + 1);
  return n;
}

/** Échéances futures des opérations récurrentes et des provisions, entre aujourd'hui (exclu) et l'horizon. */
export function upcomingEvents(recurring: Recurring[], provisions: Provision[], today: ISODate, days: number): ForecastEvent[] {
  const start = parse(today);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const out: ForecastEvent[] = [];
  for (const r of recurring) {
    let d = parse(r.lastDate);
    // avance jusqu'à la première échéance future
    for (let guard = 0; guard < 600 && d <= start; guard++) d = addInterval(d, r.frequency);
    for (let guard = 0; guard < 600 && d <= end; guard++) {
      out.push({ date: iso(d), label: r.label, amount: r.isIncome ? r.averageAmount : -r.averageAmount, kind: 'recurring' });
      d = addInterval(d, r.frequency);
    }
  }
  for (const p of provisions) {
    // échéance annuelle : le 15 du mois indiqué
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
      const d = new Date(y, p.month - 1, Math.min(p.day ?? 15, 28), 12);
      if (d > start && d <= end) out.push({ date: iso(d), label: p.name, amount: -p.amount, kind: 'provision' });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Solde projeté jour par jour : solde actuel + échéances connues + dépenses
 * courantes non récurrentes (moyenne quotidienne observée).
 */
export function forecastBalance(startBalance: Cents, events: ForecastEvent[], dailyVariable: Cents, today: ISODate, days: number): ForecastPoint[] {
  const byDate = new Map<string, Cents>();
  for (const e of events) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.amount);
  const points: ForecastPoint[] = [{ date: today, balance: startBalance }];
  let bal = startBalance;
  const d = parse(today);
  for (let i = 1; i <= days; i++) {
    d.setDate(d.getDate() + 1);
    const key = iso(d);
    bal += (byDate.get(key) ?? 0) - dailyVariable;
    points.push({ date: key, balance: Math.round(bal) });
  }
  return points;
}

/* ---------------- Dettes : boule de neige / avalanche ---------------- */

export interface Debt {
  id: string;
  name: string;
  balance: number; // euros
  rate: number; // taux annuel (0.05)
  minPayment: number; // mensualité minimale
}

export interface PayoffResult {
  months: number;
  totalInterest: number;
  totalPaid: number;
  /** Mois de remboursement complet de chaque dette. */
  payoffMonth: Record<string, number>;
  order: string[];
  feasible: boolean;
}

/**
 * Simule le remboursement : chaque mois, toutes les mensualités minimales sont payées,
 * le surplus va à la dette prioritaire (plus petit solde ou taux le plus élevé), et la
 * mensualité d'une dette soldée est reportée sur la suivante.
 */
export function simulatePayoff(debts: Debt[], extra: number, strategy: 'snowball' | 'avalanche'): PayoffResult {
  const state = debts.filter((d) => d.balance > 0).map((d) => ({ ...d }));
  const budget = state.reduce((s, d) => s + d.minPayment, 0) + extra;
  const payoffMonth: Record<string, number> = {};
  const order: string[] = [];
  let totalInterest = 0;
  let totalPaid = 0;
  let month = 0;

  while (state.some((d) => d.balance > 0.005) && month < 1200) {
    month++;
    for (const d of state) {
      if (d.balance <= 0) continue;
      const interest = d.balance * (d.rate / 12);
      d.balance += interest;
      totalInterest += interest;
    }
    let available = budget;
    for (const d of state) {
      if (d.balance <= 0) continue;
      const pay = Math.min(d.minPayment, d.balance, available);
      d.balance -= pay;
      available -= pay;
      totalPaid += pay;
    }
    const open = state.filter((d) => d.balance > 0.005);
    open.sort((a, b) => (strategy === 'snowball' ? a.balance - b.balance : b.rate - a.rate || a.balance - b.balance));
    for (const d of open) {
      if (available <= 0) break;
      const pay = Math.min(d.balance, available);
      d.balance -= pay;
      available -= pay;
      totalPaid += pay;
    }
    for (const d of state) {
      if (d.balance <= 0.005 && payoffMonth[d.id] === undefined) {
        d.balance = 0;
        payoffMonth[d.id] = month;
        order.push(d.id);
      }
    }
    // les mensualités ne couvrent même pas les intérêts
    if (month === 1 && budget <= state.reduce((s, d) => s + d.balance * (d.rate / 12), 0)) {
      return { months: Infinity, totalInterest: Infinity, totalPaid: Infinity, payoffMonth, order, feasible: false };
    }
  }
  return { months: month, totalInterest, totalPaid, payoffMonth, order, feasible: month < 1200 };
}

/* ---------------- Indépendance financière ---------------- */

/** Capital nécessaire pour vivre de ses placements (règle du taux de retrait). */
export function fireNumber(annualExpenses: number, withdrawalRate: number): number {
  return withdrawalRate > 0 ? annualExpenses / withdrawalRate : Infinity;
}

/** Nombre d'années pour atteindre un capital cible avec un effort d'épargne annuel. */
export function yearsToTarget(current: number, annualSaving: number, realReturn: number, target: number): number {
  if (current >= target) return 0;
  let v = current;
  for (let y = 1; y <= 100; y++) {
    v = v * (1 + realReturn) + annualSaving;
    if (v >= target) {
      // interpolation dans l'année
      const prev = (v - annualSaving) / (1 + realReturn);
      const frac = (target - prev) / (v - prev);
      return y - 1 + Math.max(0, Math.min(1, frac));
    }
  }
  return Infinity;
}

/** Capital final avec frais de gestion annuels, versements mensuels. */
export function valueWithFees(initial: number, monthly: number, years: number, grossReturn: number, feeRate: number): number {
  const r = Math.pow(1 + grossReturn - feeRate, 1 / 12) - 1;
  let v = initial;
  for (let m = 0; m < years * 12; m++) v = v * (1 + r) + monthly;
  return v;
}
