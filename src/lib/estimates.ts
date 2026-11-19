/**
 * Estimation des revenus et dépenses mensuels et annuels, tous comptes confondus.
 *
 * Base : les N derniers mois complets d'historique (le mois en cours, incomplet,
 * est exclu). Les virements entre vos comptes et les mouvements d'épargne ne
 * comptent ni en revenu ni en dépense : ils sont présentés à part.
 */
import { detectRecurring } from './analysis';
import { addMonths, monthKey } from './format';
import type { Account, Category, Cents, Provision, Transaction } from './types';

export interface CategoryEstimate {
  categoryId: string | null;
  /** Moyenne mensuelle (centimes, positive). */
  monthly: Cents;
  annual: Cents;
  /** Part des mois de la période où la catégorie apparaît (régularité). */
  frequency: number;
}

export interface AccountEstimate {
  accountId: string;
  income: Cents;
  expense: Cents;
}

export interface Estimates {
  months: string[];
  /** Nombre de mois réellement couverts par l'historique. */
  coveredMonths: number;
  income: { monthly: Cents; annual: Cents; byCategory: CategoryEstimate[] };
  expense: { monthly: Cents; annual: Cents; fixedMonthly: Cents; variableMonthly: Cents; byCategory: CategoryEstimate[] };
  savings: { monthly: Cents; annual: Cents };
  /** Revenus - dépenses. */
  balance: { monthly: Cents; annual: Cents };
  savingsRate: number;
  provisions: { monthly: Cents; annual: Cents };
  byAccount: AccountEstimate[];
  /** Montants mensuels réels de la période, pour les graphiques. */
  history: { month: string; income: Cents; expense: Cents }[];
}

export function computeEstimates(
  txs: Transaction[],
  categories: Map<string, Category>,
  accounts: Account[],
  provisions: Provision[],
  currentMonth: string,
  windowMonths = 12,
): Estimates {
  const months = Array.from({ length: windowMonths }, (_, i) => addMonths(currentMonth, i - windowMonths));
  const monthSet = new Set(months);
  const inWindow = txs.filter((t) => monthSet.has(monthKey(t.date)));

  // Mois effectivement couverts : du premier mois avec des opérations à la fin de la fenêtre.
  const firstSeen = inWindow.reduce<string | null>((m, t) => (!m || monthKey(t.date) < m ? monthKey(t.date) : m), null);
  const covered = firstSeen ? months.filter((m) => m >= firstSeen) : [];
  const n = Math.max(1, covered.length);

  const incomeBy = new Map<string | null, { total: Cents; months: Set<string> }>();
  const expenseBy = new Map<string | null, { total: Cents; months: Set<string> }>();
  const accountTotals = new Map<string, AccountEstimate>();
  const history = new Map<string, { month: string; income: Cents; expense: Cents }>(covered.map((m) => [m, { month: m, income: 0, expense: 0 }]));
  let saved = 0;

  for (const t of inWindow) {
    const m = monthKey(t.date);
    if (!history.has(m)) continue;
    const cat = t.categoryId ? categories.get(t.categoryId) : undefined;
    if (t.transferId || cat?.kind === 'transfer') {
      if (cat?.group === 'epargne' && t.amount < 0) saved += -t.amount;
      continue;
    }
    const acc = accountTotals.get(t.accountId) ?? { accountId: t.accountId, income: 0, expense: 0 };
    const h = history.get(m)!;
    const key = t.categoryId ?? null;
    if (t.amount > 0) {
      const e = incomeBy.get(key) ?? { total: 0, months: new Set<string>() };
      e.total += t.amount;
      e.months.add(m);
      incomeBy.set(key, e);
      acc.income += t.amount;
      h.income += t.amount;
    } else {
      const e = expenseBy.get(key) ?? { total: 0, months: new Set<string>() };
      e.total += -t.amount;
      e.months.add(m);
      expenseBy.set(key, e);
      acc.expense += -t.amount;
      h.expense += -t.amount;
    }
    accountTotals.set(t.accountId, acc);
  }

  const toList = (map: Map<string | null, { total: Cents; months: Set<string> }>): CategoryEstimate[] =>
    [...map.entries()]
      .map(([categoryId, v]) => ({
        categoryId,
        monthly: Math.round(v.total / n),
        annual: Math.round((v.total / n) * 12),
        frequency: v.months.size / n,
      }))
      .sort((a, b) => b.monthly - a.monthly);

  const incomeList = toList(incomeBy);
  const expenseList = toList(expenseBy);
  const incomeMonthly = incomeList.reduce((s, c) => s + c.monthly, 0);
  const expenseMonthly = expenseList.reduce((s, c) => s + c.monthly, 0);

  // Charges fixes : prélèvements récurrents détectés (hors virements), ramenés au mois.
  const recurring = detectRecurring(inWindow).filter((r) => {
    if (r.isIncome) return false;
    const c = r.categoryId ? categories.get(r.categoryId) : undefined;
    return c?.kind !== 'transfer';
  });
  const fixedMonthly = Math.min(expenseMonthly, Math.round(recurring.reduce((s, r) => s + r.annualCost, 0) / 12));

  const provisionsAnnual = provisions.reduce((s, p) => s + p.amount, 0);

  return {
    months: covered,
    coveredMonths: covered.length,
    income: { monthly: incomeMonthly, annual: incomeMonthly * 12, byCategory: incomeList },
    expense: {
      monthly: expenseMonthly,
      annual: expenseMonthly * 12,
      fixedMonthly,
      variableMonthly: expenseMonthly - fixedMonthly,
      byCategory: expenseList,
    },
    savings: { monthly: Math.round(saved / n), annual: Math.round((saved / n) * 12) },
    balance: { monthly: incomeMonthly - expenseMonthly, annual: (incomeMonthly - expenseMonthly) * 12 },
    savingsRate: incomeMonthly > 0 ? (incomeMonthly - expenseMonthly) / incomeMonthly : 0,
    provisions: { monthly: Math.round(provisionsAnnual / 12), annual: provisionsAnnual },
    byAccount: accounts
      .map((a) => accountTotals.get(a.id) ?? { accountId: a.id, income: 0, expense: 0 })
      .map((a) => ({ ...a, income: Math.round(a.income / n), expense: Math.round(a.expense / n) }))
      .filter((a) => a.income || a.expense),
    history: [...history.values()],
  };
}
