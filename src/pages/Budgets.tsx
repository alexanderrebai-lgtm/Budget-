import { useMemo, useState } from 'react';
import { Card, NumberField, PageHead, Progress, Stat, toast, useCategoryMap } from '../components/ui';
import { spendingByCategory } from '../lib/analysis';
import { addMonths, money0, monthKey, monthLabel, toCents, todayISO } from '../lib/format';
import { useStore } from '../store/store';

export default function Budgets() {
  const txs = useStore((s) => s.transactions);
  const budgets = useStore((s) => s.budgets);
  const categories = useStore((s) => s.categories);
  const setBudget = useStore((s) => s.setBudget);
  const cats = useCategoryMap();
  const [month, setMonth] = useState(monthKey(todayISO()));

  const spending = useMemo(() => new Map(spendingByCategory(txs, cats, month).map((x) => [x.categoryId, x.amount])), [txs, cats, month]);

  // Moyenne des 3 mois précédents, pour proposer un montant de budget réaliste.
  const average = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 1; i <= 3; i++) {
      for (const x of spendingByCategory(txs, cats, addMonths(month, -i))) m.set(x.categoryId, (m.get(x.categoryId) ?? 0) + x.amount / 3);
    }
    return m;
  }, [txs, cats, month]);

  const expenseCats = categories.filter((c) => c.kind === 'expense');
  const totalBudget = budgets.reduce((s, b) => s + b.monthly, 0);
  const totalSpentBudgeted = budgets.reduce((s, b) => s + (spending.get(b.categoryId) ?? 0), 0);
  const totalSpent = [...spending.values()].reduce((s, x) => s + x, 0);

  const suggestAll = () => {
    let n = 0;
    for (const c of expenseCats) {
      const avg = average.get(c.id);
      if (avg && avg > 1000 && !budgets.some((b) => b.categoryId === c.id)) {
        setBudget(c.id, Math.ceil(avg / 1000) * 1000); // arrondi à 10 € au-dessus
        n++;
      }
    }
    toast(n ? `${n} budget(s) proposés d’après vos 3 derniers mois.` : 'Pas assez d’historique pour proposer des budgets.');
  };

  return (
    <>
      <PageHead
        title="Budgets"
        subtitle={monthLabel(month)}
        actions={
          <>
            <button className="ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mois précédent">‹</button>
            <button className="ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mois suivant">›</button>
            <button onClick={suggestAll}>Proposer des budgets</button>
          </>
        }
      />
      <div className="stack">
        <div className="grid g3">
          <Stat label="Budget mensuel total" value={money0(totalBudget)} />
          <Stat label="Dépensé sur ces catégories" value={money0(totalSpentBudgeted)} tone={totalSpentBudgeted > totalBudget ? 'neg' : undefined} sub={`${money0(Math.max(0, totalBudget - totalSpentBudgeted))} restants`} />
          <Stat label="Dépenses totales du mois" value={money0(totalSpent)} />
        </div>
        <Card title="Plafonds par catégorie">
          <div className="list">
            {expenseCats.map((c) => {
              const b = budgets.find((x) => x.categoryId === c.id);
              const spent = spending.get(c.id) ?? 0;
              const avg = average.get(c.id) ?? 0;
              return (
                <div key={c.id} className="list-item" style={{ alignItems: 'center' }}>
                  <span className="icon-chip">{c.icon}</span>
                  <div className="grow">
                    <div className="row between small">
                      <strong style={{ fontWeight: 550 }}>{c.name}</strong>
                      <span className="num muted">
                        {money0(spent)}
                        {b ? ` / ${money0(b.monthly)}` : ''}
                      </span>
                    </div>
                    {b ? <div style={{ marginTop: 6 }}><Progress value={spent} max={b.monthly} /></div> : (
                      <div className="faint small">{avg > 0 ? `Moyenne 3 mois : ${money0(avg)}` : 'Pas de budget'}</div>
                    )}
                  </div>
                  <div style={{ width: 130 }}>
                    <NumberField label={<span className="sr-only">Budget {c.name}</span>} value={b ? b.monthly / 100 : 0} onChange={(v) => setBudget(c.id, toCents(v))} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
