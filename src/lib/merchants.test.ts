import { classify, cleanLabel, displayMerchant, learnMerchants } from './merchants';
import { DEFAULT_RULES } from './defaults';
import type { Transaction } from './types';

const cat = (label: string, amount = -10) => classify(label, amount, { defaultRules: DEFAULT_RULES }).categoryId;

describe('nettoyage des libellés', () => {
  it('retire le bruit bancaire', () => {
    expect(cleanLabel('CB CARREFOUR CITY 12/03 5290XXXXXXXX1133')).toBe('carrefour city');
    expect(cleanLabel('PRLV SEPA NETFLIX.COM REF:FR12ZZZ123')).toBe('netflix');
    expect(cleanLabel('PAIEMENT PAR CARTE X4521 MC DONALD S BEAUVAIS 02/10')).toBe('mc donald s beauvais');
  });
});

describe('reconnaissance des enseignes', () => {
  it.each([
    ['CB E.LECLERC DRIVE 14/11', 'exp-groceries', 'E.Leclerc'],
    ['CARTE X1234 INTERMARCHE SUPER', 'exp-groceries', 'Intermarché'],
    ['MC DONALD S BEAUVAIS', 'exp-restaurant', 'McDonald’s'],
    ['CB MCDONALDS PARIS 15', 'exp-restaurant', 'McDonald’s'],
    ['CB BURGER KING ROISSY', 'exp-restaurant', 'Burger King'],
    ['UBER *EATS HELP.UBER.COM', 'exp-restaurant', 'Uber Eats'],
    ['UBER *TRIP HELP.UBER.COM', 'exp-transport', 'Uber'],
    ['CB TOTALENERGIES RELAIS BEAUVAIS', 'exp-car', 'TotalEnergies'],
    ['PRLV SEPA FREE MOBILE', 'exp-telecom', 'Free'],
    ['PRLV SEPA EDF CLIENTS PARTICULIERS', 'exp-utilities', 'EDF'],
    ['CB AMZN MKTP FR*2K4LZ', 'exp-shopping', 'Amazon'],
    ['PAYPAL *STEAM GAMES', 'exp-leisure', 'Steam'],
    ['CB BASIC FIT BEAUVAIS', 'exp-leisure', 'Basic-Fit'],
    ['CB LEROY MERLIN', 'exp-shopping', 'Leroy Merlin'],
    ['PRLV SEPA SPOTIFY P1A2B3', 'exp-subscriptions', 'Spotify'],
    ['APPLE.COM/BILL ITUNES.COM', 'exp-subscriptions', 'Apple'],
    ['CB PATHE BEAUVAIS', 'exp-leisure', 'Pathé'],
    ['PRLV DGFIP IMPOT 2026', 'exp-tax', 'Impôts'],
    ['CB H&M 0123 PARIS', 'exp-shopping', 'H&M'],
    ['CB AIRBNB * HMXYZ', 'exp-travel', 'Airbnb'],
    ['OPAC DE L OISE BEAUVAIS', 'exp-housing', 'Bailleur social'],
  ])('%s → %s', (label, expected, merchant) => {
    const r = classify(label, -12, { defaultRules: DEFAULT_RULES });
    expect(r.categoryId).toBe(expected);
    expect(r.merchant).toBe(merchant);
  });

  it('reconnaît le type de commerce sans enseigne connue', () => {
    expect(cat('CB BOULANGERIE DU CENTRE')).toBe('exp-groceries');
    expect(cat('CB PIZZERIA NAPOLI')).toBe('exp-restaurant');
    expect(cat('CB PHARMACIE DE LA GARE')).toBe('exp-health');
    expect(cat('CB COIFFURE STYL ELLE')).toBe('exp-shopping');
    expect(cat('CB PARKING HOTEL DE VILLE')).toBe('exp-car');
    expect(cat('MY BEERS BVS BEAUVAIS')).toBe('exp-restaurant');
  });

  it('classe les crédits d’une enseigne en remboursement', () => {
    expect(cat('REMBOURSEMENT AMAZON', 25)).toBe('inc-refund');
    expect(cat('VIR CPAM DE L OISE', 18.5)).toBe('inc-refund');
    expect(cat('VIR CAF DE L OISE', 230)).toBe('inc-benefits');
  });

  it('ne confond pas un prénom avec une enseigne dans un virement', () => {
    expect(classify('VIR SEPA PAUL DUPONT', -50, { defaultRules: [] }).merchant).toBeNull();
    expect(classify('CB PAUL GARE DU NORD', -6, { defaultRules: [] }).merchant).toBe('Paul');
  });

  it('les règles de l’utilisateur sont prioritaires', () => {
    expect(classify('CB CARREFOUR CITY', -10, { userRules: [{ id: 'u1', pattern: 'carrefour city', categoryId: 'exp-other' }] }).categoryId).toBe('exp-other');
  });
});

describe('apprentissage', () => {
  it('retient la catégorie choisie pour un marchand', () => {
    const txs: Transaction[] = [
      { id: '1', date: '2026-10-01', amount: -2200, label: 'SAS LUDIVAN BEAUVAIS', accountId: 'a', categoryId: 'exp-restaurant' },
      { id: '2', date: '2026-10-03', amount: -1495, label: 'SAS LUDIVAN BEAUVAIS', accountId: 'a', categoryId: 'exp-restaurant' },
    ];
    const memory = learnMerchants(txs);
    expect(classify('SAS LUDIVAN BEAUVAIS', -759, { memory }).categoryId).toBe('exp-restaurant');
    expect(classify('SAS LUDIVAN BEAUVAIS', -759, { memory }).source).toBe('appris');
  });
});

describe('affichage', () => {
  it('donne un nom lisible', () => {
    expect(displayMerchant('CB MCDONALDS PARIS 15')).toBe('McDonald’s');
    expect(displayMerchant('CB SAS LUDIVAN BEAUVAIS')).toBe('Ludivan Beauvais');
  });
});

describe('noms d’enseigne en plusieurs mots', () => {
  it('reconnaît les noms contenant des mots courants', () => {
    expect(classify('DON RESTOS DU COEUR', -20, { defaultRules: DEFAULT_RULES })).toMatchObject({ categoryId: 'exp-donations-help', merchant: 'Restos du Cœur' });
    expect(classify('CB MAISONS DU MONDE', -80).merchant).toBe('Maisons du Monde');
    expect(classify('CB BOULANGERIE PAUL', -5).categoryId).toBe('exp-groceries');
  });
});

describe('retrait ou retraite', () => {
  it('ne confond pas l’épargne retraite avec un retrait d’espèces', () => {
    expect(classify('VIR PER EPARGNE RETRAITE', -100, { defaultRules: DEFAULT_RULES }).categoryId).toBe('sav-per');
    expect(classify('RETRAIT DAB BNP 12/11', -60, { defaultRules: DEFAULT_RULES }).categoryId).toBe('exp-cash');
  });
});
