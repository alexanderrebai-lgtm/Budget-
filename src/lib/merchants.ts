/**
 * Reconnaissance des enseignes à partir des libellés bancaires (100 % local).
 *
 * Ordre de décision : règles de l'utilisateur → marchands déjà classés par
 * l'utilisateur (apprentissage) → base d'enseignes → mots-clés de type de commerce.
 */
import { normalize } from './format';
import type { Rule, Transaction } from './types';

/* ---------------- Nettoyage du libellé ---------------- */

const NOISE_WORDS = new Set([
  'cb', 'carte', 'cartes', 'paiement', 'paiements', 'achat', 'achats', 'prlv', 'prelevement', 'prelev', 'prlvt', 'sepa', 'sdd', 'vir', 'virement',
  'virt', 'inst', 'instantane', 'recu', 'emis', 'facture', 'fact', 'du', 'de', 'des', 'le', 'la', 'les', 'l', 'd', 'par', 'sur', 'en', 'au', 'aux',
  'sas', 'sarl', 'sa', 'eurl', 'sasu', 'sci', 'snc', 'ste', 'societe', 'ets', 'cie', 'fr', 'france', 'eur', 'euro', 'euros', 'ref', 'reference',
  'mandat', 'ech', 'echeance', 'num', 'no', 'n', 'x', 'www', 'com', 'net', 'contactless', 'sans', 'contact', 'nfc',
  'apple', 'pay', 'google', 'paypal', 'lydia', 'sumup', 'zettle', 'stripe',
]);
/** Mots à garder malgré tout quand ils sont l'enseigne elle-même. */
const KEEP_WHEN_ALONE = new Set(['apple', 'google', 'paypal', 'lydia']);

