/**
 * Guide des leviers fiscaux et patrimoniaux pour les particuliers (France).
 * Contenu pédagogique : les montants sont ceux en vigueur pour l'imposition 2026
 * (revenus 2025), à vérifier avant toute décision.
 */

export type LeverCategory = 'impot' | 'placer' | 'revenus' | 'depenses' | 'transmettre';

export interface Lever {
  id: string;
  category: LeverCategory;
  icon: string;
  title: string;
  summary: string;
  gain: string;
  forWho: string;
  how: string[];
  watch: string[];
  difficulty: 1 | 2 | 3;
}

export const CATEGORY_LABELS: Record<LeverCategory, string> = {
  impot: 'Réduire son impôt',
  placer: 'Faire fructifier son épargne',
  revenus: 'Générer des revenus',
  depenses: 'Dépenser moins',
  transmettre: 'Transmettre',
};

export const LEVERS: Lever[] = [
  // — Impôt —
  {
    id: 'per', category: 'impot', icon: '🏖️', title: 'Plan d’épargne retraite (PER)', difficulty: 1,
    summary: 'Vos versements sont déduits de votre revenu imposable.',
    gain: 'Économie égale à votre tranche marginale : 300 € pour 1 000 € versés à 30 %, 410 € à 41 %.',
    forWho: 'Contribuables à partir de la tranche à 30 %, ou à 11 % avec une retraite prévue à 0 %.',
    how: [
      'Plafond : 10 % des revenus professionnels de l’année précédente (minimum 4 637 €, maximum 37 094 € pour les versements 2025), plus les plafonds non utilisés des 3 années précédentes.',
      'Le plafond disponible figure sur votre avis d’impôt ; les couples mariés ou pacsés peuvent mutualiser leurs plafonds (case 6QR).',
      'Verser avant le 31 décembre pour une déduction sur les revenus de l’année.',
      'Choisir un PER à frais réduits (pas de frais d’entrée, frais de gestion < 0,7 %) et une gestion pilotée adaptée à l’horizon.',
    ],
    watch: [
      'Épargne bloquée jusqu’à la retraite, sauf achat de la résidence principale et accidents de la vie.',
      'À la sortie en capital, les versements déduits sont imposés au barème et les gains au PFU : l’intérêt vient de l’écart de tranche entre aujourd’hui et la retraite, et de la capitalisation de l’économie.',
    ],
  },
  {
    id: 'frais-reels', category: 'impot', icon: '🚗', title: 'Frais réels plutôt que l’abattement de 10 %', difficulty: 1,
    summary: 'Déduire vos vrais frais professionnels quand ils dépassent 10 % du salaire.',
    gain: 'Variable : souvent plusieurs centaines d’euros pour les longs trajets domicile-travail.',
    forWho: 'Salariés qui font de longs trajets en voiture, prennent leurs repas à l’extérieur, ont une double résidence.',
    how: [
      'Trajets domicile-travail au barème kilométrique (40 km aller maximum sauf justification), +20 % pour un véhicule électrique.',
      'Repas pris sur le lieu de travail : coût moins la valeur forfaitaire d’un repas à domicile et la part employeur des titres-restaurant.',
      'Formation, documentation, matériel informatique (amorti), double résidence, télétravail (frais réels ou forfait).',
      'Déclarer le total en case 1AK et conserver les justificatifs 3 ans.',
    ],
    watch: ['Les indemnités versées par l’employeur pour ces frais doivent alors être ajoutées au salaire déclaré.'],
  },
  {
    id: 'dons', category: 'impot', icon: '❤️', title: 'Dons aux associations', difficulty: 1,
    summary: 'Réduction d’impôt de 66 % ou 75 % des sommes données.',
    gain: '75 % jusqu’à 1 000 € pour l’aide aux personnes en difficulté ; 66 % au-delà dans la limite de 20 % du revenu imposable.',
    forWho: 'Contribuables imposables (réduction non remboursable).',
    how: [
      'Garder les reçus fiscaux ; l’excédent au-delà de 20 % du revenu est reportable 5 ans.',
      'Un don mensuel lisse l’effort : 20 €/mois aux Restos du cœur coûtent 5 € net.',
    ],
    watch: ['Sans impôt à payer, la réduction est perdue.'],
  },
  {
    id: 'emploi-domicile', category: 'impot', icon: '🧹', title: 'Emploi à domicile et services à la personne', difficulty: 1,
    summary: 'Crédit d’impôt de 50 % des dépenses, remboursé même aux non-imposables.',
    gain: 'Jusqu’à 6 000 € par an (plafond de 12 000 € de dépenses, majoré de 1 500 € par enfant à charge ou membre de plus de 65 ans, dans la limite de 15 000 €).',
    forWho: 'Tous les foyers : ménage, jardinage, soutien scolaire, garde d’enfant à domicile, petit bricolage, assistance informatique.',
    how: [
      'Passer par le CESU, Pajemploi ou un organisme agréé.',
      'L’avance immédiate permet de ne payer que 50 % au moment de la facture.',
      'Une avance de 60 % du crédit de l’année précédente est versée mi-janvier.',
    ],
    watch: ['Plafonds spécifiques pour certains services (jardinage 5 000 €, bricolage 500 €, informatique 3 000 €).'],
  },
  {
    id: 'garde', category: 'impot', icon: '🧸', title: 'Frais de garde des jeunes enfants', difficulty: 1,
    summary: 'Crédit d’impôt de 50 % pour crèche, assistante maternelle, garderie.',
    gain: 'Jusqu’à 1 750 € par enfant de moins de 6 ans (3 500 € de frais retenus).',
    forWho: 'Parents d’enfants de moins de 6 ans au 1er janvier, gardés hors du domicile.',
    how: ['Déclarer les frais nets du complément de libre choix du mode de garde (CMG) et des aides de l’employeur.'],
    watch: ['Pour une garde à domicile, c’est le crédit « emploi à domicile » qui s’applique.'],
  },
  {
    id: 'enfant-majeur', category: 'impot', icon: '🎓', title: 'Enfant majeur : rattachement ou pension', difficulty: 2,
    summary: 'Choisir entre rattacher l’enfant (demi-part) ou déduire une pension alimentaire.',
    gain: 'Pension déductible jusqu’à 6 855 € environ par enfant ; le rattachement procure au plus 1 807 € par demi-part.',
    forWho: 'Parents d’enfants de 18 à 21 ans (25 ans s’ils étudient).',
    how: [
      'Simuler les deux options : à partir de la tranche à 30 %, la pension est souvent plus avantageuse.',
      'La pension est imposable chez l’enfant, souvent non imposable lui-même.',
    ],
    watch: ['Les bourses et aides au logement de l’enfant peuvent dépendre du choix.'],
  },
  {
    id: 'bareme-capitaux', category: 'impot', icon: '📊', title: 'Option pour le barème sur les revenus de capitaux', difficulty: 1,
    summary: 'Imposer dividendes et intérêts au barème plutôt qu’au PFU de 12,8 %.',
    gain: 'Pour une tranche à 0 % ou 11 % : abattement de 40 % sur les dividendes et 6,8 % de CSG déductible.',
    forWho: 'Foyers peu imposés qui perçoivent des dividendes ou des intérêts sur un compte-titres.',
    how: ['Cocher la case 2OP de la déclaration. Le simulateur compare automatiquement les deux options.'],
    watch: ['L’option est globale : elle vaut pour tous les revenus de capitaux et plus-values de l’année.'],
  },
  {
    id: 'deficit-foncier', category: 'impot', icon: '🏚️', title: 'Déficit foncier', difficulty: 3,
    summary: 'Des travaux sur un bien loué nu réduisent votre revenu global.',
    gain: 'Jusqu’à 10 700 € par an imputables sur le revenu global, soit 3 210 € d’impôt à 30 % de TMI, plus l’effacement des loyers imposables.',
    forWho: 'Propriétaires bailleurs en location nue, au régime réel, avec une TMI de 30 % ou plus.',
    how: [
      'Programmer les travaux d’entretien, de réparation ou d’amélioration (pas d’agrandissement).',
      'L’excédent et la part issue des intérêts d’emprunt sont reportables 10 ans sur les revenus fonciers.',
    ],
    watch: ['Le bien doit rester loué jusqu’au 31 décembre de la 3e année suivant l’imputation.'],
  },
  {
    id: 'lmnp', category: 'impot', icon: '🛋️', title: 'Location meublée (LMNP) au réel', difficulty: 3,
    summary: 'Amortir le bien et le mobilier pour neutraliser l’impôt sur les loyers.',
    gain: 'Souvent zéro impôt sur les loyers pendant 10 à 20 ans.',
    forWho: 'Investisseurs locatifs, recettes inférieures à 23 000 € ou à 50 % des revenus du foyer pour rester non professionnel.',
    how: [
      'Comparer avec le micro-BIC (abattement de 50 % en longue durée, 30 % en meublé de tourisme non classé).',
      'Faire appel à un expert-comptable spécialisé (honoraires en partie couverts par une réduction d’impôt via un organisme agréé).',
    ],
    watch: ['Depuis 2025, les amortissements déduits sont réintégrés dans la plus-value imposable à la revente.'],
  },
  {
    id: 'pme', category: 'impot', icon: '🚀', title: 'Investir au capital de PME (IR-PME, FCPI, FIP)', difficulty: 2,
    summary: 'Réduction d’impôt en contrepartie d’un investissement risqué et bloqué.',
    gain: 'Réduction de 18 % en général, jusqu’à 30 % pour certains fonds et entreprises solidaires, dans la limite de 50 000 € (100 000 € pour un couple).',
    forWho: 'Contribuables fortement imposés, avec une épargne qu’ils peuvent bloquer 5 à 10 ans.',
    how: ['Investir en direct (business angels, financement participatif) ou via des fonds.'],
    watch: ['Risque de perte en capital élevé et frais importants dans les fonds. Entre dans le plafonnement des niches (10 000 €).'],
  },
  {
    id: 'outre-mer', category: 'impot', icon: '🌴', title: 'Girardin, Sofica, monuments historiques', difficulty: 3,
    summary: 'Dispositifs de défiscalisation pour les contribuables les plus imposés.',
    gain: 'Girardin industriel : réduction supérieure à la mise, sur un an. Sofica : 30 à 48 %. Monuments historiques et Malraux : déduction ou réduction sur les travaux.',
    forWho: 'Impôt annuel de plusieurs milliers d’euros, après avoir utilisé les leviers simples.',
    how: ['Passer par un conseiller en gestion de patrimoine et un opérateur reconnu.'],
    watch: ['Plafond spécifique de 18 000 € pour le Girardin et les Sofica. Risque de requalification si le montage est défaillant.'],
  },
  {
    id: 'epargne-salariale', category: 'impot', icon: '🏢', title: 'Intéressement, participation et abondement', difficulty: 1,
    summary: 'Placer ses primes sur le PEE ou le PERCOL plutôt que de les encaisser.',
    gain: 'Primes exonérées d’impôt sur le revenu si elles sont placées ; l’abondement de l’employeur est un gain immédiat (souvent 50 à 300 %).',
    forWho: 'Salariés d’entreprises proposant un plan d’épargne salariale.',
    how: ['Verser de quoi obtenir l’abondement maximal chaque année.', 'Le PEE est disponible après 5 ans ou en cas de déblocage anticipé (achat de la résidence principale, mariage…).'],
    watch: ['Prélèvements sociaux de 9,7 % sur les primes ; les gains restent soumis aux prélèvements sociaux.'],
  },

  // — Placer —
  {
    id: 'precaution', category: 'placer', icon: '🛟', title: 'Épargne de précaution : livret A, LDDS, LEP', difficulty: 1,
    summary: 'Trois à six mois de dépenses disponibles immédiatement et sans risque.',
    gain: 'Intérêts nets d’impôt et de prélèvements sociaux.',
    forWho: 'Tout le monde, en priorité. Le LEP, mieux rémunéré, est réservé aux revenus modestes.',
    how: ['Plafonds : 22 950 € (livret A), 12 000 € (LDDS), 10 000 € (LEP).', 'Vérifier votre éligibilité au LEP avec votre revenu fiscal de référence.'],
    watch: ['Au-delà de l’épargne de précaution, le rendement réel (après inflation) est faible.'],
  },
  {
    id: 'pea', category: 'placer', icon: '📈', title: 'Plan d’épargne en actions (PEA)', difficulty: 2,
    summary: 'L’enveloppe la plus avantageuse pour investir en actions sur le long terme.',
    gain: 'Après 5 ans, plus-values et dividendes exonérés d’impôt sur le revenu (17,2 % de prélèvements sociaux seulement).',
    forWho: 'Épargnants avec un horizon de 5 ans ou plus.',
    how: [
      'Ouvrir un PEA tôt, même avec un petit montant, pour prendre date.',
      'Investir régulièrement dans des ETF diversifiés (ex. MSCI World éligible PEA) pour limiter le risque et les frais.',
      'Versements jusqu’à 150 000 € (225 000 € avec le PEA-PME).',
    ],
    watch: ['Un retrait avant 5 ans entraîne la clôture du plan (sauf exceptions). Risque de perte en capital.'],
  },
  {
    id: 'assurance-vie', category: 'placer', icon: '🛡️', title: 'Assurance-vie', difficulty: 2,
    summary: 'Enveloppe polyvalente : épargne disponible, fiscalité douce, transmission.',
    gain: 'Après 8 ans, abattement annuel de 4 600 € (9 200 € pour un couple) sur les gains retirés, puis 7,5 % (jusqu’à 150 000 € de versements).',
    forWho: 'Tout projet à moyen ou long terme ; incontournable pour transmettre.',
    how: [
      'Choisir un contrat en ligne sans frais sur versements, avec des ETF et des SCPI.',
      'Ouvrir un contrat tôt pour faire courir le délai de 8 ans.',
      'Racheter partiellement chaque année jusqu’à l’abattement pour « purger » les plus-values sans impôt.',
    ],
    watch: ['Le fonds euros est garanti mais peu rémunérateur ; les unités de compte comportent un risque de perte.'],
  },
  {
    id: 'scpi', category: 'placer', icon: '🏬', title: 'SCPI (pierre-papier)', difficulty: 2,
    summary: 'Investir dans l’immobilier locatif sans gestion, dès quelques centaines d’euros.',
    gain: 'Rendement de distribution de 4 à 6 % selon les SCPI ; logées en assurance-vie, les revenus échappent au barème.',
    forWho: 'Diversification immobilière ; démembrement (nue-propriété) pour les contribuables fortement imposés.',
    how: ['Privilégier la détention en assurance-vie ou les SCPI européennes (fiscalité étrangère plus légère).', 'Acheter la nue-propriété pour une décote sans revenus imposables.'],
    watch: ['Frais d’entrée élevés (souvent 8 à 12 %), placement peu liquide à envisager sur 8 ans minimum, valeur des parts non garantie.'],
  },
  {
    id: 'dca', category: 'placer', icon: '🗓️', title: 'Investissement programmé', difficulty: 1,
    summary: 'Automatiser un virement mensuel vers l’épargne le jour de la paie.',
    gain: 'Effet des intérêts composés : 200 €/mois à 5 % pendant 20 ans représentent environ 82 000 € pour 48 000 € versés.',
    forWho: 'Tout le monde.',
    how: ['« Se payer en premier » : programmer le virement dès la réception du salaire.', 'Augmenter le montant à chaque hausse de revenu.'],
    watch: ['Conserver la discipline lors des baisses de marché.'],
  },

  // — Revenus —
  {
    id: 'levier-credit', category: 'revenus', icon: '🏘️', title: 'Investissement locatif à crédit', difficulty: 3,
    summary: 'Utiliser l’argent de la banque pour constituer un patrimoine financé par les loyers.',
    gain: 'Patrimoine qui se rembourse en partie seul ; revenus complémentaires une fois le crédit remboursé.',
    forWho: 'Foyers à la situation professionnelle stable, avec une capacité d’emprunt disponible.',
    how: [
      'Calculer le rendement net et le cash-flow avec le simulateur.',
      'Viser un emplacement où la demande locative est forte, et un rendement brut d’au moins 5 à 7 % pour un cash-flow proche de l’équilibre.',
      'Choisir le régime fiscal (LMNP réel, location nue au réel) avant d’acheter.',
    ],
    watch: ['Vacance, impayés, travaux, encadrement des loyers et interdiction progressive de louer les passoires énergétiques (DPE G puis F).'],
  },
  {
    id: 'chambre', category: 'revenus', icon: '🛏️', title: 'Louer une chambre chez soi ou sa place de parking', difficulty: 1,
    summary: 'Revenus complémentaires avec peu de démarches.',
    gain: 'Louer une partie de sa résidence principale est exonéré d’impôt si le loyer reste « raisonnable » (plafond annuel par m² fixé chaque année).',
    forWho: 'Propriétaires ou locataires (avec accord du bailleur) disposant d’une pièce libre.',
    how: ['Louer à un étudiant, en bail mobilité ou en colocation.', 'Pour un parking, les loyers relèvent des revenus fonciers (micro-foncier).'],
    watch: ['La location courte durée (type Airbnb) de sa résidence principale est limitée à 120 nuits par an et soumise à déclaration dans certaines communes.'],
  },
  {
    id: 'micro', category: 'revenus', icon: '🧾', title: 'Lancer une activité en micro-entreprise', difficulty: 2,
    summary: 'Monétiser une compétence (conseil, cours, artisanat, revente) avec un régime simplifié.',
    gain: 'Abattement forfaitaire de 34 % à 71 % selon l’activité ; versement libératoire de 1 % à 2,2 % du chiffre d’affaires possible.',
    forWho: 'Salariés, étudiants, retraités qui veulent un revenu complémentaire.',
    how: ['Déclaration en ligne sur le guichet unique de l’INPI.', 'Opter pour le versement libératoire si votre TMI dépasse 11 % et que le revenu fiscal de référence le permet.'],
    watch: ['Cotisations sociales sur le chiffre d’affaires (environ 12 à 26 %). Vérifier les clauses d’exclusivité du contrat de travail.'],
  },
  {
    id: 'occasion', category: 'revenus', icon: '♻️', title: 'Vendre ce qui ne sert plus', difficulty: 1,
    summary: 'Les ventes d’objets personnels d’occasion ne sont pas imposables.',
    gain: 'Plusieurs centaines d’euros par an, sans impôt (sauf objet vendu plus de 5 000 €, et bijoux, métaux précieux et objets d’art soumis à une taxe spécifique).',
    forWho: 'Tout le monde.',
    how: ['Les plateformes transmettent au fisc un relevé au-delà de 30 ventes ou 2 000 € par an, sans que cela rende les ventes imposables.'],
    watch: ['Acheter pour revendre de façon habituelle est une activité commerciale imposable.'],
  },
  {
    id: 'droits', category: 'revenus', icon: '🤝', title: 'Vérifier ses droits aux aides', difficulty: 1,
    summary: 'Prime d’activité, aides au logement, chèque énergie : des milliers d’euros restent non réclamés.',
    gain: 'Jusqu’à plusieurs centaines d’euros par mois.',
    forWho: 'Revenus modestes et moyens, étudiants, familles.',
    how: ['Faire le simulateur officiel sur mesdroitssociaux.gouv.fr ou caf.fr.'],
    watch: ['Déclarer tout changement de situation pour éviter les indus.'],
  },

  // — Dépenses —
  {
    id: 'assurance-emprunteur', category: 'depenses', icon: '📉', title: 'Changer d’assurance emprunteur', difficulty: 1,
    summary: 'La loi Lemoine permet de changer d’assurance de prêt immobilier à tout moment.',
    gain: 'Souvent 5 000 à 15 000 € sur la durée du crédit.',
    forWho: 'Tous les emprunteurs, surtout les jeunes non-fumeurs avec un contrat groupe de la banque.',
    how: ['Comparer des contrats à garanties équivalentes et envoyer la demande de substitution à la banque.'],
    watch: ['La banque peut refuser seulement si les garanties ne sont pas équivalentes.'],
  },
  {
    id: 'abonnements', category: 'depenses', icon: '✂️', title: 'Faire le tri dans les abonnements', difficulty: 1,
    summary: 'Streaming, salle de sport, presse, applications : les petits montants s’accumulent.',
    gain: 'Souvent 300 à 800 € par an.',
    forWho: 'Tout le monde : consultez la page Abonnements.',
    how: ['Résiliation en 3 clics obligatoire pour les contrats souscrits en ligne.', 'Alterner les services de streaming plutôt que de les cumuler.'],
    watch: [],
  },
  {
    id: 'contrats', category: 'depenses', icon: '🔄', title: 'Renégocier assurances, énergie, banque, mobile', difficulty: 1,
    summary: 'Mettre en concurrence chaque année les contrats du quotidien.',
    gain: '200 à 600 € par an en moyenne.',
    forWho: 'Tout le monde.',
    how: [
      'Assurances auto et habitation résiliables à tout moment après un an (loi Hamon).',
      'Banque en ligne : carte et tenue de compte gratuites.',
      'Forfait mobile sans engagement, offre d’électricité indexée moins chère que le tarif réglementé.',
    ],
    watch: ['Comparer les garanties et les franchises, pas seulement le prix.'],
  },
  {
    id: 'renovation', category: 'depenses', icon: '🔥', title: 'Rénovation énergétique aidée', difficulty: 2,
    summary: 'MaPrimeRénov’, certificats d’économies d’énergie et éco-prêt à taux zéro.',
    gain: 'Aides pouvant couvrir une grande partie des travaux selon vos revenus, puis baisse durable de la facture.',
    forWho: 'Propriétaires occupants et bailleurs de logements de plus de 15 ans.',
    how: ['Passer par France Rénov’ et un artisan RGE ; faire les demandes avant de signer les devis.'],
    watch: ['Les règles évoluent souvent : vérifier les conditions au moment du projet.'],
  },

  // — Transmettre —
  {
    id: 'donations', category: 'transmettre', icon: '🎁', title: 'Donner de son vivant', difficulty: 2,
    summary: 'Les abattements se rechargent tous les 15 ans.',
    gain: '100 000 € par parent et par enfant sans droits, 31 865 € de don familial de sommes d’argent en plus (donateur de moins de 80 ans, bénéficiaire majeur), 31 865 € par grand-parent et petit-enfant.',
    forWho: 'Parents et grands-parents souhaitant aider leurs proches.',
    how: ['Déclarer le don en ligne sur impots.gouv.fr.', 'Le démembrement (donner la nue-propriété) réduit la base taxable selon l’âge du donateur.'],
    watch: ['Une donation est en principe irrévocable ; anticiper l’équilibre entre héritiers.'],
  },
  {
    id: 'av-transmission', category: 'transmettre', icon: '📜', title: 'Assurance-vie et clause bénéficiaire', difficulty: 1,
    summary: 'Transmettre hors succession avec une fiscalité très allégée.',
    gain: '152 500 € par bénéficiaire sans droits pour les versements effectués avant 70 ans.',
    forWho: 'Tous les détenteurs d’assurance-vie.',
    how: ['Rédiger une clause bénéficiaire précise et la mettre à jour à chaque événement de vie.', 'Verser de préférence avant 70 ans.'],
    watch: ['Après 70 ans, abattement global de 30 500 € sur les versements (les gains restent exonérés).'],
  },
];

export const TAX_CALENDAR = [
  { when: 'Janvier', what: 'Avance de 60 % des crédits d’impôt (emploi à domicile, garde) versée vers le 15 janvier.' },
  { when: 'Avril – juin', what: 'Déclaration des revenus de l’année précédente. Vérifier les montants pré-remplis et les options (frais réels, case 2OP, PER).' },
  { when: 'Juillet – août', what: 'Avis d’impôt : remboursement ou solde, et nouveau taux de prélèvement à la source appliqué en septembre.' },
  { when: 'Septembre – décembre', what: 'Solde éventuel prélevé. Taxe foncière (octobre). Moduler le taux de prélèvement si vos revenus changent.' },
  { when: 'Avant le 31 décembre', what: 'Derniers versements PER, dons, travaux et dépenses ouvrant droit à crédit d’impôt pour l’année en cours.' },
];
