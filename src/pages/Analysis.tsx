import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { buildFinanceContext } from '../ai/context';
import { desktopAi } from '../ai/desktop';
import Markdown from '../components/Markdown';
import { Card, PageHead, toast } from '../components/ui';
import { DESKTOP_DOWNLOADS } from '../components/InstallCard';
import { uid } from '../lib/format';
import { useStore } from '../store/store';

interface Exchange {
  id: string;
  question: string;
  answer: string;
  at: string;
  error?: string;
}

/** Conversations gardées sur cet appareil uniquement (non synchronisées). */
const useAiHistory = create<{ items: Exchange[]; set: (items: Exchange[]) => void }>()(
  persist((set) => ({ items: [], set: (items) => set({ items }) }), { name: 'cap-budget-ia', storage: createJSONStorage(() => localStorage) }),
);

const FULL_ANALYSIS = `Analyse complète de mes dépenses. Structure ta réponse ainsi :
## En bref (3 phrases : situation, point fort, point faible)
## Où part mon argent (les postes qui pèsent le plus et leur évolution)
## Dépenses à surveiller (inhabituelles, en hausse, ou au-dessus de la moyenne française quand c'est pertinent)
## Abonnements et prélèvements à revoir
## Économies possibles (actions chiffrées par mois et par an, de la plus rentable à la moins rentable)
## Plan d'action pour le mois prochain (3 étapes)`;

const QUICK = [
  'Où puis-je économiser 200 € par mois sans me priver de l’essentiel ?',
  'Quels abonnements ou prélèvements devrais-je résilier ou renégocier ?',
  'Mes dépenses de ce mois-ci sont-elles normales par rapport à d’habitude ?',
  'Combien puis-je épargner chaque mois de façon réaliste, et où le placer ?',
  'Propose-moi des budgets mensuels par catégorie adaptés à mes revenus.',
];

type Status = { engine: boolean; login: 'abonnement' | 'cle' | 'aucun' } | null;

