import { useMemo } from 'react';
import { useStore } from '../store/store';
import type { Transaction } from './types';

/**
 * Opérations vues par le tableau de bord et les budgets. En « vue personnelle »,
 * les opérations d'un compte joint ne comptent qu'à hauteur de la quote-part.
 */
export function useViewTransactions(): Transaction[] {
  const txs = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts);
  const personal = useStore((s) => s.settings.personalView ?? false);
  return useMemo(() => {
    if (!personal) return txs;
    const shares = new Map(accounts.filter((a) => a.share !== undefined && a.share !== 100).map((a) => [a.id, (a.share ?? 100) / 100]));
    if (!shares.size) return txs;
    return txs.map((t) => (shares.has(t.accountId) ? { ...t, amount: Math.round(t.amount * shares.get(t.accountId)!) } : t));
  }, [txs, accounts, personal]);
}
