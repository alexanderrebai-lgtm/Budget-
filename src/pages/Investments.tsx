import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, ChartTooltip, NumberField, PageHead, Segmented, Stat } from '../components/ui';
import { euros, percent, kEuros } from '../lib/format';
import { borrowingCapacity, compareEnvelopes, rentalYield } from '../lib/simulators';
import { useStore } from '../store/store';
import { computeTax } from '../tax/engine';
import { DebtPlanner, FeesImpact } from './Planners';

type Tab = 'enveloppes' | 'frais' | 'dettes' | 'emprunt' | 'locatif';

export default function Investments() {
  const [tab, setTab] = useState<Tab>('enveloppes');
  return (
    <>
      <PageHead
        title="Simulateurs"
        subtitle="Faire fructifier son épargne et utiliser l’effet de levier du crédit."
        actions={
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'enveloppes', label: 'Placements' },
              { value: 'frais', label: 'Frais' },
              { value: 'dettes', label: 'Dettes' },
              { value: 'emprunt', label: 'Capacité d’emprunt' },
              { value: 'locatif', label: 'Investissement locatif' },
            ]}
          />
        }
      />
      {tab === 'enveloppes' && <Envelopes />}
      {tab === 'frais' && <FeesImpact />}
      {tab === 'dettes' && <DebtPlanner />}
      {tab === 'emprunt' && <Borrowing />}
      {tab === 'locatif' && <Rental />}
    </>
  );
}

const COLORS: Record<string, string> = { livret: '#94a3b8', cto: '#60a5fa', pea: '#2563eb', av: '#7c3aed', per: '#0f766e' };

