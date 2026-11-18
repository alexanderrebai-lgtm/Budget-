import { useMemo } from 'react';
import { Card, Empty, PageHead, Stat, useCategoryMap } from '../components/ui';
import { detectRecurring } from '../lib/analysis';
import { dateLabel, money, money0 } from '../lib/format';
import { useStore } from '../store/store';

export default function Recurring() {
  const txs = useStore((s) => s.transactions);
  const cats = useCategoryMap();
  const all = useMemo(() => detectRecurring(txs), [txs]);
  const expenses = all.filter((r) => !r.isIncome);
  const incomes = all.filter((r) => r.isIncome);
  const annual = expenses.reduce((s, r) => s + r.annualCost, 0);
  const subs = expenses.filter((r) => cats.get(r.categoryId ?? '')?.id === 'exp-subscriptions');

  return (
    <>
      <PageHead title="Abonnements et prélèvements" subtitle="Détectés automatiquement : même marchand, montant stable, intervalle régulier." />
      <div className="stack">
        <div className="grid g3">
          <Stat label="Dépenses récurrentes / an" value={money0(annual)} sub={`${money0(annual / 12)} par mois`} />
          <Stat label="Abonnements loisirs / an" value={money0(subs.reduce((s, r) => s + r.annualCost, 0))} sub={`${subs.length} abonnement(s)`} />
          <Stat label="Revenus récurrents / an" value={money0(incomes.reduce((s, r) => s + r.annualCost, 0))} />
        </div>

        {all.length === 0 ? (
          <Card><Empty icon="↻" title="Rien de détecté pour l’instant">Il faut au moins 3 occurrences d’un même prélèvement.</Empty></Card>
        ) : (
          <>
            <div className="callout">
              Astuce : résilier un abonnement à 15 €/mois, c’est 180 € par an. Placés à 3 % pendant 10 ans, ces versements représentent environ 2 100 €.
              La loi permet de résilier en 3 clics les contrats souscrits en ligne, et la plupart des assurances au bout d’un an (loi Hamon).
            </div>
            <Card title="Prélèvements">
              <Table rows={expenses} cats={cats} />
            </Card>
            {incomes.length > 0 && (
              <Card title="Revenus réguliers">
                <Table rows={incomes} cats={cats} />
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Table({ rows, cats }: { rows: ReturnType<typeof detectRecurring>; cats: ReturnType<typeof useCategoryMap> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Libellé</th><th>Fréquence</th><th>Prochaine</th><th className="amount">Montant</th><th className="amount">Par an</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const c = cats.get(r.categoryId ?? '');
            return (
              <tr key={r.key}>
                <td>
                  <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                    <span className="icon-chip">{c?.icon ?? '↻'}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="ellipsis" style={{ maxWidth: 300 }}>{r.label}</div>
                      <div className="faint small">{c?.name ?? 'À catégoriser'} · {r.occurrences} occurrences</div>
                    </div>
                  </div>
                </td>
                <td><span className="badge">{r.frequency}</span></td>
                <td className="small muted">{dateLabel(r.nextDate)}</td>
                <td className="amount">{money(r.averageAmount)}</td>
                <td className="amount"><strong>{money0(r.annualCost)}</strong></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
