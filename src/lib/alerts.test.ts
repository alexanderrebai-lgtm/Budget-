import { computeAlerts } from './alerts';
import { initialData, type Data } from '../store/store';
import type { Transaction } from './types';

describe('rappels', () => {
  const base = (): Data => ({
    ...initialData(),
    accounts: [{ id: 'c', name: 'Courant', type: 'courant', openingBalance: 20_000 }],
    budgets: [{ categoryId: 'exp-restaurant', monthly: 10_000 }],
  });
  const tx = (id: string, date: string, amount: number, label: string, categoryId: string | null = null): Transaction => ({ id, date, amount, label, accountId: 'c', categoryId });

  it('prévient d’un gros prélèvement imminent et d’un découvert', () => {
    const d = base();
    for (const m of ['08', '09', '10', '11']) d.transactions.push(tx(`l${m}`, `2026-${m}-22`, -90_000, 'PRLV LOYER FONCIA', 'exp-housing'));
    for (const m of ['08', '09', '10', '11']) d.transactions.push(tx(`s${m}`, `2026-${m}-01`, 90_000, 'SALAIRE', 'inc-salary'));
    const alerts = computeAlerts(d, '2026-12-20');
    expect(alerts.find((a) => a.id.startsWith('debit:2026-12-22'))?.title).toMatch(/Prélèvement de 900 €/);
    expect(alerts.some((a) => a.id.startsWith('decouvert:'))).toBe(true);
  });

  it('signale un budget dépassé', () => {
    const d = base();
    d.transactions.push(tx('r1', '2026-12-05', -12_000, 'CB RESTAURANT', 'exp-restaurant'));
    const alerts = computeAlerts(d, '2026-12-10');
    expect(alerts.find((a) => a.id === 'budget-over:2026-12:exp-restaurant')).toBeDefined();
  });
});
