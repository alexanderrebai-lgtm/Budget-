import { Card, toast } from './ui';
import { isElectron, isIos, promptInstall, useInstall } from '../pwa';
import { useUpdateState } from './UpdateBanner';

/** Lien vers les installateurs PC générés par GitHub Actions (page des versions du dépôt). */
export const DESKTOP_DOWNLOADS = 'https://github.com/alexanderrebai-lgtm/Budget-/releases/latest';

export function InstallButton({ className = 'small' }: { className?: string }) {
  const prompt = useInstall((s) => s.prompt);
  if (!prompt) return null;
  return (
    <button className={className} onClick={() => void promptInstall().then((ok) => ok && toast('Cap Budget est installée.'))}>
      ⤓ Installer l’application
    </button>
  );
}

const UPDATE_LABEL: Record<string, string> = {
  idle: '',
  checking: 'Recherche d’une mise à jour…',
  'up-to-date': 'Vous avez la dernière version.',
  downloading: 'Téléchargement de la nouvelle version…',
  ready: 'Nouvelle version prête : redémarrez pour l’installer.',
  'available-manual': 'Nouvelle version disponible.',
  error: 'Impossible de vérifier les mises à jour pour le moment.',
};

function DesktopUpdateRow() {
  const { api, state } = useUpdateState();
  if (!api) return null;
  return (
    <div className="row between callout small">
      <span>
        <strong>Mises à jour automatiques</strong> · {state ? UPDATE_LABEL[state.status] : ''}
        {state?.status === 'downloading' && state.percent ? ` ${state.percent} %` : ''}
      </span>
      <span className="row" style={{ gap: 6 }}>
        {state?.status === 'ready' ? (
          <button className="small primary" onClick={() => void api.install()}>Redémarrer et installer</button>
        ) : state?.status === 'available-manual' ? (
          <button className="small primary" onClick={() => void api.openReleases()}>Télécharger</button>
        ) : (
          <button className="small" onClick={() => void api.check()} disabled={state?.status === 'checking' || state?.status === 'downloading'}>Rechercher</button>
        )}
      </span>
    </div>
  );
}

export default function InstallCard() {
  const { prompt, installed } = useInstall();
  return (
    <Card title="Installer Cap Budget" actions={installed ? <span className="badge accent">{isElectron() ? 'Application PC' : 'Installée'}</span> : undefined}>
      <div className="stack" style={{ gap: 12 }}>
        <DesktopUpdateRow />
        {prompt && (
          <div className="row between callout accent">
            <span>Installez l’application sur cet appareil : icône sur l’écran d’accueil, fenêtre dédiée, fonctionne hors ligne.</span>
            <InstallButton className="primary small" />
          </div>
        )}
        <div className="grid g3" style={{ gap: 12 }}>
          <div>
            <h3>📱 iPhone, iPad</h3>
            <p className="small muted" style={{ marginTop: 4 }}>
              Ouvrez l’application dans <strong>Safari</strong>, touchez <strong>Partager</strong> (carré avec une flèche), puis
              <strong> « Sur l’écran d’accueil »</strong>.
              {isIos() && !installed && <><br /><span className="badge warn" style={{ marginTop: 6 }}>C’est votre appareil</span></>}
            </p>
          </div>
          <div>
            <h3>🤖 Android</h3>
            <p className="small muted" style={{ marginTop: 4 }}>
              Dans <strong>Chrome</strong>, touchez le menu <strong>⋮</strong> puis <strong>« Installer l’application »</strong> (ou le bouton ci-dessus quand il apparaît).
            </p>
          </div>
          <div>
            <h3>💻 Ordinateur</h3>
            <p className="small muted" style={{ marginTop: 4 }}>
              Dans <strong>Chrome</strong> ou <strong>Edge</strong>, cliquez sur l’icône d’installation dans la barre d’adresse. Ou téléchargez le{' '}
              <a href={DESKTOP_DOWNLOADS} target="_blank" rel="noreferrer">logiciel pour Windows, macOS ou Linux</a>.
            </p>
          </div>
        </div>
        <p className="faint small">Connectez-vous au même compte de synchronisation sur chaque appareil pour retrouver vos données partout.</p>
      </div>
    </Card>
  );
}
