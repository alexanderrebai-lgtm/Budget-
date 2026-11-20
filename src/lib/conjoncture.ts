/**
 * Indicateurs économiques utilisés par le bilan du tableau de bord et par l'IA.
 * Mis à jour à chaque version de l'application (sources publiques citées).
 */
export const CONJONCTURE = {
  asOf: '2026-11-20',
  inflation: {
    /** Glissement annuel de l'indice des prix (INSEE). */
    yoy: 0.034,
    /** Inflation sous-jacente. */
    core: 0.017,
    /** Prix de l'énergie sur un an. */
    energy: 0.241,
    period: 'octobre 2026',
    next: '27 novembre 2026',
  },
  savings: {
    livretA: 0.017,
    ldds: 0.017,
    lep: 0.025,
    pel: 0.02,
    since: '1er août 2026',
    nextRevision: '1er février 2027',
  },
  credit: {
    /** Taux moyen d'un crédit immobilier sur 20 ans (baromètres des courtiers). */
    mortgage20: 0.037,
    /** Taux d'usure, prêts immobiliers à taux fixe de 20 ans et plus. */
    usury20: 0.054,
  },
  summary:
    'Inflation en hausse (3,4 % sur un an en octobre, plus haut depuis début 2024), tirée par l’énergie (+24 %) ; inflation sous-jacente modérée (1,7 %). ' +
    'Livret A et LDDS à 1,7 %, LEP à 2,5 % : les livrets réglementés rapportent moins que l’inflation. Crédit immobilier autour de 3,7 % sur 20 ans, taux longs en hausse.',
  sources: [
    { label: 'INSEE, indice des prix à la consommation, octobre 2026', url: 'https://www.insee.fr/fr/accueil' },
    { label: 'Banque de France, taux de l’épargne réglementée', url: 'https://www.banque-france.fr' },
    { label: 'Baromètres des courtiers (CAFPI, Meilleurtaux, Pretto), novembre 2026', url: 'https://www.pretto.fr/taux-immobilier/historique-taux-immobilier/2026/taux-par-duree-novembre-2026/' },
  ],
} as const;

export function conjonctureText(): string {
  const c = CONJONCTURE;
  const p = (r: number) => `${(r * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
  return [
    `Conjoncture en France au ${c.asOf} :`,
    `- Inflation ${p(c.inflation.yoy)} sur un an (${c.inflation.period}), sous-jacente ${p(c.inflation.core)}, énergie ${p(c.inflation.energy)}.`,
    `- Livret A et LDDS ${p(c.savings.livretA)}, LEP ${p(c.savings.lep)}, PEL ${p(c.savings.pel)} (révision le ${c.savings.nextRevision}).`,
    `- Crédit immobilier 20 ans ~${p(c.credit.mortgage20)} en moyenne, taux d'usure ${p(c.credit.usury20)}.`,
  ].join('\n');
}
