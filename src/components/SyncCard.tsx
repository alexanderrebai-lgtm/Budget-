import { useState } from 'react';
import { Card, Segmented, toast } from './ui';
import {
  resetPassword,
  resolveFirstSync,
  signIn,
  signOut,
  signUp,
  syncNow,
  updateConfig,
  updatePassword,
  useSync,
  type SyncStatus,
} from '../sync/engine';

export const STATUS_LABEL: Record<SyncStatus, string> = {
  disabled: 'Non configurée',
  'signed-out': 'Non connecté',
  idle: 'À jour',
  syncing: 'Synchronisation…',
  error: 'Erreur',
  locked: 'Phrase secrète requise',
  offline: 'Hors ligne',
  'needs-choice': 'Action requise',
};

export function SyncBadge() {
  const status = useSync((s) => s.status);
  if (status === 'disabled' || status === 'signed-out') return null;
  const tone = status === 'idle' ? 'accent' : status === 'syncing' ? '' : status === 'offline' ? '' : 'warn';
  return (
    <a href="#/reglages" className={`badge ${tone}`} style={{ textDecoration: 'none' }} title="Synchronisation">
      {status === 'idle' ? '☁ ' : status === 'syncing' ? '⟳ ' : '⚠ '}
      {STATUS_LABEL[status]}
    </a>
  );
}

