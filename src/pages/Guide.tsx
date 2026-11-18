import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, PageHead, Segmented } from '../components/ui';
import { CATEGORY_LABELS, LEGAL_EXEMPTIONS, LEGAL_LIMITS, LEVERS, TAX_CALENDAR, type LeverCategory } from '../lib/levers';

const DIFFICULTY = ['', 'Simple', 'Intermédiaire', 'Avancé'];

export default function Guide() {
  const [cat, setCat] = useState<LeverCategory | 'all' | 'exonere' | 'limite'>('all');
  const list = LEVERS.filter((l) => cat === 'all' || l.category === cat);
  const special = cat === 'exonere' || cat === 'limite';

  return (
    <>
      <PageHead
        title="Guide des leviers"
        subtitle="Réduire son impôt, faire fructifier son épargne, générer des revenus, transmettre."
      />
      <div className="stack">
        <div style={{ overflowX: 'auto' }}>
          <Segmented<LeverCategory | 'all' | 'exonere' | 'limite'>
            value={cat}
            onChange={setCat}
            options={[
              { value: 'all', label: 'Tous' },
              ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value: value as LeverCategory, label })),
              { value: 'exonere', label: 'Exonéré par la loi' },
              { value: 'limite', label: 'Où est la limite ?' },
            ]}
          />
        </div>

        <div className="callout accent">
          Par où commencer ? 1) Constituer une épargne de précaution. 2) Récupérer l’abondement de l’employeur s’il existe. 3) Utiliser les leviers simples
          (PER selon votre tranche, dons, frais réels, crédits d’impôt). 4) Investir régulièrement sur un PEA et une assurance-vie. 5) Envisager l’immobilier
          et les dispositifs avancés. Le <Link to="/impots">simulateur</Link> chiffre les leviers qui vous concernent.
        </div>

        {cat === 'exonere' && (
          <Card title="Revenus exonérés par la loi">
            <p className="muted small" style={{ marginBottom: 10 }}>
              Ces revenus échappent légalement à l’impôt : ce sont les vraies « niches discrètes », sans risque de redressement.
            </p>
            <div className="list">
              {LEGAL_EXEMPTIONS.map((e) => (
                <div key={e.title} className="list-item" style={{ alignItems: 'flex-start' }}>
                  <span className="badge accent">✓</span>
                  <div className="grow"><strong style={{ fontWeight: 600 }}>{e.title}</strong><div className="muted small">{e.detail}</div></div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {cat === 'limite' && (
          <div className="stack">
            <div className="grid g3">
              {LEGAL_LIMITS.levels.map((l) => (
                <div key={l.title} className={`callout ${l.tone}`}>
                  <strong>{l.title}</strong>
                  <p className="small" style={{ marginTop: 6 }}>{l.detail}</p>
                </div>
              ))}
            </div>
            <div className="grid g2">
              <Card title="Ce que l’administration voit automatiquement">
                <ul style={{ margin: 0, paddingLeft: 18 }}>{LEGAL_LIMITS.detected.map((d) => <li key={d} style={{ marginBottom: 6 }}>{d}</li>)}</ul>
              </Card>
              <Card title="Sanctions encourues">
                <ul style={{ margin: 0, paddingLeft: 18 }}>{LEGAL_LIMITS.sanctions.map((d) => <li key={d} style={{ marginBottom: 6 }}>{d}</li>)}</ul>
              </Card>
            </div>
            <div className="callout accent">{LEGAL_LIMITS.fix}</div>
            <p className="faint small">
              Cap Budget ne fournit pas de méthode pour dissimuler des revenus : en plus d’être un délit, la fraude coûte presque toujours plus cher que l’impôt
              évité une fois les majorations appliquées. Les leviers légaux de ce guide suffisent à réduire fortement l’impôt.
            </p>
          </div>
        )}

        <div style={{ display: special ? 'none' : undefined }}>
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
