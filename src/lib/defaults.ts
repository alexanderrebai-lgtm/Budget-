import type { Category, Rule } from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  // Revenus
  { id: 'inc-salary', name: 'Salaire', kind: 'income', icon: '💼', color: '#0f766e', taxTag: 'salaire' },
  { id: 'inc-freelance', name: 'Activité indépendante', kind: 'income', icon: '🧾', color: '#0d9488' },
  { id: 'inc-rent', name: 'Loyers perçus', kind: 'income', icon: '🏘️', color: '#14b8a6', taxTag: 'loyer_percu' },
  { id: 'inc-dividends', name: 'Dividendes', kind: 'income', icon: '📈', color: '#2dd4bf', taxTag: 'dividendes' },
  { id: 'inc-interest', name: 'Intérêts', kind: 'income', icon: '🪙', color: '#5eead4', taxTag: 'interets' },
  { id: 'inc-benefits', name: 'Aides et allocations', kind: 'income', icon: '🤝', color: '#99f6e4' },
  { id: 'inc-refund', name: 'Remboursements', kind: 'income', icon: '↩️', color: '#67e8f9' },
  { id: 'inc-other', name: 'Autres revenus', kind: 'income', icon: '➕', color: '#a5f3fc' },

  // Besoins
  { id: 'exp-housing', name: 'Logement', kind: 'expense', icon: '🏠', color: '#2563eb', group: 'besoins' },
  { id: 'exp-utilities', name: 'Énergie et eau', kind: 'expense', icon: '💡', color: '#3b82f6', group: 'besoins' },
  { id: 'exp-telecom', name: 'Internet et mobile', kind: 'expense', icon: '📱', color: '#60a5fa', group: 'besoins' },
  { id: 'exp-groceries', name: 'Courses', kind: 'expense', icon: '🛒', color: '#16a34a', group: 'besoins' },
  { id: 'exp-transport', name: 'Transport', kind: 'expense', icon: '🚆', color: '#ca8a04', group: 'besoins' },
  { id: 'exp-car', name: 'Voiture', kind: 'expense', icon: '🚗', color: '#a16207', group: 'besoins' },
  { id: 'exp-health', name: 'Santé', kind: 'expense', icon: '🩺', color: '#dc2626', group: 'besoins' },
  { id: 'exp-insurance', name: 'Assurances', kind: 'expense', icon: '🛡️', color: '#7c3aed', group: 'besoins' },
  { id: 'exp-childcare', name: "Garde d'enfants", kind: 'expense', icon: '🧸', color: '#db2777', group: 'besoins', taxTag: 'garde_enfant' },
  { id: 'exp-education', name: 'Éducation', kind: 'expense', icon: '🎓', color: '#9333ea', group: 'besoins' },
  { id: 'exp-loan', name: 'Crédits', kind: 'expense', icon: '🏦', color: '#475569', group: 'besoins' },
  { id: 'exp-tax', name: 'Impôts et taxes', kind: 'expense', icon: '🏛️', color: '#64748b', group: 'besoins' },
  { id: 'exp-bank', name: 'Frais bancaires', kind: 'expense', icon: '💳', color: '#94a3b8', group: 'besoins' },
  { id: 'exp-rental-costs', name: 'Charges locatives (bien loué)', kind: 'expense', icon: '🔧', color: '#78716c', group: 'besoins', taxTag: 'charges_locatives' },

  // Envies
  { id: 'exp-restaurant', name: 'Restaurants et sorties', kind: 'expense', icon: '🍽️', color: '#ea580c', group: 'envies' },
  { id: 'exp-shopping', name: 'Shopping', kind: 'expense', icon: '🛍️', color: '#f97316', group: 'envies' },
  { id: 'exp-subscriptions', name: 'Abonnements', kind: 'expense', icon: '📺', color: '#e11d48', group: 'envies' },
  { id: 'exp-leisure', name: 'Loisirs et sport', kind: 'expense', icon: '🎾', color: '#f59e0b', group: 'envies' },
  { id: 'exp-travel', name: 'Voyages', kind: 'expense', icon: '✈️', color: '#0891b2', group: 'envies' },
  { id: 'exp-gifts', name: 'Cadeaux', kind: 'expense', icon: '🎁', color: '#c026d3', group: 'envies' },
  { id: 'exp-smoking', name: 'Fumer', kind: 'expense', icon: '🚬', color: '#71717a', group: 'envies' },
  { id: 'exp-cash', name: 'Retraits d’espèces', kind: 'expense', icon: '💵', color: '#65a30d', group: 'envies' },
  { id: 'exp-home-services', name: 'Services à domicile', kind: 'expense', icon: '🧹', color: '#8b5cf6', group: 'envies', taxTag: 'emploi_domicile' },
  { id: 'exp-donations-help', name: 'Dons (aide aux personnes)', kind: 'expense', icon: '❤️', color: '#be123c', group: 'envies', taxTag: 'don_aide' },
  { id: 'exp-donations', name: 'Dons (autres associations)', kind: 'expense', icon: '🤲', color: '#9f1239', group: 'envies', taxTag: 'don' },
  { id: 'exp-union', name: 'Cotisations syndicales', kind: 'expense', icon: '✊', color: '#57534e', group: 'besoins', taxTag: 'syndicat' },
  { id: 'exp-other', name: 'Divers', kind: 'expense', icon: '📦', color: '#a8a29e', group: 'envies' },

  // Épargne et virements
  { id: 'sav-per', name: 'Versement PER', kind: 'transfer', icon: '🏖️', color: '#0369a1', group: 'epargne', taxTag: 'per' },
  { id: 'sav-invest', name: 'Épargne et placements', kind: 'transfer', icon: '🌱', color: '#0284c7', group: 'epargne' },
  { id: 'trf-internal', name: 'Virement compte', kind: 'transfer', icon: '🔁', color: '#cbd5e1' },
];

