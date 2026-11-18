import type { Data } from '../store/store';

/**
 * Fusion à trois voies entre la dernière version synchronisée (base), les
 * modifications locales et la version distante.
 *
 * - Collections identifiées (comptes, opérations, catégories…) : fusion
 *   élément par élément. Ajouts et modifications des deux côtés conservés ;
 *   en cas de modification simultanée du même élément, la version locale gagne ;
 *   une suppression n'est appliquée que si l'autre côté n'a pas modifié l'élément.
 * - Objets simples (profil fiscal, réglages) : le côté qui a changé l'emporte,
 *   la version locale en cas de double modification.
 */

export type SyncedData = Omit<Data, never>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function mergeCollection<T>(base: T[] | undefined, local: T[], remote: T[], key: (x: T) => string): T[] {
  const b = new Map((base ?? []).map((x) => [key(x), x]));
  const l = new Map(local.map((x) => [key(x), x]));
  const r = new Map(remote.map((x) => [key(x), x]));
  const out = new Map<string, T>();

  for (const [k, rv] of r) {
    const bv = b.get(k);
    const lv = l.get(k);
    if (lv === undefined) {
      // supprimé localement ? on garde la version distante si elle a changé depuis la base
      if (bv !== undefined && same(bv, rv)) continue;
      out.set(k, rv);
    } else if (bv !== undefined && same(bv, lv)) {
      out.set(k, rv); // inchangé localement : la version distante fait foi
    } else {
      out.set(k, lv); // modifié localement (ou ajouté des deux côtés) : local gagne
    }
  }
  for (const [k, lv] of l) {
    if (out.has(k) || r.has(k)) continue;
    const bv = b.get(k);
    // absent à distance : ajout local, ou suppression distante d'un élément modifié localement
    if (bv === undefined || !same(bv, lv)) out.set(k, lv);
  }
  return [...out.values()];
}

function mergeValue<T>(base: T | undefined, local: T, remote: T): T {
  if (base === undefined) return local;
  if (same(base, local)) return remote;
  return local;
}

export function mergeData(base: Data | null, local: Data, remote: Data): Data {
  const byId = <T extends { id: string }>(x: T) => x.id;
  return {
    accounts: mergeCollection(base?.accounts, local.accounts, remote.accounts, byId),
    transactions: mergeCollection(base?.transactions, local.transactions, remote.transactions, byId),
    categories: mergeCollection(base?.categories, local.categories, remote.categories, byId),
    rules: mergeCollection(base?.rules, local.rules, remote.rules, byId),
    goals: mergeCollection(base?.goals, local.goals, remote.goals, byId),
    budgets: mergeCollection(base?.budgets, local.budgets, remote.budgets, (x) => x.categoryId),
    snapshots: mergeCollection(base?.snapshots, local.snapshots, remote.snapshots, (x) => x.month).sort((a, b) =>
      a.month.localeCompare(b.month),
    ),
    taxProfile: mergeValue(base?.taxProfile, local.taxProfile, remote.taxProfile),
    csvMapping: mergeValue(base?.csvMapping, local.csvMapping, remote.csvMapping),
    settings: { ...mergeValue(base?.settings, local.settings, remote.settings), onboarded: true },
  };
}

/** Empreinte stable pour savoir si deux états diffèrent. */
export function fingerprint(d: Data): string {
  return JSON.stringify(d);
}
