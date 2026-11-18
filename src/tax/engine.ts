import { CURRENT_PARAMS, type TaxYearParams } from './params';

export type FamilyStatus = 'single' | 'couple' | 'widowed';
export type MicroKind = 'sales' | 'services' | 'bnc';
export type FurnishedKind = 'longTerm' | 'classifiedTourism' | 'unclassifiedTourism';
export type RegimeChoice = 'auto' | 'micro' | 'real';

export interface Declarant {
  /** Salaires nets imposables. */
  salary: number;
  /** Frais réels. 0 = abattement forfaitaire de 10 %. */
  realExpenses: number;
  /** Pensions de retraite imposables. */
  pension: number;
  /** Versements sur un PER (ou assimilés) dans l'année. */
  perContributions: number;
  /** Plafond épargne retraite disponible (avis d'impôt). null = estimation. */
  perCeiling: number | null;
  /** Chiffre d'affaires micro-entreprise. */
  microRevenue: number;
  microKind: MicroKind;
  microLiberatoire: boolean;
}

export interface TaxProfile {
  status: FamilyStatus;
  /** Case T : vous vivez seul(e) avec vos enfants. */
  singleParent: boolean;
  childrenExclusive: number;
  childrenShared: number;
  /** Enfants de moins de 6 ans au 1er janvier, gardés hors du domicile. */
  childrenUnder6: number;
  /** Demi-parts supplémentaires (invalidité, ancien combattant…). */
  extraHalfParts: number;
  declarants: [Declarant, Declarant];

  rental: {
    grossRent: number;
    /** Charges déductibles, intérêts d'emprunt compris. */
    expenses: number;
    loanInterest: number;
    regime: RegimeChoice;
  };
  furnished: {
    revenue: number;
    expenses: number;
    depreciation: number;
    kind: FurnishedKind;
    regime: RegimeChoice;
  };
  capital: {
    dividends: number;
    interest: number;
    capitalGains: number;
    /** 'auto' = la solution la moins chère entre PFU et barème. */
    option: 'auto' | 'pfu' | 'bareme';
  };

  alimonyAdultChildren: number;
  adultChildrenSupported: number;
  otherDeductibleAlimony: number;

  donationsHelp: number;
  donationsGeneral: number;
  homeEmployment: number;
  /** Personnes ouvrant droit à majoration (enfants, membres +65 ans). */
  homeEmploymentDependents: number;
  childcare: number;
  unionDues: number;
  schoolingCollege: number;
  schoolingLycee: number;
  schoolingSuperieur: number;
  smeInvestment: number;

  /** Prélèvement à la source déjà payé (pour estimer le solde). */
  withholdingPaid: number;
}

export const emptyDeclarant = (): Declarant => ({
  salary: 0,
  realExpenses: 0,
  pension: 0,
  perContributions: 0,
  perCeiling: null,
  microRevenue: 0,
  microKind: 'services',
  microLiberatoire: false,
});

export const emptyProfile = (): TaxProfile => ({
  status: 'single',
  singleParent: false,
  childrenExclusive: 0,
  childrenShared: 0,
  childrenUnder6: 0,
  extraHalfParts: 0,
  declarants: [emptyDeclarant(), emptyDeclarant()],
  rental: { grossRent: 0, expenses: 0, loanInterest: 0, regime: 'auto' },
  furnished: { revenue: 0, expenses: 0, depreciation: 0, kind: 'longTerm', regime: 'auto' },
  capital: { dividends: 0, interest: 0, capitalGains: 0, option: 'auto' },
  alimonyAdultChildren: 0,
  adultChildrenSupported: 0,
  otherDeductibleAlimony: 0,
  donationsHelp: 0,
  donationsGeneral: 0,
  homeEmployment: 0,
  homeEmploymentDependents: 0,
  childcare: 0,
  unionDues: 0,
  schoolingCollege: 0,
  schoolingLycee: 0,
  schoolingSuperieur: 0,
  smeInvestment: 0,
  withholdingPaid: 0,
});

export interface Line {
  label: string;
  amount: number;
  hint?: string;
}