/** Règles de catégorisation : libellés fréquents des relevés français. */
const RULES: [string, string][] = [
  ['salaire', 'inc-salary'], ['paie', 'inc-salary'], ['remuneration', 'inc-salary'],
  ['caf ', 'inc-benefits'], ['pole emploi', 'inc-benefits'], ['france travail', 'inc-benefits'],
  ['cpam', 'exp-health'], ['ameli', 'exp-health'], ['pharmacie', 'exp-health'], ['mutuelle', 'exp-insurance'],
  ['doctolib', 'exp-health'],
  ['carrefour', 'exp-groceries'], ['leclerc', 'exp-groceries'], ['auchan', 'exp-groceries'], ['lidl', 'exp-groceries'],
  ['intermarche', 'exp-groceries'], ['monoprix', 'exp-groceries'], ['franprix', 'exp-groceries'], ['casino', 'exp-groceries'],
  ['super u', 'exp-groceries'], ['picard', 'exp-groceries'], ['aldi', 'exp-groceries'], ['biocoop', 'exp-groceries'],
  ['sncf', 'exp-transport'], ['ratp', 'exp-transport'], ['navigo', 'exp-transport'], ['uber', 'exp-transport'],
  ['blablacar', 'exp-transport'], ['total', 'exp-car'], ['esso', 'exp-car'], ['shell', 'exp-car'], ['peage', 'exp-car'],
  ['vinci autoroute', 'exp-car'], ['sanef', 'exp-car'], ['aprr', 'exp-car'],
  ['edf', 'exp-utilities'], ['engie', 'exp-utilities'], ['totalenergies', 'exp-utilities'], ['veolia', 'exp-utilities'],
  ['suez', 'exp-utilities'],
  ['free mobile', 'exp-telecom'], ['freebox', 'exp-telecom'], ['orange', 'exp-telecom'], ['sfr', 'exp-telecom'],
  ['bouygues', 'exp-telecom'], ['sosh', 'exp-telecom'], ['red by sfr', 'exp-telecom'],
  ['netflix', 'exp-subscriptions'], ['spotify', 'exp-subscriptions'], ['deezer', 'exp-subscriptions'],
  ['disney', 'exp-subscriptions'], ['canal+', 'exp-subscriptions'], ['amazon prime', 'exp-subscriptions'],
  ['apple.com', 'exp-subscriptions'], ['google', 'exp-subscriptions'], ['youtube', 'exp-subscriptions'],
  ['amazon', 'exp-shopping'], ['fnac', 'exp-shopping'], ['decathlon', 'exp-leisure'], ['zara', 'exp-shopping'],
  ['ikea', 'exp-shopping'], ['leroy merlin', 'exp-shopping'], ['castorama', 'exp-shopping'],
  ['restaurant', 'exp-restaurant'], ['deliveroo', 'exp-restaurant'], ['uber eats', 'exp-restaurant'],
  ['mcdonald', 'exp-restaurant'], ['burger king', 'exp-restaurant'], ['boulangerie', 'exp-groceries'],
  ['airbnb', 'exp-travel'], ['booking', 'exp-travel'], ['air france', 'exp-travel'], ['easyjet', 'exp-travel'],
  ['loyer', 'exp-housing'], ['foncia', 'exp-housing'], ['nexity', 'exp-housing'], ['syndic', 'exp-housing'],
  ['dgfip', 'exp-tax'], ['impot', 'exp-tax'], ['tresor public', 'exp-tax'], ['taxe fonciere', 'exp-tax'],
  ['cotisation carte', 'exp-bank'], ['frais tenue', 'exp-bank'], ['commission', 'exp-bank'], ['agios', 'exp-bank'],
  ['echeance pret', 'exp-loan'], ['ech pret', 'exp-loan'], ['credit immo', 'exp-loan'],
  ['axa', 'exp-insurance'], ['maif', 'exp-insurance'], ['macif', 'exp-insurance'], ['matmut', 'exp-insurance'],
  ['allianz', 'exp-insurance'], ['groupama', 'exp-insurance'],
  ['cesu', 'exp-home-services'], ['creche', 'exp-childcare'], ['pajemploi', 'exp-childcare'],
  ['restos du coeur', 'exp-donations-help'], ['secours populaire', 'exp-donations-help'],
  ['croix rouge', 'exp-donations-help'], ['emmaus', 'exp-donations-help'], ['fondation abbe pierre', 'exp-donations-help'],
  ['unicef', 'exp-donations'], ['msf', 'exp-donations'], ['wwf', 'exp-donations'],
  ['dividende', 'inc-dividends'], ['interets', 'inc-interest'],
  ['per ', 'sav-per'], ['plan epargne retraite', 'sav-per'],
  ['vir livret', 'sav-invest'], ['assurance vie', 'sav-invest'], ['pea', 'sav-invest'],
];

