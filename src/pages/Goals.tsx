import { useState } from 'react';
import { Card, Empty, NumberField, PageHead, Progress, toast } from '../components/ui';
import { accountBalance } from '../lib/analysis';
import { dateLabel, money0, toCents, todayISO } from '../lib/format';
import type { Goal } from '../lib/types';
import { useStore } from '../store/store';

function monthsUntil(deadline: string) {
  const now = new Date();
  const d = new Date(`${deadline}T12:00:00`);
  return Math.max(1, (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth());
}

export default function Goals() {
  const goals = useStore((s) => s.goals);
  const accounts = useStore((s) => s.accounts);
  const txs = useStore((s) => s.transactions);
  const { addGoal, updateGoal, deleteGoal } = useStore.getState();
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const progressOf = (g: Goal) => {
    const acc = g.accountId ? accounts.find((a) => a.id === g.accountId) : undefined;
    return acc ? accountBalance(acc, txs) : g.saved;
  };

  return (
    <>
      <PageHead
        title="Objectifs d’épargne"
        subtitle="Épargne de précaution, apport immobilier, projet… suivez votre progression."
        actions={<button className="primary" onClick={() => setEditing('new')}>+ Nouvel objectif</button>}
      />
      <div className="stack">
        {editing && (
          <GoalForm
            goal={editing === 'new' ? undefined : goals.find((g) => g.id === editing)}
            onCancel={() => setEditing(null)}
            onSave={(g) => {
              if (editing === 'new') addGoal(g);
              else updateGoal(editing, g);
              setEditing(null);
              toast('Objectif enregistré.');
            }}
          />
        )}
        {goals.length === 0 && !editing ? (
          <Card><Empty icon="◎" title="Aucun objectif">Commencez par une épargne de précaution de 3 à 6 mois de dépenses.</Empty></Card>
        ) : (
          <div className="grid g3">
            {goals.map((g) => {
              const saved = progressOf(g);
              const remaining = Math.max(0, g.target - saved);
              const perMonth = g.deadline ? remaining / monthsUntil(g.deadline) : null;
              return (
                <Card key={g.id}>
                  <div className="stack" style={{ gap: 10 }}>
                    <div className="row between">
                      <span className="row"><span className="icon-chip">{g.icon}</span><h3>{g.name}</h3></span>
                      <span className="badge accent">{Math.min(100, Math.round((saved / g.target) * 100))} %</span>
                    </div>
                    <Progress value={saved} max={g.target} />
                    <div className="row between small">
                      <span className="num">{money0(saved)}</span>
                      <span className="muted num">sur {money0(g.target)}</span>
                    </div>
                    {remaining === 0 ? (
                      <div className="callout accent small">Objectif atteint 🎉</div>
                    ) : perMonth !== null ? (
                      <div className="small muted">
                        {money0(perMonth)} / mois pour l’atteindre d’ici le {dateLabel(g.deadline!)}.
                      </div>
                    ) : (
                      <div className="small muted">Reste {money0(remaining)}.</div>
                    )}
                    {g.accountId && <div className="faint small">Suivi sur le compte « {accounts.find((a) => a.id === g.accountId)?.name} »</div>}
                    <div className="row">
                      <button className="small" onClick={() => setEditing(g.id)}>Modifier</button>
                      <button className="small ghost danger" onClick={() => confirm('Supprimer cet objectif ?') && deleteGoal(g.id)}>Supprimer</button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function GoalForm({ goal, onSave, onCancel }: { goal?: Goal; onSave: (g: Omit<Goal, 'id'>) => void; onCancel: () => void }) {
  const accounts = useStore((s) => s.accounts);
  const [name, setName] = useState(goal?.name ?? '');
  const [icon, setIcon] = useState(goal?.icon ?? '🎯');
  const [target, setTarget] = useState((goal?.target ?? 0) / 100);
  const [saved, setSaved] = useState((goal?.saved ?? 0) / 100);
  const [accountId, setAccountId] = useState(goal?.accountId ?? '');
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');

  return (
    <Card title={goal ? 'Modifier l’objectif' : 'Nouvel objectif'}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || target <= 0) return;
          onSave({ name: name.trim(), icon, target: toCents(target), saved: toCents(saved), accountId: accountId || undefined, deadline: deadline || undefined });
        }}
      >
        <div className="form-grid">
          <label className="field"><span>Nom</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className="field"><span>Icône</span>
            <select value={icon} onChange={(e) => setIcon(e.target.value)}>
              {['🎯', '🛟', '🏡', '🚗', '✈️', '🎓', '👶', '💍', '🏖️', '💻'].map((i) => <option key={i}>{i}</option>)}
            </select>
          </label>
          <NumberField label="Montant cible" value={target} onChange={setTarget} />
          <label className="field"><span>Suivre un compte</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Non, saisie manuelle</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          {!accountId && <NumberField label="Déjà épargné" value={saved} onChange={setSaved} />}
          <label className="field"><span>Échéance (facultatif)</span><input type="date" value={deadline} min={todayISO()} onChange={(e) => setDeadline(e.target.value)} /></label>
        </div>
        <div className="row">
          <button className="primary" type="submit">Enregistrer</button>
          <button type="button" className="ghost" onClick={onCancel}>Annuler</button>
        </div>
      </form>
    </Card>
  );
}
