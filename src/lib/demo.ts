import { classify } from './merchants';
import { DEFAULT_RULES } from './defaults';
import { addMonths, uid } from './format';
import type { Data } from '../store/store';
import { initialData } from '../store/store';
import type { Transaction } from './types';

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jeu de données fictif sur 8 mois, pour découvrir l'application. */
export function demoData(): Data {
  const r = rng(42);
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = now.getDate();
  const base = initialData();

  const courant = uid();
  const livret = uid();
  const pea = uid();
  const av = uid();
  const txs: Transaction[] = [];
  const push = (date: string, amount: number, label: string, accountId = courant) => {
    txs.push({ id: uid(), date, amount: Math.round(amount * 100), label, accountId, categoryId: classify(label, amount, { defaultRules: DEFAULT_RULES }).categoryId });
  };

  for (let i = 7; i >= 0; i--) {
    const m = addMonths(current, -i);
    const isCurrent = i === 0;
    const day = (d: number) => `${m}-${String(d).padStart(2, '0')}`;
    const until = (d: number) => !isCurrent || d <= today;

    if (until(5)) push(day(5), -890, 'PRLV LOYER FONCIA APPT');
    if (until(6)) push(day(6), -(68 + r() * 25), 'PRLV EDF CLIENTS PARTICULIERS');
    if (until(8)) push(day(8), -29.99, 'PRLV FREEBOX ABONNEMENT');
    if (until(9)) push(day(9), -13.49, 'PRLV NETFLIX.COM');
    if (until(10)) push(day(10), -11.12, 'PRLV SPOTIFY');
    if (until(2)) push(day(2), -88.8, 'PRLV NAVIGO ANNUEL');
    if (until(12)) push(day(12), -42.5, 'PRLV MUTUELLE GENERALE');
    if (until(15)) push(day(15), -150, 'CESU MENAGE DOMICILE');
    if (until(15)) push(day(15), -20, 'DON RESTOS DU COEUR');
    if (until(3)) push(day(3), -2.5, 'COTISATION CARTE VISA');
    if (until(28)) push(day(28), 2_480 + (i === 2 ? 900 : 0), 'VIR SALAIRE ACME SAS');
    if (until(29)) {
      push(day(29), -250, 'VIR LIVRET A');
      txs.push({ id: uid(), date: day(29), amount: 25_000, label: 'VIR DEPUIS COMPTE COURANT', accountId: livret, categoryId: 'trf-internal' });
      push(day(29), -100, 'VIR PER EPARGNE RETRAITE');
    }

    const shops = ['CB CARREFOUR MARKET', 'CB LIDL', 'CB MONOPRIX', 'CB PICARD', 'CB BOULANGERIE PAUL'];
    const nGroceries = 7 + Math.floor(r() * 4);
    for (let k = 0; k < nGroceries; k++) {
      const d = 1 + Math.floor(r() * 27);
      if (until(d)) push(day(d), -(12 + r() * 70), shops[Math.floor(r() * shops.length)]);
    }
    const fun = [
      ['CB RESTAURANT LE PETIT ZINC', 25, 60],
      ['CB DELIVEROO', 18, 35],
      ['CB FNAC', 15, 90],
      ['CB DECATHLON', 20, 80],
      ['CB AMAZON PAYMENTS', 10, 60],
      ['CB UBER', 9, 25],
      ['CB PHARMACIE CENTRALE', 6, 30],
    ] as const;
    const nFun = 5 + Math.floor(r() * 5);
    for (let k = 0; k < nFun; k++) {
      const [label, lo, hi] = fun[Math.floor(r() * fun.length)];
      const d = 1 + Math.floor(r() * 27);
      if (until(d)) push(day(d), -(lo + r() * (hi - lo)), label);
    }
    if (i === 3) push(day(14), -640, 'AIR FRANCE BILLETS');
    if (i === 3) push(day(20), -420, 'AIRBNB PAYMENT');
  }

  // abonnement annuel
  push(`${addMonths(current, -5)}-18`, -59, 'AMAZON PRIME ANNUEL');

  return {
    ...base,
    accounts: [
      { id: courant, name: 'Compte courant', type: 'courant', openingBalance: 180_000 },
      { id: livret, name: 'Livret A', type: 'livret', openingBalance: 850_000 },
      { id: pea, name: 'PEA', type: 'pea', openingBalance: 0, valuation: 1_240_000, valuationDate: `${current}-01`, feeRate: 0.003 },
      { id: av, name: 'Assurance-vie (banque)', type: 'assurance_vie', openingBalance: 0, valuation: 2_100_000, valuationDate: `${current}-01`, feeRate: 0.021 },
    ],
    transactions: txs.sort((a, b) => b.date.localeCompare(a.date)),
    provisions: [
      { id: uid(), name: 'Assurance habitation', amount: 22_000, month: 3 },
      { id: uid(), name: 'Vacances d’été', amount: 120_000, month: 7 },
      { id: uid(), name: 'Cadeaux de Noël', amount: 40_000, month: 12 },
    ],
    budgets: [
      { categoryId: 'exp-groceries', monthly: 42_000 },
      { categoryId: 'exp-restaurant', monthly: 15_000 },
      { categoryId: 'exp-shopping', monthly: 12_000 },
      { categoryId: 'exp-transport', monthly: 12_000 },
      { categoryId: 'exp-subscriptions', monthly: 4_000 },
    ],
    goals: [
      { id: uid(), name: 'Épargne de précaution', icon: '🛟', target: 1_200_000, accountId: livret, saved: 0 },
      { id: uid(), name: 'Apport immobilier', icon: '🏡', target: 4_000_000, saved: 1_500_000, deadline: `${now.getFullYear() + 3}-06-30` },
    ],
    taxProfile: {
      ...base.taxProfile,
      declarants: [
        { ...base.taxProfile.declarants[0], salary: 33_500, perContributions: 1_200 },
        base.taxProfile.declarants[1],
      ],
      donationsHelp: 240,
      homeEmployment: 1_800,
      capital: { dividends: 320, interest: 210, capitalGains: 0, option: 'auto' },
      withholdingPaid: 2_150,
    },
    settings: { ...base.settings, onboarded: true },
  };
}
