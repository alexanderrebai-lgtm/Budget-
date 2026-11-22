import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { computeAlerts, type Alert } from '../lib/alerts';
import { money, todayISO } from '../lib/format';
import { duePauses } from '../lib/pauses';
import { useStore, whenHydrated } from '../store/store';

/** Réglages des rappels, propres à chaque appareil. */
interface RemindersState {
  enabled: boolean;
  /** Montant (centimes) à partir duquel un prélèvement est signalé. */
  threshold: number;
  sent: Record<string, string>;
  setEnabled: (v: boolean) => void;
  setThreshold: (v: number) => void;
}

export const useReminders = create<RemindersState>()(
  persist(
    (set) => ({
      enabled: false,
      threshold: 5_000,
      sent: {},
      setEnabled: (enabled) => set({ enabled }),
      setThreshold: (threshold) => set({ threshold }),
    }),
    { name: 'cap-budget-rappels', storage: createJSONStorage(() => localStorage) },
  ),
);

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export async function enableReminders(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  const ok = perm === 'granted';
  useReminders.getState().setEnabled(ok);
  return ok;
}

function show(a: Alert) {
  const n = new Notification(`Cap Budget · ${a.title}`, { body: a.body, tag: a.id, icon: './pwa-192.png' });
  n.onclick = () => {
    window.focus();
    location.hash = `#${a.to}`;
    n.close();
  };
}

export function testNotification() {
  if (notificationsSupported() && Notification.permission === 'granted') {
    show({ id: 'test', level: 'info', title: 'Les rappels fonctionnent', body: 'Vous serez prévenu des prélèvements importants, découverts prévus et budgets dépassés.', to: '/' });
  }
}

/** Alertes du moment (pour l'aperçu dans les réglages). */
export function currentAlerts(): Alert[] {
  return computeAlerts(useStore.getState(), todayISO(), useReminders.getState().threshold);
}

/** Envoie les alertes nouvelles (chacune une seule fois). */
export async function runReminders() {
  await whenHydrated();
  const r = useReminders.getState();
  if (!r.enabled || !notificationsSupported() || Notification.permission !== 'granted') return;
  const alerts = currentAlerts();
  const sent = { ...r.sent };
  for (const a of alerts) {
    if (sent[a.id]) continue;
    show(a);
    sent[a.id] = new Date().toISOString();
  }
  // fins de pause avant achat
  for (const p of duePauses(useStore.getState().pauses, sent)) {
    show({ id: `pause:${p.id}`, level: 'info', title: 'Pause terminée', body: `${p.item} (${money(p.amount)}) : toujours envie ? Décidez en un clic.`, to: '/pause' });
    sent[`pause:${p.id}`] = new Date().toISOString();
  }
  // oubli des alertes de plus de 60 jours
  const cutoff = Date.now() - 60 * 86_400_000;
  for (const [k, v] of Object.entries(sent)) if (new Date(v).getTime() < cutoff) delete sent[k];
  useReminders.setState({ sent });
}

export function startReminders() {
  setTimeout(() => void runReminders(), 6_000);
  // toutes les 5 minutes : les fins de pause doivent arriver à l'heure ; les autres alertes ne partent qu'une fois
  setInterval(() => void runReminders(), 5 * 60_000);
}
