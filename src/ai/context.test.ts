import { buildFinanceContext } from './context';
import { demoData } from '../lib/demo';

describe('contexte envoyé à Claude', () => {
  const d = demoData();
  d.settings.ownerName = 'Alexander Rebai';
  d.transactions.push(
    { id: 'x1', date: d.transactions[0].date, amount: -10_800, label: 'VIR SEPA REBAI ALEXANDER FR7630004000031234567890143', accountId: d.accounts[0].id, categoryId: 'exp-other' },
    { id: 'x2', date: d.transactions[0].date, amount: -4_500, label: 'CB CARREFOUR CITY 5290XXXXXXXX1133', accountId: d.accounts[0].id, categoryId: 'exp-groceries' },
  );
  const ctx = buildFinanceContext(d);

  it('contient les grandes masses', () => {
    expect(ctx).toMatch(/Revenus .* €/);
    expect(ctx).toContain('Prélèvements récurrents');
    expect(ctx).toContain('Carrefour');
  });
  it('ne contient ni le nom du titulaire ni de références bancaires', () => {
    expect(ctx.toLowerCase()).not.toContain('rebai');
    expect(ctx.toLowerCase()).not.toContain('alexander');
    expect(ctx).not.toMatch(/FR76\d+/);
    expect(ctx).not.toContain('5290');
  });
  it('reste d’une taille raisonnable', () => {
    expect(ctx.length).toBeLessThan(12_000);
  });
});