export interface TaxResult {
  parts: number;
  baseParts: number;
  grossIncomeLines: Line[];
  grossIncome: number;
  deductions: Line[];
  taxableIncome: number;
  /** Impôt avant plafonnement du quotient familial. */
  taxBeforeCap: number;
  qfCapApplied: boolean;
  qfAdvantage: number;
  taxAfterQf: number;
  decote: number;
  reductions: Line[];
  credits: Line[];
  nicheCapExcess: number;
  incomeTaxNet: number;
  flatTaxes: Line[];
  socialContributions: number;
  cehr: number;
  total: number;
  /** Tranche marginale d'imposition (taux du barème). */
  marginalRate: number;
  /** Taux marginal réel : impôt supplémentaire pour 100 € de revenu imposable en plus. */
  effectiveMarginalRate: number;
  averageRate: number;
  balanceDue: number;
  regimes: {
    rental: 'micro' | 'real' | null;
    furnished: 'micro' | 'real' | null;
    capital: 'pfu' | 'bareme' | null;
  };
  rentalDeficitCarryForward: number;
  perCeilings: [number, number];
  perDeducted: [number, number];
  warnings: string[];
}

const round = (n: number) => Math.round(n);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Impôt brut pour un revenu par part donné, avant multiplication par les parts. */
export function taxPerPart(incomePerPart: number, p: TaxYearParams = CURRENT_PARAMS): number {
  let tax = 0;
  const b = p.brackets;
  for (let i = 0; i < b.length; i++) {
    const lo = b[i].from;
    const hi = i + 1 < b.length ? b[i + 1].from : Infinity;
    if (incomePerPart > lo) tax += (Math.min(incomePerPart, hi) - lo) * b[i].rate;
  }
  return tax;
}

export function marginalBracket(incomePerPart: number, p: TaxYearParams = CURRENT_PARAMS): number {
  let rate = 0;
  for (const br of p.brackets) if (incomePerPart > br.from) rate = br.rate;
  return rate;
}

/** Nombre de parts et parts « de base » (hors enfants et majorations). */
export function computeParts(profile: TaxProfile): {
  parts: number;
  baseParts: number;
  singleParentBonus: number;
} {
  const couple = profile.status === 'couple';
  const n = Math.max(0, Math.floor(profile.childrenExclusive));
  const m = Math.max(0, Math.floor(profile.childrenShared));
  const hasChildren = n + m > 0;
  // Veuf avec enfants à charge : conserve 2 parts.
  const baseParts = couple || (profile.status === 'widowed' && hasChildren) ? 2 : 1;

  let childParts = 0;
  for (let i = 0; i < n; i++) childParts += i < 2 ? 0.5 : 1;
  for (let j = 0; j < m; j++) {
    const rank = n + j; // rang de l'enfant tous enfants confondus
    childParts += rank < 2 ? 0.25 : 0.5;
  }

  let singleParentBonus = 0;
  if (!couple && profile.status !== 'widowed' && profile.singleParent && hasChildren) {
    singleParentBonus = n > 0 ? 0.5 : 0.25;
  }

  const parts = baseParts + childParts + singleParentBonus + 0.5 * Math.max(0, profile.extraHalfParts);
  return { parts, baseParts, singleParentBonus };
}

export function estimatePerCeiling(d: Declarant, p: TaxYearParams = CURRENT_PARAMS): number {
  const professional = Math.max(0, d.salary - salaryDeduction(d, p));
  return round(clamp(professional * p.per.rate, p.per.min, p.per.max));
}

function salaryDeduction(d: Declarant, p: TaxYearParams): number {
  if (d.salary <= 0) return 0;
  if (d.realExpenses > 0) return Math.min(d.realExpenses, d.salary);
  const { rate, min, max } = p.salaryAllowance;
  return Math.min(d.salary, clamp(d.salary * rate, min, max));
}

function microTaxable(revenue: number, rate: number, p: TaxYearParams) {
  if (revenue <= 0) return 0;
  const allowance = Math.max(revenue * rate, Math.min(p.microEnterprise.minAllowance, revenue));
  return Math.max(0, revenue - allowance);
}

function applyBareme(income: number, parts: number, p: TaxYearParams) {
  return parts * taxPerPart(income / parts, p);
}

interface CoreOptions {
  rentalRegime: 'micro' | 'real' | null;
  furnishedRegime: 'micro' | 'real' | null;
  capitalOption: 'pfu' | 'bareme' | null;
  extraTaxable?: number;
}

