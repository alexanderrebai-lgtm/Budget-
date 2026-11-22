import { initialData, type Data } from '../store/store';
import { mergeData } from './merge';
import { deriveKeyMaterial, open, seal, userSalt, WrongPassphraseError, PassphraseRequiredError } from './crypto';
import type { Transaction } from '../lib/types';

const tx = (id: string, amount = -100, label = 'X'): Transaction => ({ id, date: '2026-10-01', amount, label, accountId: 'a', categoryId: null });
const withTx = (txs: Transaction[], patch: Partial<Data> = {}): Data => ({ ...initialData(), transactions: txs, ...patch });

describe('fusion à trois voies', () => {
  const base = withTx([tx('1'), tx('2'), tx('3')]);

  it('fusionne les pauses avant achat des deux appareils', () => {
    const p = (id: string, status: 'waiting' | 'dropped' = 'waiting') => ({ id, item: id, amount: 1000, createdAt: 'x', until: 'y', status });
    const b = withTx([], { pauses: [p('a')] });
    const local = withTx([], { pauses: [p('a', 'dropped')] }); // décidée sur le PC
    const remote = withTx([], { pauses: [p('a'), p('b')] }); // nouvelle envie notée sur le téléphone
    const m = mergeData(b, local, remote);
    expect(m.pauses.map((x) => [x.id, x.status]).sort()).toEqual([['a', 'dropped'], ['b', 'waiting']]);
  });

  it('combine les ajouts des deux appareils', () => {
    const local = withTx([...base.transactions, tx('L')]);
    const remote = withTx([...base.transactions, tx('R')]);
    const ids = mergeData(base, local, remote).transactions.map((t) => t.id).sort();
    expect(ids).toEqual(['1', '2', '3', 'L', 'R']);
  });

  it('applique les suppressions de chaque côté', () => {
    const local = withTx([tx('1'), tx('2')]); // 3 supprimée ici
    const remote = withTx([tx('2'), tx('3')]); // 1 supprimée là-bas
    expect(mergeData(base, local, remote).transactions.map((t) => t.id)).toEqual(['2']);
  });

  it('garde une modification distante si rien n’a changé localement', () => {
    const remote = withTx([tx('1', -999), tx('2'), tx('3')]);
    expect(mergeData(base, base, remote).transactions.find((t) => t.id === '1')!.amount).toBe(-999);
  });

  it('privilégie la version locale en cas de double modification', () => {
    const local = withTx([tx('1', -111), tx('2'), tx('3')]);
    const remote = withTx([tx('1', -999), tx('2'), tx('3')]);
    expect(mergeData(base, local, remote).transactions.find((t) => t.id === '1')!.amount).toBe(-111);
  });

  it('ne supprime pas un élément modifié de l’autre côté', () => {
    const local = withTx([tx('2'), tx('3')]); // 1 supprimée localement
    const remote = withTx([tx('1', -500), tx('2'), tx('3')]); // 1 modifiée à distance
    expect(mergeData(base, local, remote).transactions.map((t) => t.id).sort()).toEqual(['1', '2', '3']);
  });

  it('sans base, réunit les deux jeux de données', () => {
    const merged = mergeData(null, withTx([tx('L')]), withTx([tx('R')]));
    expect(merged.transactions.map((t) => t.id).sort()).toEqual(['L', 'R']);
  });

  it('prend le profil fiscal du côté qui l’a modifié', () => {
    const remote = withTx(base.transactions, { taxProfile: { ...base.taxProfile, withholdingPaid: 1234 } });
    expect(mergeData(base, base, remote).taxProfile.withholdingPaid).toBe(1234);
  });
});

describe('chiffrement', () => {
  const data = { hello: 'monde', n: [1, 2, 3] };

  it('aller-retour avec la clé du compte', async () => {
    const km = await deriveKeyMaterial('correct horse battery', await userSalt('user-1'));
    const sealed = await seal(data, km);
    expect(sealed.enc).toBe('aes-gcm');
    expect(JSON.stringify(sealed)).not.toContain('monde');
    expect(await open(sealed, km)).toEqual(data);
  });

  it('la même phrase donne la même clé sur un autre appareil du même compte', async () => {
    const a = await deriveKeyMaterial('phrase', await userSalt('user-1'));
    const b = await deriveKeyMaterial('phrase', await userSalt('user-1'));
    expect(await open(await seal(data, a), b)).toEqual(data);
  });

  it('refuse une mauvaise phrase', async () => {
    const good = await deriveKeyMaterial('phrase A', await userSalt('u'));
    const bad = await deriveKeyMaterial('phrase B', await userSalt('u'));
    const sealed = await seal(data, good);
    await expect(open(sealed, bad)).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(open(sealed, null)).rejects.toBeInstanceOf(PassphraseRequiredError);
  });

  it('ouvre un contenu chiffré avec un autre sel grâce à la phrase saisie', async () => {
    const old = await deriveKeyMaterial('phrase', crypto.getRandomValues(new Uint8Array(16)));
    const current = await deriveKeyMaterial('phrase', await userSalt('u'));
    const sealed = await seal(data, old);
    await expect(open(sealed, current)).rejects.toBeInstanceOf(PassphraseRequiredError);
    expect(await open(sealed, current, 'phrase')).toEqual(data);
  });

  it('stocke en clair sans clé', async () => {
    expect(await open(await seal(data, null), null)).toEqual(data);
  });
});
