import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, ChartTooltip, NumberField, PageHead, Stat, toast } from '../components/ui';
import { accountBalance } from '../lib/analysis';
import { euros, money0, percent, shortMonth, toCents, todayISO, kEuros } from '../lib/format';
import type { Account, AccountType } from '../lib/types';
import { useStore } from '../store/store';

export const ACCOUNT_TYPES: Record<AccountType, { label: string; color: string; liquid: boolean; manual: boolean }> = {
  courant: { label: 'Compte courant', color: '#0f766e', liquid: true, manual: false },
  livret: { label: 'Livret réglementé', color: '#14b8a6', liquid: true, manual: false },
  epargne: { label: 'Épargne bancaire', color: '#5eead4', liquid: true, manual: false },
  pea: { label: 'PEA', color: '#2563eb', liquid: false, manual: true },
  assurance_vie: { label: 'Assurance-vie', color: '#7c3aed', liquid: false, manual: true },
  per: { label: 'PER', color: '#0369a1', liquid: false, manual: true },
  cto: { label: 'Compte-titres', color: '#60a5fa', liquid: false, manual: true },
  crypto: { label: 'Crypto-actifs', color: '#f59e0b', liquid: false, manual: true },
  immobilier: { label: 'Immobilier', color: '#a16207', liquid: false, manual: true },
  credit: { label: 'Crédit (dette)', color: '#dc2626', liquid: false, manual: true },
  autre: { label: 'Autre', color: '#94a3b8', liquid: false, manual: true },
};