export default function Analysis() {
  const ai = desktopAi();
  const data = useStore();
  const history = useAiHistory((s) => s.items);
  const setHistory = useAiHistory((s) => s.set);
  const [status, setStatus] = useState<Status>(null);
  const [question, setQuestion] = useState('');
  const [current, setCurrent] = useState<Exchange | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loginMsg, setLoginMsg] = useState<string | null>(null);
  const requestRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (ai) setStatus(await ai.status());
  }, [ai]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (q: string) => {
    if (!ai || busy || !q.trim()) return;
    const id = uid();
    requestRef.current = id;
    const exchange: Exchange = { id, question: q.trim(), answer: '', at: new Date().toISOString() };
    setCurrent(exchange);
    setBusy(true);
    setQuestion('');
    // contexte : données chiffrées + deux derniers échanges (pour les questions de suivi)
    const recent = history.slice(0, 2).reverse().map((h) => `Question précédente : ${h.question}\nTa réponse : ${h.answer.slice(0, 1500)}`).join('\n\n');
    const prompt = `# Mes données financières\n${buildFinanceContext(data)}\n\n${recent ? `# Échanges précédents\n${recent}\n\n` : ''}# Ma demande\n${q.trim()}`;
    let answer = '';
    const res = await ai.ask(id, prompt, (delta) => {
      answer += delta;
      setCurrent((c) => (c && c.id === id ? { ...c, answer } : c));
    });
    const done: Exchange = { ...exchange, answer: res.text || answer, ...(res.error ? { error: res.error } : {}) };
    setBusy(false);
    setCurrent(null);
    requestRef.current = null;
    if (res.error && !done.answer) {
      toast(res.error);
      setCurrent(done);
      void refresh();
      return;
    }
    setHistory([done, ...history].slice(0, 30));
  };

  const stop = () => {
    if (ai && requestRef.current) void ai.stop(requestRef.current);
  };

  if (!ai) {
    return (
      <>
        <PageHead title="Analyse par l’IA" subtitle="Claude analyse vos dépenses et propose des économies chiffrées." />
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <p>
              L’analyse par l’IA utilise <strong>votre compte Claude</strong> (abonnement Pro ou Max), comme Jarvis. Elle fonctionne dans le
              <strong> logiciel PC</strong> de Cap Budget, qui embarque le moteur Claude.
            </p>
            <div className="row">
              <a className="btn primary" href={DESKTOP_DOWNLOADS} target="_blank" rel="noreferrer">Télécharger le logiciel PC</a>
            </div>
            <p className="faint small">Vos données restent synchronisées entre le logiciel PC et cette version si vous êtes connecté au même compte Cap Budget.</p>
          </div>
        </Card>
      </>
    );
  }

  const connected = status?.login && status.login !== 'aucun';
  const shown = current ? [current, ...history] : history;

  return (
    <>
      <PageHead
        title="Analyse par l’IA"
        subtitle="Claude analyse vos dépenses à partir d’un résumé chiffré (aucun libellé brut, nom et références bancaires retirés)."
        actions={history.length > 0 && !busy ? <button className="ghost small" onClick={() => setHistory([])}>Effacer l’historique</button> : undefined}
      />
      <div className="stack">
        <Card
          title="Connexion à Claude"
          actions={
            status ? (
              <span className={`badge ${connected ? 'accent' : 'warn'}`}>
                {status.login === 'abonnement' ? 'Compte Claude (abonnement)' : status.login === 'cle' ? 'Clé API' : 'Non connecté'}
              </span>
            ) : undefined
          }
        >
          <div className="stack" style={{ gap: 10 }}>
            {!status?.engine && <div className="callout warn small">Le moteur Claude est introuvable : installez la dernière version du logiciel PC.</div>}
            {!connected && (
              <p className="small muted">
                Cliquez sur « Se connecter à Claude » : une fenêtre s’ouvre, choisissez la connexion avec votre compte Claude et validez dans le navigateur.
                À faire une seule fois.
              </p>
            )}
            <div className="row">
              <button className={connected ? '' : 'primary'} disabled={!status?.engine} onClick={async () => setLoginMsg((await ai.login()).message)}>
                {connected ? 'Changer de compte' : 'Se connecter à Claude'}
              </button>
              <button className="ghost" onClick={() => void refresh().then(() => toast('État de la connexion mis à jour.'))}>Vérifier</button>
              <button className="ghost small" onClick={() => setShowKey((v) => !v)}>Utiliser une clé API à la place</button>
            </div>
            {loginMsg && <div className="callout small">{loginMsg}</div>}
            {showKey && (
              <form
                className="stack"
                style={{ gap: 8 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await ai.setKey(apiKey || null);
                  setApiKey('');
                  setStatus((s) => (s ? { ...s, login: r.login } : s));
                  toast(apiKey ? 'Clé enregistrée (chiffrée sur cet ordinateur).' : 'Clé supprimée.');
                }}
              >
                <p className="faint small">
                  Une clé de la console Anthropic est facturée à l’usage (quelques centimes par analyse) et remplace la connexion par abonnement. Elle est
                  chiffrée par le système et ne quitte pas cet ordinateur. <button type="button" className="ghost small" onClick={() => void ai.openConsole()}>Créer une clé</button>
                </p>
                <div className="row">
                  <input type="password" autoComplete="off" placeholder="sk-ant-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={{ maxWidth: 320 }} />
                  <button type="submit">{apiKey ? 'Enregistrer la clé' : 'Supprimer la clé'}</button>
                </div>
              </form>
            )}
          </div>
        </Card>

        <Card title="Que voulez-vous savoir ?">
          <div className="stack" style={{ gap: 12 }}>
            <div className="row">
              <button className="primary" disabled={!connected || busy} onClick={() => void run(FULL_ANALYSIS)}>✦ Analyser mes dépenses</button>
              {busy && <button className="ghost" onClick={stop}>Arrêter</button>}
            </div>
            <div className="row" style={{ gap: 6 }}>
              {QUICK.map((q) => (
                <button key={q} className="small" disabled={!connected || busy} onClick={() => void run(q)} style={{ whiteSpace: 'normal', textAlign: 'left' }}>
                  {q}
                </button>
              ))}
            </div>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                void run(question);
              }}
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Posez votre question : « Pourquoi ai-je dépensé plus en août ? »"
                disabled={!connected || busy}
                style={{ flex: 1, minWidth: 220 }}
              />
              <button type="submit" disabled={!connected || busy || !question.trim()}>Envoyer</button>
            </form>
          </div>
        </Card>

        {shown.map((h) => (
          <Card
            key={h.id}
            title={<div><h2>{h.question === FULL_ANALYSIS ? 'Analyse complète' : h.question}</h2><div className="faint small">{new Date(h.at).toLocaleString('fr-FR')}</div></div>}
          >
            {h.error && !h.answer ? (
              <div className="callout danger">{h.error}</div>
            ) : h.answer ? (
              <Markdown text={h.answer} />
            ) : (
              <p className="muted">Claude réfléchit…</p>
            )}
          </Card>
        ))}

        <p className="faint small">
          Les réponses de l’IA peuvent contenir des erreurs : vérifiez les montants avant de prendre une décision. Avec la connexion par abonnement,
          l’usage compte dans les limites de votre abonnement Claude.
        </p>
      </div>
    </>
  );
}
