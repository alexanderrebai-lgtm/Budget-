/**
 * Paramètres fiscaux — impôt sur le revenu 2026 (revenus 2025).
 *
 * Source : loi de finances pour 2026 (promulguée le 19/02/2026), barème
 * revalorisé de 0,9 %. Les montants marqués « indexé » sont les montants 2025
 * revalorisés de 0,9 % : vérifiez-les sur impots.gouv.fr avant toute décision.
 *
 * Tout est regroupé ici pour pouvoir ajouter une nouvelle année sans toucher
 * au moteur de calcul.
 */

export interface Bracket {
  /** Borne basse de la tranche (par part), en euros. */
  from: number;
  rate: number;
}

export interface TaxYearParams {
  /** Année des revenus déclarés. */
  incomeYear: number;
  /** Année d'imposition. */
  taxYear: number;
  brackets: Bracket[];
  quotientFamilial: {
    /** Plafond de l'avantage par demi-part supplémentaire. */
    halfPartCap: number;
    /** Plafond pour la demi-part du parent isolé (case T). */
    singleParentCap: number;
  };
  decote: { single: number; couple: number; rate: number };
  salaryAllowance: { rate: number; min: number; max: number };
  pensionAllowance: { rate: number; min: number; max: number };
  /** Plafond de déduction de la pension alimentaire versée à un enfant majeur. */
  adultChildAlimonyCap: number;
  per: {
    /** PASS utilisé pour le plafond des versements de l'année des revenus. */
    pass: number;
    rate: number;
    /** Plancher : 10 % du PASS. */
    min: number;
    /** Plafond : 10 % de 8 PASS. */
    max: number;
  };
  donations: {
    /** Dons aux organismes d'aide aux personnes en difficulté. */
    helpRate: number;
    helpCap: number;
    generalRate: number;
    /** Plafond : 20 % du revenu imposable. */
    incomeCapRate: number;
  };
  homeEmployment: {
    rate: number;
    base: number;
    perDependent: number;
    max: number;
  };
  childcare: { rate: number; capPerChild: number };
  unionDues: { rate: number; salaryCapRate: number };
  schooling: { college: number; lycee: number; superieur: number };
  smeInvestment: { rate: number; capSingle: number; capCouple: number };
  /** Plafonnement global des niches fiscales. */
  nicheCap: number;
  capitalIncome: {
    /** Taux forfaitaire d'impôt du PFU. */
    pfuRate: number;
    /** Prélèvements sociaux. */
    socialRate: number;
    /** Abattement sur dividendes en cas d'option pour le barème. */
    dividendAllowance: number;
    /** CSG déductible l'année suivante en cas d'option pour le barème. */
    deductibleCsg: number;
  };
  realEstate: {
    microFoncierRate: number;
    microFoncierCap: number;
    globalDeficitCap: number;
  };
  furnishedRental: {
    longTerm: { rate: number; cap: number };
    classifiedTourism: { rate: number; cap: number };
    unclassifiedTourism: { rate: number; cap: number };
  };
  microEnterprise: {
    sales: { rate: number; liberatoire: number };
    services: { rate: number; liberatoire: number };
    bnc: { rate: number; liberatoire: number };
    minAllowance: number;
  };
  cehr: {
    single: { threshold: number; rate: number }[];
    couple: { threshold: number; rate: number }[];
  };
  /** Barème kilométrique (voitures) : [jusqu'à 5 000 km, 5 001-20 000 km (a, b), au-delà]. */
  mileage: Record<
    '3' | '4' | '5' | '6' | '7',
    { upTo5000: number; mid: { a: number; b: number }; over20000: number }
  >;
  electricVehicleBonus: number;
}

export const PARAMS_2026: TaxYearParams = {
  incomeYear: 2025,
  taxYear: 2026,
  brackets: [
    { from: 0, rate: 0 },
    { from: 11_600, rate: 0.11 },
    { from: 29_579, rate: 0.3 },
    { from: 84_577, rate: 0.41 },
    { from: 181_917, rate: 0.45 },
  ],
  quotientFamilial: { halfPartCap: 1_807, singleParentCap: 4_262 },
  decote: { single: 897, couple: 1_483, rate: 0.4525 },
  salaryAllowance: { rate: 0.1, min: 509, max: 14_555 },
  // indexé
  pensionAllowance: { rate: 0.1, min: 454, max: 4_439 },
  // indexé
  adultChildAlimonyCap: 6_855,
  // Versements 2025 : plafond calculé sur le PASS 2024 (46 368 €).
  per: { pass: 46_368, rate: 0.1, min: 4_637, max: 37_094 },
  donations: { helpRate: 0.75, helpCap: 1_000, generalRate: 0.66, incomeCapRate: 0.2 },
  homeEmployment: { rate: 0.5, base: 12_000, perDependent: 1_500, max: 15_000 },
  childcare: { rate: 0.5, capPerChild: 3_500 },
  unionDues: { rate: 0.66, salaryCapRate: 0.01 },
  schooling: { college: 61, lycee: 153, superieur: 183 },
  smeInvestment: { rate: 0.18, capSingle: 50_000, capCouple: 100_000 },
  nicheCap: 10_000,
  capitalIncome: { pfuRate: 0.128, socialRate: 0.172, dividendAllowance: 0.4, deductibleCsg: 0.068 },
  realEstate: { microFoncierRate: 0.3, microFoncierCap: 15_000, globalDeficitCap: 10_700 },
  furnishedRental: {
    longTerm: { rate: 0.5, cap: 77_700 },
    classifiedTourism: { rate: 0.5, cap: 77_700 },
    unclassifiedTourism: { rate: 0.3, cap: 15_000 },
  },
  microEnterprise: {
    sales: { rate: 0.71, liberatoire: 0.01 },
    services: { rate: 0.5, liberatoire: 0.017 },
    bnc: { rate: 0.34, liberatoire: 0.022 },
    minAllowance: 305,
  },
  cehr: {
    single: [
      { threshold: 250_000, rate: 0.03 },
      { threshold: 500_000, rate: 0.04 },
    ],
    couple: [
      { threshold: 500_000, rate: 0.03 },
      { threshold: 1_000_000, rate: 0.04 },
    ],
  },
  mileage: {
    '3': { upTo5000: 0.529, mid: { a: 0.316, b: 1_065 }, over20000: 0.37 },
    '4': { upTo5000: 0.606, mid: { a: 0.34, b: 1_330 }, over20000: 0.407 },
    '5': { upTo5000: 0.636, mid: { a: 0.357, b: 1_395 }, over20000: 0.427 },
    '6': { upTo5000: 0.665, mid: { a: 0.374, b: 1_457 }, over20000: 0.447 },
    '7': { upTo5000: 0.697, mid: { a: 0.394, b: 1_515 }, over20000: 0.47 },
  },
  electricVehicleBonus: 0.2,
};

export const CURRENT_PARAMS = PARAMS_2026;