/** Nom du marchand extrait du libellé : « CB CARREFOUR CITY 12/03 BEAUVAIS 5290XXXX » → « carrefour city 12 03 beauvais » nettoyé. */
/** Libellé sans dates, numéros ni ponctuation, mais avec tous ses mots (pour les noms en plusieurs mots). */
function lightLabel(label: string): string {
  return normalize(label)
    .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, ' ') // dates
    .replace(/\b\d+x+\d*\b|x{3,}\d*|\bx\d{3,}\b/g, ' ') // numéros de carte masqués (5290XXXX1133, X4521)
    .replace(/\b[a-z]{2}\d{2}[a-z0-9]{10,}\b/g, ' ') // IBAN
    .replace(/\b(?=[a-z]*\d)(?=\d*[a-z])[a-z0-9]{6,}\b/g, ' ') // références mêlant lettres et chiffres
    .replace(/[*_/\\|#:;,()[\]{}"'`.]+/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanLabel(label: string): string {
  const words = lightLabel(label).split(' ').filter(Boolean);
  const kept = words.filter((w) => !NOISE_WORDS.has(w));
  if (!kept.length) return words.filter((w) => KEEP_WHEN_ALONE.has(w)).join(' ');
  return kept.join(' ');
}

/* ---------------- Base d'enseignes ---------------- */

interface Brand {
  name: string;
  category: string;
  /** Catégorie quand l'opération est un crédit (remboursement, prestation). */
  income?: string;
  aliases: string[];
}

// [catégorie, nom affiché, alias…] — alias en minuscules sans accents.
const B: [string, string, ...string[]][] = [
  // Courses
  ['exp-groceries', 'Carrefour', 'carrefour', 'carrefour city', 'carrefour market', 'carrefour express', 'carrefour contact', 'carrefour drive', 'carref', 'crf'],
  ['exp-groceries', 'E.Leclerc', 'leclerc', 'e leclerc', 'eleclerc', 'leclerc drive', 'leclerc express'],
  ['exp-groceries', 'Auchan', 'auchan', 'my auchan', 'auchan drive', 'auchan supermarche'],
  ['exp-groceries', 'Intermarché', 'intermarche', 'itm', 'intermarche express', 'inter contact'],
  ['exp-groceries', 'Lidl', 'lidl'],
  ['exp-groceries', 'Aldi', 'aldi'],
  ['exp-groceries', 'Netto', 'netto'],
  ['exp-groceries', 'Système U', 'super u', 'hyper u', 'u express', 'utile', 'marche u', 'magasins u', 'systeme u', 'courses u'],
  ['exp-groceries', 'Casino', 'casino', 'geant casino', 'petit casino', 'casino shop', 'spar', 'vival', 'sherpa'],
  ['exp-groceries', 'Monoprix', 'monoprix', 'monop', 'monop daily'],
  ['exp-groceries', 'Franprix', 'franprix'],
  ['exp-groceries', 'Picard', 'picard', 'picard surgeles'],
  ['exp-groceries', 'Grand Frais', 'grand frais'],
  ['exp-groceries', 'Biocoop', 'biocoop'],
  ['exp-groceries', 'Naturalia', 'naturalia'],
  ['exp-groceries', 'La Vie Claire', 'la vie claire'],
  ['exp-groceries', 'Bio c’ Bon', 'bio c bon'],
  ['exp-groceries', 'Cora', 'cora'],
  ['exp-groceries', 'Match', 'supermarche match'],
  ['exp-groceries', 'Leader Price', 'leader price'],
  ['exp-groceries', 'G20', 'g20'],
  ['exp-groceries', 'Proxi', 'proxi'],
  ['exp-groceries', 'Coccinelle', 'coccinelle'],
  ['exp-groceries', 'Thiriet', 'thiriet'],
  ['exp-groceries', 'Marie Blachère', 'marie blachere'],
  ['exp-groceries', 'Paul', 'paul', 'boulangerie paul'],
  ['exp-groceries', 'Ange', 'boulangerie ange'],
  ['exp-groceries', 'La Mie Câline', 'la mie caline'],
  ['exp-groceries', 'Nicolas', 'nicolas vins', 'cavavin', 'v and b'],
  ['exp-groceries', 'La Grande Épicerie', 'grande epicerie'],
  ['exp-groceries', 'Too Good To Go', 'too good to go', 'toogoodtogo'],
  ['exp-groceries', 'Hellofresh', 'hellofresh', 'quitoque'],
  // Restauration
  ['exp-restaurant', 'McDonald’s', 'mcdonald', 'mcdonalds', 'mc donald', 'mc donalds', 'mac donald', 'macdo', 'mcdo'],
  ['exp-restaurant', 'Burger King', 'burger king', 'bk'],
  ['exp-restaurant', 'KFC', 'kfc'],
  ['exp-restaurant', 'Quick', 'quick'],
  ['exp-restaurant', 'Subway', 'subway'],
  ['exp-restaurant', 'Domino’s', 'dominos', 'domino s', 'dominos pizza'],
  ['exp-restaurant', 'Pizza Hut', 'pizza hut'],
  ['exp-restaurant', 'O’Tacos', 'o tacos', 'otacos'],
  ['exp-restaurant', 'Five Guys', 'five guys'],
  ['exp-restaurant', 'Starbucks', 'starbucks'],
  
  ['exp-restaurant', 'Brioche Dorée', 'brioche doree'],
  ['exp-restaurant', 'Columbus Café', 'columbus'],
  ['exp-restaurant', 'Pomme de Pain', 'pomme de pain'],
  ['exp-restaurant', 'Flunch', 'flunch'],
  ['exp-restaurant', 'Buffalo Grill', 'buffalo grill'],
  ['exp-restaurant', 'Courtepaille', 'courtepaille'],
  ['exp-restaurant', 'Hippopotamus', 'hippopotamus'],
  ['exp-restaurant', 'Léon', 'leon de bruxelles'],
  ['exp-restaurant', 'Del Arte', 'del arte'],
  ['exp-restaurant', 'Sushi Shop', 'sushi shop'],
  ['exp-restaurant', 'Planet Sushi', 'planet sushi'],
  ['exp-restaurant', 'Big Fernand', 'big fernand'],
  ['exp-restaurant', 'Exki', 'exki'],
  ['exp-restaurant', 'Pret A Manger', 'pret a manger'],
  ['exp-restaurant', 'Bagelstein', 'bagelstein'],
  ['exp-restaurant', 'Uber Eats', 'uber eats', 'ubereats'],
  ['exp-restaurant', 'Deliveroo', 'deliveroo'],
  ['exp-restaurant', 'Just Eat', 'just eat', 'justeat'],
  ['exp-restaurant', 'Sodexo', 'sodexo'],
  ['exp-restaurant', 'Crous', 'crous'],
  // Carburant, voiture
  ['exp-car', 'TotalEnergies', 'total', 'totalenergies', 'total access', 'relais total'],
  ['exp-car', 'Esso', 'esso'],
  ['exp-car', 'Shell', 'shell'],
  ['exp-car', 'BP', 'bp'],
  ['exp-car', 'Avia', 'avia'],
  ['exp-car', 'Agip', 'agip', 'eni station'],
  ['exp-car', 'Dyneff', 'dyneff'],
  ['exp-car', 'Vinci Autoroutes', 'vinci autoroutes', 'vinci', 'asf', 'cofiroute', 'escota'],
  ['exp-car', 'Sanef', 'sanef', 'sapn'],
  ['exp-car', 'APRR', 'aprr', 'area'],
  ['exp-car', 'Bip&Go', 'bip go', 'bipandgo', 'ulys'],
  ['exp-car', 'Indigo', 'indigo', 'parking indigo'],
  ['exp-car', 'Effia', 'effia'],
  ['exp-car', 'Saemes', 'saemes'],
  ['exp-car', 'Onepark', 'onepark'],
  ['exp-car', 'Norauto', 'norauto'],
  ['exp-car', 'Feu Vert', 'feu vert', 'feuvert'],
  ['exp-car', 'Speedy', 'speedy'],
  ['exp-car', 'Midas', 'midas'],
  ['exp-car', 'Point S', 'point s'],
  ['exp-car', 'Euromaster', 'euromaster'],
  ['exp-car', 'Dekra', 'dekra', 'autosur', 'securitest'],
  ['exp-car', 'ANTS', 'ants'],
  ['exp-car', 'Tesla', 'tesla'],
  ['exp-car', 'Ionity', 'ionity', 'freshmile', 'chargemap', 'electra'],
  // Transport
  ['exp-transport', 'SNCF', 'sncf', 'sncf connect', 'oui sncf', 'ouigo', 'ter', 'tgv', 'inoui', 'trainline'],
  ['exp-transport', 'RATP', 'ratp'],
  ['exp-transport', 'Île-de-France Mobilités', 'navigo', 'iledefrance mobilites', 'idf mobilites'],
  ['exp-transport', 'Uber', 'uber', 'uber trip', 'uber bv'],
  ['exp-transport', 'Bolt', 'bolt'],
  ['exp-transport', 'Heetch', 'heetch'],
  ['exp-transport', 'G7', 'g7', 'taxi g7'],
  ['exp-transport', 'BlaBlaCar', 'blablacar', 'blablacar bus'],
  ['exp-transport', 'FlixBus', 'flixbus'],
  ['exp-transport', 'Lime', 'lime'],
  ['exp-transport', 'Dott', 'dott'],
  ['exp-transport', 'Vélib’', 'velib'],
  ['exp-transport', 'Transdev', 'transdev'],
  ['exp-transport', 'Keolis', 'keolis'],
  ['exp-transport', 'TCL', 'tcl'],
  ['exp-transport', 'Getaround', 'getaround'],
  // Shopping
  ['exp-shopping', 'Amazon', 'amazon', 'amazon fr', 'amzn', 'amazon mktplace', 'amazon marketplace', 'amz'],
  ['exp-shopping', 'Cdiscount', 'cdiscount'],
  ['exp-shopping', 'Fnac', 'fnac'],
  ['exp-shopping', 'Darty', 'darty'],
  ['exp-shopping', 'Boulanger', 'boulanger'],
  ['exp-shopping', 'AliExpress', 'aliexpress'],
  ['exp-shopping', 'Temu', 'temu'],
  ['exp-shopping', 'Shein', 'shein'],
  ['exp-shopping', 'Vinted', 'vinted'],
  ['exp-shopping', 'Leboncoin', 'leboncoin', 'lbc'],
  ['exp-shopping', 'eBay', 'ebay'],
  ['exp-shopping', 'Rakuten', 'rakuten'],
  ['exp-shopping', 'Zalando', 'zalando'],
  ['exp-shopping', 'Vente-privée', 'veepee', 'vente privee', 'showroomprive'],
  ['exp-shopping', 'Zara', 'zara'],
  ['exp-shopping', 'H&M', 'h m', 'h&m', 'hm', 'hennes'],
  ['exp-shopping', 'Kiabi', 'kiabi'],
  ['exp-shopping', 'Primark', 'primark'],
  ['exp-shopping', 'Celio', 'celio'],
  ['exp-shopping', 'Jules', 'jules'],
  ['exp-shopping', 'Uniqlo', 'uniqlo'],
  ['exp-shopping', 'Bershka', 'bershka'],
  ['exp-shopping', 'Pull&Bear', 'pull bear', 'pull and bear'],
  ['exp-shopping', 'Mango', 'mango'],
  ['exp-shopping', 'Promod', 'promod'],
  ['exp-shopping', 'Etam', 'etam', 'undiz'],
  ['exp-shopping', 'La Halle', 'la halle'],
  ['exp-shopping', 'Gémo', 'gemo'],
  ['exp-shopping', 'Foot Locker', 'foot locker', 'footlocker'],
  ['exp-shopping', 'Courir', 'courir'],
  ['exp-shopping', 'Sephora', 'sephora'],
  ['exp-shopping', 'Nocibé', 'nocibe'],
  ['exp-shopping', 'Yves Rocher', 'yves rocher'],
  ['exp-shopping', 'Marionnaud', 'marionnaud'],
  ['exp-shopping', 'Lush', 'lush'],
  ['exp-shopping', 'Ikea', 'ikea'],
  ['exp-shopping', 'Leroy Merlin', 'leroy merlin'],
  ['exp-shopping', 'Castorama', 'castorama'],
  ['exp-shopping', 'Brico Dépôt', 'brico depot'],
  ['exp-shopping', 'Bricomarché', 'bricomarche'],
  ['exp-shopping', 'Mr.Bricolage', 'mr bricolage'],
  ['exp-shopping', 'Conforama', 'conforama'],
  ['exp-shopping', 'BUT', 'but'],
  ['exp-shopping', 'Maisons du Monde', 'maisons du monde'],
  ['exp-shopping', 'Gifi', 'gifi'],
  ['exp-shopping', 'Action', 'action'],
  ['exp-shopping', 'Hema', 'hema'],
  ['exp-shopping', 'Centrakor', 'centrakor'],
  ['exp-shopping', 'Noz', 'noz'],
  ['exp-shopping', 'B&M', 'b m', 'b&m', 'b et m', 'bm'],
  ['exp-shopping', 'La Foir’Fouille', 'foir fouille', 'la foirfouille'],
  ['exp-shopping', 'Normal', 'normal'],
  ['exp-shopping', 'Flying Tiger', 'flying tiger', 'tiger'],
  ['exp-shopping', 'Cultura', 'cultura'],
  ['exp-shopping', 'Relay', 'relay'],
  ['exp-shopping', 'Micromania', 'micromania'],
  ['exp-shopping', 'Apple Store', 'apple store'],
  ['exp-shopping', 'Back Market', 'back market', 'backmarket'],
  ['exp-shopping', 'Truffaut', 'truffaut', 'jardiland', 'botanic', 'gamm vert'],
  ['exp-shopping', 'Maxi Zoo', 'maxi zoo', 'animalis', 'zooplus'],
  ['exp-shopping', 'La Poste', 'la poste', 'colissimo'],
  // Loisirs, sport
  ['exp-leisure', 'Decathlon', 'decathlon'],
  ['exp-leisure', 'Intersport', 'intersport'],
  ['exp-leisure', 'Go Sport', 'go sport'],
  ['exp-leisure', 'Basic-Fit', 'basic fit', 'basicfit'],
  ['exp-leisure', 'Fitness Park', 'fitness park'],
  ['exp-leisure', 'Keep Cool', 'keep cool', 'keepcool'],
  ['exp-leisure', 'L’Orange Bleue', 'orange bleue'],
  ['exp-leisure', 'On Air', 'on air fitness'],
  ['exp-leisure', 'Pathé', 'pathe', 'pathe gaumont', 'gaumont'],
  ['exp-leisure', 'UGC', 'ugc'],
  ['exp-leisure', 'CGR', 'cgr', 'cgr cinemas'],
  ['exp-leisure', 'Kinépolis', 'kinepolis'],
  ['exp-leisure', 'MK2', 'mk2'],
  ['exp-leisure', 'Ticketmaster', 'ticketmaster', 'fnac spectacles', 'see tickets', 'billetreduc', 'weezevent'],
  ['exp-leisure', 'FDJ', 'fdj', 'francaise des jeux'],
  ['exp-leisure', 'PMU', 'pmu'],
  ['exp-leisure', 'Winamax', 'winamax', 'betclic', 'unibet', 'parions sport'],
  ['exp-leisure', 'Steam', 'steam', 'steamgames'],
  ['exp-leisure', 'PlayStation', 'playstation', 'sony interactive', 'psn'],
  ['exp-leisure', 'Nintendo', 'nintendo'],
  ['exp-leisure', 'Xbox', 'xbox'],
  ['exp-leisure', 'Disneyland', 'disneyland', 'euro disney'],
  ['exp-leisure', 'Parc Astérix', 'parc asterix'],
  // Abonnements
  ['exp-subscriptions', 'Netflix', 'netflix', 'netflix com'],
  ['exp-subscriptions', 'Spotify', 'spotify'],
  ['exp-subscriptions', 'Deezer', 'deezer'],
  ['exp-subscriptions', 'Disney+', 'disney plus', 'disneyplus', 'disney'],
  ['exp-subscriptions', 'Prime Video', 'prime video', 'amazon prime', 'primevideo'],
  ['exp-subscriptions', 'Canal+', 'canal', 'canal plus', 'canalplus', 'mycanal'],
  ['exp-subscriptions', 'Apple', 'apple com', 'apple com bill', 'itunes', 'icloud'],
  ['exp-subscriptions', 'Google', 'google', 'google play', 'google one', 'youtube', 'youtube premium', 'google storage'],
  ['exp-subscriptions', 'Crunchyroll', 'crunchyroll'],
  ['exp-subscriptions', 'Audible', 'audible'],
  ['exp-subscriptions', 'Max', 'hbo max'],
  ['exp-subscriptions', 'Paramount+', 'paramount'],
  ['exp-subscriptions', 'Molotov', 'molotov'],
  ['exp-subscriptions', 'OpenAI', 'openai', 'chatgpt'],
  ['exp-subscriptions', 'Anthropic', 'anthropic', 'claude ai'],
  ['exp-subscriptions', 'Adobe', 'adobe'],
  ['exp-subscriptions', 'Microsoft', 'microsoft', 'msft', 'office 365', 'microsoft 365'],
  ['exp-subscriptions', 'Dropbox', 'dropbox'],
  ['exp-subscriptions', 'Canva', 'canva'],
  ['exp-subscriptions', 'Le Monde', 'le monde', 'lemonde'],
  ['exp-subscriptions', 'Le Figaro', 'le figaro'],
  ['exp-subscriptions', 'Cafeyn', 'cafeyn'],
  ['exp-subscriptions', 'Tinder', 'tinder', 'bumble', 'meetic', 'hinge'],
  ['exp-subscriptions', 'Patreon', 'patreon', 'twitch', 'onlyfans'],
  // Téléphone, internet
  ['exp-telecom', 'Free', 'free', 'free mobile', 'freebox', 'free telecom'],
  ['exp-telecom', 'Orange', 'orange', 'orange sa', 'orange france'],
  ['exp-telecom', 'SFR', 'sfr', 'red by sfr', 'sfr box'],
  ['exp-telecom', 'Bouygues Telecom', 'bouygues', 'bouygues telecom', 'b you'],
  ['exp-telecom', 'Sosh', 'sosh'],
  ['exp-telecom', 'Prixtel', 'prixtel', 'nrj mobile', 'la poste mobile', 'syma', 'lebara', 'lycamobile'],
  // Énergie, eau
  ['exp-utilities', 'EDF', 'edf', 'edf clients particuliers'],
  ['exp-utilities', 'Engie', 'engie', 'gdf'],
  ['exp-utilities', 'TotalEnergies électricité', 'totalenergies electricite', 'total direct energie', 'direct energie'],
  ['exp-utilities', 'Ekwateur', 'ekwateur', 'mint energie', 'octopus energy', 'ohm energie', 'vattenfall', 'eni gaz', 'eni'],
  ['exp-utilities', 'Veolia', 'veolia', 'eau de paris', 'saur', 'suez'],
  ['exp-utilities', 'GRDF', 'grdf', 'enedis'],
  // Santé
  ['exp-health', 'Assurance maladie', 'cpam', 'ameli', 'assurance maladie', 'caisse primaire'],
  ['exp-health', 'Doctolib', 'doctolib'],
  ['exp-health', 'Pharmacie', 'pharmacie', 'pharma', 'parapharmacie'],
  ['exp-health', 'Laboratoire', 'laboratoire', 'labo', 'cerballiance', 'biogroup', 'synlab', 'eurofins'],
  ['exp-health', 'Afflelou', 'afflelou', 'krys', 'optic 2000', 'atol', 'grand optical', 'general d optique', 'lissac'],
  ['exp-health', 'Audika', 'audika', 'amplifon'],
  // Assurances, mutuelles
  ['exp-insurance', 'AXA', 'axa'],
  ['exp-insurance', 'MAIF', 'maif'],
  ['exp-insurance', 'MACIF', 'macif'],
  ['exp-insurance', 'MAAF', 'maaf'],
  ['exp-insurance', 'Matmut', 'matmut'],
  ['exp-insurance', 'GMF', 'gmf'],
  ['exp-insurance', 'Allianz', 'allianz'],
  ['exp-insurance', 'Groupama', 'groupama'],
  ['exp-insurance', 'MMA', 'mma'],
  ['exp-insurance', 'Generali', 'generali'],
  ['exp-insurance', 'Direct Assurance', 'direct assurance'],
  ['exp-insurance', 'Luko', 'luko', 'leocare', 'lovys', 'acheel'],
  ['exp-insurance', 'Alan', 'alan', 'alan insurance'],
  ['exp-insurance', 'Mutuelle', 'mutuelle', 'harmonie mutuelle', 'mgen', 'malakoff', 'ag2r', 'april', 'swisslife', 'swiss life', 'mutuelle generale'],
  // Logement
  ['exp-housing', 'Foncia', 'foncia'],
  ['exp-housing', 'Nexity', 'nexity'],
  ['exp-housing', 'Citya', 'citya'],
  ['exp-housing', 'Orpi', 'orpi', 'century 21', 'laforet', 'guy hoquet'],
  ['exp-housing', 'Bailleur social', 'opac', 'oph', 'opah', 'hlm', 'logement', 'cdc habitat', 'paris habitat', 'action logement', 'icf habitat', 'vilogia', 'logirep'],
  // Impôts, administrations
  ['exp-tax', 'Impôts', 'dgfip', 'impot', 'impots', 'tresor public', 'finances publiques', 'direction generale des finances'],
  ['exp-tax', 'Amendes (ANTAI)', 'antai', 'amende', 'amendes gouv'],
  ['exp-tax', 'URSSAF', 'urssaf'],
  // Banque
  ['exp-bank', 'Frais bancaires', 'frais', 'commission', 'commissions', 'cotisation carte', 'agios', 'interets debiteurs', 'frais tenue', 'frais nickel', 'offre groupee'],
  // Voyages
  ['exp-travel', 'Airbnb', 'airbnb'],
  ['exp-travel', 'Booking.com', 'booking', 'booking com'],
  ['exp-travel', 'Expedia', 'expedia', 'hotels com', 'lastminute', 'opodo', 'edreams'],
  ['exp-travel', 'Air France', 'air france', 'airfrance'],
  ['exp-travel', 'easyJet', 'easyjet'],
  ['exp-travel', 'Ryanair', 'ryanair'],
  ['exp-travel', 'Transavia', 'transavia'],
  ['exp-travel', 'Vueling', 'vueling', 'volotea', 'wizz air'],
  ['exp-travel', 'Accor', 'accor', 'ibis', 'novotel', 'mercure', 'sofitel', 'pullman'],
  ['exp-travel', 'B&B Hotels', 'b b hotel', 'b&b hotel', 'campanile', 'kyriad', 'premiere classe', 'formule 1', 'hotel f1'],
  ['exp-travel', 'Center Parcs', 'center parcs', 'pierre vacances', 'club med', 'belambra', 'odalys'],
  ['exp-travel', 'Hertz', 'hertz', 'europcar', 'avis', 'sixt', 'rent a car', 'ada'],
  // Garde, éducation
  ['exp-childcare', 'Pajemploi', 'pajemploi'],
  ['exp-education', 'Acadomia', 'acadomia', 'completude', 'superprof'],
  // Services à domicile
  ['exp-home-services', 'CESU', 'cesu', 'cesu urssaf'],
  ['exp-home-services', 'Shiva', 'shiva', 'o2', 'wecasa', 'helpling', 'vitalliance'],
  // Dons
  ['exp-donations-help', 'Restos du Cœur', 'restos du coeur', 'secours populaire', 'croix rouge', 'emmaus', 'fondation abbe pierre', 'secours catholique', 'banque alimentaire'],
  ['exp-donations', 'Association', 'unicef', 'msf', 'medecins sans frontieres', 'wwf', 'greenpeace', 'amnesty', 'handicap international', 'telethon', 'afm', 'ligue contre le cancer', 'institut pasteur', 'spa'],
  // Revenus et organismes
  ['inc-benefits', 'CAF', 'caf', 'caisse d allocations', 'allocations familiales', 'pole emploi', 'france travail', 'msa', 'carsat', 'agirc arrco'],
];

const BRANDS: Brand[] = B.map(([category, name, ...aliases]) => ({
  name,
  category,
  income: category === 'inc-benefits' ? 'inc-benefits' : category === 'exp-health' ? 'inc-refund' : category === 'exp-tax' ? 'inc-refund' : undefined,
  aliases: aliases.map((a) => normalize(a).replace(/[^a-z0-9& ]/g, ' ').replace(/\s+/g, ' ').trim()),
}));

/* ---------------- Mots-clés par type de commerce ---------------- */

const KEYWORDS: [string, string[]][] = [
  ['exp-groceries', ['boulangerie', 'boulanger patissier', 'patisserie', 'fournil', 'boucherie', 'charcuterie', 'fromagerie', 'primeur', 'epicerie', 'superette', 'supermarche', 'hypermarche', 'alimentation', 'marche', 'poissonnerie', 'traiteur', 'cave', 'drive', 'halles', 'bio']],
  ['exp-restaurant', ['restaurant', 'resto', 'brasserie', 'bistrot', 'bistro', 'pizzeria', 'pizza', 'sushi', 'kebab', 'tacos', 'burger', 'creperie', 'cafe', 'bar', 'pub', 'snack', 'grill', 'cantine', 'food', 'tapas', 'bagel', 'wok', 'thai', 'noodle', 'ramen', 'glacier', 'salon de the', 'coffee', 'lounge', 'beer', 'beers', 'chicken', 'sandwich', 'boucherie halal']],
  ['exp-health', ['pharmacie', 'medecin', 'docteur', 'dr', 'dentiste', 'dentaire', 'kine', 'kinesitherapeute', 'osteopathe', 'osteo', 'orthodontiste', 'podologue', 'psychologue', 'infirmier', 'hopital', 'clinique', 'chu', 'centre medical', 'radiologie', 'optique', 'opticien', 'veterinaire', 'clinique veterinaire']],
  ['exp-car', ['station', 'carburant', 'essence', 'gazole', 'parking', 'peage', 'autoroute', 'garage', 'carrosserie', 'pneus', 'pneu', 'controle technique', 'lavage', 'auto ecole', 'stationnement', 'horodateur', 'recharge']],
  ['exp-transport', ['taxi', 'vtc', 'bus', 'tram', 'metro', 'transport', 'trottinette', 'velo']],
  ['exp-shopping', ['coiffure', 'coiffeur', 'barbier', 'barber', 'esthetique', 'institut', 'onglerie', 'beaute', 'parfumerie', 'boutique', 'shop', 'store', 'mode', 'chaussures', 'bijouterie', 'librairie', 'papeterie', 'fleuriste', 'fleurs', 'bricolage', 'quincaillerie', 'meubles', 'deco', 'pressing', 'cordonnerie', 'tabac presse', 'presse']],
  ['exp-leisure', ['cinema', 'theatre', 'musee', 'concert', 'bowling', 'escape', 'piscine', 'patinoire', 'golf', 'fitness', 'salle de sport', 'gym', 'club', 'stade', 'billetterie', 'parc', 'zoo', 'laser', 'karting', 'jeux']],
  ['exp-travel', ['hotel', 'camping', 'gite', 'auberge', 'residence', 'voyages', 'aeroport', 'airlines', 'location vacances']],
  ['exp-education', ['ecole', 'college', 'lycee', 'universite', 'formation', 'cours', 'scolarite', 'cantine scolaire']],
  ['exp-childcare', ['creche', 'micro creche', 'garderie', 'centre de loisirs', 'assistante maternelle']],
  ['exp-housing', ['loyer', 'syndic', 'copropriete', 'charges locatives', 'agence immobiliere']],
  ['exp-insurance', ['assurance', 'assurances', 'prevoyance']],
  ['exp-loan', ['pret', 'emprunt', 'echeance pret', 'remboursement pret']],
  ['exp-smoking', ['tabac', 'civette', 'cigarette', 'vape', 'vapote']],
  ['exp-cash', ['retrait', 'retrait dab', 'retrait agence']],
];

/* ---------------- Correspondance ---------------- */

const pad = (s: string) => ` ${s} `;

const TRANSFER_RE = /\b(vir|virt|virement|virements|transfert)\b/;

function matchBrand(clean: string, rawNormalized = ''): Brand | null {
  // les noms en plusieurs mots (« restos du coeur ») se cherchent dans le libellé complet
  const text = pad(`${clean} | ${lightLabel(rawNormalized)}`.replace(/[^a-z0-9&| ]/g, ' ').replace(/\s+/g, ' '));
  // Dans un virement, le libellé contient souvent un nom de personne (« VIR PAUL DUPONT ») :
  // seuls les organismes payeurs et les noms d'enseigne longs sont retenus.
  const transfer = TRANSFER_RE.test(rawNormalized);
  const first = clean.split(' ')[0] ?? '';
  let best: Brand | null = null;
  let bestLen = 0;
  for (const b of BRANDS) {
    // organismes payeurs (CAF, CPAM, impôts…) : toujours reconnus, même dans un virement
    const payer = b.category.startsWith('inc-') || b.income !== undefined;
    for (const a of b.aliases) {
      if (a.length <= bestLen) continue;
      if (transfer && !payer && a.length < 6) continue;
      let hit: boolean;
      if (a.length <= 3) {
        // alias très courts (« bp », « h&m », « ter ») : seulement en tête de libellé
        hit = first === a || clean === a;
      } else {
        hit = text.includes(pad(a));
        // variantes en plusieurs mots : « mc donald s » = « mcdonalds », « basic fit » = « basicfit »
        if (!hit && a.length >= 6 && !a.includes(' ')) {
          let acc = '';
          for (const w of clean.split(' ')) {
            acc += w.replace(/[^a-z0-9]/g, '');
            if (acc === a) { hit = true; break; }
            if (acc.length >= a.length) break;
          }
        }
      }
      if (hit) {
        best = b;
        bestLen = a.length;
      }
    }
  }
  return best;
}

function matchKeyword(clean: string): string | null {
  const text = pad(clean);
  let best: string | null = null;
  let bestLen = 0;
  for (const [cat, words] of KEYWORDS) {
    for (const w of words) {
      if (w.length > bestLen && text.includes(pad(w))) {
        best = cat;
        bestLen = w.length;
      }
    }
  }
  return best;
}

/** Clé de marchand pour l'apprentissage : deux premiers mots significatifs du libellé nettoyé. */
export function merchantId(label: string): string {
  return cleanLabel(label).split(' ').slice(0, 2).join(' ');
}

/** Mémoire des choix de l'utilisateur : marchand → catégorie la plus fréquente. */
export function learnMerchants(txs: Transaction[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const t of txs) {
    if (!t.categoryId || t.transferId) continue;
    const k = `${merchantId(t.label)}|${t.amount < 0 ? '-' : '+'}`;
    if (k.length < 4) continue;
    const m = counts.get(k) ?? new Map<string, number>();
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    counts.set(k, m);
  }
  const out = new Map<string, string>();
  for (const [k, m] of counts) {
    const [cat] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    out.set(k, cat);
  }
  return out;
}

export interface Classification {
  categoryId: string | null;
  source: 'regle' | 'appris' | 'enseigne' | 'mot-cle' | null;
  /** Nom de l'enseigne reconnue (pour l'affichage). */
  merchant: string | null;
}

/** Règles fournies avec l'application (et non créées par l'utilisateur). */
export const isDefaultRule = (r: Rule) => /^r(\d+|-smoke-\d+|-v3-\d+)$/.test(r.id);

export function ruleMatch(label: string, rules: Rule[]): string | null {
  const l = ` ${normalize(label).replace(/[*/_\-]/g, ' ')} `;
  let best: Rule | null = null;
  let bestLen = 0;
  for (const r of rules) {
    const p = normalize(r.pattern);
    if (!p) continue;
    const needle = ` ${p}${r.pattern.endsWith(' ') ? ' ' : ''}`;
    if (l.includes(needle) && p.length > bestLen) {
      best = r;
      bestLen = p.length;
    }
  }
  return best?.categoryId ?? null;
}

/**
 * Catégorise une opération. `userRules` sont les règles créées par l'utilisateur
 * (prioritaires) ; `defaultRules` les règles fournies avec l'application.
 */
export function classify(
  label: string,
  amount: number,
  opts: { userRules?: Rule[]; defaultRules?: Rule[]; memory?: Map<string, string> } = {},
): Classification {
  const clean = cleanLabel(label);
  const brand = matchBrand(clean, normalize(label));
  const merchant = brand?.name ?? null;

  const fromUser = opts.userRules?.length ? ruleMatch(label, opts.userRules) : null;
  if (fromUser) return { categoryId: fromUser, source: 'regle', merchant };

  const learned = opts.memory?.get(`${merchantId(label)}|${amount < 0 ? '-' : '+'}`);
  if (learned) return { categoryId: learned, source: 'appris', merchant };

  if (brand) {
    if (amount > 0) {
      return { categoryId: brand.income ?? (brand.category.startsWith('inc-') ? brand.category : 'inc-refund'), source: 'enseigne', merchant };
    }
    if (!brand.category.startsWith('inc-')) return { categoryId: brand.category, source: 'enseigne', merchant };
  }

  const fromDefault = opts.defaultRules?.length ? ruleMatch(label, opts.defaultRules) : null;
  if (fromDefault) {
    // un crédit chez un commerçant ou un organisme est un remboursement
    const refund = amount > 0 && fromDefault.startsWith('exp-');
    return { categoryId: refund ? 'inc-refund' : fromDefault, source: 'regle', merchant };
  }

  const kw = matchKeyword(clean);
  if (kw && (amount < 0 || kw.startsWith('inc-'))) return { categoryId: kw, source: 'mot-cle', merchant };

  return { categoryId: null, source: null, merchant };
}

/** Nom lisible du marchand : enseigne reconnue, sinon libellé nettoyé en casse de titre. */
export function displayMerchant(label: string): string {
  const clean = cleanLabel(label);
  const brand = matchBrand(clean, normalize(label));
  if (brand) return brand.name;
  const words = clean.split(' ').slice(0, 4).join(' ');
  return words.replace(/\b[a-z]/g, (c) => c.toUpperCase()) || label;
}
