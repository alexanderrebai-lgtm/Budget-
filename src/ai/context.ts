/**
 * Résumé chiffré envoyé à Claude pour l'analyse. Aucune opération brute :
 * des totaux, des moyennes et des noms d'enseignes. Le nom du titulaire et les
 * références bancaires sont retirés.
 */
import { accountBalance, detectRecurring, spendingByCategory } from '../lib/analysis';
import { computeEstimates } from '../lib/estimates';
import { addMonths, monthKey, monthLabel, normalize, todayISO } from '../lib/format';
import { cleanLabel, displayMerchant } from '../lib/merchants';
import type { Data } from '../store/store';
import { ownerVariants } from '../lib/transfers';
import type { Category } from '../lib/types';

const eur = (c: number) => `${Math.round(c / 100).toLocaleString('fr-FR')} €`;

export function buildFinanceContext(d: Data): string {
  const cats = new Map<string, Category>(d.categories.map((c) => [c.id, c]));
  const catName = (id: string | null | undefined) => (id ? cats.get(id)?.name ?? 'Autre' : 'À catégoriser');
  const today = todayISO();
  const current = monthKey(today);
  const owners = ownerVariants(d.settings.ownerName ?? '');
  const ownerRes = owners.map((o) => new RegExp(o.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'gi'));
  const anonymize = (s: string) => {
    let out = s;
    for (const re of ownerRes) out = out.replace(re, 'le titulaire');
    // filet de sécurité si le libellé contient des accents
    return owners.some((o) => normalize(out).includes(o)) ? 'le titulaire' : out;
  };

  const est = computeEstimates(d.transactions, cats, d.accounts, d.provisions, current, 12);
  const lines: string[] = [];
  lines.push(`Date du jour : ${today}. Historique analysé : ${est.coveredMonths} mois complets${est.months.length ? ` (${monthLabel(est.months[0])} à ${monthLabel(est.months[est.months.length - 1])})` : ''}.`);

  lines.push('\n## Moyennes mensuelles (tous comptes, virements internes exclus)');
  lines.push(`Revenus ${eur(est.income.monthly)} ; dépenses ${eur(est.expense.monthly)} (fixes ${eur(est.expense.fixedMonthly)}, variables ${eur(est.expense.variableMonthly)}) ; reste ${eur(est.balance.monthly)} ; épargne versée ${eur(est.savings.monthly)} ; taux d'épargne ${(est.savingsRate * 100).toFixed(1)} %.`);
  lines.push('Revenus par catégorie : ' + est.income.byCategory.map((c) => `${catName(c.categoryId)} ${eur(c.monthly)}`).join(', ') + '.');
  lines.push('Dépenses par catégorie (moyenne / mois, régularité) :');
  for (const c of est.expense.byCategory.slice(0, 25)) lines.push(`- ${catName(c.categoryId)} : ${eur(c.monthly)} (${Math.round(c.frequency * 100)} % des mois)`);

  lines.push('\n## Mois par mois');
  for (const h of est.history) lines.push(`- ${monthLabel(h.month)} : revenus ${eur(h.income)}, dépenses ${eur(h.expense)}`);

  // Mois en cours
  const now = spendingByCategory(d.transactions, cats, current);
  lines.push(`\n## Mois en cours (${monthLabel(current)}, au ${today.slice(8)})`);
  lines.push(now.slice(0, 12).map((x) => `${catName(x.categoryId)} ${eur(x.amount)}`).join(', ') || 'Aucune dépense.');

  // Principales enseignes sur 3 mois
  const from = addMonths(current, -3);
  const merchants = new Map<string, { total: number; count: number; cat: string }>();
  for (const t of d.transactions) {
    if (t.amount >= 0 || t.transferId || monthKey(t.date) < from) continue;
    const cat = t.categoryId ? cats.get(t.categoryId) : undefined;
    if (cat?.kind === 'transfer') continue;
    const name = anonymize(displayMerchant(t.label) || cleanLabel(t.label)).slice(0, 40);
    const m = merchants.get(name) ?? { total: 0, count: 0, cat: catName(t.categoryId) };
    m.total += -t.amount;
    m.count += 1;
    merchants.set(name, m);
  }
  lines.push('\n## Principaux marchands (3 derniers mois)');
  for (const [name, m] of [...merchants.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 30)) {
    lines.push(`- ${name} (${m.cat}) : ${eur(m.total)} en ${m.count} fois`);
  }

  // Prélèvements récurrents
  const recurring = detectRecurring(d.transactions).filter((r) => !r.isIncome && cats.get(r.categoryId ?? '')?.kind !== 'transfer');
  lines.push('\n## Prélèvements récurrents détectés');
  for (const r of recurring.slice(0, 25)) lines.push(`- ${anonymize(displayMerchant(r.label))} (${catName(r.categoryId)}) : ${eur(r.averageAmount)} ${r.frequency}, soit ${eur(r.annualCost)} / an`);

  // Budgets
  if (d.budgets.length) {
    lines.push('\n## Budgets mensuels fixés');
    for (const b of d.budgets) {
      const spent = now.find((x) => x.categoryId === b.categoryId)?.amount ?? 0;
      lines.push(`- ${catName(b.categoryId)} : budget ${eur(b.monthly)}, dépensé ce mois ${eur(spent)}`);
    }
  }

  // Patrimoine et objectifs
  lines.push('\n## Comptes et patrimoine');
  for (const a of d.accounts.filter((x) => !x.archived)) lines.push(`- ${anonymize(a.name)} (${a.type}) : ${eur(accountBalance(a, d.transactions))}${a.feeRate ? ` (frais ${(a.feeRate * 100).toFixed(2)} %/an)` : ''}`);
  if (d.goals.length) {
    lines.push('Objectifs : ' + d.goals.map((g) => `${g.name} ${eur(g.target)}${g.deadline ? ` avant ${g.deadline}` : ''}`).join(' ; ') + '.');
  }
  if (d.provisions.length) lines.push('Dépenses annuelles prévues : ' + d.provisions.map((p) => `${p.name} ${eur(p.amount)}`).join(', ') + '.');

  return lines.join('\n');
}