export default function SyncCard() {
  const s = useSync();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: '' | 'danger' | 'accent'; text: string } | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [url, setUrl] = useState(s.config.url);
  const [key, setKey] = useState(s.config.key);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const signedIn = Boolean(s.email);

  return (
    <Card
      title="Synchronisation entre appareils"
      actions={<span className={`badge ${s.status === 'idle' ? 'accent' : s.status === 'error' || s.status === 'locked' ? 'warn' : ''}`}>{STATUS_LABEL[s.status]}</span>}
    >
      <div className="stack" style={{ gap: 12 }}>
        {s.status === 'disabled' && (
          <p className="muted">Renseignez l’adresse et la clé de votre projet Supabase dans les paramètres avancés ci-dessous.</p>
        )}

        {s.recovery && (
          <form
            className="callout accent stack"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await updatePassword(newPassword);
                toast('Mot de passe modifié.');
              });
            }}
          >
            <strong>Choisissez un nouveau mot de passe</strong>
            <div className="row">
              <input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ maxWidth: 260 }} />
              <button className="primary" disabled={busy}>Enregistrer</button>
            </div>
          </form>
        )}

        {!signedIn && s.status !== 'disabled' && (
          <form
            className="stack"
            style={{ gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (mode === 'signup') {
                  const { needsConfirmation } = await signUp(email.trim(), password);
                  setMessage({
                    tone: 'accent',
                    text: needsConfirmation
                      ? 'Compte créé. Cliquez sur le lien reçu par e-mail pour confirmer votre adresse, puis connectez-vous ici.'
                      : 'Compte créé, synchronisation en cours.',
                  });
                  if (needsConfirmation) setMode('signin');
                } else {
                  await signIn(email.trim(), password);
                }
              });
            }}
          >
            <p className="muted small">
              Créez un compte pour retrouver vos données sur votre téléphone, votre PC et tout autre appareil. Sans compte, tout reste sur cet appareil.
            </p>
            <Segmented value={mode} onChange={setMode} options={[{ value: 'signin', label: 'Se connecter' }, { value: 'signup', label: 'Créer un compte' }]} />
            <div className="form-grid">
              <label className="field"><span>E-mail</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="field">
                <span>Mot de passe</span>
                <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined} required value={password} onChange={(e) => setPassword(e.target.value)} />
                {mode === 'signup' && <span className="hint">8 caractères minimum</span>}
              </label>
            </div>
            <div className="row">
              <button className="primary" disabled={busy}>{mode === 'signup' ? 'Créer mon compte' : 'Se connecter'}</button>
              {mode === 'signin' && (
                <button
                  type="button"
                  className="ghost small"
                  disabled={busy}
                  onClick={() => {
                    if (!email.trim()) return setMessage({ tone: 'danger', text: 'Saisissez votre e-mail pour recevoir le lien de réinitialisation.' });
                    void run(async () => {
                      await resetPassword(email.trim());
                      setMessage({ tone: 'accent', text: 'Si un compte existe, un e-mail de réinitialisation vient d’être envoyé.' });
                    });
                  }}
                >
                  Mot de passe oublié ?
                </button>
              )}
            </div>
          </form>
        )}

        {signedIn && (
          <>
            <div className="row between">
              <div>
                <div>Connecté : <strong>{s.email}</strong></div>
                <div className="faint small">
                  {s.lastSyncedAt
                    ? `Dernière synchronisation ${new Date(s.lastSyncedAt).toLocaleString('fr-FR')}${s.lastDevice ? ` · dernière écriture : ${s.lastDevice}` : ''}`
                    : 'Pas encore synchronisé'}
                </div>
              </div>
              <div className="row">
                <button onClick={() => void run(() => syncNow())} disabled={busy || s.status === 'syncing'}>Synchroniser</button>
                <button className="ghost" onClick={() => void run(() => signOut())}>Se déconnecter</button>
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={s.config.auto} onChange={(e) => updateConfig({ auto: e.target.checked })} />
              Synchroniser automatiquement après chaque modification
            </label>
          </>
        )}

        {s.status === 'needs-choice' && (
          <div className="callout warn stack" style={{ gap: 8 }}>
            <strong>Cet appareil et votre compte contiennent tous deux des données.</strong>
            <span>Que voulez-vous faire ?</span>
            <div className="row">
              <button className="primary small" onClick={() => resolveFirstSync('merge')}>Fusionner les deux</button>
              <button className="small" onClick={() => resolveFirstSync('replace-local')}>Garder celles du compte</button>
              <button className="small" onClick={() => resolveFirstSync('replace-remote')}>Garder celles de cet appareil</button>
            </div>
          </div>
        )}

        {s.error && s.status !== 'needs-choice' && <div className="callout danger small">{s.error}</div>}
        {message && <div className={`callout ${message.tone} small`}>{message.text}</div>}

        {signedIn && (
          <details className="lever" open={s.status === 'locked'}>
            <summary><h3>Chiffrement de bout en bout</h3><span className="badge" style={{ marginLeft: 'auto' }}>{s.config.passphrase ? 'Activé' : 'Désactivé'}</span></summary>
            <div className="body">
              <p className="small">
                Avec une phrase secrète, vos données sont chiffrées sur l’appareil avant l’envoi : ni le serveur ni personne d’autre ne peut les lire.
                Saisissez la même phrase sur chacun de vos appareils. <strong>Si vous l’oubliez, les données en ligne sont irrécupérables</strong> (vos
                appareils gardent leur copie locale).
              </p>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (passphrase.length < 10) return setMessage({ tone: 'danger', text: 'Choisissez une phrase d’au moins 10 caractères.' });
                  updateConfig({ passphrase });
                  setPassphrase('');
                  void syncNow();
                  toast('Phrase secrète enregistrée sur cet appareil.');
                }}
              >
                <input type="password" autoComplete="off" placeholder={s.config.passphrase ? 'Nouvelle phrase secrète' : 'Phrase secrète'} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} style={{ maxWidth: 280 }} />
                <button className="small primary">{s.config.passphrase ? 'Changer' : 'Activer'}</button>
                {s.config.passphrase && (
                  <button
                    type="button"
                    className="small ghost danger"
                    onClick={() => {
                      if (confirm('Désactiver le chiffrement ? Les données seront de nouveau stockées en clair sur le serveur (protégées par votre compte).')) {
                        updateConfig({ passphrase: null });
                        void syncNow();
                      }
                    }}
                  >
                    Désactiver
                  </button>
                )}
              </form>
            </div>
          </details>
        )}

        <button className="ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setAdvanced((v) => !v)}>
          {advanced ? 'Masquer' : 'Paramètres avancés'}
        </button>
        {advanced && (
          <form
            className="stack"
            style={{ gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              updateConfig({ url: url.trim(), key: key.trim() });
              toast('Configuration enregistrée. Rechargement…');
              setTimeout(() => location.reload(), 600);
            }}
          >
            <p className="faint small">Pour utiliser votre propre projet Supabase (le script SQL est dans le dossier supabase/migrations du code).</p>
            <div className="form-grid">
              <label className="field"><span>URL du projet</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" /></label>
              <label className="field"><span>Clé publishable</span><input value={key} onChange={(e) => setKey(e.target.value)} placeholder="sb_publishable_…" /></label>
            </div>
            <div><button className="small">Enregistrer</button></div>
          </form>
        )}
      </div>
    </Card>
  );
}