function core(profile: TaxProfile, opts: CoreOptions, p: TaxYearParams): TaxResult {
  const warnings: string[] = [];
  const couple = profile.status === 'couple';
  const active = couple ? [0, 1] : [0];
  const { parts, baseParts, singleParentBonus } = computeParts(profile);

  // 1. Revenus catégoriels
  const gross: Line[] = [];
  let salariesNet = 0;
  let salariesTotal = 0;
  for (const i of active) {
    const d = profile.declarants[i];
    if (d.salary > 0) {
      const ded = salaryDeduction(d, p);
      salariesTotal += d.salary;
      salariesNet += d.salary - ded;
      gross.push({
        label: `Salaires déclarant ${i + 1}`,
        amount: round(d.salary - ded),
        hint: d.realExpenses > 0 ? `frais réels ${round(ded)} €` : `abattement 10 % : ${round(ded)} €`,
      });
    }
  }

  const pensions = active.reduce((s, i) => s + profile.declarants[i].pension, 0);
  if (pensions > 0) {
    const { rate, min, max } = p.pensionAllowance;
    const ded = Math.min(pensions, clamp(pensions * rate, min, max));
    gross.push({ label: 'Pensions et retraites', amount: round(pensions - ded), hint: `abattement ${round(ded)} €` });
  }

  const flatTaxes: Line[] = [];
  for (const i of active) {
    const d = profile.declarants[i];
    if (d.microRevenue <= 0) continue;
    const kind = p.microEnterprise[d.microKind];
    if (d.microLiberatoire) {
      flatTaxes.push({
        label: `Versement libératoire micro (décl. ${i + 1})`,
        amount: round(d.microRevenue * kind.liberatoire),
      });
    } else {
      gross.push({
        label: `Micro-entreprise déclarant ${i + 1}`,
        amount: round(microTaxable(d.microRevenue, kind.rate, p)),
        hint: `abattement ${Math.round(kind.rate * 100)} %`,
      });
    }
  }

  // Revenus fonciers
  let rentalDeficitGlobal = 0;
  let rentalDeficitCarryForward = 0;
  let rentalTaxable = 0;
  const r = profile.rental;
  if (opts.rentalRegime && r.grossRent > 0) {
    if (opts.rentalRegime === 'micro') {
      rentalTaxable = r.grossRent * (1 - p.realEstate.microFoncierRate);
      gross.push({ label: 'Revenus fonciers (micro-foncier)', amount: round(rentalTaxable), hint: 'abattement 30 %' });
    } else {
      const result = r.grossRent - r.expenses;
      if (result >= 0) {
        rentalTaxable = result;
        gross.push({ label: 'Revenus fonciers (réel)', amount: round(result) });
      } else {
        // Le déficit issu des intérêts d'emprunt ne s'impute que sur les revenus fonciers.
        const nonInterestDeficit = Math.max(0, r.expenses - r.loanInterest - r.grossRent);
        rentalDeficitGlobal = Math.min(nonInterestDeficit, p.realEstate.globalDeficitCap);
        rentalDeficitCarryForward = -result - rentalDeficitGlobal;
        gross.push({
          label: 'Déficit foncier imputable',
          amount: -round(rentalDeficitGlobal),
          hint: rentalDeficitCarryForward > 0 ? `${round(rentalDeficitCarryForward)} € reportables 10 ans` : undefined,
        });
      }
    }
  }

  // Location meublée (LMNP)
  let furnishedTaxable = 0;
  const f = profile.furnished;
  if (opts.furnishedRegime && f.revenue > 0) {
    if (opts.furnishedRegime === 'micro') {
      furnishedTaxable = microTaxable(f.revenue, p.furnishedRental[f.kind].rate, p);
      gross.push({
        label: 'Location meublée (micro-BIC)',
        amount: round(furnishedTaxable),
        hint: `abattement ${Math.round(p.furnishedRental[f.kind].rate * 100)} %`,
      });
    } else {
      const beforeDep = f.revenue - f.expenses;
      // L'amortissement ne peut pas créer de déficit.
      furnishedTaxable = Math.max(0, beforeDep - Math.min(f.depreciation, Math.max(0, beforeDep)));
      if (beforeDep < 0) warnings.push('Déficit LMNP : imputable uniquement sur les revenus LMNP des 10 années suivantes.');
      gross.push({ label: 'Location meublée (réel)', amount: round(furnishedTaxable), hint: 'après amortissements' });
    }
  }

  // Revenus de capitaux mobiliers
  const c = profile.capital;
  const capitalTotal = c.dividends + c.interest + c.capitalGains;
  let capitalOnBareme = 0;
  if (capitalTotal > 0 && opts.capitalOption === 'bareme') {
    capitalOnBareme = c.dividends * (1 - p.capitalIncome.dividendAllowance) + c.interest + c.capitalGains;
    gross.push({ label: 'Revenus de capitaux (option barème)', amount: round(capitalOnBareme), hint: 'abattement 40 % sur dividendes' });
  } else if (capitalTotal > 0) {
    flatTaxes.push({ label: 'PFU 12,8 % sur revenus de capitaux', amount: round(capitalTotal * p.capitalIncome.pfuRate) });
  }

  if (opts.extraTaxable) gross.push({ label: 'Revenu supplémentaire (simulation)', amount: opts.extraTaxable });

  const grossIncome = Math.max(0, gross.reduce((s, l) => s + l.amount, 0));

  // 2. Charges déductibles
  const deductions: Line[] = [];
  const perCeilings: [number, number] = [0, 0];
  const perDeducted: [number, number] = [0, 0];
  for (const i of active) {
    const d = profile.declarants[i];
    perCeilings[i] = d.perCeiling ?? estimatePerCeiling(d, p);
  }
  // Les couples mariés/pacsés peuvent mutualiser leurs plafonds.
  const perTotal = active.reduce((s, i) => s + profile.declarants[i].perContributions, 0);
  const perCeilingTotal = active.reduce((s, i) => s + perCeilings[i], 0);
  if (perTotal > 0) {
    let remaining = Math.min(perTotal, perCeilingTotal);
    for (const i of active) {
      perDeducted[i] = Math.min(profile.declarants[i].perContributions, perCeilings[i]);
      remaining -= perDeducted[i];
    }
    for (const i of active) {
      if (remaining <= 0) break;
      const spare = perCeilings[i] - perDeducted[i];
      const take = Math.min(spare, remaining);
      perDeducted[i] += take;
      remaining -= take;
    }
    const ded = perDeducted[0] + perDeducted[1];
    deductions.push({ label: 'Versements épargne retraite (PER)', amount: round(ded) });
    if (perTotal > perCeilingTotal) warnings.push(`Versements PER au-delà du plafond : ${round(perTotal - perCeilingTotal)} € non déductibles.`);
  }
  if (profile.alimonyAdultChildren > 0) {
    const cap = p.adultChildAlimonyCap * Math.max(1, profile.adultChildrenSupported);
    deductions.push({ label: 'Pension alimentaire enfants majeurs', amount: round(Math.min(cap, profile.alimonyAdultChildren)) });
  }
  if (profile.otherDeductibleAlimony > 0) {
    deductions.push({ label: 'Autres pensions alimentaires', amount: round(profile.otherDeductibleAlimony) });
  }
  if (opts.capitalOption === 'bareme' && capitalTotal > 0) {
    deductions.push({
      label: 'CSG déductible (estimée, année suivante)',
      amount: 0,
      hint: `≈ ${round(capitalTotal * p.capitalIncome.deductibleCsg)} € l'an prochain`,
    });
  }
  const deductionTotal = deductions.reduce((s, l) => s + l.amount, 0);
  const taxableIncome = Math.max(0, Math.floor(grossIncome - deductionTotal));

  // 3. Barème et quotient familial
  const taxFull = applyBareme(taxableIncome, parts, p);
  const taxBase = applyBareme(taxableIncome, baseParts, p);
  const extraParts = parts - baseParts;
  let cap = extraParts * 2 * p.quotientFamilial.halfPartCap;
  if (singleParentBonus > 0) {
    cap += (p.quotientFamilial.singleParentCap - p.quotientFamilial.halfPartCap) * singleParentBonus * 2;
  }
  const qfAdvantage = taxBase - taxFull;
  const qfCapApplied = qfAdvantage > cap;
  const taxAfterQf = qfCapApplied ? taxBase - cap : taxFull;

  // 4. Décote
  const decoteBase = couple ? p.decote.couple : p.decote.single;
  const decote = Math.min(taxAfterQf, Math.max(0, decoteBase - p.decote.rate * taxAfterQf));
  const taxAfterDecote = Math.max(0, taxAfterQf - decote);

  // 5. Réductions (non remboursables)
  const reductions: Line[] = [];
  const credits: Line[] = [];
  let nicheTotal = 0;

  const donHelp = Math.min(profile.donationsHelp, p.donations.helpCap);
  const donGeneralBase = Math.min(
    profile.donationsGeneral + Math.max(0, profile.donationsHelp - p.donations.helpCap),
    taxableIncome * p.donations.incomeCapRate,
  );
  const donReduction = donHelp * p.donations.helpRate + donGeneralBase * p.donations.generalRate;
  if (donReduction > 0) reductions.push({ label: 'Dons (75 % / 66 %)', amount: round(donReduction) });

  const schooling =
    profile.schoolingCollege * p.schooling.college +
    profile.schoolingLycee * p.schooling.lycee +
    profile.schoolingSuperieur * p.schooling.superieur;
  if (schooling > 0) reductions.push({ label: 'Frais de scolarité', amount: round(schooling) });

  if (profile.smeInvestment > 0) {
    const capSme = couple ? p.smeInvestment.capCouple : p.smeInvestment.capSingle;
    const sme = Math.min(profile.smeInvestment, capSme) * p.smeInvestment.rate;
    nicheTotal += sme;
    reductions.push({ label: 'Investissement PME (IR-PME)', amount: round(sme) });
  }

  // Crédits (remboursables)
  if (profile.homeEmployment > 0) {
    const capHome = Math.min(
      p.homeEmployment.max,
      p.homeEmployment.base + p.homeEmployment.perDependent * profile.homeEmploymentDependents,
    );
    const credit = Math.min(profile.homeEmployment, capHome) * p.homeEmployment.rate;
    nicheTotal += credit;
    credits.push({ label: 'Emploi à domicile (50 %)', amount: round(credit) });
  }
  if (profile.childcare > 0) {
    const capCare = p.childcare.capPerChild * Math.max(1, profile.childrenUnder6);
    const credit = Math.min(profile.childcare, capCare) * p.childcare.rate;
    nicheTotal += credit;
    credits.push({ label: "Frais de garde d'enfants (50 %)", amount: round(credit) });
  }
  if (profile.unionDues > 0) {
    const capUnion = salariesTotal * p.unionDues.salaryCapRate;
    const credit = Math.min(profile.unionDues, capUnion) * p.unionDues.rate;
    if (credit > 0) credits.push({ label: 'Cotisations syndicales (66 %)', amount: round(credit) });
  }

  // Plafonnement global des niches (10 000 €) — appliqué de façon simplifiée.
  const nicheCapExcess = Math.max(0, nicheTotal - p.nicheCap);
  if (nicheCapExcess > 0) {
    warnings.push(`Plafonnement global des niches fiscales : ${round(nicheCapExcess)} € d'avantage perdu.`);
  }

  const reductionTotal = reductions.reduce((s, l) => s + l.amount, 0);
  const creditTotal = credits.reduce((s, l) => s + l.amount, 0) - nicheCapExcess;
  const afterReductions = Math.max(0, taxAfterDecote - reductionTotal);
  if (reductionTotal > taxAfterDecote && reductionTotal > 0) {
    warnings.push(`Réductions d'impôt non utilisées : ${round(reductionTotal - taxAfterDecote)} € (non remboursables).`);
  }
  // Recouvrement : impôt < 61 € non mis en recouvrement (avant crédits).
  const incomeTaxNet = round(afterReductions - creditTotal);

  // 6. Prélèvements sociaux et contributions
  const flatTaxTotal = flatTaxes.reduce((s, l) => s + l.amount, 0);
  const socialBase = capitalTotal + Math.max(0, rentalTaxable) + furnishedTaxable;
  const socialContributions = round(socialBase * p.capitalIncome.socialRate);

  const rfr = taxableIncome + (opts.capitalOption === 'pfu' ? capitalTotal : 0);
  const cehrScale = couple ? p.cehr.couple : p.cehr.single;
  let cehr = 0;
  for (let i = 0; i < cehrScale.length; i++) {
    const lo = cehrScale[i].threshold;
    const hi = i + 1 < cehrScale.length ? cehrScale[i + 1].threshold : Infinity;
    if (rfr > lo) cehr += (Math.min(rfr, hi) - lo) * cehrScale[i].rate;
  }
  cehr = round(cehr);

  const total = incomeTaxNet + flatTaxTotal + socialContributions + cehr;

  const marginalRate = marginalBracket(taxableIncome / parts, p);
  const totalIncomeForAverage = salariesTotal + pensions + capitalTotal + r.grossRent + f.revenue +
    active.reduce((s, i) => s + profile.declarants[i].microRevenue, 0);

  return {
    parts,
    baseParts,
    grossIncomeLines: gross,
    grossIncome: round(grossIncome),
    deductions,
    taxableIncome,
    taxBeforeCap: round(taxFull),
    qfCapApplied,
    qfAdvantage: round(Math.min(qfAdvantage, cap)),
    taxAfterQf: round(taxAfterQf),
    decote: round(decote),
    reductions,
    credits,
    nicheCapExcess: round(nicheCapExcess),
    incomeTaxNet,
    flatTaxes,
    socialContributions,
    cehr,
    total,
    marginalRate,
    effectiveMarginalRate: 0,
    averageRate: totalIncomeForAverage > 0 ? (incomeTaxNet + flatTaxTotal + cehr) / totalIncomeForAverage : 0,
    balanceDue: round(incomeTaxNet + flatTaxTotal + cehr - profile.withholdingPaid),
    regimes: {
      rental: r.grossRent > 0 ? opts.rentalRegime : null,
      furnished: f.revenue > 0 ? opts.furnishedRegime : null,
      capital: capitalTotal > 0 ? opts.capitalOption : null,
    },
    rentalDeficitCarryForward: round(rentalDeficitCarryForward),
    perCeilings,
    perDeducted,
    warnings,
  };
}

