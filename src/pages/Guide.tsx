import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, PageHead, Segmented } from '../components/ui';
import { CATEGORY_LABELS, LEVERS, TAX_CALENDAR, type LeverCategory } from '../lib/levers';

const DIFFICULTY = ['', 'Simple', 'Intermédiaire', 'Avancé'];

export default function Guide() {
  const [cat, setCat] = useState<LeverCategory | 'all'>('all');
  const list = LEVERS.filter((l) => cat === 'all' || l.category === cat);

  return (
    <>
      <PageHead
        title="Guide des leviers"
        subtitle="Réduire son impôt, faire fructifier son épargne, générer des revenus, transmettre."
      />
      <div className="stack">
        <div style={{ overflowX: 'auto' }}>
          <Segmented<LeverCategory | 'all'>
            value={cat}
            onChange={setCat}
            options={[{ value: 'all', label: 'Tous' }, ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value: value as LeverCategory, label }))]}
          />
        </div>

        <div className="callout accent">
          Par où commencer ? 1) Constituer une épargne de précaution. 2) Récupérer l’abondement de l’employeur s’il existe. 3) Utiliser les leviers simples
          (PER selon votre tranche, dons, frais réels, crédits d’impôt). 4) Investir régulièrement sur un PEA et une assurance-vie. 5) Envisager l’immobilier
          et les dispositifs avancés. Le <Link to="/impots">simulateur</Link> chiffre les leviers qui vous concernent.
        </div>

        <div>
          {list.map((l) => (
            <details key={l.id} className="lever">
              <summary>
                <span className="icon-chip">{l.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{l.title}</div>
                  <div className="muted small">{l.summary}</div>
                </div>
                <span className="badge">{DIFFICULTY[l.difficulty]}</span>
              </summary>
              <div className="body">
                <div className="callout accent"><strong>Gain : </strong>{l.gain}</div>
                <div><strong>Pour qui : </strong>{l.forWho}</div>
                <div>
                  <strong>Comment faire</strong>
                  <ul>{l.how.map((h) => <li key={h}>{h}</li>)}</ul>
                </div>
                {l.watch.length > 0 && (
                  <div className="callout warn">
                    <strong>Points de vigilance</strong>
                    <ul>{l.watch.map((w) => <li key={w}>{w}</li>)}</ul>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>

        <Card title="Calendrier fiscal">
          <div className="list">
            {TAX_CALENDAR.map((c) => (
              <div key={c.when} className="list-item">
                <span className="badge accent" style={{ minWidth: 130, justifyContent: 'center' }}>{c.when}</span>
                <span className="grow">{c.what}</span>
              </div>
            ))}
          </div>
        </Card>

        <p className="faint small">
          Informations générales à jour de la loi de finances 2026, sans valeur de conseil personnalisé. Les dispositifs et plafonds évoluent chaque année :
          vérifiez sur impots.gouv.fr et service-public.fr, et consultez un conseiller pour les montages complexes.
        </p>
      </div>
    </>
  );
}
