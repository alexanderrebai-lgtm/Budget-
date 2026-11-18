import { useMemo, useState } from 'react';
import { Card, NumberField, PageHead, Progress, Stat, useCategoryMap } from '../components/ui';
import { accountBalance, monthlySummaries } from '../lib/analysis';
import { addMonths, euros, monthKey, percent, todayISO } from '../lib/format';
import { PASSIVE_ROADMAP, PASSIVE_SOURCES } from '../lib/passive';
import { fireNumber, yearsToTarget } from '../lib/planning';
import { useStore } from '../store/store';

const INVESTED_TYPES = new Set(['livret', 'epargne', 'pea', 'assurance_vie', 'per', 'cto', 'crypto']);
const PASSIVE_TAGS = new Set(['dividendes', 'interets', 'loyer_percu']);

export default function Freedom() {
  const txs = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts);
  const cats = useCategoryMap();
  const today = todayISO();

  // Moyennes sur les 12 derniers mois complets
  const stats = useMemo(() => {
    const current = monthKey(today);
    const from = addMonths(current, -12);
    const months = monthlySummaries(txs, cats).filter((m) => m.month >= from && m.month < current);
    const n = Math.max(1, months.length);
    const expense = months.reduce((s, m) => s + m.expense, 0) / n;
    const income = months.reduce((s, m) => s + m.income, 0) / n;
    let passive = 0;
    for (const t of txs) {
      if (t.amount <= 0 || monthKey(t.date) < from || monthKey(t.date) >= current) continue;
      const tag = t.categoryId ? cats.get(t.categoryId)?.taxTag : undefined;
      if (tag && PASSIVE_TAGS.has(tag)) passive += t.amount;
    }
    const invested = accounts.filter((a) => INVESTED_TYPES.has(a.type) && !a.archived).reduce((s, a) => s + accountBalance(a, txs), 0);
    return { months: months.length, expense: expense / 100, income: income / 100, passive: passive / n / 100, invested: invested / 100 };
  }, [txs, cats, accounts, today]);

  const [expenses, setExpenses] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [capital, setCapital] = useState<number | null>(null);
  const [swr, setSwr] = useState(3.5);
  const [realReturn, setRealReturn] = useState(4);

  const monthlyExpenses = expenses ?? Math.round(stats.expense);
  const monthlySaving = saving ?? Math.max(0, Math.round(stats.income - stats.expense));
  const current = capital ?? Math.round(stats.invested);
  const target = fireNumber(monthlyExpenses * 12, swr / 100);
  const years = yearsToTarget(current, monthlySaving * 12, realReturn / 100, target);
  const savingsRate = stats.income > 0 ? monthlySaving / stats.income : 0;
  const passiveCoverage = monthlyExpenses > 0 ? stats.passive / monthlyExpenses : 0;
  const fiYear = Number.isFinite(years) ? new Date().getFullYear() + Math.ceil(years) : null;

  return (
    <>
      <PageHead
        title="Liberté financière"
        subtitle="Combien faut-il pour vivre de ses placements, et quand y arriverez-vous ?"
      />
      <div className="stack">
        <div className="grid g4">
          <Stat label="Capital cible" value={euros(target)} sub={`${percent(swr / 100)} de retrait par an`} />
          <Stat label="Capital placé aujourd’hui" value={euros(current)} sub={`${percent(Math.min(1, current / target))} de l’objectif`} />
          <Stat
            label="Liberté financière"
            value={years === 0 ? 'Atteinte' : Number.isFinite(years) ? `${years.toFixed(1).replace('.', ',')} ans` : 'Hors d’atteinte'}
            sub={fiYear && years > 0 ? `vers ${fiYear}` : undefined}
            tone={years === 0 ? 'pos' : undefined}
          />
          <Stat label="Revenus passifs actuels" value={`${euros(stats.passive)} / mois`} sub={`${percent(passiveCoverage)} de vos dépenses`} />
        </div>

        <div className="grid g2">
          <Card title="Vos hypothèses">
            <div className="stack" style={{ gap: 12 }}>
              <div className="form-grid">
                <NumberField label="Dépenses mensuelles" value={monthlyExpenses} onChange={setExpenses} hint={`Moyenne observée : ${euros(stats.expense)}`} />
                <NumberField label="Épargne mensuelle investie" value={monthlySaving} onChange={setSaving} hint={`Taux d’épargne : ${percent(savingsRate)}`} />
                <NumberField label="Capital déjà placé" value={current} onChange={setCapital} hint="Livrets et placements (hors résidence)" />
                <NumberField label="Taux de retrait" suffix="%" value={swr} onChange={setSwr} hint="3 à 4 % ; 3,5 % est prudent" />
                <NumberField label="Rendement réel" suffix="%" value={realReturn} onChange={setRealReturn} hint="Après inflation et frais" />
              </div>
              <p className="faint small">
                Le capital cible est la somme dont les retraits annuels couvrent vos dépenses sans l’épuiser sur 30 ans ou plus (étude de Trinity, règle des 4 %).
                {stats.months < 12 && ` Moyennes calculées sur ${stats.months} mois : complétez votre historique pour plus de précision.`}
              </p>
            </div>
          </Card>

          <Card title="Ce qui accélère le plus">
            <div className="stack" style={{ gap: 10 }}>
              {[
                { label: 'Épargner 200 € de plus par mois', y: yearsToTarget(current, (monthlySaving + 200) * 12, realReturn / 100, target) },
                { label: 'Réduire les dépenses de 10 %', y: yearsToTarget(current, (monthlySaving + monthlyExpenses * 0.1) * 12, realReturn / 100, fireNumber(monthlyExpenses * 0.9 * 12, swr / 100)) },
                { label: 'Gagner 1 point de rendement (frais réduits)', y: yearsToTarget(current, monthlySaving * 12, (realReturn + 1) / 100, target) },
              ].map((x) => (
                <div key={x.label} className="row between small">
                  <span>{x.label}</span>
                  <span className="num">
                    {Number.isFinite(x.y) && Number.isFinite(years) ? (
                      <strong className="pos">−{(years - x.y).toFixed(1).replace('.', ',')} ans</strong>
                    ) : '—'}
                  </span>
                </div>
              ))}
              <p className="faint small">
                Réduire ses dépenses agit deux fois : on épargne davantage et on a besoin d’un capital plus petit. C’est le levier le plus puissant.
              </p>
              <div>
                <div className="row between small" style={{ marginBottom: 4 }}><span>Couverture des dépenses par les revenus passifs</span><span className="num">{percent(passiveCoverage)}</span></div>
                <Progress value={stats.passive} max={monthlyExpenses || 1} />
                <p className="faint small" style={{ marginTop: 4 }}>Dividendes, intérêts et loyers perçus (catégories avec étiquette fiscale), moyenne 12 mois.</p>
              </div>
            </div>
          </Card>
        </div>

        <Card title="Construire ses revenus passifs : par où commencer">
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {PASSIVE_ROADMAP.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </Card>

        <Card title="Comparatif des sources de revenus passifs" actions={<span className="faint small">Capital estimé pour 500 € nets par mois</span>}>
          <div>
            {PASSIVE_SOURCES.map((s) => (
              <details key={s.id} className="lever">
                <summary>
                  <span className="icon-chip">{s.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div className="muted small">{s.capital} · effort {s.effort.toLowerCase()} · risque {s.risk.toLowerCase()}</div>
                  </div>
                  <span className="badge num">
                    {s.badge ?? (s.netYield ? `${euros(6000 / s.netYield[1])} – ${euros(6000 / s.netYield[0])}` : 'Temps plutôt que capital')}
                  </span>
                </summary>
                <div className="body">
                  {s.netYield && (
                    <div className="callout accent">
                      Rendement net indicatif : {percent(s.netYield[0])} à {percent(s.netYield[1])} par an, soit {euros(s.netYield[0] * 100_000 / 12)} à{' '}
                      {euros(s.netYield[1] * 100_000 / 12)} par mois pour 100 000 € placés.
                    </div>
                  )}
                  <div><strong>Fiscalité : </strong>{s.tax}</div>
                  <div><strong>Disponibilité : </strong>{s.liquidity}</div>
                  <div><strong>Comment faire</strong><ul>{s.how.map((h) => <li key={h}>{h}</li>)}</ul></div>
                  <div className="callout warn"><strong>Points de vigilance</strong><ul>{s.watch.map((w) => <li key={w}>{w}</li>)}</ul></div>
                </div>
              </details>
            ))}
          </div>
          <p className="faint small" style={{ marginTop: 10 }}>
            Rendements de long terme indicatifs, non garantis. Méfiez-vous de toute offre promettant un revenu passif élevé sans risque : c’est la marque des
            arnaques (consultez les listes noires de l’AMF avant d’investir).
          </p>
        </Card>
      </div>
    </>
  );
}
