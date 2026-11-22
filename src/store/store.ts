import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { indexedDbStorage } from './storage';
import { categorize } from '../lib/analysis';
import { classify, isDefaultRule, learnMerchants } from '../lib/merchants';
import { findTransferPairs, looksLikeTransfer, ownerVariants, TRANSFER_CATEGORY } from '../lib/transfers';
import { importHash, type ImportedRow } from '../lib/csv';
import { DEFAULT_CATEGORIES, DEFAULT_RULES, SMOKING_RULES, V3_RULES } from '../lib/defaults';
import { normalize, toCents, uid } from '../lib/format';
import type {
  Account,
  Budget,
  Category,
  CsvMapping,
  Goal,
  NetWorthSnapshot,
  Pause,
  Provision,
  Rule,
  Settings,
  Transaction,
} from '../lib/types';
import { emptyProfile, type TaxProfile } from '../tax/engine';

export interface Data {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  rules: Rule[];
  goals: Goal[];
  snapshots: NetWorthSnapshot[];
  provisions: Provision[];
  pauses: Pause[];
  taxProfile: TaxProfile;
  csvMapping: CsvMapping | null;
  settings: Settings;
}

interface Actions {
  addAccount: (a: Omit<Account, 'id'>) => string;
  updateAccount: (id: string, patch: Partial<Account>) => void;
  deleteAccount: (id: string) => void;

  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  deleteTransactions: (ids: string[]) => void;
  setCategoryFor: (ids: string[], categoryId: string | null) => void;
  importRows: (rows: ImportedRow[], accountId: string) => { added: number; duplicates: number; transfers: number };
  /** Rapproche les virements entre vos comptes ; renvoie le nombre de paires trouvées. */
  linkTransfers: () => number;
  unlinkTransfer: (transferId: string) => void;

  addCategory: (c: Omit<Category, 'id'>) => void;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  setBudget: (categoryId: string, monthly: number) => void;

  addRule: (pattern: string, categoryId: string, applyToExisting: boolean) => number;
  deleteRule: (id: string) => void;
  recategorizeUncategorized: () => number;

  addGoal: (g: Omit<Goal, 'id'>) => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;

  addProvision: (p: Omit<Provision, 'id'>) => void;
  updateProvision: (id: string, patch: Partial<Provision>) => void;
  deleteProvision: (id: string) => void;

  addPause: (p: Omit<Pause, 'id' | 'createdAt' | 'status'>) => string;
  decidePause: (id: string, status: Pause['status']) => void;
  updatePause: (id: string, patch: Partial<Pause>) => void;
  deletePause: (id: string) => void;

  recordSnapshot: (month: string, value: number) => void;
  setTaxProfile: (p: TaxProfile) => void;
  setCsvMapping: (m: CsvMapping) => void;
  updateSettings: (s: Partial<Settings>) => void;

  replaceAll: (d: Data) => void;
  reset: () => void;
}

export const initialData = (): Data => ({
  accounts: [],
  transactions: [],
  categories: DEFAULT_CATEGORIES,
  budgets: [],
  rules: DEFAULT_RULES,
  goals: [],
  snapshots: [],
  provisions: [],
  pauses: [],
  taxProfile: emptyProfile(),
  csvMapping: null,
  settings: { monthStartDay: 1, theme: 'system', onboarded: false },
});

export const SCHEMA_VERSION = 6;

