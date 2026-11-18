import { useMemo, useState } from 'react';
import { Card, NumberField, Segmented, Stat } from '../components/ui';
import { accountBalance } from '../lib/analysis';
import { euros, percent, uid } from '../lib/format';
import { simulatePayoff, valueWithFees, type Debt } from '../lib/planning';
import { useStore } from '../store/store';

const monthsLabel = (m: number) => {
  if (!Number.isFinite(m)) return 'jamais';
  const y = Math.floor(m / 12);
  const r = m % 12;
  return [y ? `${y} an${y > 1 ? 's' : ''}` : '', r ? `${r} mois` : ''].filter(Boolean).join(' ') || '0 mois';
};

/** Comparateur boule de neige / avalanche, prérempli avec les crédits enregistrés. */
export function DebtPlanner() {
  const accounts = useStore((s) => s.accounts);
  const txs = useStore((s) => s.transactions);
  const initial = useMemo<Debt[]>(() => {
    const fromAccounts = accounts
      .filter((a) => a.type === 'credit' && !a.archived)
      .map((a) => ({ id: a.id, name: a.name, balance: Math.abs(accountBalance(a, txs)) / 100, rate: a.rate ?? 0.05, minPayment: (a.monthlyPayment ?? 0) / 100 || 100 }));
    return fromAccounts.length
      ? fromAccounts
      : [
          { id: uid(), name: 'Crédit renouvelable', balance: 2_500, rate: 0.19, minPayment: 80 },
          { id: uid(), name: 'Crédit conso', balance: 6_000, rate: 0.07, minPayment: 180 },
          { id: uid(), name: 'Crédit auto', balance: 11_000, rate: 0.045, minPayment: 260 },
        ];
  }, [accounts, txs]);
  const [debts, setDebts] = useState<Debt[]>(initial);
  const [extra, setExtra] = useState(150);
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche');

  const upd = (id: string, patch: Partial<Debt>) => setDebts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const res = simulatePayoff(debts, extra, strategy);
  const other = simulatePayoff(debts, extra, strategy === 'avalanche' ? 'snowball' : 'avalanche');
  const minimumOnly = simulatePayoff(debts, 0, strategy);

  return (
    <div className="stack">
      <Card title="Vos dettes" actions={<button className="small" onClick={() => setDebts([...debts, { id: uid(), name: 'Nouvelle dette', balance: 1_000, rate: 0.06, minPayment: 50 }])}>+ Ajouter</button>}>
        <div className="stack" style={{ gap: 10 }}>
          {debts.map((d) => (
            <div key={d.id} className="row" style={{ alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: 2, minWidth: 150 }}><span>Nom</span><input value={d.name} onChange={(e) => upd(d.id, { name: e.target.value })} /></label>
              <div style={{ flex: 1, minWidth: 110 }}><NumberField label="Restant dû" value={d.balance} onChange={(n) => upd(d.id, { balance: n })} /></div>
              <div style={{ flex: 1, minWidth: 90 }}><NumberField label="Taux" suffix="%" value={+(d.rate * 100).toFixed(2)} onChange={(n) => upd(d.id, { rate: n / 100 })} /></div>
              <div style={{ flex: 1, minWidth: 110 }}><NumberField label="Mensualité" value={d.minPayment} onChange={(n) => upd(d.id, { minPayment: n })} /></div>
              <button className="ghost small danger" onClick={() => setDebts(debts.filter((x) => x.id !== d.id))} aria-label="Retirer">×</button>
            </div>
          ))}
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ width: 220 }}><NumberField label="Effort supplémentaire par mois" value={extra} onChange={setExtra} /></div>
            <Segmented
              value={strategy}
              onChange={setStrategy}
              options={[{ value: 'avalanche', label: 'Avalanche (taux le plus élevé)' }, { value: 'snowball', label: 'Boule de neige (plus petit solde)' }]}
            />
          </div>
        </div>
      </Card>

      {!res.feasible ? (
        <div className="callout danger">Les mensualités ne couvrent pas les intérêts : la dette ne diminue jamais. Augmentez l’effort mensuel.</div>
      ) : (
        <>
          <div className="grid g4">
            <Stat label="Libéré de vos dettes dans" value={monthsLabel(res.months)} />
            <Stat label="Intérêts payés" value={euros(res.totalInterest)} />
            <Stat label="Gagné grâce à l’effort supplémentaire" value={euros(Math.max(0, minimumOnly.totalInterest - res.totalInterest))} tone="pos" sub={`${monthsLabel(Math.max(0, minimumOnly.months - res.months))} plus tôt`} />
            <Stat label={`Écart avec ${strategy === 'avalanche' ? 'la boule de neige' : 'l’avalanche'}`} value={euros(other.totalInterest - res.totalInterest)} sub="d’intérêts" />
          </div>
          <Card title="Ordre de remboursement">
            <div className="list">
              {res.order.map((id, i) => {
                const d = debts.find((x) => x.id === id)!;
                return (
                  <div key={id} className="list-item small">
                    <span className="badge accent">{i + 1}</span>
                    <span className="grow">{d.name} <span className="faint">· {percent(d.rate)}</span></span>
                    <span>soldée dans {monthsLabel(res.payoffMonth[id])}</span>
                  </div>
                );
              })}
            </div>
            <p className="faint small" style={{ marginTop: 10 }}>
              L’avalanche minimise les intérêts. La boule de neige solde vite les petites dettes : moins rentable, mais très motivant. Dans les deux cas, la
              mensualité d’une dette soldée est reportée sur la suivante. Pensez aussi au rachat de crédits ou à la renégociation si les taux ont baissé.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

/** Impact des frais de gestion sur le long terme (inspiré des « scanners de frais »). */
export function FeesImpact() {
  const accounts = useStore((s) => s.accounts);
  const txs = useStore((s) => s.transactions);
  const [years, setYears] = useState(20);
  const [ret, setRet] = useState(6);
  const [monthly, setMonthly] = useState(200);
  const [cheap, setCheap] = useState(0.3);

  const rows = accounts
    .filter((a) => ['pea', 'assurance_vie', 'per', 'cto'].includes(a.type) && !a.archived)
    .map((a) => {
      const balance = accountBalance(a, txs) / 100;
      const fee = a.feeRate ?? 0;
      const withFees = valueWithFees(balance, 0, years, ret / 100, fee);
      const lowCost = valueWithFees(balance, 0, years, ret / 100, cheap / 100);
      return { a, balance, fee, loss: lowCost - withFees };
    });

  const sample = [0.3, 1, 2, 3].map((f) => ({ fee: f, value: valueWithFees(10_000, monthly, years, ret / 100, f / 100) }));

  return (
    <div className="stack">
      <Card title="Hypothèses">
        <div className="form-grid">
          <NumberField label="Durée" suffix="ans" value={years} onChange={(n) => setYears(Math.max(1, Math.min(50, Math.round(n))))} />
          <NumberField label="Rendement brut" suffix="%" value={ret} onChange={setRet} />
          <NumberField label="Versement mensuel (exemple)" value={monthly} onChange={setMonthly} />
          <NumberField label="Frais d’une solution économique" suffix="%" value={cheap} onChange={setCheap} hint="ETF en ligne ≈ 0,2-0,5 %" />
        </div>
      </Card>

      <Card title="Ce que coûtent les frais">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Frais annuels</th><th className="amount">Capital final</th><th className="amount">Perdu à cause des frais</th></tr></thead>
            <tbody>
              {sample.map((s) => (
                <tr key={s.fee}>
                  <td>{s.fee.toLocaleString('fr-FR')} %</td>
                  <td className="amount">{euros(s.value)}</td>
                  <td className="amount neg">{s.fee === sample[0].fee ? '—' : euros(sample[0].value - s.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint small" style={{ marginTop: 8 }}>
          Exemple : 10 000 € de départ puis {euros(monthly)} par mois pendant {years} ans. Les contrats bancaires classiques cumulent souvent 2 à 3 % de frais
          par an (gestion du contrat + frais des fonds), contre 0,5 % pour un contrat en ligne investi en ETF.
        </p>
      </Card>

      <Card title="Vos placements">
        {rows.length === 0 ? (
          <p className="muted">Ajoutez vos PEA, assurances-vie, PER et comptes-titres dans « Comptes et patrimoine », avec leurs frais annuels.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Compte</th><th className="amount">Valeur</th><th className="amount">Frais</th><th className="amount">Manque à gagner sur {years} ans</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.a.id}>
                    <td>{r.a.name}</td>
                    <td className="amount">{euros(r.balance)}</td>
                    <td className="amount">{r.fee ? `${(r.fee * 100).toLocaleString('fr-FR')} %` : <span className="faint">à renseigner</span>}</td>
                    <td className={`amount ${r.loss > 0 ? 'neg' : ''}`}>{r.fee ? euros(r.loss) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="faint small" style={{ marginTop: 8 }}>
          Les frais figurent dans le document d’informations clés (DIC) de chaque fonds et dans les conditions générales du contrat. Un PEA ou une
          assurance-vie peut être transféré ou complété par un contrat moins cher (le transfert d’assurance-vie conserve l’antériorité fiscale chez le même assureur).
        </p>
      </Card>
    </div>
  );
}
