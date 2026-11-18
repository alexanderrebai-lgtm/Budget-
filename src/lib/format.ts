import type { Cents, ISODate } from './types';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

export const money = (c: Cents) => eur.format(c / 100);
export const money0 = (c: Cents) => eur0.format(c / 100);
/** Formate des euros (et non des centimes). */
export const euros = (e: number) => eur0.format(e);
export const percent = (r: number) => pct.format(r);

export const toCents = (e: number) => Math.round(e * 100);

/** Analyse un montant saisi à la française : « 1 234,56 », « -12.5 », « 1.234,56 ». */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/[\s  €]/g, '');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  if (s.includes(',') && s.includes('.')) {
    // le dernier séparateur est le séparateur décimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const shortMonthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export const monthKey = (d: ISODate) => d.slice(0, 7);
export const monthLabel = (key: string) => {
  const s = monthFmt.format(new Date(`${key}-01T12:00:00`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const shortMonth = (key: string) => shortMonthFmt.format(new Date(`${key}-01T12:00:00`)).replace('.', '');
export const dateLabel = (d: ISODate) => dayFmt.format(new Date(`${d}T12:00:00`));

export const todayISO = (): ISODate => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000);
}

/** Minuscules, sans accents, espaces normalisés. */
export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Graduation d'axe : « 2,5 k€ ». */
export const kEuros = (v: number) => `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€`;
