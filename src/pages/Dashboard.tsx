import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, ChartTooltip, PageHead, Progress, Segmented, useCategoryMap } from '../components/ui';
import { accountBalance, detectRecurring, monthlySummaries, needsWantsSavings, spendingByCategory } from '../lib/analysis';
import { computeEstimates } from '../lib/estimates';
import { computeBrief } from '../lib/brief';
import { useConjoncture } from '../lib/conjoncture';
import BriefCard from '../components/BriefCard';
import { addMonths, dateLabel, euros, kEuros, money, money0, monthKey, monthLabel, percent, shortMonth, todayISO } from '../lib/format';
import { upcomingEvents } from '../lib/planning';
import { pauseStats, wantsSummary } from '../lib/pauses';
import { useViewTransactions } from '../lib/useView';
import { useStore } from '../store/store';
import { computeTax } from '../tax/engine';
import { suggest } from '../tax/optimizer';
import { ACCOUNT_TYPES } from './Wealth';

const hello = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Bonsoir' : h < 18 ? 'Bonjour' : 'Bonsoir';
};

export default function Dashboard() {
  const txs = useViewTransactions();
  const accounts = useStore((s) => s.accounts);
  const budgets = useStore((s) => s.budgets);
  const provisions = useStore((s) => s.provisions);
  const snapshots = useStore((s) => s.snapshots);
  const pauses = useStore((s) => s.pauses);
  const taxProfile = useStore((s) => s.taxProfile);
  const ownerName = useStore((s) => s.settings.ownerName);
  const personalView = useStore((s) => s.settings.personalView ?? false);
  const updateSettings = useStore((s) => s.updateSettings);
  const cats = useCategoryMap();
  const hasJoint = accounts.some((a) => a.share !== undefined && a.share < 100);
  const today = todayISO();
  const thisMonth = monthKey(today);
  const [month, setMonth] = useState(thisMonth);
  const isCurrent = month === thisMonth;

  const summaries = useMemo(() => monthlySummaries(txs, cats), [txs, cats]);
  const byMonth = useMemo(() => new Map(summaries.map((s) => [s.month, s])), [summaries]);
  const cur = byMonth.get(month) ?? { month, income: 0, expense: 0, saved: 0, net: 0 };
  const est = useMemo(() => computeEstimates(txs, cats, accounts, provisions, thisMonth, 12), [txs, cats, accounts, provisions, thisMonth]);
  const recurring = useMemo(() => detectRecurring(txs), [txs]);
  const conjData = useConjoncture((s) => s.data);
  const brief = useMemo(() => computeBrief(est, accounts, txs, undefined, conjData), [est, accounts, txs, conjData]);

  // Projection de fin de mois : déjà réalisé + échéances restantes + dépenses courantes habituelles.
  const projection = useMemo(() => {
    if (!isCurrent) return null;
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const daysLeft = Math.max(0, lastDay - new Date(`${today}T12:00:00`).getDate());
    const events = upcomingEvents(recurring.filter((r) => cats.get(r.categoryId ?? '')?.kind !== 'transfer'), [], today, daysLeft);
    const pendingIncome = events.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const pendingBills = events.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0);
    const variable = Math.round((est.expense.variableMonthly / 30) * daysLeft);
    const income = cur.income + pendingIncome;
    const expense = cur.expense + pendingBills + variable;
    return { daysLeft, pendingIncome, pendingBills, variable, income, expense, net: income - expense };
  }, [isCurrent, month, today, recurring, cats, est, cur]);

  const spending = useMemo(() => spendingByCategory(txs, cats, month), [txs, cats, month]);
  const spendTotal = spending.reduce((s, x) => s + x.amount, 0);
  const pie = spending.slice(0, 6).map((x) => ({
    name: cats.get(x.categoryId)?.name ?? 'À catégoriser',
    icon: cats.get(x.categoryId)?.icon ?? '❔',
    value: x.amount / 100,
    color: cats.get(x.categoryId)?.color ?? '#a8a29e',
  }));
  if (spending.length > 6) pie.push({ name: 'Autres', icon: '…', value: spending.slice(6).reduce((s, x) => s + x.amount, 0) / 100, color: '#cbd5e1' });

  const trend = Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11)).map((mm) => {
    const s = byMonth.get(mm);
    return { name: shortMonth(mm), Revenus: (s?.income ?? 0) / 100, Dépenses: (s?.expense ?? 0) / 100, Solde: ((s?.income ?? 0) - (s?.expense ?? 0)) / 100 };
  });

  const accountRows = accounts.filter((a) => !a.archived).map((a) => ({ a, balance: accountBalance(a, txs) }));
  const netWorth = accountRows.reduce((s, r) => s + r.balance, 0);
  const cash = accountRows.filter((r) => ACCOUNT_TYPES[r.a.type].liquid).reduce((s, r) => s + r.balance, 0);
  const worthHistory = snapshots.slice(-12).map((s) => ({ name: shortMonth(s.month), Patrimoine: s.value / 100 }));
  const worthDelta = snapshots.length >= 2 ? snapshots[snapshots.length - 1].value - snapshots[snapshots.length - 2].value : null;

  const upcoming = recurring
    .filter((r) => !r.isIncome && r.nextDate >= today)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 5);

  const budgetRows = budgets
    .map((b) => ({ b, cat: cats.get(b.categoryId), spent: spending.find((x) => x.categoryId === b.categoryId)?.amount ?? 0 }))
    .filter((x) => x.cat)
    .sort((a, b) => b.spent / b.b.monthly - a.spent / a.b.monthly);

  const nws = needsWantsSavings(txs, cats, month);
  const tax = useMemo(() => computeTax(taxProfile), [taxProfile]);
  const topSuggestion = useMemo(() => suggest(taxProfile).find((s) => s.saving > 0), [taxProfile]);
  const hasTaxData = taxProfile.declarants[0].salary + taxProfile.declarants[0].pension + taxProfile.declarants[0].microRevenue > 0;
  const uncategorized = txs.filter((t) => !t.categoryId && monthKey(t.date) === month).length;

  const insights: { tone: '' | 'warn' | 'accent' | 'danger'; text: string; to?: string }[] = [];
  if (projection && projection.net < 0) insights.push({ tone: 'danger', text: `À ce rythme, le mois se terminerait à ${money0(projection.net)}.`, to: '/previsions' });
  for (const r of budgetRows) if (r.spent > r.b.monthly) insights.push({ tone: 'warn', text: `Budget « ${r.cat!.name} » dépassé de ${money0(r.spent - r.b.monthly)}.`, to: '/budgets' });
  if (est.coveredMonths >= 2 && cur.expense > est.expense.monthly * 1.15 && !isCurrent) {
    insights.push({ tone: 'warn', text: `Dépenses supérieures de ${percent(cur.expense / est.expense.monthly - 1)} à votre moyenne.` });
  }
  if (est.savingsRate >= 0.2) insights.push({ tone: 'accent', text: `Taux d’épargne moyen de ${percent(est.savingsRate)} : au-dessus de l’objectif de 20 %.` });
  const subsYear = recurring.filter((r) => !r.isIncome && cats.get(r.categoryId ?? '')?.kind !== 'transfer').reduce((s, r) => s + r.annualCost, 0);
  if (subsYear > 0) insights.push({ tone: '', text: `Prélèvements récurrents : ${money0(subsYear)} par an.`, to: '/recurrents' });
  if (uncategorized > 0) insights.push({ tone: '', text: `${uncategorized} opération(s) à catégoriser ce mois-ci.`, to: '/transactions' });
  if (!ownerName && accounts.length > 1) insights.push({ tone: '', text: 'Indiquez votre nom pour rapprocher les virements entre vos comptes.', to: '/reglages' });

  const spentShare = est.expense.monthly > 0 ? cur.expense / est.expense.monthly : 0;

  return (
    <>
      <PageHead
        title={isCurrent ? `${hello()}${ownerName ? ` ${ownerName.split(' ')[0]}` : ''}` : 'Tableau de bord'}
        subtitle={monthLabel(month)}
        actions={
          <>
            {hasJoint && (
              <Segmented value={personalView ? 'perso' : 'foyer'} onChange={(v) => updateSettings({ personalView: v === 'perso' })} options={[{ value: 'foyer', label: 'Foyer' }, { value: 'perso', label: 'Ma part' }]} />
            )}
            <button className="ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mois précédent">‹</button>
            <button onClick={() => setMonth(thisMonth)} disabled={isCurrent}>Ce mois-ci</button>
            <button className="ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mois suivant" disabled={isCurrent}>›</button>
          </>
        }
      />

      <div className="stack">
        {/* 0. Bilan express : diagnostic immédiat */}
        <BriefCard brief={brief} est={est} />
        <PauseStrip pauses={pauses} wantsTotal={wantsSummary(txs, cats, month).total} monthName={isCurrent ? 'ce mois-ci' : `en ${monthLabel(month).toLowerCase()}`} />

        {/* 1. Le mois et le patrimoine */}
        <div className="grid g3">
          <section className="card span2 hero">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="muted small">{isCurrent ? 'Dépensé ce mois-ci' : `Dépensé en ${monthLabel(month).toLowerCase()}`}</div>
                <div className="hero-value num">{money0(cur.expense)}</div>
                {est.expense.monthly > 0 && (
                  <div className="small muted">sur {money0(est.expense.monthly)} habituels ({percent(spentShare)})</div>
                )}
              </div>
              <div className="hero-side">
                <div><span className="muted small">Revenus</span><strong className="num pos">{money0(cur.income)}</strong></div>
                <div><span className="muted small">Reste</span><strong className={`num ${cur.net >= 0 ? 'pos' : 'neg'}`}>{money0(cur.net)}</strong></div>
                {cur.saved > 0 && <div><span className="muted small">Épargné</span><strong className="num">{money0(cur.saved)}</strong></div>}
              </div>
            </div>
            {est.expense.monthly > 0 && <div style={{ margin: '14px 0 4px' }}><Progress value={cur.expense} max={est.expense.monthly} /></div>}
            {projection && (
              <div className="projection">
                <div>
                  <span className="faint small">Projection fin de mois</span>
                  <strong className={`num ${projection.net >= 0 ? 'pos' : 'neg'}`}>{money0(projection.net)}</strong>
                </div>
                <div className="faint small">
                  {projection.daysLeft} jour(s) restants
                  {projection.pendingIncome > 0 && ` · ${money0(projection.pendingIncome)} de revenus attendus`}
                  {projection.pendingBills > 0 && ` · ${money0(projection.pendingBills)} de prélèvements à venir`}
                  {projection.variable > 0 && ` · ~${money0(projection.variable)} de dépenses courantes`}
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <div className="row between">
              <span className="muted small">Patrimoine net</span>
              <Link to="/patrimoine" className="small">Détail</Link>
            </div>
            <div className="hero-value num" style={{ fontSize: 26 }}>{money0(netWorth)}</div>
            <div className="small muted">
              {money0(cash)} disponibles
              {worthDelta !== null && <span className={worthDelta >= 0 ? 'pos' : 'neg'}> · {worthDelta >= 0 ? '+' : ''}{money0(worthDelta)} sur un mois</span>}
            </div>
            {est.expense.monthly > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="row between small" style={{ marginBottom: 4 }}>
                  <span>Épargne de précaution</span>
                  <strong className="num">{(cash / est.expense.monthly).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois</strong>
                </div>
                <Progress value={Math.min(cash, est.expense.monthly * 6)} max={est.expense.monthly * 6} />
                <div className="faint small" style={{ marginTop: 4 }}>
                  {cash >= est.expense.monthly * 3 ? 'Objectif de 3 à 6 mois de dépenses atteint' : `Objectif : ${money0(est.expense.monthly * 3)} (3 mois de dépenses)`}
                </div>
              </div>
            )}
            {worthHistory.length >= 2 && (
              <div style={{ height: 70, marginTop: 8 }}>
                <ResponsiveContainer>
                  <AreaChart data={worthHistory} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
                    <Area type="monotone" dataKey="Patrimoine" stroke="var(--accent)" fill="var(--accent-soft)" strokeWidth={2} isAnimationActive={false} />
                    <Tooltip content={<ChartTooltip format={euros} />} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>

        {/* 2. Estimation mensuelle et annuelle, tous comptes */}
        <Card
          title={<div><h2>Estimation mensuelle et annuelle</h2><div className="faint small">Tous vos comptes, moyenne des {est.coveredMonths} derniers mois complets, virements internes exclus</div></div>}
          actions={<Link to="/estimations" className="small">Voir le détail</Link>}
        >
          {est.coveredMonths === 0 ? (
            <p className="muted">Les estimations apparaîtront après un premier mois complet d’opérations.</p>
          ) : (
            <div className="grid g4" style={{ gap: 12 }}>
              {[
                { label: 'Revenus', m: est.income.monthly, y: est.income.annual, tone: 'pos' },
                { label: 'Dépenses', m: est.expense.monthly, y: est.expense.annual, tone: '' },
                { label: 'Reste', m: est.balance.monthly, y: est.balance.annual, tone: est.balance.monthly >= 0 ? 'pos' : 'neg' },
                { label: 'Épargne', m: est.savings.monthly, y: est.savings.annual, tone: '' },
              ].map((x) => (
                <div key={x.label} className="mini">
                  <div className="faint small">{x.label}</div>
                  <div className={`num mini-value ${x.tone}`}>{money0(x.m)}<span className="faint small"> / mois</span></div>
                  <div className="num small muted">{money0(x.y)} / an</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 3. Tendances */}
        <div className="grid g3">
          <Card title="12 derniers mois" className="span2">
            <div className="chart-box">
              <ResponsiveContainer>
                <ComposedChart data={trend} barGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: 'var(--text-3)', fontSize: 12 }} tickFormatter={kEuros} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={euros} />} />
                  <Bar dataKey="Revenus" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Bar dataKey="Dépenses" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Line dataKey="Solde" stroke="var(--text-2)" strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="legend">
              <span><i className="dot" style={{ background: 'var(--accent)' }} />Revenus</span>
              <span><i className="dot" style={{ background: '#f59e0b' }} />Dépenses</span>
              <span><i className="dot" style={{ background: 'var(--text-2)' }} />Solde du mois</span>
            </div>
          </Card>

          <Card title="Où part l’argent">
            {pie.length === 0 ? (
              <p className="muted">Aucune dépense ce mois-ci.</p>
            ) : (
              <>
                <div style={{ height: 150, position: 'relative' }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={1} stroke="var(--surface)" isAnimationActive={false}>
                        {pie.map((p) => <Cell key={p.name} fill={p.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip format={euros} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center"><strong className="num">{money0(spendTotal)}</strong></div>
                </div>
                <div className="list">
                  {pie.map((p) => (
                    <div key={p.name} className="row between small" style={{ padding: '3px 0', flexWrap: 'nowrap' }}>
                      <span className="row ellipsis" style={{ gap: 8, flexWrap: 'nowrap' }}><i className="dot" style={{ background: p.color }} />{p.icon} {p.name}</span>
                      <span className="num" style={{ whiteSpace: 'nowrap' }}>{euros(p.value)} <span className="faint">{percent((p.value * 100) / spendTotal)}</span></span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* 4. Détail */}
        <div className="grid g3">
          <Card title="Comptes" actions={<Link to="/patrimoine" className="small">Gérer</Link>}>
            <div className="list">
              {accountRows.slice(0, 6).map(({ a, balance }) => (
                <div key={a.id} className="list-item small">
                  <span className="dot" style={{ background: ACCOUNT_TYPES[a.type].color, width: 10, height: 10 }} />
                  <span className="grow ellipsis">{a.name}{a.bank ? ' 🏦' : ''}</span>
                  <span className={`num ${balance < 0 ? 'neg' : ''}`}>{money0(balance)}</span>
                </div>
              ))}
              {accountRows.length === 0 && <p className="muted">Aucun compte.</p>}
            </div>
          </Card>

          <Card title="Prochains prélèvements" actions={<Link to="/previsions" className="small">Prévisions</Link>}>
            {upcoming.length === 0 ? (
              <p className="muted">Les prélèvements récurrents apparaîtront après quelques mois d’historique.</p>
            ) : (
              <div className="list">
                {upcoming.map((r) => (
                  <div key={r.key} className="list-item small">
                    <span className="icon-chip">{cats.get(r.categoryId ?? '')?.icon ?? '↻'}</span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="ellipsis">{r.label}</div>
                      <div className="faint">{dateLabel(r.nextDate)}</div>
                    </div>
                    <span className="num">{money(r.averageAmount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

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
        </div>

        <div className="grid g3">
          <Card title="À retenir">
            {insights.length === 0 ? (
              <p className="muted">Rien à signaler pour ce mois.</p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {insights.slice(0, 5).map((i) => (
                  <div key={i.text} className={`callout small ${i.tone}`}>
                    {i.text} {i.to && <Link to={i.to}>Voir</Link>}
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
                        <span className="num">{percent(share)} <span className="faint">/ {percent(target)}</span></span>
                      </div>
                      <Progress value={k === 'epargne' ? Math.min(share, target) : share} max={target} />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Impôt 2026" actions={<Link to="/impots" className="small">Simuler</Link>}>
            {!hasTaxData ? (
              <p className="muted">Renseignez vos revenus dans le simulateur pour estimer votre impôt et découvrir vos leviers.</p>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                <div className="row between"><span className="muted">Impôt estimé</span><strong className="num" style={{ fontSize: 20 }}>{euros(tax.total)}</strong></div>
                <div className="row between small"><span className="muted">Tranche marginale</span><span>{percent(tax.marginalRate)}</span></div>
                {topSuggestion && <div className="callout accent small"><strong>{topSuggestion.title}</strong> : jusqu’à {euros(topSuggestion.saving)} d’économie.</div>}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/** Bandeau « Pause avant achat » : décisions en attente, argent gardé, ou invitation à essayer. */
function PauseStrip({ pauses, wantsTotal, monthName }: { pauses: ReturnType<typeof useStore.getState>['pauses']; wantsTotal: number; monthName: string }) {
  const st = pauseStats(pauses);
  const waiting = pauses.filter((p) => p.status === 'waiting').length;
  let text: React.ReactNode;
  if (st.ready > 0) text = <><strong>{st.ready} pause{st.ready > 1 ? 's' : ''} terminée{st.ready > 1 ? 's' : ''}</strong> : toujours envie ? À vous de décider.</>;
  else if (st.saved > 0 || waiting > 0)
    text = (
      <>
        <strong className="num">{money0(st.saved)}</strong> gardés grâce à la pause avant achat
        {waiting > 0 && <> · {waiting} envie{waiting > 1 ? 's' : ''} en réflexion</>}.
      </>
    );
  else if (wantsTotal > 0) text = <>Vos envies ont coûté <strong className="num">{money0(wantsTotal)}</strong> {monthName}. Avant le prochain achat plaisir, faites une pause.</>;
  else return null;
  return (
    <Link to="/pause" className={`pause-strip ${st.ready ? 'ready' : ''}`}>
      <span className="pause-strip-ico" aria-hidden>⏸</span>
      <span className="grow">{text}</span>
      <span className="small">{st.ready ? 'Décider' : 'Pause avant achat'} ›</span>
    </Link>
  );
}
