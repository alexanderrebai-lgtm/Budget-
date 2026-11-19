/** Accès au pont du logiciel PC (absent dans la version web). */
export interface DesktopAi {
  status: () => Promise<{ engine: boolean; login: 'abonnement' | 'cle' | 'aucun' }>;
  login: () => Promise<{ ok: boolean; message: string }>;
  setKey: (key: string | null) => Promise<{ login: 'abonnement' | 'cle' | 'aucun' }>;
  openConsole: () => Promise<void>;
  stop: (requestId: string) => Promise<boolean>;
  ask: (requestId: string, prompt: string, onDelta: (text: string) => void) => Promise<{ text: string; error?: string; stopped?: boolean }>;
}

export const desktopAi = (): DesktopAi | null =>
  (window as unknown as { capBudgetDesktop?: { ai?: DesktopAi } }).capBudgetDesktop?.ai ?? null;
