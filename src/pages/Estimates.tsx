import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, ChartTooltip, Empty, PageHead, Progress, Segmented, useCategoryMap } from '../components/ui';
import { computeEstimates, type CategoryEstimate } from '../lib/estimates';
import { euros, kEuros, money0, monthKey, monthLabel, percent, shortMonth, todayISO } from '../lib/format';
import { useViewTransactions } from '../lib/useView';
import { useStore } from '../store/store';

type Window = '3' | '6' | '12';

export default function Estimates() {
  const txs = useViewTransactions();
  const accounts = useStore((s) => s.accounts);
  const provisions = useStore((s) => s.provisions);
  const cats = useCategoryMap();
  const [win, setWin] = useState<Window>('12');
  const current = monthKey(todayISO());

  const e = useMemo(() => computeEstimates(txs, cats, accounts, provisions, current, Number(win)), [txs, cats, accounts, provisions, current, win]);

  if (e.coveredMonths === 0) {
    return (
      <>
        <PageHead title="Estimations" />
        <Card><Empty icon="📊" title="Pas encore d’historique">Importez au moins un mois complet d’opérations pour obtenir des estimations.</Empty></Card>
      </>
    );
  }

  const chart = e.history.map((h) => ({ name: shortMonth(h.month), Revenus: h.income / 100, Dépenses: h.expense / 100 }));
  const period = e.coveredMonths === 1 ? monthLabel(e.months[0]) : `${monthLabel(e.months[0])} – ${monthLabel(e.months[e.months.length - 1])}`;

  return (
    <>
      <PageHead
        title="Estimations"
        subtitle={`Revenus et dépenses de tous vos comptes, moyenne de ${e.coveredMonths} mois complet${e.coveredMonths > 1 ? 's' : ''} (${period}). Virements entre vos comptes exclus.`}
        actions={<Segmented value={win} onChange={setWin} options={[{ value: '3', label: '3 mois' }, { value: '6', label: '6 mois' }, { value: '12', label: '12 mois' }]} />}
      />
      <div className="stack">
        <div className="card">
          <div className="table-wrap">
            <table className="estimate-table">
              <thead>
                <tr><th /><th className="amount">Par mois</th><th className="amount">Par an</th></tr>
              </thead>
              <tbody>
                <tr><td><span className="dot" style={{ background: 'var(--accent)' }} /> Revenus</td><td className="amount big pos">{money0(e.income.monthly)}</td><td className="amount big">{money0(e.income.annual)}</td></tr>
                <tr><td><span className="dot" style={{ background: '#f59e0b' }} /> Dépenses</td><td className="amount big">{money0(e.expense.monthly)}</td><td className="amount big">{money0(e.expense.annual)}</td></tr>
                <tr className="sub"><td>dont charges fixes (prélèvements réguliers)</td><td className="amount">{money0(e.expense.fixedMonthly)}</td><td className="amount">{money0(e.expense.fixedMonthly * 12)}</td></tr>
                <tr className="sub"><td>dont dépenses variables</td><td className="amount">{money0(e.expense.variableMonthly)}</td><td className="amount">{money0(e.expense.variableMonthly * 12)}</td></tr>
                <tr className="total">
                  <td>Reste après dépenses</td>
                  <td className={`amount big ${e.balance.monthly >= 0 ? 'pos' : 'neg'}`}>{money0(e.balance.monthly)}</td>
                  <td className={`amount big ${e.balance.annual >= 0 ? 'pos' : 'neg'}`}>{money0(e.balance.annual)}</td>
                </tr>
                <tr className="sub"><td>Mis de côté (virements vers l’épargne et le PER)</td><td className="amount">{money0(e.savings.monthly)}</td><td className="amount">{money0(e.savings.annual)}</td></tr>
                {e.provisions.annual > 0 && (
                  <tr className="sub"><td>Provisions pour dépenses annuelles (à prévoir)</td><td className="amount">{money0(e.provisions.monthly)}</td><td className="amount">{money0(e.provisions.annual)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 14, gap: 16 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="row between small" style={{ marginBottom: 4 }}><span>Taux d’épargne</span><strong>{percent(e.savingsRate)}</strong></div>
              <Progress value={Math.max(0, e.savingsRate)} max={0.2} />
              <div className="faint small" style={{ marginTop: 4 }}>Objectif courant : 20 % des revenus.</div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="row between small" style={{ marginBottom: 4 }}><span>Charges fixes / revenus</span><strong>{percent(e.income.monthly ? e.expense.fixedMonthly / e.income.monthly : 0)}</strong></div>
              <Progress value={e.expense.fixedMonthly} max={(e.income.monthly || 1) * 0.5} />
              <div className="faint small" style={{ marginTop: 4 }}>Au-delà de 50 %, le budget devient rigide.</div>
            </div>
          </div>
        </div>

        {e.coveredMonths > 1 && (
          <Card title="Mois par mois">
            <div className="chart-box">
              <ResponsiveContainer>
                <BarChart data={chart} barGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: 'var(--text-3)', fontSize: 12 }} tickFormatter={kEuros} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={euros} />} />
                  <ReferenceLine y={e.expense.monthly / 100} stroke="#f59e0b" strokeDasharray="4 4" />
                  <ReferenceLine y={e.income.monthly / 100} stroke="var(--accent)" strokeDasharray="4 4" />
                  <Bar dataKey="Revenus" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                  <Bar dataKey="Dépenses" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="faint small">Les lignes pointillées indiquent les moyennes mensuelles.</p>
          </Card>
        )}

        <div className="grid g2">
          <CategoryTable title="Dépenses par catégorie" rows={e.expense.byCategory} total={e.expense.monthly} cats={cats} />
          <div className="stack">
            <CategoryTable title="Revenus par catégorie" rows={e.income.byCategory} total={e.income.monthly} cats={cats} />
            <Card title="Par compte">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Compte</th><th className="amount">Revenus / mois</th><th className="amount">Dépenses / mois</th></tr></thead>
                  <tbody>
                    {e.byAccount.map((a) => (
                      <tr key={a.accountId}>
                        <td>{accounts.find((x) => x.id === a.accountId)?.name ?? '—'}</td>
                        <td className="amount pos">{money0(a.income)}</td>
                        <td className="amount">{money0(a.expense)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function CategoryTable({ title, rows, total, cats }: { title: string; rows: CategoryEstimate[]; total: number; cats: ReturnType<typeof useCategoryMap> }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="muted">Aucune opération.</p>
      ) : (
        <div className="list">
          {rows.map((r) => {
            const c = r.categoryId ? cats.get(r.categoryId) : undefined;
            return (
              <div key={r.categoryId ?? 'none'} className="list-item small">
                <span className="icon-chip">{c?.icon ?? '❔'}</span>
                <div className="grow">
                  <div className="row between">
                    <span>{c?.name ?? 'À catégoriser'} {r.frequency >= 0.8 ? <span className="badge accent">chaque mois</span> : r.frequency < 0.4 ? <span className="badge">occasionnel</span> : null}</span>
                    <span className="num"><strong>{money0(r.monthly)}</strong><span className="faint"> / mois · {money0(r.annual)} / an</span></span>
                  </div>
                  <div className="bar-neutral" style={{ marginTop: 5 }}><div style={{ width: `${Math.min(100, (r.monthly / (total || 1)) * 100)}%` }} /></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
