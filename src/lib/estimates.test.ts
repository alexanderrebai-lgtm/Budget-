import { computeEstimates } from './estimates';
import { DEFAULT_CATEGORIES } from './defaults';
import type { Transaction } from './types';

const cats = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
let id = 0;
const tx = (date: string, amount: number, categoryId: string, accountId = 'a', extra: Partial<Transaction> = {}): Transaction => ({
  id: String(id++), date, amount, label: categoryId, accountId, categoryId, ...extra,
});

describe('estimations mensuelles et annuelles', () => {
  const txs: Transaction[] = [];
  const shops: Record<string, string> = { '2026-08': 'CB LIDL', '2026-09': 'CB CARREFOUR', '2026-10': 'CB AUCHAN' };
  for (const m of ['2026-08', '2026-09', '2026-10']) {
    txs.push(tx(`${m}-28`, 250_000, 'inc-salary', 'courant'));
    txs.push(tx(`${m}-05`, -90_000, 'exp-housing', 'courant', { label: 'PRLV LOYER FONCIA' }));
    txs.push(tx(`${m}-12`, -30_000, 'exp-groceries', 'nickel', { label: shops[m] }));
    // virement entre comptes : exclu
    txs.push(tx(`${m}-02`, -10_000, 'trf-internal', 'courant', { transferId: `t${m}` }));
    txs.push(tx(`${m}-03`, 10_000, 'trf-internal', 'nickel', { transferId: `t${m}` }));
    // épargne
    txs.push(tx(`${m}-29`, -20_000, 'sav-invest', 'courant'));
  }
  txs.push(tx('2026-11-03', -99_999, 'exp-shopping', 'courant')); // mois en cours : exclu
  const accounts = [
    { id: 'courant', name: 'Courant', type: 'courant' as const, openingBalance: 0 },
    { id: 'nickel', name: 'Nickel', type: 'courant' as const, openingBalance: 0 },
  ];
  const e = computeEstimates(txs, cats, accounts, [{ id: 'p', name: 'Assurance', amount: 24_000, month: 3 }], '2026-11', 12);

  it('ne compte que les mois couverts et exclut le mois en cours', () => {
    expect(e.coveredMonths).toBe(3);
  });
  it('additionne tous les comptes, hors virements internes', () => {
    expect(e.income.monthly).toBe(250_000);
    expect(e.expense.monthly).toBe(120_000);
    expect(e.balance.annual).toBe(130_000 * 12);
    expect(e.byAccount.find((a) => a.accountId === 'nickel')).toMatchObject({ income: 0, expense: 30_000 });
  });
  it('isole l’épargne et les charges fixes', () => {
    expect(e.savings.monthly).toBe(20_000);
    expect(e.expense.fixedMonthly).toBe(90_000);
    expect(e.expense.variableMonthly).toBe(30_000);
    expect(e.provisions.monthly).toBe(2_000);
  });
});
