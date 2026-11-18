import { useState } from 'react';
import { demoData } from '../lib/demo';
import { toCents } from '../lib/format';
import { parseBackup, useStore } from '../store/store';
import { NumberField } from '../components/ui';

export default function Welcome() {
  const replaceAll = useStore((s) => s.replaceAll);
  const addAccount = useStore((s) => s.addAccount);
  const updateSettings = useStore((s) => s.updateSettings);
  const [name, setName] = useState('Compte courant');
  const [balance, setBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    addAccount({ name: name.trim() || 'Compte courant', type: 'courant', openingBalance: toCents(balance) });
    updateSettings({ onboarded: true });
  };

  const restore = async (file: File) => {
    try {
      const data = parseBackup(await file.text());
      replaceAll({ ...data, settings: { ...data.settings, onboarded: true } });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ maxWidth: 760, width: '100%' }} className="stack">
        <div className="row" style={{ gap: 12 }}>
          <span className="brand-mark" style={{ width: 44, height: 44, fontSize: 20, borderRadius: 12 }}>€</span>
          <div>
            <h1>Cap Budget</h1>
            <p className="muted">Suivez vos dépenses, faites grandir votre épargne et payez le juste impôt.</p>
          </div>
        </div>

        <div className="grid g3">
          {[
            ['📊', 'Budget clair', 'Import des relevés CSV, catégorisation automatique, budgets et abonnements détectés.'],
            ['🏛️', 'Impôt optimisé', 'Simulateur de l’impôt 2026 et leviers chiffrés : PER, dons, frais réels, foncier…'],
            ['🔒', '100 % local', 'Aucun compte, aucun serveur : vos données restent dans votre navigateur.'],
          ].map(([icon, title, text]) => (
            <div key={title} className="card">
              <div style={{ fontSize: 22 }}>{icon}</div>
              <h3 style={{ marginTop: 8 }}>{title}</h3>
              <p className="muted small" style={{ marginTop: 4 }}>{text}</p>
            </div>
          ))}
        </div>

        <div className="card stack">
          <h2>Commencer</h2>
          <div className="form-grid">
            <label className="field">
              <span>Nom de votre compte principal</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <NumberField label="Solde actuel" value={balance} onChange={setBalance} min={-1e9} />
          </div>
          <div className="row">
            <button className="primary" onClick={start}>Créer mon espace</button>
            <span className="faint small">ou</span>
            <button onClick={() => replaceAll(demoData())}>Explorer avec des données de démo</button>
            <button
              onClick={() => {
                updateSettings({ onboarded: true });
                location.hash = '#/reglages';
              }}
            >
              J’ai déjà un compte
            </button>
            <label className="btn" style={{ cursor: 'pointer' }}>
              Restaurer une sauvegarde
              <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
            </label>
          </div>
          {error && <div className="callout danger">{error}</div>}
        </div>
        <p className="faint small">
          Les calculs fiscaux sont des estimations fondées sur la législation 2026 (revenus 2025). Ils ne remplacent pas le simulateur officiel
          d’impots.gouv.fr ni l’avis d’un professionnel.
        </p>
      </div>
    </div>
  );
}
