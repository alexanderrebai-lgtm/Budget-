/**
 * Bilan express du tableau de bord : une note de santé financière, une phrase
 * de synthèse, les signaux importants et la prochaine action, calculés
 * localement à partir des opérations, des comptes et de la conjoncture.
 */
import { accountBalance } from './analysis';
import { conj, type Conjoncture } from './conjoncture';
import type { Estimates } from './estimates';
import type { Account, Category, Cents, Transaction } from './types';

export type Tone = 'pos' | 'warn' | 'neg' | 'info';

export interface Signal {
  id: string;
  tone: Tone;
  title: string;
  detail: string;
  /** Chiffre clé affiché en gros. */
  metric: string;
  to?: string;
}

export interface Brief {
  ready: boolean;
  score: number;
  label: string;
  tone: Tone;
  headline: string;
  signals: Signal[];
  next: { text: string; to: string } | null;
  /** Évolution des dépenses (3 derniers mois vs 3 précédents). */
  spendingTrend: number | null;
  /** Pouvoir d'achat perdu par an sur l'épargne disponible. */
  cashErosion: Cents;
  components: { label: string; points: number; max: number }[];
}

const LIQUID = new Set(['courant', 'livret', 'epargne']);
const SAVINGS_ACCOUNTS = new Set(['livret', 'epargne']);
const eur = (c: number) => `${Math.round(c / 100).toLocaleString('fr-FR')} €`;
const pct = (r: number, d = 0) => `${(r * 100).toLocaleString('fr-FR', { maximumFractionDigits: d })} %`;