export default function Wealth() {
  const accounts = useStore((s) => s.accounts);
  const txs = useStore((s) => s.transactions);
  const snapshots = useStore((s) => s.snapshots);
  const { addAccount, updateAccount, deleteAccount } = useStore.getState();
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const rows = useMemo(
    () => accounts.filter((a) => !a.archived).map((a) => ({ a, balance: accountBalance(a, txs) })),
    [accounts, txs],
  );
  const assets = rows.filter((r) => r.balance > 0).reduce((s, r) => s + r.balance, 0);
  const debts = rows.filter((r) => r.balance < 0).reduce((s, r) => s - r.balance, 0);
  const liquid = rows.filter((r) => ACCOUNT_TYPES[r.a.type].liquid).reduce((s, r) => s + r.balance, 0);

  const byType = new Map<AccountType, number>();
  for (const r of rows) if (r.balance > 0) byType.set(r.a.type, (byType.get(r.a.type) ?? 0) + r.balance);
  const pie = [...byType.entries()].map(([t, v]) => ({ name: ACCOUNT_TYPES[t].label, value: v / 100, color: ACCOUNT_TYPES[t].color }));

  const history = snapshots.slice(-24).map((s) => ({ name: shortMonth(s.month), Patrimoine: s.value / 100 }));

  return (
    <>
      <PageHead
        title="Comptes et patrimoine"
        subtitle="Comptes bancaires, placements, immobilier et crédits."
        actions={<button className="primary" onClick={() => setEditing('new')}>+ Ajouter un compte</button>}
      />
      <div className="stack">
        <div className="grid g4">
          <Stat label="Patrimoine net" value={money0(assets - debts)} />
          <Stat label="Actifs" value={money0(assets)} />
          <Stat label="Dettes" value={money0(debts)} tone={debts ? 'neg' : undefined} />
          <Stat label="Épargne disponible" value={money0(liquid)} sub="Comptes et livrets" />
        </div>

        {editing && (
          <AccountForm
            account={editing === 'new' ? undefined : accounts.find((a) => a.id === editing)}
            onCancel={() => setEditing(null)}
            onSave={(a) => {
              if (editing === 'new') addAccount(a);
              else updateAccount(editing, a);
              setEditing(null);
              toast('Compte enregistré.');
            }}
          />
        )}

        <div className="grid g3">
          <Card title="Vos comptes" className="span2">
            <div className="list">
              {rows.map(({ a, balance }) => (
                <div key={a.id} className="list-item">
                  <span className="dot" style={{ background: ACCOUNT_TYPES[a.type].color, width: 10, height: 10 }} />
                  <div className="grow">
                    <div>{a.name}</div>
                    <div className="faint small">
                      {ACCOUNT_TYPES[a.type].label}
                      {a.bank ? ` · 🏦 relié à ${a.bank.bankName}` : ''}
                      {a.valuation !== undefined && a.valuationDate ? ` · valorisé au ${new Date(a.valuationDate).toLocaleDateString('fr-FR')}` : ''}
                    </div>
                  </div>
                  <strong className={`num ${balance < 0 ? 'neg' : ''}`}>{money0(balance)}</strong>
                  <button className="small ghost" onClick={() => setEditing(a.id)}>Modifier</button>
                  <button
                    className="small ghost danger"
                    onClick={() => confirm(`Supprimer « ${a.name} » et ses opérations ?`) && deleteAccount(a.id)}
                  >
                    Supprimer
                  </button>
                </div>
              ))}
              {rows.length === 0 && <p className="muted">Aucun compte.</p>}
            </div>
          </Card>
          <Card title="Répartition">
            {pie.length === 0 ? <p className="muted">—</p> : (
              <>
                <div style={{ height: 170 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie isAnimationActive={false} data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={76} stroke="var(--surface)">
                        {pie.map((p) => <Cell key={p.name} fill={p.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip format={euros} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {pie.map((p) => (
                  <div key={p.name} className="row between small" style={{ padding: '3px 0' }}>
                    <span className="row" style={{ gap: 8 }}><i className="dot" style={{ background: p.color }} />{p.name}</span>
                    <span className="num">{percent((p.value * 100) / assets)}</span>
                  </div>
                ))}
              </>
            )}
          </Card>
        </div>

        <Card title="Évolution du patrimoine">
          {history.length < 2 ? (
            <p className="muted">L’historique se construit automatiquement : un point est enregistré chaque mois où vous ouvrez l’application.</p>
          ) : (
            <div className="chart-box">
              <ResponsiveContainer>
                <AreaChart data={history}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={60} tick={{ fill: 'var(--text-3)', fontSize: 12 }} tickFormatter={kEuros} />
                  <Tooltip content={<ChartTooltip format={euros} />} />
                  <Area type="monotone" dataKey="Patrimoine" stroke="var(--accent)" fill="var(--accent-soft)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <div className="callout">
          Épargne de précaution : visez 3 à 6 mois de dépenses sur des supports disponibles (livret A, LDDS, LEP si vous y avez droit). Au-delà,
          faites travailler votre argent sur des enveloppes long terme : PEA, assurance-vie, PER. Voir <a href="#/placements">les simulateurs</a>.
        </div>
      </div>
    </>
  );
}

function AccountForm({ account, onSave, onCancel }: { account?: Account; onSave: (a: Omit<Account, 'id'>) => void; onCancel: () => void }) {
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'courant');
  const [opening, setOpening] = useState((account?.openingBalance ?? 0) / 100);
  const [valuation, setValuation] = useState((account?.valuation ?? 0) / 100);
  const manual = ACCOUNT_TYPES[type].manual;
  const [share, setShare] = useState(account?.share ?? 100);
  const [feePct, setFeePct] = useState(account?.feeRate !== undefined ? +(account.feeRate * 100).toFixed(2) : 0);
  const [ratePct, setRatePct] = useState(account?.rate !== undefined ? +(account.rate * 100).toFixed(2) : 0);
  const [payment, setPayment] = useState((account?.monthlyPayment ?? 0) / 100);
  const investment = ['pea', 'assurance_vie', 'per', 'cto'].includes(type);

  return (
    <Card title={account ? `Modifier « ${account.name} »` : 'Nouveau compte'}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const sign = type === 'credit' ? -1 : 1;
          onSave({
            name: name.trim() || ACCOUNT_TYPES[type].label,
            type,
            openingBalance: manual ? 0 : toCents(opening),
            valuation: manual ? sign * Math.abs(toCents(valuation)) : undefined,
            valuationDate: manual ? todayISO() : undefined,
            share: share > 0 && share < 100 ? share : undefined,
            feeRate: investment && feePct > 0 ? feePct / 100 : undefined,
            rate: type === 'credit' && ratePct > 0 ? ratePct / 100 : undefined,
            monthlyPayment: type === 'credit' && payment > 0 ? toCents(payment) : undefined,
          });
        }}
      >
        <div className="form-grid">
          <label className="field"><span>Nom</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Livret A" /></label>
          <label className="field"><span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          {manual ? (
            <NumberField
              label={type === 'credit' ? 'Capital restant dû' : 'Valeur actuelle'}
              value={Math.abs(valuation)}
              onChange={setValuation}
              hint="Mettez-la à jour de temps en temps."
            />
          ) : (
            <NumberField label="Solde de départ" value={opening} onChange={setOpening} min={-1e9} hint="Solde avant la première opération suivie." />
          )}
          {type === 'courant' && (
            <NumberField label="Votre part (compte joint)" suffix="%" value={share} onChange={(n) => setShare(Math.min(100, n))} hint="100 % si le compte est à vous seul" />
          )}
          {investment && (
            <NumberField label="Frais de gestion annuels" suffix="%" value={feePct} onChange={setFeePct} hint="Contrat + supports (ETF, fonds)" />
          )}
          {type === 'credit' && (
            <>
              <NumberField label="Taux annuel" suffix="%" value={ratePct} onChange={setRatePct} />
              <NumberField label="Mensualité" value={payment} onChange={setPayment} />
            </>
          )}
        </div>
        <div className="row">
          <button className="primary" type="submit">Enregistrer</button>
          <button type="button" className="ghost" onClick={onCancel}>Annuler</button>
        </div>
      </form>
    </Card>
  );
}
