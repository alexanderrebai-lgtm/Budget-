/** Montants stockés en centimes (entiers) pour éviter les erreurs d'arrondi. */
export type Cents = number;
/** Date au format AAAA-MM-JJ. */
export type ISODate = string;

export type AccountType =
  | 'courant'
  | 'livret'
  | 'epargne'
  | 'pea'
  | 'assurance_vie'
  | 'per'
  | 'cto'
  | 'crypto'
  | 'immobilier'
  | 'credit'
  | 'autre';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Solde à la date d'ouverture du suivi. */
  openingBalance: Cents;
  /** Valorisation saisie à la main (placements, immobilier). Remplace le calcul. */
  valuation?: Cents;
  valuationDate?: ISODate;
  archived?: boolean;
}

export type CategoryKind = 'income' | 'expense' | 'transfer';
/** Classement 50/30/20. */
export type NeedGroup = 'besoins' | 'envies' | 'epargne';
/** Étiquette fiscale : la catégorie alimente le simulateur d'impôt. */
export type TaxTag =
  | 'salaire'
  | 'don_aide'
  | 'don'
  | 'emploi_domicile'
  | 'garde_enfant'
  | 'per'
  | 'syndicat'
  | 'loyer_percu'
  | 'charges_locatives'
  | 'dividendes'
  | 'interets';

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  group?: NeedGroup;
  taxTag?: TaxTag;
}

export interface Transaction {
  id: string;
  date: ISODate;
  /** Négatif = dépense, positif = revenu. */
  amount: Cents;
  label: string;
  accountId: string;
  categoryId: string | null;
  notes?: string;
  /** Empreinte utilisée pour éviter les doublons à l'import. */
  importHash?: string;
}

export interface Budget {
  categoryId: string;
  monthly: Cents;
}

export interface Rule {
  id: string;
  /** Texte recherché dans le libellé (insensible à la casse et aux accents). */
  pattern: string;
  categoryId: string;
}

export interface Goal {
  id: string;
  name: string;
  icon: string;
  target: Cents;
  /** Compte dont le solde mesure l'avancement (sinon montant manuel). */
  accountId?: string;
  saved: Cents;
  deadline?: ISODate;
}

export interface NetWorthSnapshot {
  month: string; // AAAA-MM
  value: Cents;
}

export interface CsvMapping {
  delimiter: string;
  dateColumn: string;
  labelColumn: string;
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  dateFormat: 'dd/mm/yyyy' | 'yyyy-mm-dd' | 'mm/dd/yyyy';
}

export interface Settings {
  /** Jour de début du mois budgétaire (jour de paie). */
  monthStartDay: number;
  theme: 'system' | 'light' | 'dark';
  onboarded: boolean;
}