export const useStore = create<Data & Actions>()(
  persist(
    (set, get) => ({
      ...initialData(),

      addAccount: (a) => {
        const id = uid();
        set((s) => ({ accounts: [...s.accounts, { ...a, id }] }));
        return id;
      },
      updateAccount: (id, patch) =>
        set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      deleteAccount: (id) =>
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          transactions: s.transactions.filter((t) => t.accountId !== id),
          goals: s.goals.map((g) => (g.accountId === id ? { ...g, accountId: undefined } : g)),
        })),

      addTransaction: (t) => set((s) => ({ transactions: [{ ...t, id: uid() }, ...s.transactions] })),
      updateTransaction: (id, patch) =>
        set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      deleteTransactions: (ids) => {
        const del = new Set(ids);
        set((s) => ({ transactions: s.transactions.filter((t) => !del.has(t.id)) }));
      },
      setCategoryFor: (ids, categoryId) => {
        const sel = new Set(ids);
        set((s) => ({ transactions: s.transactions.map((t) => (sel.has(t.id) ? { ...t, categoryId } : t)) }));
      },
      importRows: (rows, accountId) => {
        const existing = new Set(get().transactions.map((t) => t.importHash).filter(Boolean));
        const seen = new Map<string, number>();
        const ctx = classifierContext(get());
        const fresh: Transaction[] = [];
        let duplicates = 0;
        for (const row of rows) {
          const base = importHash(row, accountId, 0);
          const n = seen.get(base) ?? 0;
          seen.set(base, n + 1);
          const hash = importHash(row, accountId, n);
          if (existing.has(hash)) {
            duplicates++;
            continue;
          }
          fresh.push({
            id: uid(),
            date: row.date,
            amount: toCents(row.amount),
            label: row.label,
            accountId,
            categoryId: classify(row.label, row.amount, ctx).categoryId,
            importHash: hash,
          });
        }
        set((s) => ({ transactions: [...fresh, ...s.transactions] }));
        const transfers = fresh.length ? get().linkTransfers() : 0;
        return { added: fresh.length, duplicates, transfers };
      },
      linkTransfers: () => {
        const owners = ownerVariants(get().settings.ownerName ?? '');
        const pairs = findTransferPairs(get().transactions, owners);
        const link = new Map<string, string>();
        for (const p of pairs) {
          const id = uid();
          link.set(p.debitId, id);
          link.set(p.creditId, id);
        }
        set((s) => ({
          transactions: s.transactions.map((t) => {
            const tid = link.get(t.id);
            if (tid) return { ...t, transferId: tid, categoryId: TRANSFER_CATEGORY };
            // virement à votre nom vers un compte non suivi dans l'application
            if (!t.categoryId && owners.length && looksLikeTransfer(t.label, []) && owners.some((n) => ` ${normalize(t.label)} `.includes(` ${n} `))) {
              return { ...t, categoryId: TRANSFER_CATEGORY };
            }
            return t;
          }),
        }));
        return pairs.length;
      },
      unlinkTransfer: (transferId) =>
        set((s) => ({ transactions: s.transactions.map((t) => (t.transferId === transferId ? { ...t, transferId: undefined } : t)) })),

      addCategory: (c) => set((s) => ({ categories: [...s.categories, { ...c, id: uid() }] })),
      updateCategory: (id, patch) =>
        set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      deleteCategory: (id) =>
        set((s) => ({
          categories: s.categories.filter((c) => c.id !== id),
          transactions: s.transactions.map((t) => (t.categoryId === id ? { ...t, categoryId: null } : t)),
          budgets: s.budgets.filter((b) => b.categoryId !== id),
          rules: s.rules.filter((r) => r.categoryId !== id),
        })),

      setBudget: (categoryId, monthly) =>
        set((s) => {
          const others = s.budgets.filter((b) => b.categoryId !== categoryId);
          return { budgets: monthly > 0 ? [...others, { categoryId, monthly }] : others };
        }),

      addRule: (pattern, categoryId, applyToExisting) => {
        const rule: Rule = { id: uid(), pattern, categoryId };
        let changed = 0;
        set((s) => {
          const rules = [...s.rules, rule];
          if (!applyToExisting) return { rules };
          const transactions = s.transactions.map((t) => {
            if (t.categoryId) return t;
            const c = categorize(t.label, [rule]);
            if (!c) return t;
            changed++;
            return { ...t, categoryId: c };
          });
          return { rules, transactions };
        });
        return changed;
      },
      deleteRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      recategorizeUncategorized: () => {
        let changed = 0;
        const ctx = classifierContext(get());
        set((s) => ({
          transactions: s.transactions.map((t) => {
            if (t.categoryId) return t;
            const c = classify(t.label, t.amount, ctx).categoryId;
            if (!c) return t;
            changed++;
            return { ...t, categoryId: c };
          }),
        }));
        return changed;
      },

      addGoal: (g) => set((s) => ({ goals: [...s.goals, { ...g, id: uid() }] })),
      updateGoal: (id, patch) => set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
      deleteGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      addProvision: (p) => set((s) => ({ provisions: [...s.provisions, { ...p, id: uid() }] })),
      updateProvision: (id, patch) => set((s) => ({ provisions: s.provisions.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      deleteProvision: (id) => set((s) => ({ provisions: s.provisions.filter((p) => p.id !== id) })),

      addPause: (p) => {
        const id = uid();
        set((s) => ({ pauses: [{ ...p, id, createdAt: new Date().toISOString(), status: 'waiting' }, ...s.pauses] }));
        return id;
      },
      decidePause: (id, status) =>
        set((s) => ({
          pauses: s.pauses.map((p) => (p.id === id ? { ...p, status, decidedAt: status === 'waiting' ? undefined : new Date().toISOString() } : p)),
        })),
      updatePause: (id, patch) => set((s) => ({ pauses: s.pauses.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      deletePause: (id) => set((s) => ({ pauses: s.pauses.filter((p) => p.id !== id) })),

      recordSnapshot: (month, value) =>
        set((s) => {
          const prev = s.snapshots.find((x) => x.month === month);
          if (prev?.value === value) return {};
          return {
            snapshots: [...s.snapshots.filter((x) => x.month !== month), { month, value }].sort((a, b) =>
              a.month.localeCompare(b.month),
            ),
          };
        }),
      setTaxProfile: (taxProfile) => set({ taxProfile }),
      setCsvMapping: (csvMapping) => set({ csvMapping }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      replaceAll: (d) => set({ ...initialData(), ...d }),
      reset: () => set(initialData()),
    }),
    {
      name: 'cap-budget',
      version: SCHEMA_VERSION,
      migrate: (persisted, version) => migrateData(persisted as Partial<Data>, version) as never,
      storage: createJSONStorage(() => indexedDbStorage),
      partialize: (s) => {
        const { accounts, transactions, categories, budgets, rules, goals, snapshots, provisions, pauses, taxProfile, csvMapping, settings } = s;
        return { accounts, transactions, categories, budgets, rules, goals, snapshots, provisions, pauses, taxProfile, csvMapping, settings };
      },
      // Fusion profonde du profil fiscal : les nouveaux champs reçoivent une valeur par défaut.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Data>;
        const base = emptyProfile();
        const tp = p.taxProfile;
        return {
          ...current,
          ...p,
          taxProfile: tp
            ? {
                ...base,
                ...tp,
                declarants: [
                  { ...base.declarants[0], ...tp.declarants?.[0] },
                  { ...base.declarants[1], ...tp.declarants?.[1] },
                ],
                rental: { ...base.rental, ...tp.rental },
                furnished: { ...base.furnished, ...tp.furnished },
                capital: { ...base.capital, ...tp.capital },
              }
            : base,
          settings: { ...current.settings, ...p.settings },
        };
      },
    },
  ),
);

/** Contexte du moteur de catégorisation : règles de l'utilisateur, règles fournies, marchands déjà classés. */
export function classifierContext(d: Pick<Data, 'rules' | 'transactions'>) {
  return {
    userRules: d.rules.filter((r) => !isDefaultRule(r)),
    defaultRules: d.rules.filter(isDefaultRule),
    memory: learnMerchants(d.transactions),
  };
}

/** Mises à niveau des données enregistrées par une version précédente de l'application. */
export function migrateData(d: Partial<Data>, version: number): Partial<Data> {
  const out = { ...d };
  if (version < 2) {
    // v2 : catégorie « Fumer » et ses règles
    const cats = out.categories ?? [];
    const smoking = DEFAULT_CATEGORIES.find((c) => c.id === 'exp-smoking')!;
    if (!cats.some((c) => c.id === smoking.id)) out.categories = [...cats, smoking];
    const rules = out.rules ?? [];
    out.rules = [...rules, ...SMOKING_RULES.filter((r) => !rules.some((x) => x.id === r.id))];
  }
  if (version < 3) {
    // v3 : catégorie « Retraits d'espèces » et règles pour les relevés de néobanques
    const cats = out.categories ?? [];
    const cash = DEFAULT_CATEGORIES.find((c) => c.id === 'exp-cash')!;
    if (!cats.some((c) => c.id === cash.id)) out.categories = [...cats, cash];
    const rules = out.rules ?? [];
    out.rules = [...rules, ...V3_RULES.filter((r) => !rules.some((x) => x.id === r.id))];
  }
  if (version < 4) {
    // v4 : « Virement interne » devient « Virement compte »
    out.categories = (out.categories ?? []).map((c) => (c.id === 'trf-internal' && c.name === 'Virement interne' ? { ...c, name: 'Virement compte' } : c));
  }
  if (version < 5) {
    // v5 : « retrait » ne doit pas reconnaître « retraite » ; règle PER complémentaire
    const rules = (out.rules ?? []).map((r) => (r.id === 'r-v3-1' && r.pattern === 'retrait' ? { ...r, pattern: 'retrait ' } : r));
    const per = V3_RULES.find((r) => r.id === 'r-v3-13')!;
    out.rules = rules.some((r) => r.id === per.id) ? rules : [...rules, per];
    // opérations mal classées par l'ancienne règle
    out.transactions = (out.transactions ?? []).map((t) =>
      t.categoryId === 'exp-cash' && /retraite/i.test(t.label) && !/\bretrait\b/i.test(t.label) ? { ...t, categoryId: /epargne retraite|\bper\b/i.test(t.label) ? 'sav-per' : null } : t,
    );
  }
  if (version < 6) {
    // v6 : pauses avant achat
    out.pauses = out.pauses ?? [];
  }
  return out;
}

/** Export JSON complet, pour sauvegarde ou changement d'appareil. */
export function exportData(): string {
  const s = useStore.getState();
  const { accounts, transactions, categories, budgets, rules, goals, snapshots, provisions, pauses, taxProfile, csvMapping, settings } = s;
  return JSON.stringify(
    { app: 'cap-budget', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: { accounts, transactions, categories, budgets, rules, goals, snapshots, provisions, pauses, taxProfile, csvMapping, settings } },
    null,
    2,
  );
}

export function parseBackup(text: string): Data {
  const json = JSON.parse(text);
  if (json?.app !== 'cap-budget' || typeof json.data !== 'object') throw new Error('Ce fichier n’est pas une sauvegarde Cap Budget.');
  const d = json.data as Partial<Data>;
  if (!Array.isArray(d.transactions) || !Array.isArray(d.accounts)) throw new Error('Sauvegarde incomplète.');
  return { ...initialData(), ...migrateData(d, Number(json.version) || 1) } as Data;
}

/** Résolu quand les données enregistrées ont été chargées (le chargement IndexedDB est asynchrone). */
export function whenHydrated(): Promise<void> {
  if (useStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
