import { categorize, detectRecurring, merchantKey } from './analysis';
import { applyMapping, guessMapping, parseCsv } from './csv';
import { DEFAULT_RULES } from './defaults';
import { parseAmount } from './format';
import type { Transaction } from './types';

describe('parseAmount', () => {
  it.each([
    ['1 234,56', 1234.56],
    ['-12,50 €', -12.5],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['(45,00)', -45],
    ['', null],
  ])('%s → %s', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });
});

describe('categorize', () => {
  it('reconnaît les marchands courants', () => {
    expect(categorize('CB CARREFOUR MARKET 12/03', DEFAULT_RULES)).toBe('exp-groceries');
    expect(categorize('PRLV SEPA NETFLIX.COM', DEFAULT_RULES)).toBe('exp-subscriptions');
  });
  it('privilégie la règle la plus longue', () => {
    expect(categorize('CB UBER EATS PARIS', DEFAULT_RULES)).toBe('exp-restaurant');
  });
  it('respecte la fin de mot imposée', () => {
    expect(categorize('CAFE DE LA GARE', DEFAULT_RULES)).not.toBe('inc-benefits');
  });
});

describe('import CSV', () => {
  it('lit un export avec débit/crédit séparés et lignes de préambule', () => {
    const csv = [
      'Compte courant n°123;;;',
      'Solde au 31/10/2026;1 500,00;;',
      '',
      'Date;Libellé;Débit;Crédit',
      '02/10/2026;CB LIDL;45,30;',
      '05/10/2026;VIR SALAIRE ACME;;2 450,00',
    ].join('\n');
    const parsed = parseCsv(csv);
    const mapping = guessMapping(parsed);
    expect(mapping.debitColumn).toBe('Débit');
    const { rows, errors } = applyMapping(parsed, mapping);
    expect(errors).toBe(0);
    expect(rows).toEqual([
      { date: '2026-10-02', label: 'CB LIDL', amount: -45.3 },
      { date: '2026-10-05', label: 'VIR SALAIRE ACME', amount: 2450 },
    ]);
  });
});

describe('détection des récurrences', () => {
  it('trouve un abonnement mensuel', () => {
    const txs: Transaction[] = ['2026-06-03', '2026-07-03', '2026-08-04', '2026-09-03'].map((date, i) => ({
      id: String(i), date, amount: -1399, label: `PRLV NETFLIX ${i}`, accountId: 'a', categoryId: null,
    }));
    const r = detectRecurring(txs);
    expect(r).toHaveLength(1);
    expect(r[0].frequency).toBe('mensuel');
    expect(r[0].annualCost).toBe(1399 * 12);
  });
  it('tolère un mois exceptionnel (prime)', () => {
    const txs: Transaction[] = ['2026-06-28', '2026-07-28', '2026-08-28', '2026-09-28', '2026-10-28'].map((date, i) => ({
      id: String(i), date, amount: i === 2 ? 338_000 : 248_000, label: 'VIR SALAIRE ACME', accountId: 'a', categoryId: null,
    }));
    const r = detectRecurring(txs);
    expect(r).toHaveLength(1);
    expect(r[0].averageAmount).toBe(248_000);
    expect(r[0].isIncome).toBe(true);
  });
  it('normalise les libellés', () => {
    expect(merchantKey('CB SPOTIFY 12/05 REF 8899')).toBe('spotify ref');
  });
});
