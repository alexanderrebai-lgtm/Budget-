/**
 * Sources de revenus passifs pour un particulier en France.
 * Rendements indicatifs de long terme, non garantis, à date de 2026.
 * « Net » = après fiscalité typique, hors fiscalité personnelle particulière.
 */

export interface PassiveSource {
  id: string;
  icon: string;
  name: string;
  /** Rendement annuel net indicatif (bas, haut) servant à estimer le capital nécessaire. */
  netYield: [number, number] | null;
  /** Remplace l'estimation de capital quand elle n'a pas de sens. */
  badge?: string;
  capital: string;
  effort: 'Très faible' | 'Faible' | 'Moyen' | 'Élevé';
  risk: 'Faible' | 'Moyen' | 'Élevé';
  liquidity: string;
  tax: string;
  how: string[];
  watch: string[];
}

export const PASSIVE_SOURCES: PassiveSource[] = [
  {
    id: 'etf-pea', icon: '🌍', name: 'ETF actions monde dans un PEA', netYield: [0.03, 0.04],
    capital: 'Dès 10 € par mois', effort: 'Très faible', risk: 'Moyen', liquidity: 'Bonne (retraits après 5 ans sans clôture)',
    tax: 'Après 5 ans : uniquement les prélèvements sociaux sur les gains retirés.',
    how: [
      'Investir chaque mois dans un ETF diversifié éligible PEA (type MSCI World), frais < 0,3 %/an.',
      'Phase de capitalisation : réinvestir tout. Phase de rente : retirer 3 à 4 % du capital par an (le « taux de retrait »).',
      'Rendement historique des actions mondiales ≈ 6-7 %/an sur longue période, avant inflation.',
    ],
    watch: ['Baisses de 30 à 50 % possibles certaines années : n’y placer que l’argent dont on n’a pas besoin avant 8-10 ans.'],
  },
  {
    id: 'dividendes', icon: '💶', name: 'Actions ou ETF à dividendes', netYield: [0.025, 0.04],
    capital: 'Quelques milliers d’euros', effort: 'Faible', risk: 'Moyen', liquidity: 'Bonne',
    tax: 'PEA : prélèvements sociaux seuls après 5 ans. Compte-titres : flat tax de 31,4 % en 2026 (ou barème sur option).',
    how: ['ETF « distribuant » à haut dividende, ou portefeuille d’entreprises qui augmentent leur dividende chaque année.', 'Loger d’abord dans le PEA (dividendes non imposés tant qu’ils restent dans le plan).'],
    watch: ['Un dividende élevé n’est pas un gain gratuit : le cours baisse d’autant au détachement. Le rendement total compte plus que le dividende.'],
  },
  {
    id: 'scpi', icon: '🏢', name: 'SCPI (immobilier en parts)', netYield: [0.025, 0.04],
    capital: 'Dès 200 € la part', effort: 'Très faible', risk: 'Moyen', liquidity: 'Faible (revente parfois lente)',
    tax: 'En direct : revenus fonciers (votre tranche + 17,2 %). En assurance-vie : pas d’impôt tant que les revenus restent dans le contrat.',
    how: ['Taux de distribution de 4 à 6 % brut. Les SCPI européennes subissent une fiscalité étrangère souvent plus légère.', 'Acheter à crédit permet de déduire les intérêts des loyers.'],
    watch: ['Frais d’entrée de 8 à 12 % : horizon de 8 à 10 ans minimum. Le prix des parts peut baisser (2023-2024).'],
  },
  {
    id: 'lmnp', icon: '🛋️', name: 'Location meublée (LMNP)', netYield: [0.03, 0.05],
    capital: 'Apport de 10 à 20 %, le reste à crédit', effort: 'Moyen', risk: 'Moyen', liquidity: 'Faible',
    tax: 'Au réel, l’amortissement du bien efface souvent l’impôt sur les loyers pendant 10 à 20 ans.',
    how: ['Studio ou T2 près d’une université, d’un hôpital ou d’une gare : vacance faible.', 'Déléguer la gestion (6 à 8 % des loyers) pour rendre le revenu vraiment passif.', 'Effet de levier : le crédit est remboursé par les loyers, le patrimoine se constitue avec peu d’apport.'],
    watch: ['Réintégration des amortissements dans la plus-value depuis 2025. DPE : location interdite des logements G, puis F en 2028.'],
  },
  {
    id: 'parking', icon: '🅿️', name: 'Parking, box, cave, garde-meuble', netYield: [0.03, 0.06],
    capital: '10 000 à 40 000 €', effort: 'Faible', risk: 'Faible', liquidity: 'Moyenne',
    tax: 'Revenus fonciers : micro-foncier (30 % d’abattement) sous 15 000 € de loyers.',
    how: ['Rendement brut de 5 à 8 % dans les villes où se garer est difficile.', 'Peu de charges, pas d’encadrement des loyers, contrat simple.'],
    watch: ['Vérifier les projets d’urbanisme (nouveaux parkings, zones piétonnes) qui peuvent faire chuter la demande.'],
  },
  {
    id: 'fonds-euros', icon: '🛡️', name: 'Fonds euros, obligations, livrets', netYield: [0.015, 0.025],
    capital: 'Dès 1 €', effort: 'Très faible', risk: 'Faible', liquidity: 'Très bonne',
    tax: 'Livret A, LDDS, LEP : exonérés. Assurance-vie : allégée après 8 ans.',
    how: ['Partie sécurisée du patrimoine et épargne de précaution.', 'ETF obligataires à échéance pour figer un rendement.'],
    watch: ['Le rendement réel (après inflation) est proche de zéro : utile pour la sécurité, pas pour s’enrichir.'],
  },
  {
    id: 'crowdfunding', icon: '🧱', name: 'Financement participatif (immobilier, PME)', netYield: [0.04, 0.06],
    capital: 'Dès 100 €', effort: 'Faible', risk: 'Élevé', liquidity: 'Nulle jusqu’à l’échéance',
    tax: 'Intérêts soumis à la flat tax (31,4 % en 2026).',
    how: ['Rendements affichés de 8 à 11 % brut sur 12 à 36 mois.', 'Diversifier sur de nombreux projets, ne pas dépasser 5 à 10 % du patrimoine.'],
    watch: ['Retards et défauts fréquents depuis 2023 : le rendement réel est souvent bien inférieur à l’affiché.'],
  },
  {
    id: 'numerique', icon: '💻', name: 'Produits numériques', netYield: null,
    capital: 'Pas de capital, du temps', effort: 'Élevé', risk: 'Faible', liquidity: '—',
    tax: 'Micro-entreprise (BNC 34 % ou BIC 50 % d’abattement), cotisations sociales sur le chiffre d’affaires.',
    how: [
      'Ebook, formation en ligne, modèles (tableurs, Notion, Canva), photos, musique, applications, plugins.',
      'Le travail est fait une fois, les ventes continuent : c’est « passif » après une phase très active.',
      'S’appuyer sur une compétence existante et une audience (blog, YouTube, newsletter, réseaux).',
    ],
    watch: ['La plupart des produits se vendent peu sans promotion continue : prévoir le marketing dès le départ.'],
  },
  {
    id: 'contenu', icon: '🎥', name: 'Contenu monétisé : blog, YouTube, affiliation', netYield: null,
    capital: 'Pas de capital', effort: 'Élevé', risk: 'Faible', liquidity: '—',
    tax: 'Micro-entreprise BNC. Les revenus doivent être déclarés dès le premier euro.',
    how: ['Publicité, liens d’affiliation, sponsors. Les contenus « evergreen » (guides, tutoriels) rapportent pendant des années.'],
    watch: ['Des mois, voire des années, avant un revenu significatif. Dépendance aux algorithmes des plateformes.'],
  },
  {
    id: 'location-biens', icon: '🚗', name: 'Louer ce que l’on possède déjà', netYield: null,
    capital: 'Aucun nouvel achat', effort: 'Moyen', risk: 'Faible', liquidity: '—',
    tax: 'Location d’une chambre chez soi exonérée sous conditions ; voiture, matériel : revenus à déclarer (micro-BIC) au-delà des frais partagés.',
    how: ['Voiture entre particuliers, matériel (outils, sono, vélo cargo), place de parking, chambre en bail mobilité.'],
    watch: ['Assurance spécifique, usure, accord du bailleur ou de la copropriété.'],
  },
  {
    id: 'solaire', icon: '☀️', name: 'Panneaux solaires avec revente', netYield: [0.03, 0.06], badge: 'Limité par la taille du toit',
    capital: '5 000 à 15 000 € (aides déduites)', effort: 'Faible', risk: 'Faible', liquidity: 'Nulle',
    tax: 'Revente exonérée d’impôt pour les petites installations domestiques (jusqu’à 3 kWc, sous conditions) ; au-delà, micro-BIC.',
    how: ['Autoconsommation avec vente du surplus : économie sur la facture + revenu garanti par contrat de rachat sur 20 ans.', 'Faire faire plusieurs devis par des installateurs certifiés RGE.'],
    watch: ['Démarchage agressif et arnaques fréquentes dans ce secteur : ne jamais signer au premier rendez-vous.'],
  },
];

/** Ordre de priorité classique pour construire des revenus passifs. */
export const PASSIVE_ROADMAP = [
  'Épargne de précaution : 3 à 6 mois de dépenses sur livrets.',
  'Rembourser les dettes coûteuses (crédit renouvelable, découvert) : c’est un « placement » garanti à 15-20 %.',
  'Récupérer l’abondement de l’employeur (PEE, PERCOL) : rendement immédiat de 50 à 300 %.',
  'Investir chaque mois sur un PEA (ETF monde) et une assurance-vie : le socle, très peu de temps à y consacrer.',
  'Selon la tranche d’imposition, ajouter un PER pour l’économie d’impôt immédiate.',
  'Avec une épargne solide et des revenus stables : immobilier locatif à crédit (effet de levier) ou SCPI.',
  'En parallèle, si vous en avez l’envie : un projet numérique ou une activité indépendante qui exploite vos compétences.',
];
