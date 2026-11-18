import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, Empty, PageHead, toast } from '../components/ui';
import {
  bankStatus,
  deleteConnection,
  listAspsps,
  listConnections,
  startConnection,
  syncLinkedAccount,
  type Aspsp,
  type BankConnection,
} from '../bank/bank';
import { accountBalance } from '../lib/analysis';
import { dateLabel, money0, normalize } from '../lib/format';
import { isElectron } from '../pwa';
import { useStore } from '../store/store';
import { useSync } from '../sync/engine';

const LINKABLE = new Set(['courant', 'livret', 'epargne', 'credit', 'autre']);

export default function Banks() {
  const email = useSync((s) => s.email);
  const syncStatus = useSync((s) => s.status);
  const location = useLocation();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [picker, setPicker] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!email) return;
    try {
      setConnections(await listConnections());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [email]);

  useEffect(() => {
    if (syncStatus === 'disabled') return;
    bankStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, [syncStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // retour de la banque (version web) : #/banques?bank=ok&message=…
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const msg = q.get('message');
    if (q.get('bank') && msg) {
      toast(msg);
      void refresh();
      history.replaceState(null, '', `${location.pathname.replace(/\?.*$/, '')}#/banques`);
    }
  }, [location.search, location.pathname, refresh]);

  // en attente du retour de la banque dans une autre fenêtre : on surveille l'arrivée de la connexion
  const before = useRef(0);
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      const list = await listConnections().catch(() => null);
      if (list && list.length > before.current) {
        setConnections(list);
        setWaiting(false);
        toast('Banque connectée. Reliez maintenant ses comptes à vos comptes Cap Budget.');
      } else if (Date.now() - started > 10 * 60_000) setWaiting(false);
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting]);

  const connect = async (aspsp: Aspsp) => {
    setError(null);
    setLoading(true);
    try {
      const webReturn = location.pathname && window.location.protocol === 'https:' && !isElectron() ? window.location.href.split('#')[0] : null;
      const { url } = await startConnection(aspsp, webReturn);
      before.current = connections.length;
      if (webReturn) {
        window.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener');
        setWaiting(true);
        setPicker(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHead
        title="Banques connectées"
        subtitle="Vos opérations arrivent automatiquement, comme dans Bankin’ ou Linxo, grâce à l’accès sécurisé prévu par la directive européenne DSP2."
        actions={email && configured ? <button className="primary" onClick={() => setPicker((v) => !v)}>+ Connecter une banque</button> : undefined}
      />
      <div className="stack">
        {!email ? (
          <Card>
            <Empty icon="🏦" title="Connectez-vous d’abord">
              La connexion bancaire passe par votre compte Cap Budget. <Link to="/reglages">Créer un compte ou se connecter</Link>
            </Empty>
          </Card>
        ) : configured === false ? (
          <SetupGuide />
        ) : (
          <>
            {waiting && (
              <div className="callout accent row between">
                <span>Terminez la connexion dans la fenêtre de votre banque. Cette page se met à jour toute seule.</span>
                <button className="small ghost" onClick={() => setWaiting(false)}>Annuler</button>
              </div>
            )}
            {error && <div className="callout danger">{error}</div>}
            {picker && <BankPicker onPick={connect} busy={loading} />}
            {connections.length === 0 && !picker ? (
              <Card>
                <Empty icon="🏦" title="Aucune banque connectée">
                  Cliquez sur « Connecter une banque », choisissez votre établissement et identifiez-vous sur son site. Cap Budget ne voit jamais vos identifiants.
                </Empty>
              </Card>
            ) : (
              connections.map((c) => <ConnectionCard key={c.id} connection={c} onChange={refresh} />)
            )}
            <div className="callout small">
              <strong>Sécurité.</strong> Vous vous identifiez directement chez votre banque ; Cap Budget reçoit uniquement un accès en lecture (soldes et
              opérations), valable jusqu’à 180 jours puis renouvelable. L’agrégateur Enable Banking est agréé par les autorités financières européennes.
              Les opérations transitent par le serveur sans y être enregistrées. Vous pouvez révoquer l’accès à tout moment ici ou depuis votre banque.
            </div>
          </>
        )}
      </div>
    </>
  );
}

function BankPicker({ onPick, busy }: { onPick: (a: Aspsp) => void; busy: boolean }) {
  const [list, setList] = useState<Aspsp[] | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    listAspsps('FR').then(setList).catch((e) => setErr((e as Error).message));
  }, []);
  const filtered = useMemo(() => (list ?? []).filter((a) => normalize(a.name).includes(normalize(q))), [list, q]);
  return (
    <Card title="Choisissez votre banque">
      <div className="stack" style={{ gap: 12 }}>
        <input placeholder="Rechercher : Boursorama, Crédit Agricole, BNP…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {err && <div className="callout danger small">{err}</div>}
        {!list && !err && <p className="muted">Chargement de la liste des banques…</p>}
        <div className="grid g3" style={{ gap: 8, maxHeight: 420, overflowY: 'auto' }}>
          {filtered.slice(0, 120).map((a) => (
            <button key={`${a.name}|${a.country}`} className="row" style={{ justifyContent: 'flex-start', gap: 10, padding: 10, whiteSpace: 'normal', textAlign: 'left' }} disabled={busy} onClick={() => onPick(a)}>
              {a.logo ? <img src={a.logo} alt="" width={28} height={28} style={{ objectFit: 'contain', borderRadius: 6, background: '#fff' }} /> : <span className="icon-chip">🏦</span>}
              <span style={{ flex: 1 }}>{a.name}</span>
              {a.beta && <span className="badge warn">bêta</span>}
            </button>
          ))}
        </div>
        {list && filtered.length === 0 && <p className="muted small">Aucune banque trouvée.</p>}
      </div>
    </Card>
  );
}

