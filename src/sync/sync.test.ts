import { initialData, type Data } from '../store/store';
import { mergeData } from './merge';
import { open, seal, WrongPassphraseError, PassphraseRequiredError } from './crypto';
import type { Transaction } from '../lib/types';

const tx = (id: string, amount = -100, label = 'X'): Transaction => ({ id, date: '2026-10-01', amount, label, accountId: 'a', categoryId: null });
const withTx = (txs: Transaction[], patch: Partial<Data> = {}): Data => ({ ...initialData(), transactions: txs, ...patch });

describe('fusion à trois voies', () => {
  const base = withTx([tx('1'), tx('2'), tx('3')]);

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

  it('aller-retour avec la bonne phrase', async () => {
    const sealed = await seal(data, 'correct horse battery');
    expect(sealed.enc).toBe('aes-gcm');
    expect(JSON.stringify(sealed)).not.toContain('monde');
    expect(await open(sealed, 'correct horse battery')).toEqual(data);
  });

  it('refuse une mauvaise phrase', async () => {
    const sealed = await seal(data, 'phrase A');
    await expect(open(sealed, 'phrase B')).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(open(sealed, null)).rejects.toBeInstanceOf(PassphraseRequiredError);
  });

  it('stocke en clair sans phrase', async () => {
    expect(await open(await seal(data, null), null)).toEqual(data);
  });
});
