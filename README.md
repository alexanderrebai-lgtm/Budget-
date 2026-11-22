# Cap Budget

Application de suivi de budget et d'optimisation fiscale pour les particuliers en France, disponible :
- en **version web** installable sur téléphone (iPhone, Android) et ordinateur, utilisable hors ligne ;
- en **logiciel PC** (Windows, macOS, Linux).

Les données sont stockées sur l'appareil. Une **synchronisation entre appareils** facultative (compte e-mail,
chiffrement de bout en bout au choix) s'appuie sur Supabase.

## Fonctionnalités

**Budget**
- Comptes multiples, opérations avec recherche, filtres, sélection multiple, export CSV
- **Connexion directe aux banques** (comme Bankin') via l'agrégateur agréé Enable Banking (DSP2) : choix de la banque, authentification chez la banque, import automatique des opérations (90 jours puis mises à jour toutes les 6 h), solde aligné sur celui de la banque, accès en lecture seule révocable
- Import de relevés bancaires :
  - **CSV** (séparateur `;` ou `,`, colonne signée ou débit/crédit, UTF-8 ou Windows-1252, préambule ignoré) ;
  - **OFX / QFX** et **QIF** (exports « Money » / « Quicken ») ;
  - **PDF** : lecture du relevé mensuel (dates, libellés sur plusieurs lignes, sens débit/crédit d'après les colonnes, relevés à cheval sur deux années) avec aperçu corrigeable ;
  - **plusieurs fichiers à la fois** (sélection multiple ou glisser-déposer), avec suppression des opérations communes à des relevés qui se chevauchent ;
  - dédoublonnage à la réimportation
- **Reconnaissance des enseignes**, 100 % locale : nettoyage du libellé (CB, PRLV, dates, cartes masquées, références), base d'environ 350 enseignes françaises avec leurs variantes d'écriture, mots-clés de type de commerce (boulangerie, pharmacie, pizzeria, garage…), apprentissage à partir de vos propres choix, nom de l'enseigne affiché dans la liste ; ordre de décision : vos règles → vos choix passés → enseigne → règles fournies → type de commerce
- Création de règle en un clic, rapprochement des virements entre vos comptes
- Budgets mensuels par catégorie, avec proposition d'après la moyenne des 3 derniers mois
- Pause avant achat : une envie est notée avec son prix, un délai de réflexion (24 h à 30 jours, suggéré selon le prix) et une notification à la fin ; l'argent gardé grâce aux envies abandonnées est suivi. Chaque dépense peut être classée Besoin ou Envie, indépendamment de sa catégorie
- Détection automatique des abonnements et prélèvements récurrents (coût annuel, prochaine échéance)
- Tableau de bord : revenus/dépenses sur 6 mois, répartition, règle 50/30/20, alertes ; vue « foyer » ou « ma part » (comptes joints comptés à leur quote-part)
- Prévision de trésorerie à 30/90/180 jours (prélèvements et revenus détectés, dépenses courantes lissées), alerte de découvert, calendrier des échéances
- Provisions pour les dépenses annuelles (assurance, vacances, Noël…)

**Patrimoine**
- Comptes, livrets, PEA, assurance-vie, PER, immobilier, crédits ; historique mensuel du patrimoine net
- Objectifs d'épargne (effort mensuel calculé selon l'échéance)
- Liberté financière : capital cible (taux de retrait), date d'indépendance d'après vos données, leviers d'accélération, couverture des dépenses par les revenus passifs, comparatif de 11 sources de revenus passifs
- Remboursement des dettes (avalanche ou boule de neige) et impact des frais de gestion de vos placements
- Simulateurs : comparaison des enveloppes après impôts (livret, CTO, PEA, assurance-vie, PER), capacité d'emprunt (norme HCSF 35 %), rendement et cash-flow d'un investissement locatif

**Fiscalité** (impôt 2026 sur les revenus 2025)
- Barème, quotient familial et son plafonnement, parent isolé, garde alternée, décote
- Salaires (abattement 10 % ou frais réels), pensions, micro-entreprise (avec versement libératoire)
- Revenus fonciers (micro/réel, déficit foncier imputable), LMNP (micro-BIC/réel), revenus de capitaux (PFU ou barème)
- PER avec plafonds et mutualisation dans le couple, pensions alimentaires, dons, emploi à domicile, garde d'enfants, scolarité, IR-PME, cotisations syndicales, plafonnement des niches, CEHR
- Choix automatique des régimes les plus avantageux, taux marginal réel (effets de la décote inclus), solde après prélèvement à la source
- Leviers d'optimisation chiffrés en relançant le calcul complet, calculateur de frais réels (barème kilométrique)
- Pré-remplissage depuis les opérations grâce aux étiquettes fiscales des catégories
- Guide de 27 leviers (impôt, placements, revenus, dépenses, transmission), revenus exonérés par la loi, repères sur la limite entre optimisation, abus de droit et fraude, calendrier fiscal

**Analyse par l'IA (logiciel PC)**
- Claude analyse vos dépenses et répond à vos questions (économies chiffrées, abonnements à revoir, budgets proposés)
- Connexion à votre compte Claude (abonnement Pro ou Max) par le SDK officiel Claude Agent et le moteur Claude Code embarqué, comme Jarvis ; ou clé API facultative, chiffrée par le système
- Claude reçoit un résumé chiffré (moyennes, catégories, enseignes, prélèvements), jamais les libellés bruts ; nom du titulaire et références bancaires retirés ; aucun outil autorisé

**Bilan express (tableau de bord)**
- Diagnostic immédiat sans rien demander : note de santé financière sur 100 (taux d'épargne, épargne de précaution, charges fixes, évolution des dépenses, dettes), synthèse en quelques phrases, 4 signaux prioritaires et prochaine étape
- Prise en compte de la conjoncture (`src/lib/conjoncture.ts`, mise à jour à chaque version) : inflation, prix de l'énergie, taux des livrets, taux de crédit ; perte de pouvoir d'achat de l'épargne en euros, dépenses comparées à l'inflation
- Logiciel PC : « le mot de Claude », commentaire personnalisé rédigé automatiquement une fois par jour (désactivable)

**Estimations et tableau de bord**
- Estimation mensuelle et annuelle des revenus, dépenses (fixes et variables), reste et épargne, tous comptes confondus, virements internes exclus, par catégorie et par compte (moyenne sur 3, 6 ou 12 mois)
- Tableau de bord : mois en cours avec projection de fin de mois, patrimoine et épargne de précaution, estimations, 12 derniers mois, répartition, comptes, prélèvements, budgets, points d'attention

**Fiabilité et sécurité**
- Données dans IndexedDB (plus de limite de ~5 Mo), migration automatique depuis localStorage
- Sauvegardes automatiques : une copie par jour (14 jours) et avant chaque action risquée, restaurables en un clic ; le logiciel PC écrit aussi un fichier par jour dans `Documents/Cap Budget/Sauvegardes` (30 jours)
- Mises à jour automatiques du logiciel PC (Windows et Linux ; simple avertissement sur macOS, l'installation automatique exigeant une application signée)
- Rappels par notification : gros prélèvement dans les 3 jours, découvert prévu, budget presque atteint ou dépassé
- Conjoncture à jour : inflation, énergie et inflation sous-jacente chargées depuis Eurostat (cache 24 h) ; taux des livrets et du crédit lus dans `public/conjoncture.json`
- Politique de sécurité du contenu (CSP) ; la phrase de chiffrement n'est plus stockée : seule une clé non exportable, propre au compte, est gardée dans IndexedDB

**Synchronisation et installation**
- Compte e-mail / mot de passe, synchronisation automatique (après chaque modification, au retour sur l'application, toutes les minutes)
- Fusion à trois voies : des modifications faites hors ligne sur plusieurs appareils sont combinées sans perte
- Chiffrement de bout en bout facultatif (AES-GCM 256, clé dérivée d'une phrase secrète par PBKDF2) : le serveur ne voit que des données chiffrées
- PWA : installable, hors ligne, mises à jour automatiques ; logiciel PC Electron avec installateurs

## Démarrer

```bash
npm install
npm run dev      # serveur de développement
npm test         # tests unitaires (moteur fiscal, import CSV, détection des récurrences)
npm run build    # build statique dans dist/ (déployable sur n'importe quel hébergeur statique)
npm run desktop  # lance le logiciel PC (Electron) sur la version compilée
npm run dist:desktop  # fabrique l'installateur pour le système courant (dossier release/)
```

## Publier

- **Version web** (`.github/workflows/pages.yml`) : publiée sur GitHub Pages à chaque mise à jour de `main`.
  Activer une fois *Settings → Pages → Source : GitHub Actions*. L'adresse obtenue s'ouvre sur téléphone pour installer l'application.
- **Logiciel PC** (`.github/workflows/desktop.yml`) : pousser un tag (`git tag v1.0.0 && git push origin v1.0.0`) génère
  les installateurs Windows, macOS et Linux et les publie dans une version GitHub. Ils ne sont pas signés : Windows et macOS
  affichent un avertissement au premier lancement.

## Synchronisation (Supabase)

Le projet Supabase est configuré dans `.env` (URL et clé *publishable*, publiques par conception ; l'accès aux données est
protégé par la sécurité au niveau des lignes). Le schéma est dans `supabase/migrations/` : une table `vaults` (un document
par utilisateur, révision pour le contrôle de concurrence) et une fonction `push_vault` qui refuse une écriture basée sur une
version périmée ; le client fusionne alors puis réessaie. Un autre projet peut être utilisé depuis *Réglages → Paramètres avancés*.

Dans le tableau de bord Supabase, *Authentication → URL Configuration* : renseigner l'adresse de la version web comme
*Site URL* pour que les liens de confirmation et de réinitialisation du mot de passe y mènent.

## Connexion bancaire (Enable Banking)

La fonction Supabase `bank` (`supabase/functions/bank`) détient la clé privée de l'agrégateur, signe les requêtes
(JWT RS256) et relaie les opérations sans les stocker. Tables : `bank_auths` (autorisations en cours, accès serveur
uniquement) et `bank_connections` (sessions, lisibles par leur seul propriétaire).

Mise en service, une fois :
1. Créer un compte sur enablebanking.com, puis une application **Production** dont l'adresse de retour est
   `https://<projet>.supabase.co/functions/v1/bank/callback`. Générer la clé dans le navigateur et télécharger la clé privée.
2. « Activer en reliant des comptes » : relier tous les comptes à suivre (mode restreint, gratuit pour un usage personnel).
3. Dans Supabase → Edge Functions → Secrets : `ENABLE_BANKING_APP_ID` et `ENABLE_BANKING_PRIVATE_KEY` (contenu du fichier PEM).

Les banques limitent l'historique à environ 90 jours et les consultations automatiques à environ 4 par jour ;
l'accès doit être renouvelé au plus tard tous les 180 jours.

## Structure

```
src/
  lib/merchants.ts  moteur de reconnaissance des enseignes
  tax/        params.ts (paramètres par année), engine.ts (calcul), optimizer.ts (leviers)
  lib/        types, formatage, import CSV, analyses, simulateurs, contenu du guide, démo
  store/      état persistant (zustand + localStorage, fusion des schémas)
  sync/       synchronisation : moteur, fusion à trois voies, chiffrement, stockage IndexedDB
  bank/       client de la connexion bancaire
  pages/      une page par écran
  components/ composants d'interface partagés
electron/     processus principal du logiciel PC
supabase/     migrations SQL et fonction serveur « bank »
```

Pour une nouvelle année fiscale, ajouter un objet `TaxYearParams` dans `src/tax/params.ts` et mettre à jour `CURRENT_PARAMS`.

## Avertissement

Les calculs sont des estimations fondées sur la loi de finances 2026. Certains montants (abattement pensions,
plafond de pension alimentaire) sont des valeurs 2025 revalorisées de 0,9 % et doivent être vérifiés.
Cas non modélisés : revenus exceptionnels (système du quotient), plus-values immobilières, CDHR, réductions
d'investissement locatif, BIC/BNC au réel. Vérifiez avec le simulateur officiel d'impots.gouv.fr.

## Analyse par l'IA

Dans le logiciel PC, `electron/ai.cjs` pilote le moteur Claude Code embarqué (`@anthropic-ai/claude-agent-sdk`, binaire de la
plateforme décompressé hors de l'archive asar). Sans clé, il utilise la connexion au compte Claude faite une fois via
« Se connecter à Claude » ; avec une clé API (console.anthropic.com), il l'utilise à la place, facturée à l'usage.
La page n'a accès qu'au pont `window.capBudgetDesktop.ai` (preload, isolation de contexte).

À savoir : les conditions d'Anthropic prévoient la connexion par abonnement pour l'usage personnel de Claude Code et du SDK
Agent, et une clé API pour les produits destinés à d'autres. Pour une diffusion de l'application à d'autres utilisateurs,
privilégier la clé API.