function regimeCandidates(choice: RegimeChoice, microAllowed: boolean): ('micro' | 'real')[] {
  if (choice === 'micro') return microAllowed ? ['micro'] : ['real'];
  if (choice === 'real') return ['real'];
  return microAllowed ? ['micro', 'real'] : ['real'];
}

/**
 * Calcule l'impôt. Lorsque des régimes sont en « auto », toutes les
 * combinaisons sont testées et la moins coûteuse est retenue.
 */
export function computeTax(profile: TaxProfile, p: TaxYearParams = CURRENT_PARAMS, extraTaxable = 0): TaxResult {
  const rentalOptions = profile.rental.grossRent > 0
    ? regimeCandidates(profile.rental.regime, profile.rental.grossRent <= p.realEstate.microFoncierCap)
    : [null];
  const furnishedCap = p.furnishedRental[profile.furnished.kind].cap;
  const furnishedOptions = profile.furnished.revenue > 0
    ? regimeCandidates(profile.furnished.regime, profile.furnished.revenue <= furnishedCap)
    : [null];
  const capitalTotal = profile.capital.dividends + profile.capital.interest + profile.capital.capitalGains;
  const capitalOptions: ('pfu' | 'bareme' | null)[] = capitalTotal > 0
    ? profile.capital.option === 'auto' ? ['pfu', 'bareme'] : [profile.capital.option]
    : [null];

  let best: TaxResult | null = null;
  for (const rentalRegime of rentalOptions)
    for (const furnishedRegime of furnishedOptions)
      for (const capitalOption of capitalOptions) {
        const res = core(profile, { rentalRegime, furnishedRegime, capitalOption, extraTaxable }, p);
        if (!best || res.total < best.total) best = res;
      }
  const result = best!;

  if (profile.rental.regime === 'micro' && profile.rental.grossRent > p.realEstate.microFoncierCap) {
    result.warnings.push('Loyers > 15 000 € : le micro-foncier n’est pas accessible, régime réel appliqué.');
  }
  if (profile.furnished.regime === 'micro' && profile.furnished.revenue > furnishedCap) {
    result.warnings.push('Recettes au-delà du seuil micro-BIC : régime réel appliqué.');
  }

  // Taux marginal réel (intègre décote, plafonnement QF…).
  if (extraTaxable === 0) {
    const plus = core(
      profile,
      {
        rentalRegime: result.regimes.rental,
        furnishedRegime: result.regimes.furnished,
        capitalOption: result.regimes.capital,
        extraTaxable: 1_000,
      },
      p,
    );
    result.effectiveMarginalRate = Math.max(0, (plus.incomeTaxNet - result.incomeTaxNet) / 1_000);
  }
  return result;
}

/** Barème kilométrique pour une voiture. */
export function mileageAllowance(
  km: number,
  cv: keyof TaxYearParams['mileage'],
  electric = false,
  p: TaxYearParams = CURRENT_PARAMS,
): number {
  const s = p.mileage[cv];
  let amount: number;
  if (km <= 5_000) amount = km * s.upTo5000;
  else if (km <= 20_000) amount = km * s.mid.a + s.mid.b;
  else amount = km * s.over20000;
  return round(amount * (electric ? 1 + p.electricVehicleBonus : 1));
}
