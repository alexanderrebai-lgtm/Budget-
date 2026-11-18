import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const isElectron = () => /Electron/.test(navigator.userAgent);
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

interface InstallState {
  prompt: BeforeInstallPromptEvent | null;
  installed: boolean;
}

export const useInstall = create<InstallState>(() => ({ prompt: null, installed: isStandalone() || isElectron() }));

export async function promptInstall(): Promise<boolean> {
  const p = useInstall.getState().prompt;
  if (!p) return false;
  await p.prompt();
  const { outcome } = await p.userChoice;
  useInstall.setState({ prompt: null, installed: outcome === 'accepted' });
  return outcome === 'accepted';
}

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    useInstall.setState({ prompt: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => useInstall.setState({ prompt: null, installed: true }));

  // Le service worker (mode hors ligne, mises à jour) n'a de sens que sur le web.
  if (location.protocol.startsWith('http') && !isElectron() && 'serviceWorker' in navigator && import.meta.env.PROD) {
    void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
  }
}
