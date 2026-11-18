import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, ChartTooltip, PageHead, Progress, Segmented, Stat, useCategoryMap } from '../components/ui';
import {
  accountBalance,
  detectRecurring,
  monthlySummaries,
  needsWantsSavings,
  spendingByCategory,
} from '../lib/analysis';
import { addMonths, dateLabel, euros, money, money0, monthKey, monthLabel, percent, shortMonth, todayISO, kEuros } from '../lib/format';
import { useStore } from '../store/store';
import { useViewTransactions } from '../lib/useView';
import { computeTax } from '../tax/engine';
import { suggest } from '../tax/optimizer';

export default function Dashboard() {
  const txs = useViewTransactions();
  const accounts = useStore((s) => s.accounts);
  const budgets = useStore((s) => s.budgets);
  const taxProfile = useStore((s) => s.taxProfile);
  const cats = useCategoryMap();
  const personalView = useStore((s) => s.settings.personalView ?? false);
  const updateSettings = useStore((s) => s.updateSettings);
  const hasJoint = accounts.some((a) => a.share !== undefined && a.share < 100);
  const today = todayISO();
  const [month, setMonth] = useState(monthKey(today));

  const summaries = useMemo(() => monthlySummaries(txs, cats), [txs, cats]);
  const byMonth = useMemo(() => new Map(summaries.map((s) => [s.month, s])), [summaries]);
  const cur = byMonth.get(month) ?? { month, income: 0, expense: 0, saved: 0, net: 0 };
  const prev = byMonth.get(addMonths(month, -1));

  const last6 = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5)).map((m) => {
    const s = byMonth.get(m);
    return { name: shortMonth(m), Revenus: (s?.income ?? 0) / 100, Dépenses: (s?.expense ?? 0) / 100 };
  });

  const spending = useMemo(() => spendingByCategory(txs, cats, month), [txs, cats, month]);
  const spendTotal = spending.reduce((s, x) => s + x.amount, 0);
  const pie = spending.slice(0, 7).map((x) => ({
    name: cats.get(x.categoryId)?.name ?? 'À catégoriser',
    value: x.amount / 100,
    color: cats.get(x.categoryId)?.color ?? '#a8a29e',
  }));
  if (spending.length > 7) {
    pie.push({ name: 'Autres', value: spending.slice(7).reduce((s, x) => s + x.amount, 0) / 100, color: '#cbd5e1' });
  }

  const netWorth = accounts.filter((a) => !a.archived).reduce((s, a) => s + accountBalance(a, txs), 0);
  const savingsRate = cur.income > 0 ? (cur.income - cur.expense) / cur.income : 0;
  const uncategorized = txs.filter((t) => !t.categoryId).length;

  const recurring = useMemo(() => detectRecurring(txs), [txs]);
  const upcoming = recurring
    .filter((r) => !r.isIncome && r.nextDate >= today)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 5);

  const nws = needsWantsSavings(txs, cats, month);
  const tax = useMemo(() => computeTax(taxProfile), [taxProfile]);
  const topSuggestion = useMemo(() => suggest(taxProfile).find((s) => s.saving > 0), [taxProfile]);
  const hasTaxData = taxProfile.declarants[0].salary + taxProfile.declarants[0].pension + taxProfile.declarants[0].microRevenue > 0;

  const budgetRows = budgets
    .map((b) => ({ b, cat: cats.get(b.categoryId), spent: spending.find((x) => x.categoryId === b.categoryId)?.amount ?? 0 }))
    .filter((x) => x.cat)
    .sort((a, b) => b.spent / b.b.monthly - a.spent / a.b.monthly);

  const insights: { tone: '' | 'warn' | 'accent'; text: string }[] = [];
  for (const r of budgetRows) if (r.spent > r.b.monthly) insights.push({ tone: 'warn', text: `Budget « ${r.cat!.name} » dépassé de ${money0(r.spent - r.b.monthly)}.` });
  if (prev && prev.expense > 0 && cur.expense > prev.expense * 1.15 && month !== monthKey(today))
    insights.push({ tone: 'warn', text: `Dépenses en hausse de ${percent(cur.expense / prev.expense - 1)} par rapport au mois précédent.` });
  if (savingsRate >= 0.2) insights.push({ tone: 'accent', text: `Taux d’épargne de ${percent(savingsRate)} : au-dessus de l’objectif de 20 %.` });
  const subsTotal = recurring.filter((r) => !r.isIncome && cats.get(r.categoryId ?? '')?.kind !== 'transfer').reduce((s, r) => s + r.annualCost, 0);
  if (subsTotal > 0) insights.push({ tone: '', text: `Vos prélèvements récurrents représentent ${money0(subsTotal)} par an. Vérifiez-les dans « Abonnements ».` });
  if (uncategorized > 0) insights.push({ tone: '', text: `${uncategorized} opération(s) à catégoriser.` });

  return (
    <>
      <PageHead
        title="Tableau de bord"
        subtitle={monthLabel(month)}
        actions={
          <>
            {hasJoint && (
              <Segmented
                value={personalView ? 'perso' : 'foyer'}
                onChange={(v) => updateSettings({ personalView: v === 'perso' })}
                options={[{ value: 'foyer', label: 'Foyer' }, { value: 'perso', label: 'Ma part' }]}
              />
            )}
            <button className="ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mois précédent">‹</button>
            <button onClick={() => setMonth(monthKey(today))}>Ce mois-ci</button>
            <button className="ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mois suivant">›</button>
          </>
        }
      />

      <div className="stack">
        <div className="grid g4">
          <Stat label="Revenus" value={money0(cur.income)} sub={prev ? `${money0(prev.income)} le mois précédent` : undefined} />
          <Stat label="Dépenses" value={money0(cur.expense)} sub={prev ? `${money0(prev.expense)} le mois précédent` : undefined} />
          <Stat
            label="Reste après dépenses"
            value={money0(cur.net)}
            tone={cur.net >= 0 ? 'pos' : 'neg'}
            sub={cur.income > 0 ? `Taux d’épargne ${percent(savingsRate)}` : undefined}
          />
          <Stat label="Patrimoine net" value={money0(netWorth)} sub={<Link to="/patrimoine">{accounts.length} compte(s)</Link>} />
        </div>

        <div className="grid g3">
          <Card title="Revenus et dépenses" className="span2">
            <div className="chart-box">
              <ResponsiveContainer>
                <BarChart data={last6} barGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: 'var(--text-3)', fontSize: 12 }} tickFormatter={kEuros} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={euros} />} />
                  <Bar dataKey="Revenus" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Dépenses" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="legend">
              <span><i className="dot" style={{ background: 'var(--accent)' }} />Revenus</span>
              <span><i className="dot" style={{ background: '#f59e0b' }} />Dépenses</span>
            </div>
          </Card>

          <Card title="Où part l’argent">
            {pie.length === 0 ? (
              <p className="muted">Aucune dépense ce mois-ci.</p>
            ) : (
              <>
                <div style={{ height: 170 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie isAnimationActive={false} data={pie} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={1} stroke="var(--surface)">
                        {pie.map((p) => <Cell key={p.name} fill={p.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip format={euros} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="list">
                  {pie.slice(0, 5).map((p) => (
                    <div key={p.name} className="row between small" style={{ padding: '3px 0' }}>
                      <span className="row" style={{ gap: 8 }}><i className="dot" style={{ background: p.color }} />{p.name}</span>
                      <span className="num">{euros(p.value)} <span className="faint">· {percent((p.value * 100) / spendTotal)}</span></span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="grid g3">
          <Card title="Budgets du mois" actions={<Link to="/budgets" className="small">Gérer</Link>}>
            {budgetRows.length === 0 ? (
              <p className="muted">Fixez des plafonds par catégorie pour suivre vos dépenses. <Link to="/budgets">Créer un budget</Link></p>
            ) : (
              <div className="stack" style={{ gap: 12 }}>
                {budgetRows.slice(0, 5).map(({ b, cat, spent }) => (
                  <div key={b.categoryId}>
                    <div className="row between small" style={{ marginBottom: 4 }}>
                      <span>{cat!.icon} {cat!.name}</span>
                      <span className="num">{money0(spent)} / {money0(b.monthly)}</span>
                    </div>
                    <Progress value={spent} max={b.monthly} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Prochains prélèvements" actions={<Link to="/recurrents" className="small">Tout voir</Link>}>
            {upcoming.length === 0 ? (
              <p className="muted">Les prélèvements récurrents apparaîtront après quelques mois d’historique.</p>
            ) : (
              <div className="list">
                {upcoming.map((r) => (
                  <div key={r.key} className="list-item small">
                    <span className="icon-chip">{cats.get(r.categoryId ?? '')?.icon ?? '↻'}</span>
                    <div className="grow">
                      <div className="ellipsis">{r.label}</div>
                      <div className="faint">{dateLabel(r.nextDate)}</div>
                    </div>
                    <span className="num">{money(r.averageAmount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Règle 50 / 30 / 20">
            {nws.income === 0 ? (
              <p className="muted">Pas de revenu enregistré ce mois-ci.</p>
            ) : (
              <div className="stack" style={{ gap: 12 }}>
                {([
                  ['besoins', 'Besoins essentiels', 0.5],
                  ['envies', 'Envies', 0.3],
                  ['epargne', 'Épargne', 0.2],
                ] as const).map(([k, label, target]) => {
                  const share = nws[k] / nws.income;
                  return (
                    <div key={k}>
                      <div className="row between small" style={{ marginBottom: 4 }}>
                        <span>{label}</span>
                        <span className="num">{percent(share)} <span className="faint">/ cible {percent(target)}</span></span>
                      </div>
                      <Progress value={k === 'epargne' ? Math.min(share, target) : share} max={target} />
                    </div>
                  );
                })}
                <p className="faint small">Part des revenus du mois. L’épargne compte les virements vers l’épargne et le PER.</p>
              </div>
            )}
          </Card>
        </div>

        <div className="grid g2">
          <Card title="À retenir">
            {insights.length === 0 ? (
              <p className="muted">Rien à signaler pour ce mois.</p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {insights.map((i) => <div key={i.text} className={`callout ${i.tone}`}>{i.text}</div>)}
              </div>
            )}
          </Card>
          <Card title="Impôt sur le revenu 2026" actions={<Link to="/impots" className="small">Simuler</Link>}>
            {!hasTaxData ? (
              <p className="muted">Renseignez vos revenus dans le simulateur pour estimer votre impôt et découvrir vos leviers d’optimisation.</p>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                <div className="row between">
                  <span className="muted">Impôt estimé</span>
                  <strong className="num" style={{ fontSize: 20 }}>{euros(tax.total)}</strong>
                </div>
                <div className="row between small">
                  <span className="muted">Tranche marginale</span>
                  <span>{percent(tax.marginalRate)}</span>
                </div>
                {topSuggestion && (
                  <div className="callout accent">
                    <strong>{topSuggestion.title}</strong> : jusqu’à {euros(topSuggestion.saving)} d’économie.
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
