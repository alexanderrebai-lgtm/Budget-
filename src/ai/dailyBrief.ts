import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { conjonctureText } from '../lib/conjoncture';
import { todayISO, uid } from '../lib/format';
import type { Data } from '../store/store';
import { buildFinanceContext } from './context';
import { desktopAi } from './desktop';

/** « Le mot de Claude » : court commentaire du jour, généré au plus une fois par jour (logiciel PC). */
interface DailyBriefState {
  date: string | null;
  text: string;
  error: string | null;
  auto: boolean;
  running: boolean;
  setAuto: (auto: boolean) => void;
}

export const useDailyBrief = create<DailyBriefState>()(
  persist(
    (set) => ({ date: null, text: '', error: null, auto: true, running: false, setAuto: (auto) => set({ auto }) }),
    {
      name: 'cap-budget-ia-bilan',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ date: s.date, text: s.text, error: s.error, auto: s.auto }),
    },
  ),
);

const PROMPT = `Rédige « le mot du jour » affiché en haut de mon tableau de bord.
Contraintes : 4 phrases maximum (90 mots), tutoiement, ton direct et encourageant, pas de titre, pas de liste.
Contenu : 1) un constat chiffré sur ma situation actuelle, 2) le point qui mérite mon attention ce mois-ci en tenant compte de la conjoncture (inflation, taux des livrets, prix de l'énergie, taux de crédit), 3) une action concrète et chiffrée à faire cette semaine.`;

export async function generateDailyBrief(data: Data, force = false): Promise<void> {
  const ai = desktopAi();
  const state = useDailyBrief.getState();
  if (!ai || state.running) return;
  if (!force && (!state.auto || state.date === todayISO())) return;
  const status = await ai.status().catch(() => null);
  if (!status?.engine || status.login === 'aucun') return;
  if (!data.transactions.length) return;

  useDailyBrief.setState({ running: true, error: null, ...(force ? { text: '' } : {}) });
  const prompt = `# Conjoncture\n${conjonctureText()}\n\n# Mes données financières\n${buildFinanceContext(data)}\n\n# Ma demande\n${PROMPT}`;
  let streamed = '';
  const res = await ai.ask(uid(), prompt, (delta) => {
    streamed += delta;
    useDailyBrief.setState({ text: streamed });
  });
  if (res.error && !res.text) {
    useDailyBrief.setState({ running: false, error: res.error });
    return;
  }
  useDailyBrief.setState({ running: false, text: (res.text || streamed).trim(), date: todayISO(), error: null });
}
