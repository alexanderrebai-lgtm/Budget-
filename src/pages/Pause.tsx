import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CategorySelect, Empty, NumberField, PageHead, Segmented, toast, useCategoryMap } from '../components/ui';
import { enableReminders, notificationsSupported, useReminders } from '../alerts/notify';
import { computeEstimates } from '../lib/estimates';
import { addMonths, dateLabel, money, money0, monthKey, monthLabel, percent, todayISO, toCents } from '../lib/format';
import {
  PAUSE_DELAYS,
  REFLECTION_QUESTIONS,
  pauseState,
  pauseStats,
  progress,
  remaining,
  suggestedDelay,
  wantsSummary,
  workHours,
} from '../lib/pauses';
import type { Pause as PauseItem } from '../lib/types';
import { useViewTransactions } from '../lib/useView';
import { useStore } from '../store/store';

/** Horloge rafraîchie toutes les 30 s pour les comptes à rebours. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Ring({ value, size = 54 }: { value: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ flex: 'none' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

const hoursLabel = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h.toLocaleString('fr-FR', { maximumFractionDigits: h < 10 ? 1 : 0 })} h`);

export default function Pause() {
  const now = useNow();
  const pauses = useStore((s) => s.pauses);
  const addPause = useStore((s) => s.addPause);
  const decidePause = useStore((s) => s.decidePause);
  const updatePause = useStore((s) => s.updatePause);
  const deletePause = useStore((s) => s.deletePause);
  const accounts = useStore((s) => s.accounts);
  const provisions = useStore((s) => s.provisions);
  const txs = useViewTransactions();
  const cats = useCategoryMap();
  const reminders = useReminders((s) => s.enabled);

  const thisMonth = monthKey(todayISO());
  const est = useMemo(() => computeEstimates(txs, cats, accounts, provisions, thisMonth, 6), [txs, cats, accounts, provisions, thisMonth]);
  // mois affiché pour les envies : le mois en cours, ou le précédent s'il est encore vide
  const wants = useMemo(() => {
    const cur = wantsSummary(txs, cats, thisMonth);
    return cur.count ? cur : wantsSummary(txs, cats, addMonths(thisMonth, -1));
  }, [txs, cats, thisMonth]);
  const stats = useMemo(() => pauseStats(pauses, now), [pauses, now]);

  const [item, setItem] = useState('');
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [delay, setDelay] = useState<number | null>(null);
  const [error, setError] = useState('');
  const cents = toCents(amount);
  const hours = delay ?? suggestedDelay(cents);
  const work = workHours(cents, est.income.monthly);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.trim()) return setError('Notez ce que vous comptez acheter.');
    if (!(cents > 0)) return setError('Indiquez un montant.');
    setError('');
    const until = new Date(Date.now() + hours * 3_600_000).toISOString();
    addPause({ item: item.trim(), amount: cents, categoryId, reason: reason.trim() || undefined, until });
    toast(`Pause lancée : on en reparle dans ${PAUSE_DELAYS.find((d) => d.hours === hours)?.label ?? `${hours} h`}.`);
    setItem('');
    setAmount(0);
    setReason('');
    setCategoryId(null);
    setDelay(null);
  };

  const ready = pauses.filter((p) => pauseState(p, now) === 'ready').sort((a, b) => a.until.localeCompare(b.until));
  const waiting = pauses.filter((p) => pauseState(p, now) === 'waiting').sort((a, b) => a.until.localeCompare(b.until));
  const decided = pauses.filter((p) => p.status !== 'waiting').sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''));

  const extend = (p: PauseItem) => {
    updatePause(p.id, { until: new Date(Date.now() + 24 * 3_600_000).toISOString() });
    // une nouvelle notification partira à la fin du nouveau délai
    useReminders.setState((s) => {
      const sent = { ...s.sent };
      delete sent[`pause:${p.id}`];
      return { sent };
    });
    toast('Encore 24 h de réflexion.');
  };

  return (
    <>
      <PageHead
        title="Pause avant achat"
        subtitle="Une envie ? Notez-la et laissez passer un délai avant d’acheter. Si l’envie tient toujours, achetez sans culpabiliser ; sinon, c’est de l’argent gardé."
      />

      <div className="stack">
        {ready.length > 0 && (
          <Card title={`À décider (${ready.length})`}>
            <div className="list">
              {ready.map((p) => (
                <div key={p.id} className="list-item pause-item">
                  <span className="icon-chip" aria-hidden>{cats.get(p.categoryId ?? '')?.icon ?? '🛍️'}</span>
                  <div className="grow">
                    <div><strong>{p.item}</strong> · <span className="num">{money(p.amount)}</span></div>
                    <div className="faint small">
                      En pause depuis le {dateLabel(p.createdAt.slice(0, 10))}
                      {p.reason && <> · « {p.reason} »</>}
                    </div>
                  </div>
                  <div className="row">
                    <button className="primary small" onClick={() => { decidePause(p.id, 'dropped'); toast(`${money(p.amount)} gardés. Bien joué.`); }}>
                      J’abandonne
                    </button>
                    <button className="small" onClick={() => { decidePause(p.id, 'bought'); toast('Noté : achat assumé.'); }}>Je l’achète</button>
                    <button className="ghost small" onClick={() => extend(p)}>Encore 24 h</button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="grid g3">
          <Card title="Une envie d’acheter ?" className="span2">
            <form className="stack" onSubmit={submit}>
              <div className="form-grid">
                <label className="field">
                  <span>Ce que vous voulez acheter</span>
                  <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Ex. nouvelles baskets" maxLength={80} />
                </label>
                <NumberField label="Prix" value={amount} onChange={setAmount} />
                <label className="field">
                  <span>Catégorie (facultatif)</span>
                  <CategorySelect value={categoryId} onChange={setCategoryId} kinds={['expense']} />
                </label>
              </div>
              <div className="field">
                <span>Délai de réflexion {delay === null && cents > 0 && <span className="faint">(suggéré selon le prix)</span>}</span>
                <Segmented
                  value={String(hours)}
                  onChange={(v) => setDelay(Number(v))}
                  options={PAUSE_DELAYS.map((d) => ({ value: String(d.hours), label: d.label }))}
                />
              </div>

              {cents > 0 && (
                <div className="callout small">
                  {work !== null && (
                    <>
                      Cet achat représente environ <strong>{hoursLabel(work)} de travail</strong> (d’après vos revenus des derniers mois).{' '}
                    </>
                  )}
                  {wants.total > 0 && (
                    <>
                      C’est <strong>{percent(cents / wants.total)}</strong> de ce que vos envies ont coûté en {monthLabel(wants.month).toLowerCase()} ({money0(wants.total)}).
                    </>
                  )}
                  {work === null && wants.total === 0 && <>Importez vos relevés pour situer cet achat par rapport à vos revenus.</>}
                </div>
              )}

              <div>
                <div className="muted small" style={{ marginBottom: 6 }}>Avant de valider, posez-vous la question :</div>
                <ul className="pause-questions">
                  {REFLECTION_QUESTIONS.map((q) => <li key={q}>{q}</li>)}
                </ul>
              </div>
              <label className="field">
                <span>Pourquoi maintenant ? (facultatif, vous le relirez à la fin de la pause)</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. journée difficile, promo qui finit ce soir…" maxLength={140} />
              </label>
              {error && <div className="callout danger small">{error}</div>}
              <div className="row">
                <button className="primary">Lancer la pause</button>
                <span className="faint small">Rien n’est bloqué : c’est vous qui décidez à la fin.</span>
              </div>
            </form>
          </Card>

          <Card title="Grâce à la pause">
            <div className="stack" style={{ gap: 12 }}>
              <div>
                <div className="muted small">Argent gardé</div>
                <div className="pause-saved num">{money0(stats.saved)}</div>
                <div className="faint small">{stats.dropped} envie{stats.dropped > 1 ? 's' : ''} abandonnée{stats.dropped > 1 ? 's' : ''} après réflexion</div>
              </div>
              <div className="row between small"><span className="muted">Achats assumés</span><span className="num">{stats.bought} · {money0(stats.boughtTotal)}</span></div>
              <div className="row between small"><span className="muted">En réflexion</span><span className="num">{waiting.length + ready.length} · {money0(stats.pending)}</span></div>
              {stats.resistRate !== null && (
                <div className="row between small"><span className="muted">Taux d’abandon après réflexion</span><span className="num">{percent(stats.resistRate)}</span></div>
              )}
              {!reminders && notificationsSupported() && (
                <div className="callout accent small stack" style={{ gap: 6 }}>
                  <span>Activez les rappels pour être prévenu à la fin de chaque pause.</span>
                  <div>
                    <button className="small primary" onClick={() => void enableReminders().then((ok) => toast(ok ? 'Rappels activés.' : 'Notifications refusées par le navigateur.'))}>
                      Activer les rappels
                    </button>
                  </div>
                </div>
              )}
              {reminders && <p className="faint small">Une notification arrive à la fin de la pause quand Cap Budget est ouvert ; sinon, la décision vous attend ici à la prochaine ouverture.</p>}
            </div>
          </Card>
        </div>

        <div className="grid g2">
          <Card title={`En pause (${waiting.length})`}>
            {waiting.length === 0 ? (
              <Empty icon="⏸" title="Aucune pause en cours">La prochaine fois qu’un achat vous tente, notez-le ici d’abord.</Empty>
            ) : (
              <div className="list">
                {waiting.map((p) => (
                  <div key={p.id} className="list-item">
                    <div className="pause-ring">
                      <Ring value={progress(p, now)} />
                      <span aria-hidden>{cats.get(p.categoryId ?? '')?.icon ?? '🛍️'}</span>
                    </div>
                    <div className="grow">
                      <div className="ellipsis"><strong>{p.item}</strong> · <span className="num">{money(p.amount)}</span></div>
                      <div className="faint small">Encore {remaining(p, now)}</div>
                    </div>
                    <button className="ghost small" title="Abandonner dès maintenant" onClick={() => { decidePause(p.id, 'dropped'); toast(`${money(p.amount)} gardés.`); }}>
                      Abandonner
                    </button>
                    <button className="ghost small" aria-label="Supprimer" title="Supprimer (saisie par erreur)" onClick={() => deletePause(p.id)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title={`Vos envies en ${monthLabel(wants.month).toLowerCase()}`} actions={<Link to="/transactions" className="small">Opérations</Link>}>
            {wants.count === 0 ? (
              <p className="muted">Aucune dépense classée en « Envie » sur cette période.</p>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                <div className="row between">
                  <span><strong className="num" style={{ fontSize: 20 }}>{money0(wants.total)}</strong> <span className="muted small">en {wants.count} achats</span></span>
                  {wants.expense > 0 && <span className="badge">{percent(wants.total / wants.expense)} des dépenses</span>}
                </div>
                <div className="list">
                  {wants.lines.slice(0, 6).map((l) => {
                    const c = cats.get(l.categoryId ?? '');
                    return (
                      <div key={l.categoryId ?? 'none'} className="list-item">
                        <span className="icon-chip" aria-hidden>{c?.icon ?? '❔'}</span>
                        <div className="grow">
                          <div className="ellipsis">{c?.name ?? 'Sans catégorie'}</div>
                          <div className="faint small">
                            {l.count} achat{l.count > 1 ? 's' : ''}
                            {l.small > 1 && <> · dont {l.small} de moins de 30 €</>}
                          </div>
                        </div>
                        <span className="num">{money0(l.total)}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="faint small">
                  Le classement vient de la catégorie (réglable dans Réglages) ; une opération particulière peut être passée en Besoin ou en Envie depuis la liste des opérations.
                </p>
              </div>
            )}
          </Card>
        </div>

        {decided.length > 0 && (
          <Card title="Historique">
            <div className="list">
              {decided.slice(0, 20).map((p) => (
                <div key={p.id} className="list-item">
                  <span className={`badge ${p.status === 'dropped' ? 'accent' : ''}`}>{p.status === 'dropped' ? 'Abandonnée' : 'Achetée'}</span>
                  <div className="grow ellipsis">{p.item}</div>
                  <span className="faint small">{p.decidedAt ? dateLabel(p.decidedAt.slice(0, 10)) : ''}</span>
                  <span className="num">{money(p.amount)}</span>
                  <button className="ghost small" aria-label="Supprimer" title="Supprimer de l’historique" onClick={() => deletePause(p.id)}>×</button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
