import { computeBrief } from './brief';
import { computeEstimates } from './estimates';
import { DEFAULT_CATEGORIES } from './defaults';
import { demoData } from './demo';
import type { Account, Transaction } from './types';

const cats = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));

describe('bilan express', () => {
  it('produit une note, une synthèse et des signaux avec les données de démo', () => {
    const d = demoData();
    const current = new Date().toISOString().slice(0, 7);
    const est = computeEstimates(d.transactions, cats, d.accounts, d.provisions, current, 12);
    const b = computeBrief(est, d.accounts, d.transactions, cats);
    expect(b.ready).toBe(true);
    expect(b.score).toBeGreaterThan(0);
    expect(b.score).toBeLessThanOrEqual(100);
    expect(b.headline).toMatch(/par mois/);
    expect(b.signals.length).toBeGreaterThan(0);
    expect(b.next).not.toBeNull();
    // 10 250 € sur livret A à 1,7 % contre 3,4 % d'inflation → érosion ≈ 174 €/an
    expect(Math.round(b.cashErosion / 100)).toBe(Math.round(102_50 * 0.017));
  });

  it('signale un déficit et un découvert', () => {
    const accounts: Account[] = [{ id: 'c', name: 'Courant', type: 'courant', openingBalance: 0 }];
    const txs: Transaction[] = [];
    let i = 0;
    for (const m of ['2026-08', '2026-09', '2026-10']) {
      txs.push({ id: String(i++), date: `${m}-01`, amount: 150_000, label: 'SALAIRE', accountId: 'c', categoryId: 'inc-salary' });
      txs.push({ id: String(i++), date: `${m}-05`, amount: -180_000, label: `CB ACHAT ${m}`, accountId: 'c', categoryId: 'exp-shopping' });
    }
    const est = computeEstimates(txs, cats, accounts, [], '2026-11', 12);
    const b = computeBrief(est, accounts, txs, cats);
    expect(b.signals[0].tone).toBe('neg');
    expect(b.signals.some((s) => s.id === 'overdraft')).toBe(true);
    expect(b.next?.text).toMatch(/découvert/);
    expect(b.label).toBe('Tendue');
  });

  it('attend des données suffisantes', () => {
    const est = computeEstimates([], cats, [], [], '2026-11', 12);
    expect(computeBrief(est, [], [], cats).ready).toBe(false);
  });
});
