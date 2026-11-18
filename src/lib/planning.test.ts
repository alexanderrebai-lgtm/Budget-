import { fireNumber, forecastBalance, simulatePayoff, upcomingEvents, valueWithFees, yearsToTarget } from './planning';
import type { Recurring } from './analysis';

const rec = (p: Partial<Recurring>): Recurring => ({
  key: 'k', label: 'LOYER', categoryId: null, averageAmount: 80_000, frequency: 'mensuel', occurrences: 4,
  lastDate: '2026-11-05', nextDate: '2026-12-05', annualCost: 960_000, isIncome: false, ...p,
});

describe('prévision de trésorerie', () => {
  it('projette les échéances mensuelles', () => {
    const ev = upcomingEvents([rec({})], [], '2026-11-18', 60);
    expect(ev.map((e) => e.date)).toEqual(['2026-12-05', '2027-01-05']);
  });
  it('ajoute les provisions annuelles', () => {
    const ev = upcomingEvents([], [{ id: 'p', name: 'Taxe foncière', amount: 90_000, month: 10 }], '2026-09-01', 60);
    expect(ev).toEqual([{ date: '2026-10-15', label: 'Taxe foncière', amount: -90_000, kind: 'provision' }]);
  });
  it('calcule le solde jour par jour', () => {
    const pts = forecastBalance(100_000, [{ date: '2026-11-20', label: 'x', amount: -50_000, kind: 'recurring' }], 1_000, '2026-11-18', 3);
    expect(pts.map((p) => p.balance)).toEqual([100_000, 99_000, 48_000, 47_000]);
  });
});

describe('remboursement des dettes', () => {
  const debts = [
    { id: 'conso', name: 'Crédit conso', balance: 3_000, rate: 0.08, minPayment: 100 },
    { id: 'auto', name: 'Crédit auto', balance: 8_000, rate: 0.04, minPayment: 200 },
    { id: 'revolving', name: 'Revolving', balance: 1_500, rate: 0.19, minPayment: 50 },
  ];
  it('avalanche coûte moins d’intérêts que boule de neige', () => {
    const a = simulatePayoff(debts, 200, 'avalanche');
    const s = simulatePayoff(debts, 200, 'snowball');
    expect(a.feasible && s.feasible).toBe(true);
    expect(a.totalInterest).toBeLessThanOrEqual(s.totalInterest);
    expect(s.order[0]).toBe('revolving'); // plus petit solde
    expect(a.order[0]).toBe('revolving'); // taux le plus élevé
  });
  it('un effort supplémentaire raccourcit la durée', () => {
    expect(simulatePayoff(debts, 500, 'avalanche').months).toBeLessThan(simulatePayoff(debts, 0, 'avalanche').months);
  });
  it('détecte une mensualité insuffisante', () => {
    expect(simulatePayoff([{ id: 'x', name: 'x', balance: 100_000, rate: 0.2, minPayment: 100 }], 0, 'avalanche').feasible).toBe(false);
  });
});

describe('indépendance financière', () => {
  it('règle des 4 %', () => {
    expect(fireNumber(30_000, 0.04)).toBe(750_000);
  });
  it('années pour atteindre la cible', () => {
    expect(yearsToTarget(0, 10_000, 0, 50_000)).toBeCloseTo(5, 5);
    expect(yearsToTarget(100, 0, 0, 50)).toBe(0);
  });
  it('les frais réduisent le capital final', () => {
    const cheap = valueWithFees(10_000, 200, 20, 0.06, 0.002);
    const costly = valueWithFees(10_000, 200, 20, 0.06, 0.02);
    expect(cheap - costly).toBeGreaterThan(20_000);
  });
});
