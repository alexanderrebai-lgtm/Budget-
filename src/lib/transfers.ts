import { daysBetween, normalize } from './format';
import type { Transaction } from './types';

/** Catégorie des virements entre vos propres comptes. */
export const TRANSFER_CATEGORY = 'trf-internal';

const TRANSFER_WORDS = /\b(vir|virt|virement|virements|transfert|transfer)\b/;

/** Le libellé ressemble-t-il à un virement (ou mentionne-t-il le titulaire) ? */
export function looksLikeTransfer(label: string, ownerNames: string[]): boolean {
  const l = ` ${normalize(label)} `;
  if (TRANSFER_WORDS.test(l)) return true;
  return ownerNames.some((n) => n && l.includes(` ${n} `));
}

/** Variantes d'un nom de titulaire : « Alexander Rebai » → « alexander rebai » et « rebai alexander ». */
export function ownerVariants(name: string): string[] {
  const words = normalize(name).replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const direct = words.join(' ');
  const reversed = [...words].reverse().join(' ');
  return [...new Set([direct, reversed])];
}

export interface TransferPair {
  debitId: string;
  creditId: string;
}

/**
 * Rapproche les virements entre vos comptes : un débit sur un compte et un crédit
 * du même montant sur un autre compte, à 4 jours d'écart au plus, dont au moins un
 * libellé ressemble à un virement ou mentionne le titulaire. Le crédit le plus
 * proche en date est retenu ; chaque opération n'est rapprochée qu'une fois.
 */
export function findTransferPairs(txs: Transaction[], ownerNames: string[], maxDays = 4): TransferPair[] {
  const free = txs.filter((t) => !t.transferId);
  const credits = free.filter((t) => t.amount > 0);
  const byAmount = new Map<number, Transaction[]>();
  for (const c of credits) {
    const list = byAmount.get(c.amount);
    if (list) list.push(c);
    else byAmount.set(c.amount, [c]);
  }
  const used = new Set<string>();
  const pairs: TransferPair[] = [];
  const debits = free.filter((t) => t.amount < 0).sort((a, b) => a.date.localeCompare(b.date));
  for (const d of debits) {
    const candidates = byAmount.get(-d.amount) ?? [];
    let best: Transaction | null = null;
    let bestGap = Infinity;
    for (const c of candidates) {
      if (used.has(c.id) || c.accountId === d.accountId) continue;
      const gap = Math.abs(daysBetween(d.date, c.date));
      if (gap > maxDays) continue;
      if (!looksLikeTransfer(d.label, ownerNames) && !looksLikeTransfer(c.label, ownerNames)) continue;
      if (gap < bestGap) {
        best = c;
        bestGap = gap;
      }
    }
    if (best) {
      used.add(best.id);
      pairs.push({ debitId: d.id, creditId: best.id });
    }
  }
  return pairs;
}
