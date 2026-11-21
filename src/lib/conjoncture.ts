/**
 * Indicateurs économiques du bilan et de l'IA.
 * - Inflation (totale, énergie, sous-jacente) : chargée en direct depuis Eurostat
 *   (indice des prix harmonisé, France), mise en cache 24 h.
 * - Taux des livrets et du crédit : fichier public/conjoncture.json du dépôt (modifiable
 *   sans nouvelle version de l'application), avec repli sur les valeurs intégrées.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface Conjoncture {
  asOf: string;
  inflation: { yoy: number; core: number; energy: number; period: string; source: string };
  savings: { livretA: number; ldds: number; lep: number; pel: number; since: string; nextRevision: string };
  credit: { mortgage20: number; usury20: number };
}

/** Valeurs intégrées (novembre 2026), utilisées hors ligne. */
export const DEFAULT_CONJONCTURE: Conjoncture = {
  asOf: '2026-11-20',
  inflation: { yoy: 0.034, core: 0.017, energy: 0.241, period: 'octobre 2026', source: 'INSEE (indice des prix à la consommation)' },
  savings: { livretA: 0.017, ldds: 0.017, lep: 0.025, pel: 0.02, since: '1er août 2026', nextRevision: '1er février 2027' },
  credit: { mortgage20: 0.037, usury20: 0.054 },
};

/** Compatibilité : valeurs intégrées. Préférer conj() qui renvoie les valeurs à jour. */
export const CONJONCTURE = DEFAULT_CONJONCTURE;

const EUROSTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr';
const RATES_URL = 'https://raw.githubusercontent.com/alexanderrebai-lgtm/Budget-/HEAD/public/conjoncture.json';
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

interface ConjState {
  data: Conjoncture;
  fetchedAt: string | null;
  live: boolean;
}

export const useConjoncture = create<ConjState>()(
  persist((): ConjState => ({ data: DEFAULT_CONJONCTURE, fetchedAt: null, live: false }), {
    name: 'cap-budget-conjoncture',
    storage: createJSONStorage(() => localStorage),
  }),
);

export const conj = (): Conjoncture => useConjoncture.getState().data;

/** Dernier taux annuel (en fraction) d'un agrégat de l'IPCH France. */
async function eurostatRate(coicop: string): Promise<{ value: number; period: string } | null> {
  const res = await fetch(`${EUROSTAT}?geo=FR&unit=RCH_A&coicop18=${coicop}&lastTimePeriod=1`);
  if (!res.ok) return null;
  const d = await res.json();
  const time = Object.keys(d?.dimension?.time?.category?.index ?? {})[0];
  const value = Object.values(d?.value ?? {})[0];
  if (!time || typeof value !== 'number') return null;
  return { value: value / 100, period: time };
}

const periodLabel = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

export async function refreshConjoncture(force = false): Promise<void> {
  const s = useConjoncture.getState();
  if (!force && s.fetchedAt && Date.now() - new Date(s.fetchedAt).getTime() < 24 * 3_600_000) return;
  const [total, energy, core, rates] = await Promise.all([
    eurostatRate('TOTAL').catch(() => null),
    eurostatRate('NRG').catch(() => null),
    eurostatRate('TOT_X_NRG_FOOD').catch(() => null),
    fetch(RATES_URL, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const base = s.data;
  const next: Conjoncture = {
    ...base,
    ...(rates?.savings ? { savings: { ...base.savings, ...rates.savings } } : {}),
    ...(rates?.credit ? { credit: { ...base.credit, ...rates.credit } } : {}),
    inflation: total
      ? {
          yoy: total.value,
          energy: energy?.value ?? base.inflation.energy,
          core: core?.value ?? base.inflation.core,
          period: periodLabel(total.period),
          source: 'Eurostat (indice des prix harmonisé, France)',
        }
      : base.inflation,
    asOf: new Date().toISOString().slice(0, 10),
  };
  useConjoncture.setState({ data: next, fetchedAt: new Date().toISOString(), live: Boolean(total) });
}

const p = (r: number) => `${(r * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

export function conjonctureText(c: Conjoncture = conj()): string {
  return [
    `Conjoncture en France au ${c.asOf} :`,
    `- Inflation ${p(c.inflation.yoy)} sur un an (${c.inflation.period}, ${c.inflation.source}), sous-jacente ${p(c.inflation.core)}, énergie ${p(c.inflation.energy)}.`,
    `- Livret A et LDDS ${p(c.savings.livretA)}, LEP ${p(c.savings.lep)}, PEL ${p(c.savings.pel)} (prochaine révision : ${c.savings.nextRevision}).`,
    `- Crédit immobilier 20 ans ~${p(c.credit.mortgage20)} en moyenne, taux d'usure ${p(c.credit.usury20)}.`,
  ].join('\n');
}