export function computeBrief(est: Estimates, accounts: Account[], txs: Transaction[], _categories?: Map<string, Category>, CONJONCTURE: Conjoncture = conj()): Brief {
  const empty: Brief = { ready: false, score: 0, label: '', tone: 'info', headline: '', signals: [], next: null, spendingTrend: null, cashErosion: 0, components: [] };
  if (est.coveredMonths < 1 || est.income.monthly <= 0) return empty;

  const balances = accounts.filter((a) => !a.archived).map((a) => ({ a, b: accountBalance(a, txs) }));
  const cash = balances.filter((x) => LIQUID.has(x.a.type)).reduce((s, x) => s + Math.max(0, x.b), 0);
  const savingsCash = balances.filter((x) => SAVINGS_ACCOUNTS.has(x.a.type)).reduce((s, x) => s + Math.max(0, x.b), 0);
  const overdraft = balances.filter((x) => x.a.type === 'courant' && x.b < 0).reduce((s, x) => s - x.b, 0);
  const debts = balances.filter((x) => x.a.type === 'credit');
  const expense = est.expense.monthly || 1;
  const monthsOfCash = cash / expense;
  const fixedRatio = est.expense.fixedMonthly / est.income.monthly;
  const rate = est.savingsRate;

  // Tendance : moyenne des 3 derniers mois complets vs les 3 précédents
  const h = est.history;
  let spendingTrend: number | null = null;
  if (h.length >= 6) {
    const recent = h.slice(-3).reduce((s, x) => s + x.expense, 0);
    const before = h.slice(-6, -3).reduce((s, x) => s + x.expense, 0);
    spendingTrend = before > 0 ? recent / before - 1 : null;
  } else if (h.length >= 2) {
    const last = h[h.length - 1].expense;
    const avg = h.slice(0, -1).reduce((s, x) => s + x.expense, 0) / (h.length - 1);
    spendingTrend = avg > 0 ? last / avg - 1 : null;
  }

  // Note sur 100
  const ptsSavings = Math.round(Math.max(0, Math.min(1, rate / 0.2)) * 30);
  const ptsCushion = Math.round(Math.max(0, Math.min(1, monthsOfCash / 6)) * 25);
  const ptsFixed = Math.round(Math.max(0, Math.min(1, (0.6 - fixedRatio) / 0.25)) * 20);
  const ptsTrend = spendingTrend === null ? 10 : Math.round(Math.max(0, Math.min(1, (0.1 - spendingTrend) / 0.15)) * 15);
  const ptsDebt = overdraft > 0 ? 0 : debts.some((d) => (d.a.rate ?? 0) > 0.08) ? 4 : 10;
  const score = Math.min(100, ptsSavings + ptsCushion + ptsFixed + ptsTrend + ptsDebt);
  const components = [
    { label: 'Taux d’épargne', points: ptsSavings, max: 30 },
    { label: 'Épargne de précaution', points: ptsCushion, max: 25 },
    { label: 'Charges fixes', points: ptsFixed, max: 20 },
    { label: 'Évolution des dépenses', points: ptsTrend, max: 15 },
    { label: 'Dettes et découvert', points: ptsDebt, max: 10 },
  ];
  const [label, tone]: [string, Tone] = score >= 75 ? ['Solide', 'pos'] : score >= 55 ? ['Correcte', 'info'] : score >= 35 ? ['Fragile', 'warn'] : ['Tendue', 'neg'];

  const infl = CONJONCTURE.inflation.yoy;
  const livretGap = CONJONCTURE.savings.livretA - infl;
  const cashErosion = Math.round(savingsCash * Math.max(0, -livretGap));

  const signals: Signal[] = [];

  // Équilibre du budget
  if (est.balance.monthly < 0) {
    signals.push({ id: 'deficit', tone: 'neg', title: 'Vous dépensez plus que vous ne gagnez', metric: eur(est.balance.monthly), detail: `En moyenne ${eur(-est.balance.monthly)} de plus par mois que vos revenus.`, to: '/estimations' });
  } else {
    signals.push({
      id: 'rate',
      tone: rate >= 0.15 ? 'pos' : rate >= 0.05 ? 'info' : 'warn',
      title: 'Taux d’épargne',
      metric: pct(rate),
      detail: rate >= 0.2 ? 'Au-dessus de l’objectif de 20 % : vous avez de la marge pour investir.' : `Objectif courant : 20 %, soit ${eur(est.income.monthly * 0.2)} par mois.`,
      to: '/estimations',
    });
  }

  // Inflation et épargne qui dort
  if (cashErosion > 0 && savingsCash > expense * 3) {
    const excess = Math.max(0, cash - expense * 6);
    signals.push({
      id: 'erosion',
      tone: 'warn',
      title: 'Votre épargne perd du pouvoir d’achat',
      metric: `-${eur(cashErosion)} / an`,
      detail:
        `Livret A à ${pct(CONJONCTURE.savings.livretA, 1)} contre une inflation à ${pct(infl, 1)} : ${eur(savingsCash)} sur livrets perdent environ ${eur(cashErosion)} par an.` +
        (excess > 0 ? ` Au-delà de 6 mois de dépenses, ${eur(excess)} pourraient travailler sur un PEA ou une assurance-vie.` : ''),
      to: '/placements',
    });
  }

  // Coussin de sécurité
  if (monthsOfCash < 3) {
    signals.push({ id: 'cushion', tone: monthsOfCash < 1 ? 'neg' : 'warn', title: 'Épargne de précaution insuffisante', metric: `${monthsOfCash.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois`, detail: `Visez 3 mois de dépenses, soit ${eur(expense * 3)} disponibles.`, to: '/objectifs' });
  }

  // Charges fixes
  if (fixedRatio > 0.5) {
    signals.push({ id: 'fixed', tone: 'warn', title: 'Charges fixes élevées', metric: pct(fixedRatio), detail: `${eur(est.expense.fixedMonthly)} de prélèvements réguliers par mois : renégociez assurances, énergie et abonnements.`, to: '/recurrents' });
  }

  // Tendance des dépenses vs inflation
  if (spendingTrend !== null && Math.abs(spendingTrend) >= 0.05) {
    signals.push({
      id: 'trend',
      tone: spendingTrend > 0.1 ? 'warn' : spendingTrend < 0 ? 'pos' : 'info',
      title: spendingTrend > 0 ? 'Dépenses en hausse' : 'Dépenses en baisse',
      metric: `${spendingTrend > 0 ? '+' : ''}${pct(spendingTrend)}`,
      detail: `Sur les 3 derniers mois par rapport aux 3 précédents (inflation officielle : ${pct(infl, 1)} sur un an).`,
      to: '/estimations',
    });
  }

  // Énergie : flambée des prix
  const energy = est.expense.byCategory.find((c) => c.categoryId === 'exp-utilities');
  if (energy && energy.monthly > 0 && CONJONCTURE.inflation.energy > 0.1) {
    signals.push({
      id: 'energy',
      tone: 'info',
      title: 'Énergie : prix en forte hausse',
      metric: `${eur(energy.monthly)} / mois`,
      detail: `Les prix de l’énergie ont augmenté de ${pct(CONJONCTURE.inflation.energy)} en un an. Comparez les offres à prix fixe et vérifiez votre mensualisation.`,
      to: '/recurrents',
    });
  }

  // Découvert, crédits chers
  if (overdraft > 0) signals.push({ id: 'overdraft', tone: 'neg', title: 'Compte à découvert', metric: eur(-overdraft), detail: 'Les agios coûtent souvent plus de 15 % par an : renflouez le compte depuis l’épargne.', to: '/patrimoine' });
  const costly = debts.filter((d) => (d.a.rate ?? 0) > CONJONCTURE.credit.mortgage20 + 0.03);
  if (costly.length) signals.push({ id: 'debt', tone: 'warn', title: 'Crédit coûteux', metric: pct(Math.max(...costly.map((d) => d.a.rate ?? 0)), 1), detail: 'Remboursez-le en priorité avec votre épargne disponible (méthode avalanche).', to: '/placements' });

  // Phrase de synthèse
  const parts: string[] = [];
  if (est.balance.monthly >= 0) {
    parts.push(`Vous gardez ${eur(est.balance.monthly)} par mois sur ${eur(est.income.monthly)} de revenus (${pct(rate)}).`);
  } else {
    parts.push(`Vos dépenses dépassent vos revenus de ${eur(-est.balance.monthly)} par mois en moyenne.`);
  }
  if (spendingTrend !== null && spendingTrend > 0.05) parts.push(`Vos dépenses augmentent (${pct(spendingTrend)} sur 3 mois), plus vite que l’inflation.`);
  else if (spendingTrend !== null && spendingTrend < -0.05) parts.push(`Vos dépenses reculent de ${pct(-spendingTrend)} sur 3 mois, malgré une inflation à ${pct(infl, 1)}.`);
  if (cashErosion > 0 && savingsCash > expense * 3) parts.push(`Avec une inflation à ${pct(infl, 1)}, votre épargne sur livrets perd environ ${eur(cashErosion)} de pouvoir d’achat par an.`);
  else if (monthsOfCash < 3) parts.push(`Votre épargne disponible couvre ${monthsOfCash.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois de dépenses : à renforcer en priorité.`);
  else parts.push(`Votre épargne disponible couvre ${monthsOfCash.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois de dépenses.`);

  // Prochaine action : la plus importante
  let next: Brief['next'];
  if (overdraft > 0) next = { text: 'Sortir du découvert avec un virement depuis l’épargne.', to: '/patrimoine' };
  else if (est.balance.monthly < 0) next = { text: 'Repérer les postes à réduire pour revenir à l’équilibre.', to: '/estimations' };
  else if (monthsOfCash < 3) next = { text: `Programmer ${eur(Math.max(5000, est.balance.monthly * 0.5))} par mois vers l’épargne de précaution.`, to: '/objectifs' };
  else if (costly.length) next = { text: 'Rembourser le crédit le plus cher en priorité.', to: '/placements' };
  else if (cashErosion > 0 && cash > expense * 6) next = { text: `Placer l’épargne au-delà de 6 mois de dépenses (${eur(cash - expense * 6)}) sur un support qui bat l’inflation.`, to: '/placements' };
  else if (fixedRatio > 0.5) next = { text: 'Renégocier les prélèvements réguliers les plus lourds.', to: '/recurrents' };
  else if (rate < 0.2) next = { text: `Viser ${eur(est.income.monthly * 0.2)} d’épargne par mois (20 %).`, to: '/budgets' };
  else next = { text: 'Investir régulièrement le surplus (PEA, assurance-vie, PER selon votre tranche).', to: '/liberte' };

  const order: Record<Tone, number> = { neg: 0, warn: 1, info: 2, pos: 3 };
  signals.sort((a, b) => order[a.tone] - order[b.tone]);

  return { ready: true, score, label, tone, headline: parts.join(' '), signals: signals.slice(0, 4), next, spendingTrend, cashErosion, components };
}
