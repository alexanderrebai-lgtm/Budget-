import { computeTax, type TaxProfile, type TaxResult } from './engine';
import { CURRENT_PARAMS, type TaxYearParams } from './params';

export interface Suggestion {
  id: string;
  title: string;
  /** Économie d'impôt estimée (euros, année en cours). */
  saving: number;
  /** Coût net de l'action, quand il a un sens (versement - économie). */
  netCost?: number;
  detail: string;
  /** Action à saisir pour obtenir l'économie (montant à verser, à dépenser…). */
  action?: string;
  kind: 'deduction' | 'reduction' | 'credit' | 'regime' | 'info';
}

const clone = (p: TaxProfile): TaxProfile => structuredClone(p);
const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;

function savingFrom(base: TaxResult, mutate: (p: TaxProfile) => void, profile: TaxProfile, params: TaxYearParams) {
  const next = clone(profile);
  mutate(next);
  return base.total - computeTax(next, params).total;
}

/**
 * Passe en revue les leviers applicables au foyer et chiffre chacun d'eux en
 * relançant le calcul complet : les effets de seuil (décote, plafonnement QF,
 * changement de tranche) sont donc pris en compte.
 */
export function suggest(profile: TaxProfile, params: TaxYearParams = CURRENT_PARAMS): Suggestion[] {
  const base = computeTax(profile, params);
  const out: Suggestion[] = [];
  const couple = profile.status === 'couple';
  const active = couple ? [0, 1] : [0];

  // PER : plafond restant
  const perRoom = active.reduce((s, i) => s + base.perCeilings[i] - base.perDeducted[i], 0);
  if (perRoom > 100 && base.incomeTaxNet > 0) {
    const full = savingFrom(base, (p) => {
      for (const i of active) p.declarants[i].perContributions += base.perCeilings[i] - base.perDeducted[i];
    }, profile, params);
    const per1000 = savingFrom(base, (p) => {
      p.declarants[0].perContributions += 1_000;
    }, profile, params);
    if (full > 0) {
      out.push({
        id: 'per',
        kind: 'deduction',
        title: 'Verser sur un PER',
        saving: Math.round(full),
        netCost: Math.round(perRoom - full),
        action: `Verser jusqu’à ${fmt(perRoom)} avant le 31 décembre`,
        detail:
          `Chaque versement est déduit de votre revenu imposable, dans la limite de votre plafond (${fmt(perRoom)} disponibles). ` +
          `1 000 € versés vous font économiser environ ${fmt(per1000)}. L’épargne est bloquée jusqu’à la retraite (sauf achat de la résidence principale) ` +
          `et le capital sera imposé à la sortie : le levier est d’autant plus intéressant que votre taux marginal actuel est élevé. ` +
          `Les plafonds non utilisés des 3 années précédentes figurent sur votre avis d’impôt.`,
      });
    }
  }

  // Frais réels vs abattement 10 %
  for (const i of active) {
    const d = profile.declarants[i];
    if (d.salary > 0 && d.realExpenses === 0) {
      const allowance = Math.min(d.salary, Math.max(params.salaryAllowance.min, Math.min(params.salaryAllowance.max, d.salary * 0.1)));
      out.push({
        id: `frais-reels-${i}`,
        kind: 'info',
        title: `Comparer frais réels et abattement (déclarant ${i + 1})`,
        saving: 0,
        detail:
          `Votre abattement forfaitaire est de ${fmt(allowance)}. Si vos frais professionnels réels (kilomètres domicile-travail via le barème kilométrique, ` +
          `repas, double résidence, formation, matériel…) dépassent ce montant, optez pour les frais réels. Utilisez le calculateur de frais kilométriques ci-dessous.`,
      });
    }
  }

  // Dons
  if (base.incomeTaxNet > 0 && profile.donationsHelp < params.donations.helpCap) {
    const room = params.donations.helpCap - profile.donationsHelp;
    const s = savingFrom(base, (p) => { p.donationsHelp += room; }, profile, params);
    if (s > 0) {
      out.push({
        id: 'dons',
        kind: 'reduction',
        title: 'Dons aux associations d’aide aux personnes',
        saving: Math.round(s),
        netCost: Math.round(room - s),
        action: `Jusqu’à ${fmt(room)} de dons à 75 %`,
        detail:
          `Les dons aux organismes d’aide aux personnes en difficulté (repas, logement, soins) ouvrent droit à 75 % de réduction jusqu’à ${fmt(params.donations.helpCap)}, ` +
          `puis 66 % dans la limite de 20 % du revenu imposable. Un don de 100 € ne vous coûte que 25 €. La réduction n’est utile que si vous payez de l’impôt.`,
      });
    }
  }

  // Emploi à domicile
  const homeCap = Math.min(
    params.homeEmployment.max,
    params.homeEmployment.base + params.homeEmployment.perDependent * profile.homeEmploymentDependents,
  );
  if (profile.homeEmployment < homeCap) {
    out.push({
      id: 'emploi-domicile',
      kind: 'credit',
      title: 'Services à la personne',
      saving: 0,
      action: `Plafond restant : ${fmt(homeCap - profile.homeEmployment)} de dépenses`,
      detail:
        `Ménage, jardinage, soutien scolaire, petit bricolage, assistance informatique : 50 % des dépenses sont remboursées sous forme de crédit d’impôt, ` +
        `même si vous n’êtes pas imposable. Avec l’avance immédiate (CESU+ / plateformes agréées), vous ne payez que la moitié dès la facture. ` +
        `Ce n’est rentable que si le service vous est utile : 100 € dépensés = 50 € de coût réel.`,
    });
  }

  // Garde d'enfants
  if (profile.childrenUnder6 > 0) {
    const capCare = params.childcare.capPerChild * profile.childrenUnder6;
    if (profile.childcare < capCare) {
      const s = savingFrom(base, (p) => { p.childcare = capCare; }, profile, params);
      out.push({
        id: 'garde',
        kind: 'credit',
        title: 'Frais de garde des enfants de moins de 6 ans',
        saving: Math.round(s),
        action: `Déclarez jusqu’à ${fmt(capCare)} de frais (crèche, assistante maternelle, garderie)`,
        detail: 'Crédit de 50 % des frais nets des aides (CMG), plafonnés à 3 500 € par enfant. Pensez à déclarer la totalité des frais de crèche et de garderie.',
      });
    }
  }

  // Revenus de capitaux : rappel du choix effectué
  const capitalTotal = profile.capital.dividends + profile.capital.interest + profile.capital.capitalGains;
  if (capitalTotal > 0 && profile.capital.option !== 'auto') {
    const other = profile.capital.option === 'pfu' ? 'bareme' : 'pfu';
    const s = savingFrom(base, (p) => { p.capital.option = other; }, profile, params);
    if (s > 0) {
      out.push({
        id: 'capital-option',
        kind: 'regime',
        title: other === 'bareme' ? 'Opter pour le barème progressif (case 2OP)' : 'Rester au prélèvement forfaitaire unique',
        saving: Math.round(s),
        detail:
          other === 'bareme'
            ? 'Avec une tranche marginale à 0 % ou 11 %, l’option pour le barème est souvent plus intéressante grâce à l’abattement de 40 % sur les dividendes et à la CSG déductible. L’option est globale : elle s’applique à tous vos revenus de capitaux.'
            : 'Votre tranche marginale rend le PFU (12,8 % + prélèvements sociaux) plus avantageux que le barème.',
      });
    }
  }

  // Revenus fonciers : régime
  if (profile.rental.grossRent > 0 && profile.rental.regime !== 'auto') {
    const s = savingFrom(base, (p) => { p.rental.regime = 'auto'; }, profile, params);
    if (s > 0) {
      out.push({
        id: 'foncier-regime',
        kind: 'regime',
        title: base.regimes.rental === 'micro' ? 'Passer au régime réel (foncier)' : 'Passer au micro-foncier',
        saving: Math.round(s),
        detail: 'Le régime réel devient avantageux quand vos charges (intérêts, travaux, taxe foncière, assurance) dépassent 30 % des loyers. L’option pour le réel engage pendant 3 ans.',
      });
    }
  }
  if (profile.rental.grossRent > 0 && base.marginalRate >= 0.3) {
    out.push({
      id: 'deficit-foncier',
      kind: 'info',
      title: 'Déficit foncier par des travaux',
      saving: 0,
      detail:
        `Au régime réel, des travaux d’entretien ou d’amélioration créant un déficit (hors intérêts) sont imputables sur votre revenu global jusqu’à ${fmt(params.realEstate.globalDeficitCap)} par an. ` +
        `À ${Math.round(base.marginalRate * 100)} % de TMI + 17,2 % de prélèvements sociaux évités sur les loyers, l’effet est important. Le bien doit rester loué 3 ans.`,
    });
  }

  // LMNP : régime
  if (profile.furnished.revenue > 0 && profile.furnished.regime !== 'auto') {
    const s = savingFrom(base, (p) => { p.furnished.regime = 'auto'; }, profile, params);
    if (s > 0) {
      out.push({
        id: 'lmnp-regime',
        kind: 'regime',
        title: base.regimes.furnished === 'micro' ? 'LMNP : passer au réel' : 'LMNP : passer au micro-BIC',
        saving: Math.round(s),
        detail: 'Au réel, l’amortissement du bien et du mobilier efface souvent la totalité des loyers imposables. Depuis 2025, les amortissements déduits sont réintégrés dans la plus-value à la revente : à intégrer dans votre calcul.',
      });
    }
  }

  // Zone de décote : taux marginal réel plus élevé
  if (base.decote > 0 && base.effectiveMarginalRate > base.marginalRate + 0.02) {
    out.push({
      id: 'decote',
      kind: 'info',
      title: 'Vous êtes dans la zone de décote',
      saving: 0,
      detail:
        `La décote réduit votre impôt de ${fmt(base.decote)}, mais elle diminue quand votre revenu augmente : votre taux marginal réel est de ` +
        `${Math.round(base.effectiveMarginalRate * 100)} % (et non ${Math.round(base.marginalRate * 100)} %). Chaque euro déduit (PER, frais réels) rapporte donc davantage.`,
    });
  }

  // Prélèvement à la source
  if (profile.withholdingPaid > 0) {
    const gap = base.balanceDue;
    if (Math.abs(gap) > 300) {
      out.push({
        id: 'pas',
        kind: 'info',
        title: gap > 0 ? 'Ajuster votre taux de prélèvement à la source' : 'Vous êtes trop prélevé',
        saving: 0,
        detail:
          gap > 0
            ? `Vous devriez payer environ ${fmt(gap)} de solde l’été prochain. Moduler votre taux sur impots.gouv.fr évite ce rattrapage (ou provisionnez-le dans votre budget).`
            : `Vous allez être remboursé d’environ ${fmt(-gap)}. Baisser votre taux de prélèvement améliore votre trésorerie dès maintenant.`,
      });
    }
  }

  // Plafonnement global
  if (base.nicheCapExcess > 0) {
    out.push({
      id: 'niches',
      kind: 'info',
      title: 'Plafonnement des niches atteint',
      saving: 0,
      detail: `Vous dépassez le plafond global de ${fmt(params.nicheCap)} d’avantages fiscaux. Les dons, le PER et la pension alimentaire n’y sont pas soumis : privilégiez ces leviers.`,
    });
  }

  return out.sort((a, b) => b.saving - a.saving);
}
