# Cap Budget

Application web de suivi de budget et d'optimisation fiscale pour les particuliers en France.
Aucun serveur ni compte : toutes les données restent dans le navigateur (localStorage), avec export/import JSON.

## Fonctionnalités

**Budget**
- Comptes multiples, opérations avec recherche, filtres, sélection multiple, export CSV
- Import de relevés bancaires CSV (séparateur `;` ou `,`, colonne signée ou débit/crédit, encodage UTF-8 ou Windows-1252, lignes de préambule ignorées), dédoublonnage à la réimportation
- Catégorisation automatique par règles (une centaine de marchands français préconfigurés), création de règle en un clic
- Budgets mensuels par catégorie, avec proposition d'après la moyenne des 3 derniers mois
- Détection automatique des abonnements et prélèvements récurrents (coût annuel, prochaine échéance)
- Tableau de bord : revenus/dépenses sur 6 mois, répartition, règle 50/30/20, alertes

**Patrimoine**
- Comptes, livrets, PEA, assurance-vie, PER, immobilier, crédits ; historique mensuel du patrimoine net
- Objectifs d'épargne (effort mensuel calculé selon l'échéance)
- Simulateurs : comparaison des enveloppes après impôts (livret, CTO, PEA, assurance-vie, PER), capacité d'emprunt (norme HCSF 35 %), rendement et cash-flow d'un investissement locatif

**Fiscalité** (impôt 2026 sur les revenus 2025)
- Barème, quotient familial et son plafonnement, parent isolé, garde alternée, décote
- Salaires (abattement 10 % ou frais réels), pensions, micro-entreprise (avec versement libératoire)
- Revenus fonciers (micro/réel, déficit foncier imputable), LMNP (micro-BIC/réel), revenus de capitaux (PFU ou barème)
- PER avec plafonds et mutualisation dans le couple, pensions alimentaires, dons, emploi à domicile, garde d'enfants, scolarité, IR-PME, cotisations syndicales, plafonnement des niches, CEHR
- Choix automatique des régimes les plus avantageux, taux marginal réel (effets de la décote inclus), solde après prélèvement à la source
- Leviers d'optimisation chiffrés en relançant le calcul complet, calculateur de frais réels (barème kilométrique)
- Pré-remplissage depuis les opérations grâce aux étiquettes fiscales des catégories
- Guide de 27 leviers (impôt, placements, revenus, dépenses, transmission) et calendrier fiscal

## Démarrer

```bash
npm install
npm run dev      # serveur de développement
npm test         # tests unitaires (moteur fiscal, import CSV, détection des récurrences)
npm run build    # build statique dans dist/ (déployable sur n'importe quel hébergeur statique)
```

## Structure

```
src/
  tax/        params.ts (paramètres par année), engine.ts (calcul), optimizer.ts (leviers)
  lib/        types, formatage, import CSV, analyses, simulateurs, contenu du guide, démo
  store/      état persistant (zustand + localStorage, fusion des schémas)
  pages/      une page par écran
  components/ composants d'interface partagés
```

Pour une nouvelle année fiscale, ajouter un objet `TaxYearParams` dans `src/tax/params.ts` et mettre à jour `CURRENT_PARAMS`.

## Avertissement

Les calculs sont des estimations fondées sur la loi de finances 2026. Certains montants (abattement pensions,
plafond de pension alimentaire) sont des valeurs 2025 revalorisées de 0,9 % et doivent être vérifiés.
Cas non modélisés : revenus exceptionnels (système du quotient), plus-values immobilières, CDHR, réductions
d'investissement locatif, BIC/BNC au réel. Vérifiez avec le simulateur officiel d'impots.gouv.fr.
