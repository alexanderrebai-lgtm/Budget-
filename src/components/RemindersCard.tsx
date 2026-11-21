import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { currentAlerts, enableReminders, notificationsSupported, runReminders, testNotification, useReminders } from '../alerts/notify';
import { useStore } from '../store/store';
import { Card, NumberField, toast } from './ui';

export default function RemindersCard() {
  const { enabled, threshold, setEnabled, setThreshold } = useReminders();
  const txs = useStore((s) => s.transactions);
  const budgets = useStore((s) => s.budgets);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const alerts = useMemo(() => currentAlerts(), [txs, budgets, threshold]);
  const supported = notificationsSupported();

  return (
    <Card title="Rappels et alertes" actions={<span className={`badge ${enabled ? 'accent' : ''}`}>{enabled ? 'Activés' : 'Désactivés'}</span>}>
      <div className="stack" style={{ gap: 12 }}>
        <p className="muted small">
          Une notification vous prévient d’un prélèvement important dans les 3 jours, d’un découvert prévu dans le mois et d’un budget presque
          atteint ou dépassé. Chaque alerte n’est envoyée qu’une fois.
          {!supported && ' Ce navigateur ne permet pas les notifications.'}
        </p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          {enabled ? (
            <button onClick={() => setEnabled(false)}>Désactiver</button>
          ) : (
            <button
              className="primary"
              disabled={!supported}
              onClick={async () => {
                const ok = await enableReminders();
                toast(ok ? 'Rappels activés.' : 'Autorisez les notifications dans les réglages du navigateur ou du système.');
                if (ok) void runReminders();
              }}
            >
              Activer les rappels
            </button>
          )}
          {enabled && <button className="ghost" onClick={testNotification}>Tester</button>}
          <div style={{ width: 210 }}>
            <NumberField label="Signaler les prélèvements à partir de" value={threshold / 100} onChange={(v) => setThreshold(Math.round(v * 100))} />
          </div>
        </div>
        <div>
          <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>En ce moment</div>
          {alerts.length === 0 ? (
            <p className="faint small">Aucune alerte.</p>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {alerts.map((a) => (
                <div key={a.id} className={`callout small ${a.level === 'danger' ? 'danger' : a.level === 'warn' ? 'warn' : ''}`}>
                  <strong>{a.title}</strong> — {a.body} <Link to={a.to}>Voir</Link>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="faint small">Sur téléphone, les rappels s’affichent quand l’application est ouverte ou en arrière-plan récent ; sur ordinateur, tant que Cap Budget ou l’onglet est ouvert.</p>
      </div>
    </Card>
  );
}
