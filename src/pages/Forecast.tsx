import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, ChartTooltip, Empty, NumberField, PageHead, Segmented, Stat, toast } from '../components/ui';
import { accountBalance, detectRecurring, merchantKey } from '../lib/analysis';
import { dateLabel, euros, kEuros, money, money0, toCents, todayISO } from '../lib/format';
import { forecastBalance, upcomingEvents } from '../lib/planning';
import { useStore } from '../store/store';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export default function Forecast() {
  const txs = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts);
  const categories = useStore((s) => s.categories);
  const provisions = useStore((s) => s.provisions);
  const { addProvision, deleteProvision } = useStore.getState();
  const [days, setDays] = useState<'30' | '90' | '180'>('90');
  const today = todayISO();
  const horizon = Number(days);

  const model = useMemo(() => {
    const cash = accounts.filter((a) => a.type === 'courant' && !a.archived);
    const cashIds = new Set(cash.map((a) => a.id));
    const cashTxs = txs.filter((t) => cashIds.has(t.accountId));
    const start = cash.reduce((s, a) => s + accountBalance(a, txs), 0);
    const recurring = detectRecurring(cashTxs);
    const recurringKeys = new Set(recurring.map((r) => r.key));
    const transferCats = new Set(categories.filter((c) => c.kind === 'transfer').map((c) => c.id));
    // dépenses courantes hors prélèvements récurrents, sur les 90 derniers jours
    const since = new Date(`${today}T12:00:00`);
    since.setDate(since.getDate() - 90);
    const sinceIso = since.toISOString().slice(0, 10);
    let variable = 0;
    for (const t of cashTxs) {
      if (t.date < sinceIso || t.date > today || t.amount >= 0) continue;
      if (t.categoryId && transferCats.has(t.categoryId)) continue;
      if (recurringKeys.has(`${merchantKey(t.label)}|-`)) continue;
      variable += -t.amount;
    }
    const daily = Math.round(variable / 90);
    const events = upcomingEvents(recurring, provisions, today, horizon);
    const points = forecastBalance(start, events, daily, today, horizon);
    const low = points.reduce((m, p) => (p.balance < m.balance ? p : m), points[0]);
    return { start, daily, events, points, low, hasCash: cash.length > 0 };
  }, [txs, accounts, categories, provisions, today, horizon]);

  const chart = model.points.map((p) => ({ name: dateLabel(p.date).replace(/ \d{4}$/, ''), Solde: p.balance / 100 }));
  const end = model.points[model.points.length - 1];
  const yearlyProvisions = provisions.reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <PageHead
        title="Prévisions"
        subtitle="Solde projeté de vos comptes courants d’après vos prélèvements, revenus réguliers et dépenses habituelles."
        actions={<Segmented value={days} onChange={setDays} options={[{ value: '30', label: '30 jours' }, { value: '90', label: '3 mois' }, { value: '180', label: '6 mois' }]} />}
      />
      {!model.hasCash ? (
        <Card><Empty icon="📈" title="Aucun compte courant">Ajoutez un compte courant et quelques mois d’opérations pour obtenir une prévision.</Empty></Card>
      ) : (
        <div className="stack">
          <div className="grid g4">
            <Stat label="Solde aujourd’hui" value={money0(model.start)} />
            <Stat label={`Solde dans ${horizon} jours`} value={money0(end.balance)} tone={end.balance < 0 ? 'neg' : undefined} />
            <Stat label="Point le plus bas" value={money0(model.low.balance)} tone={model.low.balance < 0 ? 'neg' : undefined} sub={dateLabel(model.low.date)} />
            <Stat label="Dépenses courantes" value={`${money0(model.daily * 30)} / mois`} sub="Hors prélèvements, moyenne 3 mois" />
          </div>

          {model.low.balance < 0 && (
            <div className="callout danger">
              Votre compte risque de passer à découvert vers le {dateLabel(model.low.date)} ({money0(model.low.balance)}). Anticipez un virement depuis
              l’épargne ou décalez une dépense : les agios et frais d’incident coûtent vite plus cher.
            </div>
          )}

          <Card title="Solde projeté">
            <div className="chart-box" style={{ height: 280 }}>
              <ResponsiveContainer>
                <AreaChart data={chart}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 12 }} interval={Math.floor(horizon / 6)} />
                  <YAxis tickLine={false} axisLine={false} width={60} tick={{ fill: 'var(--text-3)', fontSize: 12 }} tickFormatter={kEuros} />
                  <Tooltip content={<ChartTooltip format={euros} />} />
                  <ReferenceLine y={0} stroke="var(--neg)" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="Solde" stroke="var(--accent)" fill="var(--accent-soft)" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="faint small" style={{ marginTop: 8 }}>
              Estimation : les prélèvements et revenus réguliers sont détectés automatiquement, les autres dépenses sont lissées chaque jour.
            </p>
          </Card>

          <div className="grid g2">
            <Card title="Calendrier des échéances">
              {model.events.length === 0 ? (
                <p className="muted">Aucune échéance détectée sur la période.</p>
              ) : (
                <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {model.events.map((e, i) => (
                    <div key={i} className="list-item small">
                      <span className="badge" style={{ minWidth: 92, justifyContent: 'center' }}>{dateLabel(e.date)}</span>
                      <span className="grow ellipsis">{e.label}{e.kind === 'provision' && <span className="faint"> · provision</span>}</span>
                      <span className={`num ${e.amount > 0 ? 'pos' : ''}`}>{money(e.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Provisions pour dépenses annuelles" actions={<span className="badge accent">{money0(yearlyProvisions / 12)} / mois</span>}>
              <div className="stack" style={{ gap: 10 }}>
                <p className="muted small">
                  Taxe foncière, assurance auto, vacances, cadeaux de Noël, entretien de la voiture… Mettez de côté chaque mois le douzième de ces
                  dépenses pour ne plus être surpris.
                </p>
                <ProvisionForm onAdd={(p) => { addProvision(p); toast('Provision ajoutée.'); }} />
                <div className="list">
                  {provisions
                    .slice()
                    .sort((a, b) => a.month - b.month)
                    .map((p) => (
                      <div key={p.id} className="list-item small">
                        <span className="grow">{p.name} <span className="faint">· {MONTHS[p.month - 1]}</span></span>
                        <span className="num">{money0(p.amount)}</span>
                        <span className="faint num">{money0(p.amount / 12)}/mois</span>
                        <button className="ghost small danger" onClick={() => deleteProvision(p.id)} aria-label="Supprimer">×</button>
                      </div>
                    ))}
                  {provisions.length === 0 && <p className="faint small">Aucune provision.</p>}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function ProvisionForm({ onAdd }: { onAdd: (p: { name: string; amount: number; month: number }) => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  return (
    <form
      className="row"
      style={{ alignItems: 'flex-end' }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || amount <= 0) return;
        onAdd({ name: name.trim(), amount: toCents(amount), month });
        setName('');
        setAmount(0);
      }}
    >
      <label className="field" style={{ flex: 2, minWidth: 140 }}><span>Dépense</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Taxe foncière" /></label>
      <div style={{ flex: 1, minWidth: 110 }}><NumberField label="Montant annuel" value={amount} onChange={setAmount} /></div>
      <label className="field" style={{ flex: 1, minWidth: 120 }}><span>Mois</span>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </label>
      <button type="submit">Ajouter</button>
    </form>
  );
}