function ConnectionCard({ connection: c, onChange }: { connection: BankConnection; onChange: () => void }) {
  const accounts = useStore((s) => s.accounts);
  const txs = useStore((s) => s.transactions);
  const { updateAccount, addAccount } = useStore.getState();
  const [busy, setBusy] = useState<string | null>(null);
  const expired = c.valid_until ? new Date(c.valid_until) < new Date() : false;
  const daysLeft = c.valid_until ? Math.ceil((new Date(c.valid_until).getTime() - Date.now()) / 86_400_000) : null;

  const linkedTo = (uid: string) => accounts.find((a) => a.bank?.connectionId === c.id && a.bank.accountUid === uid);

  const link = (uid: string, name: string, target: string) => {
    // un compte bancaire ne peut être lié qu'à un seul compte local
    for (const a of accounts) if (a.bank?.connectionId === c.id && a.bank.accountUid === uid) updateAccount(a.id, { bank: undefined });
    if (!target) return;
    const bank = { connectionId: c.id, accountUid: uid, bankName: c.aspsp_name };
    if (target === 'new') addAccount({ name, type: 'courant', openingBalance: 0, bank });
    else updateAccount(target, { bank });
  };

  const sync = async (accountId: string) => {
    setBusy(accountId);
    const r = await syncLinkedAccount(accountId, true);
    setBusy(null);
    if (r.error) toast(r.expired ? 'Accès expiré : reconnectez la banque.' : r.error);
    else toast(`${r.added} nouvelle(s) opération(s)${r.duplicates ? `, ${r.duplicates} déjà présente(s)` : ''}${r.balanceAligned ? ', solde aligné sur la banque' : ''}.`);
    onChange();
  };

  const remove = async () => {
    if (!confirm(`Déconnecter ${c.aspsp_name} ? Les opérations déjà importées sont conservées.`)) return;
    try {
      await deleteConnection(c.id);
      for (const a of accounts) if (a.bank?.connectionId === c.id) updateAccount(a.id, { bank: undefined });
      toast('Banque déconnectée.');
      onChange();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <Card
      title={<div><h2>{c.aspsp_name}</h2><div className="faint small">Connectée le {dateLabel(c.created_at.slice(0, 10))}{c.last_sync_at ? ` · dernière mise à jour ${new Date(c.last_sync_at).toLocaleString('fr-FR')}` : ''}</div></div>}
      actions={
        <>
          {expired ? <span className="badge danger">Accès expiré</span> : daysLeft !== null && daysLeft < 15 ? <span className="badge warn">Expire dans {daysLeft} j</span> : <span className="badge accent">Active</span>}
          <button className="small ghost danger" onClick={remove}>Déconnecter</button>
        </>
      }
    >
      {expired && <div className="callout warn small" style={{ marginBottom: 12 }}>L’accès accordé par la banque a expiré (180 jours maximum). Déconnectez puis reconnectez cette banque pour continuer.</div>}
      <div className="list">
        {c.accounts.map((ba) => {
          const local = linkedTo(ba.uid);
          return (
            <div key={ba.uid} className="list-item">
              <span className="icon-chip">🏦</span>
              <div className="grow">
                <div>{ba.name}</div>
                <div className="faint small">{ba.iban_masked ?? ba.currency}</div>
              </div>
              <select
                value={local?.id ?? ''}
                onChange={(e) => link(ba.uid, `${ba.name} (${c.aspsp_name})`, e.target.value)}
                style={{ maxWidth: 230 }}
                aria-label="Compte Cap Budget lié"
              >
                <option value="">Non relié</option>
                <option value="new">+ Créer un compte</option>
                {accounts.filter((a) => LINKABLE.has(a.type) && !a.archived && (!a.bank || a.id === local?.id)).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {local && (
                <>
                  <span className="num small" style={{ minWidth: 80, textAlign: 'right' }}>{money0(accountBalance(local, txs))}</span>
                  <button className="small" disabled={busy === local.id || expired} onClick={() => sync(local.id)}>
                    {busy === local.id ? 'Mise à jour…' : 'Mettre à jour'}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="faint small" style={{ marginTop: 10 }}>
        À la première mise à jour, les 90 derniers jours sont importés (limite fixée par les banques). Ensuite, les comptes reliés se mettent à jour
        automatiquement à l’ouverture de l’application, au plus toutes les 6 heures.
      </p>
    </Card>
  );
}

function SetupGuide() {
  const callback = `${import.meta.env.VITE_SUPABASE_URL ?? 'https://<projet>.supabase.co'}/functions/v1/bank/callback`;
  return (
    <Card title="Activer la connexion bancaire (une seule fois)">
      <div className="stack" style={{ gap: 10 }}>
        <p className="muted">
          La connexion directe aux banques passe par un agrégateur agréé. Cap Budget utilise <strong>Enable Banking</strong>, gratuit pour relier vos propres
          comptes (usage personnel). Cette configuration est à faire par le propriétaire de l’installation, une seule fois :
        </p>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Créer un compte sur <a href="https://enablebanking.com/sign-in/" target="_blank" rel="noreferrer">enablebanking.com</a> (lien de connexion envoyé par e-mail).</li>
          <li>
            Dans le <a href="https://enablebanking.com/cp/applications" target="_blank" rel="noreferrer">panneau de contrôle</a>, enregistrer une application en
            environnement <strong>Production</strong>, avec comme adresse de retour : <code style={{ wordBreak: 'break-all' }}>{callback}</code>
          </li>
          <li>Choisir de générer la clé dans le navigateur et <strong>télécharger la clé privée</strong> (fichier .pem). Noter l’identifiant de l’application.</li>
          <li>Cliquer sur « Activer en reliant des comptes » et relier <strong>tous</strong> les comptes que vous voulez suivre (mode restreint gratuit).</li>
          <li>Dans Supabase (Edge Functions → Secrets), renseigner <code>ENABLE_BANKING_APP_ID</code> et <code>ENABLE_BANKING_PRIVATE_KEY</code> (contenu du .pem).</li>
        </ol>
        <p className="faint small">Une fois les secrets enregistrés, rechargez cette page : le bouton « Connecter une banque » apparaît.</p>
      </div>
    </Card>
  );
}