function Envelopes() {
  const taxProfile = useStore((s) => s.taxProfile);
  const tax = useMemo(() => computeTax(taxProfile), [taxProfile]);
  const [initial, setInitial] = useState(5_000);
  const [monthly, setMonthly] = useState(200);
  const [years, setYears] = useState(15);
  const [ret, setRet] = useState(5);
  const [livret, setLivret] = useState(1.5);
  const [tmiNow, setTmiNow] = useState(Math.round(tax.marginalRate * 100) || 30);
  const [tmiRet, setTmiRet] = useState(11);

  const results = compareEnvelopes({
    initial, monthly, years, grossReturn: ret / 100, tmiNow: tmiNow / 100, tmiRetirement: tmiRet / 100,
    couple: taxProfile.status === 'couple', livretRate: livret / 100, pfuTotal: 0.314, socialRate: 0.186, lifeInsuranceSocialRate: 0.172,
  });
  const best = [...results].sort((a, b) => b.net - a.net)[0];
  const chart = Array.from({ length: years + 1 }, (_, y) => {
    const row: Record<string, number | string> = { name: `${y} an${y > 1 ? 's' : ''}` };
    for (const r of results) row[r.name] = Math.round(r.series[y] ?? 0);
    return row;
  });

  return (
    <div className="stack">
      <Card title="Hypothèses">
        <div className="form-grid">
          <NumberField label="Versement initial" value={initial} onChange={setInitial} />
          <NumberField label="Versement mensuel" value={monthly} onChange={setMonthly} />
          <NumberField label="Durée" suffix="ans" value={years} onChange={(n) => setYears(Math.min(50, Math.max(1, Math.round(n))))} />
          <NumberField label="Rendement brut annuel" suffix="%" value={ret} onChange={setRet} hint="Fonds euros ≈ 2,5-3,5 % · actions monde ≈ 6-7 % (long terme, non garanti)" />
          <NumberField label="Taux du livret" suffix="%" value={livret} onChange={setLivret} />
          <NumberField label="TMI actuelle" suffix="%" value={tmiNow} onChange={setTmiNow} hint="Reprise du simulateur d’impôt" />
          <NumberField label="TMI à la retraite" suffix="%" value={tmiRet} onChange={setTmiRet} />
        </div>
      </Card>

      <div className="grid g3">
        <Stat label="Total versé" value={euros(results[0].contributions)} />
        <Stat label="Meilleure enveloppe (net)" value={best.name} sub={euros(best.net)} />
        <Stat label="Gain net vs livret" value={euros(best.net - results[0].net)} tone="pos" />
      </div>

      <Card title="Capital brut au fil du temps">
        <div className="chart-box" style={{ height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={chart}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 12 }} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: 'var(--text-3)', fontSize: 12 }} tickFormatter={kEuros} />
              <Tooltip content={<ChartTooltip format={euros} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {results.map((r) => <Line key={r.id} type="monotone" dataKey={r.name} stroke={COLORS[r.id]} dot={false} strokeWidth={2} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Comparaison après impôts">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Enveloppe</th><th className="amount">Capital brut</th><th className="amount">Impôts à la sortie</th><th className="amount">Économie à l’entrée</th><th className="amount">Net</th></tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="row" style={{ gap: 8 }}><i className="dot" style={{ background: COLORS[r.id] }} /><strong style={{ fontWeight: 550 }}>{r.name}</strong></div>
                    <div className="faint small" style={{ maxWidth: 460 }}>{r.note}</div>
                  </td>
                  <td className="amount">{euros(r.grossValue)}</td>
                  <td className="amount">{euros(r.tax)}</td>
                  <td className="amount">{r.entrySaving ? euros(r.entrySaving) : '—'}</td>
                  <td className="amount"><strong>{euros(r.net)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint small" style={{ marginTop: 10 }}>
          Simplifications : rendement constant, frais de gestion moyens déduits (CTO/PEA 0,2 %, assurance-vie 0,6 %, PER 0,7 %), sortie en une fois. Fiscalité 2026 : flat tax de 31,4 % (dont 18,6 % de prélèvements sociaux) ; 17,2 % de prélèvements sociaux en assurance-vie.
          Les performances passées ne préjugent pas des performances futures ; un placement en actions peut perdre de la valeur.
        </p>
      </Card>
    </div>
  );
}

function Borrowing() {
  const [income, setIncome] = useState(3_500);
  const [existing, setExisting] = useState(0);
  const [rate, setRate] = useState(3.3);
  const [years, setYears] = useState(25);
  const [insurance, setInsurance] = useState(0.3);
  const [down, setDown] = useState(30_000);

  // Règle du HCSF : 35 % d'endettement maximum, assurance comprise, 25 ans (27 dans le neuf).
  const maxPayment = Math.max(0, income * 0.35 - existing);
  // Le capital dépend aussi de l'assurance (proportionnelle au capital) : résolution directe.
  const r = rate / 100 / 12;
  const n = years * 12;
  const factor = r === 0 ? 1 / n : r / (1 - Math.pow(1 + r, -n));
  const capital = maxPayment / (factor + insurance / 100 / 12);
  const approx = borrowingCapacity(maxPayment, rate / 100, years);
  const budget = capital + down;
  const totalCost = maxPayment * n - capital;

  return (
    <div className="stack">
      <Card title="Votre situation">
        <div className="form-grid">
          <NumberField label="Revenus nets mensuels du foyer" value={income} onChange={setIncome} hint="Avant prélèvement à la source" />
          <NumberField label="Mensualités de crédits en cours" value={existing} onChange={setExisting} />
          <NumberField label="Taux du crédit" suffix="%" value={rate} onChange={setRate} />
          <NumberField label="Durée" suffix="ans" value={years} onChange={(n) => setYears(Math.min(30, Math.max(5, Math.round(n))))} />
          <NumberField label="Taux d’assurance emprunteur" suffix="%" value={insurance} onChange={setInsurance} />
          <NumberField label="Apport personnel" value={down} onChange={setDown} />
        </div>
      </Card>
      <div className="grid g4">
        <Stat label="Mensualité maximale" value={euros(maxPayment)} sub="35 % des revenus, assurance comprise" />
        <Stat label="Capital empruntable" value={euros(capital)} sub={`${euros(approx)} hors assurance`} />
        <Stat label="Budget total avec apport" value={euros(budget)} sub="Frais de notaire et travaux à couvrir" />
        <Stat label="Coût du crédit" value={euros(totalCost)} sub="Intérêts et assurance" />
      </div>
      <div className="callout">
        Les banques appliquent la norme du Haut Conseil de stabilité financière : taux d’endettement de 35 % maximum et durée de 25 ans (27 ans dans le neuf).
        Elles regardent aussi votre « reste à vivre » et la stabilité de vos revenus. Un apport couvrant au moins les frais de notaire (7-8 % dans l’ancien) facilite l’accord.
        Pour un investissement locatif, 70 % des loyers attendus sont généralement ajoutés à vos revenus.
      </div>
    </div>
  );
}

function Rental() {
  const [price, setPrice] = useState(150_000);
  const [notary, setNotary] = useState(8);
  const [works, setWorks] = useState(10_000);
  const [furniture, setFurniture] = useState(0);
  const [rent, setRent] = useState(750);
  const [charges, setCharges] = useState(1_200);
  const [propertyTax, setPropertyTax] = useState(900);
  const [vacancy, setVacancy] = useState(0.5);
  const [down, setDown] = useState(20_000);
  const [rate, setRate] = useState(3.4);
  const [years, setYears] = useState(20);

  const r = rentalYield({
    price, notaryRate: notary / 100, works, furniture, monthlyRent: rent, annualCharges: charges, propertyTax,
    vacancyMonths: vacancy, downPayment: down, loanRate: rate / 100, loanYears: years, insuranceRate: 0.003,
  });

  return (
    <div className="stack">
      <Card title="Le projet">
        <div className="form-grid">
          <NumberField label="Prix d’achat" value={price} onChange={setPrice} />
          <NumberField label="Frais de notaire" suffix="%" value={notary} onChange={setNotary} hint="≈ 8 % ancien, 2-3 % neuf" />
          <NumberField label="Travaux" value={works} onChange={setWorks} />
          <NumberField label="Mobilier (meublé)" value={furniture} onChange={setFurniture} />
          <NumberField label="Loyer mensuel hors charges" value={rent} onChange={setRent} />
          <NumberField label="Charges annuelles non récupérables" value={charges} onChange={setCharges} hint="Copropriété, assurance PNO, gestion" />
          <NumberField label="Taxe foncière" value={propertyTax} onChange={setPropertyTax} />
          <NumberField label="Vacance locative" suffix="mois/an" value={vacancy} onChange={setVacancy} />
          <NumberField label="Apport" value={down} onChange={setDown} />
          <NumberField label="Taux du crédit" suffix="%" value={rate} onChange={setRate} />
          <NumberField label="Durée du crédit" suffix="ans" value={years} onChange={(n) => setYears(Math.max(1, Math.round(n)))} />
        </div>
      </Card>
      <div className="grid g4">
        <Stat label="Coût total de l’opération" value={euros(r.totalCost)} sub={`Emprunt : ${euros(r.loan)}`} />
        <Stat label="Rendement brut" value={percent(r.gross)} />
        <Stat label="Rendement net de charges" value={percent(r.net)} sub="Avant impôts" />
        <Stat label="Cash-flow mensuel" value={euros(r.cashflow)} tone={r.cashflow >= 0 ? 'pos' : 'neg'} sub={`Mensualité ${euros(r.payment)}`} />
      </div>
      <div className="callout">
        {r.cashflow >= 0
          ? 'Les loyers couvrent le crédit et les charges : le locataire finance votre patrimoine. '
          : `Effort d’épargne de ${euros(-r.cashflow)} par mois avant impôts. `}
        Choisissez ensuite le régime fiscal dans le simulateur d’impôt : en location meublée (LMNP au réel), l’amortissement efface souvent l’impôt sur les loyers pendant
        de longues années ; en location nue, le régime réel permet de déduire intérêts et travaux et de créer un déficit foncier imputable sur vos autres revenus.
      </div>
    </div>
  );
}
