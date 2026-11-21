import { useEffect, useState } from 'react';

export interface UpdateState {
  status: 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'available-manual' | 'error';
  version: string | null;
  percent: number;
  error: string | null;
}

interface DesktopUpdate {
  state: () => Promise<UpdateState>;
  check: () => Promise<void>;
  install: () => Promise<void>;
  openReleases: () => Promise<void>;
  onState: (cb: (s: UpdateState) => void) => () => void;
}

export const desktopUpdate = (): DesktopUpdate | null =>
  (window as unknown as { capBudgetDesktop?: { update?: DesktopUpdate } }).capBudgetDesktop?.update ?? null;

export function useUpdateState() {
  const api = desktopUpdate();
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    if (!api) return;
    void api.state().then(setState);
    return api.onState(setState);
  }, [api]);
  return { api, state };
}

/** Bandeau du logiciel PC : nouvelle version téléchargée, prête à installer. */
export default function UpdateBanner() {
  const { api, state } = useUpdateState();
  const [hidden, setHidden] = useState(false);
  if (!api || !state || hidden) return null;
  if (state.status === 'ready') {
    return (
      <div className="update-banner">
        <span>✨ La version {state.version} de Cap Budget est prête.</span>
        <span className="row" style={{ gap: 6 }}>
          <button className="small primary" onClick={() => void api.install()}>Redémarrer et installer</button>
          <button className="small ghost" onClick={() => setHidden(true)}>Plus tard</button>
        </span>
      </div>
    );
  }
  if (state.status === 'available-manual') {
    return (
      <div className="update-banner">
        <span>✨ La version {state.version} de Cap Budget est disponible.</span>
        <span className="row" style={{ gap: 6 }}>
          <button className="small primary" onClick={() => void api.openReleases()}>Télécharger</button>
          <button className="small ghost" onClick={() => setHidden(true)}>Plus tard</button>
        </span>
      </div>
    );
  }
  return null;
}
