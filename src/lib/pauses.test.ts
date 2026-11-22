import { describe, expect, it } from 'vitest';
import { duePauses, pauseState, pauseStats, progress, remaining, suggestedDelay, wantsSummary, workHours } from './pauses';
import type { Category, Pause, Transaction } from './types';

const now = new Date('2026-11-22T12:00:00Z');
const pause = (over: Partial<Pause>): Pause => ({
  id: 'p1',
  item: 'Baskets',
  amount: 8_900,
  createdAt: '2026-11-21T12:00:00Z',
  until: '2026-11-22T12:00:00Z',
  status: 'waiting',
  ...over,
});

describe('pauses avant achat', () => {
  it('suggère un délai proportionnel au prix', () => {
    expect(suggestedDelay(2_000)).toBe(24);
    expect(suggestedDelay(8_900)).toBe(48);
    expect(suggestedDelay(50_000)).toBe(168);
    expect(suggestedDelay(150_000)).toBe(720);
  });

  it('distingue pause en cours, à décider et décidée', () => {
    expect(pauseState(pause({ until: '2026-11-23T12:00:00Z' }), now)).toBe('waiting');
    expect(pauseState(pause({}), now)).toBe('ready');
    expect(pauseState(pause({ status: 'dropped' }), now)).toBe('dropped');
  });

  it('affiche le temps restant et l’avancement', () => {
    expect(remaining(pause({ until: '2026-11-25T16:00:00Z' }), now)).toBe('3 j 4 h');
    expect(remaining(pause({ until: '2026-11-22T17:12:00Z' }), now)).toBe('5 h 12 min');
    expect(remaining(pause({ until: '2026-11-22T12:08:00Z' }), now)).toBe('8 min');
    expect(remaining(pause({}), now)).toBe('terminée');
    expect(progress(pause({ until: '2026-11-23T12:00:00Z' }), now)).toBeCloseTo(0.5);
  });

  it('compte l’argent gardé grâce à la pause', () => {
    const s = pauseStats(
      [
        pause({ id: 'a', status: 'dropped', amount: 8_900 }),
        pause({ id: 'b', status: 'dropped', amount: 2_500 }),
        pause({ id: 'c', status: 'bought', amount: 4_000 }),
        pause({ id: 'd', amount: 1_000 }),
        pause({ id: 'e', amount: 3_000, until: '2026-12-01T00:00:00Z' }),
      ],
      now,
    );
    expect(s.saved).toBe(11_400);
    expect(s.dropped).toBe(2);
    expect(s.bought).toBe(1);
    expect(s.pending).toBe(4_000);
    expect(s.ready).toBe(1);
    expect(s.resistRate).toBeCloseTo(2 / 3);
  });

  it('convertit un prix en heures de travail', () => {
    expect(workHours(15_167, 151_670)).toBeCloseTo(15.167);
    expect(workHours(1_000, 0)).toBeNull();
  });

  it('ne notifie qu’une fois chaque fin de pause', () => {
    const list = [pause({ id: 'a' }), pause({ id: 'b' }), pause({ id: 'c', until: '2026-12-01T00:00:00Z' })];
    expect(duePauses(list, {}, now).map((p) => p.id)).toEqual(['a', 'b']);
    expect(duePauses(list, { 'pause:a': 'x' }, now).map((p) => p.id)).toEqual(['b']);
  });

  it('résume les envies du mois avec le classement propre à chaque opération', () => {
    const cats = new Map<string, Category>([
      ['resto', { id: 'resto', name: 'Restaurants', kind: 'expense', icon: '🍽️', color: '#000', group: 'envies' }],
      ['courses', { id: 'courses', name: 'Courses', kind: 'expense', icon: '🛒', color: '#000', group: 'besoins' }],
      ['vir', { id: 'vir', name: 'Virement compte', kind: 'transfer', icon: '⇄', color: '#000' }],
      ['salaire', { id: 'salaire', name: 'Salaire', kind: 'income', icon: '💼', color: '#000' }],
    ]);
    const tx = (id: string, amount: number, categoryId: string, extra: Partial<Transaction> = {}): Transaction => ({
      id, date: '2026-08-10', amount, label: id, accountId: 'c', categoryId, ...extra,
    });
    const s = wantsSummary(
      [
        tx('kfc', -2_990, 'resto'),
        tx('pizza', -900, 'resto'),
        tx('anniv', -6_000, 'resto', { need: 'besoins' }), // repas jugé nécessaire
        tx('leclerc', -15_258, 'courses'),
        tx('chocolat', -1_200, 'courses', { need: 'envies' }), // plaisir dans les courses
        tx('virement', -10_000, 'vir'),
        tx('paie', 180_000, 'salaire'),
        tx('juillet', -5_000, 'resto', { date: '2026-07-30' }),
      ],
      cats,
      '2026-08',
    );
    expect(s.total).toBe(2_990 + 900 + 1_200);
    expect(s.count).toBe(3);
    expect(s.income).toBe(180_000);
    expect(s.expense).toBe(2_990 + 900 + 6_000 + 15_258 + 1_200);
    expect(s.lines[0]).toMatchObject({ categoryId: 'resto', total: 3_890, count: 2, small: 2 });
  });
});

describe('migration v6', () => {
  it('ajoute la liste des pauses aux données existantes', async () => {
    const { migrateData } = await import('../store/store');
    expect(migrateData({ transactions: [] }, 5).pauses).toEqual([]);
    const kept = [pause({})];
    expect(migrateData({ pauses: kept }, 5).pauses).toBe(kept);
  });
});