/** Règles ajoutées après la première version : identifiants fixes pour la migration des données existantes. */
export const SMOKING_RULES: Rule[] = [
  { id: 'r-smoke-1', pattern: 'tabac', categoryId: 'exp-smoking' },
  { id: 'r-smoke-2', pattern: 'civette', categoryId: 'exp-smoking' },
  { id: 'r-smoke-3', pattern: 'cigarette', categoryId: 'exp-smoking' },
  { id: 'r-smoke-4', pattern: 'vapote', categoryId: 'exp-smoking' },
  { id: 'r-smoke-5', pattern: 'e-liquide', categoryId: 'exp-smoking' },
];

/** Règles ajoutées en v3 (relevés de néobanques : retraits, enseignes courantes). */
export const V3_RULES: Rule[] = [
  { id: 'r-v3-1', pattern: 'retrait', categoryId: 'exp-cash' },
  { id: 'r-v3-2', pattern: 'retrait dab', categoryId: 'exp-cash' },
  { id: 'r-v3-3', pattern: 'mc donald', categoryId: 'exp-restaurant' },
  { id: 'r-v3-4', pattern: 'burger', categoryId: 'exp-restaurant' },
  { id: 'r-v3-5', pattern: 'kfc', categoryId: 'exp-restaurant' },
  { id: 'r-v3-6', pattern: 'opac', categoryId: 'exp-housing' },
  { id: 'r-v3-7', pattern: 'b&m', categoryId: 'exp-shopping' },
  { id: 'r-v3-8', pattern: 'action ', categoryId: 'exp-shopping' },
  { id: 'r-v3-9', pattern: 'primark', categoryId: 'exp-shopping' },
  { id: 'r-v3-10', pattern: 'virement depuis', categoryId: 'trf-internal' },
  { id: 'r-v3-11', pattern: 'frais nickel', categoryId: 'exp-bank' },
];

export const DEFAULT_RULES: Rule[] = [...RULES.map(([pattern, categoryId], i) => ({ id: `r${i}`, pattern, categoryId })), ...SMOKING_RULES, ...V3_RULES];
