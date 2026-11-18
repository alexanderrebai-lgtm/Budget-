import { computeParts, computeTax, emptyProfile, mileageAllowance, taxPerPart, type TaxProfile } from './engine';
import { suggest } from './optimizer';

function profile(mut: (p: TaxProfile) => void): TaxProfile {
  const p = emptyProfile();
  mut(p);
  return p;
}

describe('barème', () => {
  it('ne taxe pas la première tranche', () => {
    expect(taxPerPart(11_600)).toBe(0);
  });
  it('applique les tranches successives', () => {
    // (29 579 - 11 600) × 11 % + (40 000 - 29 579) × 30 %
    expect(taxPerPart(40_000)).toBeCloseTo(17_979 * 0.11 + 10_421 * 0.3, 2);
  });
});

describe('quotient familial', () => {
  it('couple avec 3 enfants = 4 parts', () => {
    expect(computeParts(profile((p) => { p.status = 'couple'; p.childrenExclusive = 3; })).parts).toBe(4);
  });
  it('parent isolé avec 1 enfant = 2 parts', () => {
    expect(computeParts(profile((p) => { p.singleParent = true; p.childrenExclusive = 1; })).parts).toBe(2);
  });
  it('garde alternée de 2 enfants = 1,5 part', () => {
    expect(computeParts(profile((p) => { p.childrenShared = 2; })).parts).toBe(1.5);
  });
  it('parent isolé en garde alternée = 1,75 part', () => {
    expect(computeParts(profile((p) => { p.singleParent = true; p.childrenShared = 2; })).parts).toBe(1.75);
  });
});

describe('calcul complet', () => {
  it('célibataire 30 000 € de salaire, avec décote', () => {
    const r = computeTax(profile((p) => { p.declarants[0].salary = 30_000; }));
    expect(r.taxableIncome).toBe(27_000);
    expect(r.taxAfterQf).toBe(1_694);
    expect(r.decote).toBe(130);
    expect(r.incomeTaxNet).toBe(1_564);
    expect(r.marginalRate).toBe(0.11);
    // la décote augmente le taux marginal réel
    expect(r.effectiveMarginalRate).toBeGreaterThan(0.15);
  });

  it('couple 2 enfants 70 000 €', () => {
    const r = computeTax(profile((p) => {
      p.status = 'couple';
      p.childrenExclusive = 2;
      p.declarants[0].salary = 40_000;
      p.declarants[1].salary = 30_000;
    }));
    expect(r.parts).toBe(3);
    expect(r.taxableIncome).toBe(63_000);
    expect(r.qfCapApplied).toBe(false);
    expect(r.incomeTaxNet).toBe(3_023);
  });

  it('plafonne l’avantage du quotient familial', () => {
    const r = computeTax(profile((p) => {
      p.status = 'couple';
      p.childrenExclusive = 1;
      p.declarants[0].salary = 154_555; // abattement plafonné à 14 555 €
    }));
    expect(r.taxableIncome).toBe(140_000);
    expect(r.qfCapApplied).toBe(true);
    // 2 parts : 28 207,98 € - plafond 1 807 €
    expect(r.incomeTaxNet).toBe(26_401);
  });

  it('déduit le PER dans la limite du plafond', () => {
    const r = computeTax(profile((p) => {
      p.declarants[0].salary = 60_000;
      p.declarants[0].perContributions = 10_000;
      p.declarants[0].perCeiling = 5_400;
    }));
    expect(r.perDeducted[0]).toBe(5_400);
    expect(r.taxableIncome).toBe(54_000 - 5_400);
    expect(r.warnings.some((w) => w.includes('PER'))).toBe(true);
  });

  it('crédit emploi à domicile remboursable même non imposable', () => {
    const r = computeTax(profile((p) => { p.declarants[0].salary = 12_000; p.homeEmployment = 2_000; }));
    expect(r.incomeTaxNet).toBe(-1_000);
  });

  it('choisit le barème pour des dividendes à TMI 0 %', () => {
    const r = computeTax(profile((p) => { p.capital.dividends = 3_000; }));
    expect(r.regimes.capital).toBe('bareme');
  });

  it('choisit le PFU à TMI élevée', () => {
    const r = computeTax(profile((p) => { p.declarants[0].salary = 120_000; p.capital.dividends = 10_000; p.capital.interest = 5_000; }));
    expect(r.regimes.capital).toBe('pfu');
  });

  it('déficit foncier : intérêts exclus de l’imputation globale', () => {
    const r = computeTax(profile((p) => {
      p.declarants[0].salary = 50_000;
      p.rental = { grossRent: 8_000, expenses: 25_000, loanInterest: 3_000, regime: 'real' };
    }));
    // déficit hors intérêts = 22 000 - 8 000 = 14 000 → plafonné à 10 700
    expect(r.grossIncomeLines.find((l) => l.label.includes('Déficit'))?.amount).toBe(-10_700);
    expect(r.rentalDeficitCarryForward).toBe(17_000 - 10_700);
  });

  it('micro-foncier quand les charges sont faibles', () => {
    const r = computeTax(profile((p) => {
      p.declarants[0].salary = 40_000;
      p.rental = { grossRent: 10_000, expenses: 1_000, loanInterest: 0, regime: 'auto' };
    }));
    expect(r.regimes.rental).toBe('micro');
  });
});

describe('optimisation', () => {
  it('propose le PER avec une économie positive', () => {
    const s = suggest(profile((p) => { p.declarants[0].salary = 60_000; }));
    const per = s.find((x) => x.id === 'per');
    expect(per).toBeDefined();
    expect(per!.saving).toBeGreaterThan(1_000);
  });
});

describe('barème kilométrique', () => {
  it('5 CV, 10 000 km', () => {
    expect(mileageAllowance(10_000, '5')).toBe(4_965);
  });
});
