import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CategorySelect, Empty, NumberField, PageHead, Segmented, download, toast, useCategoryMap } from '../components/ui';
import { merchantKey, needGroupOf } from '../lib/analysis';
import { classify } from '../lib/merchants';
import { dateLabel, money, monthKey, monthLabel, normalize, toCents, todayISO } from '../lib/format';
import { useStore } from '../store/store';

type Kind = 'all' | 'expense' | 'income' | 'wants' | 'uncat';
const PAGE = 150;

export default function Transactions() {
  const txs = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts);
  const { addTransaction, updateTransaction, deleteTransactions, setCategoryFor, addRule, linkTransfers, unlinkTransfer } = useStore.getState();
  const transferPeer = useMemo(() => {
    const byId = new Map<string, typeof txs>();
    for (const t of txs) if (t.transferId) byId.set(t.transferId, [...(byId.get(t.transferId) ?? []), t]);
    return byId;
  }, [txs]);
  const cats = useCategoryMap();

  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [month, setMonth] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [ruleOffer, setRuleOffer] = useState<{ pattern: string; categoryId: string } | null>(null);

  const months = useMemo(() => [...new Set(txs.map((t) => monthKey(t.date)))].sort().reverse(), [txs]);

  const filtered = useMemo(() => {
    const nq = normalize(q);
    return txs
      .filter((t) => {
        if (account && t.accountId !== account) return false;
        if (category && t.categoryId !== category) return false;
        if (month && monthKey(t.date) !== month) return false;
        if (kind === 'expense' && t.amount >= 0) return false;
        if (kind === 'income' && t.amount < 0) return false;
        if (kind === 'uncat' && t.categoryId) return false;
        if (kind === 'wants' && (t.amount >= 0 || needGroupOf(t, cats.get(t.categoryId ?? '')) !== 'envies')) return false;
        if (nq && !normalize(t.label).includes(nq) && !normalize(t.notes ?? '').includes(nq)) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [txs, q, kind, account, category, month, cats]);

  const total = filtered.reduce((s, t) => s + t.amount, 0);
  // nom d'enseigne reconnu (affiché à la place du libellé brut, qui reste visible en dessous)
  const merchantNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of filtered.slice(0, limit)) {
      const name = classify(t.label, t.amount).merchant;
      if (name) m.set(t.id, name);
    }
    return m;
  }, [filtered, limit]);
  const allSelected = filtered.length > 0 && filtered.slice(0, limit).every((t) => selected.has(t.id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const changeCategory = (id: string, label: string, categoryId: string | null) => {
    updateTransaction(id, { categoryId });
    const pattern = merchantKey(label);
    if (categoryId && pattern.length >= 3) setRuleOffer({ pattern, categoryId });
  };

  const exportCsv = () => {
    const rows = [['Date', 'Libellé', 'Montant', 'Catégorie', 'Compte', 'Notes']];
    for (const t of filtered) {
      rows.push([
        t.date,
        t.label,
        (t.amount / 100).toFixed(2).replace('.', ','),
        cats.get(t.categoryId ?? '')?.name ?? '',
        accounts.find((a) => a.id === t.accountId)?.name ?? '',
        t.notes ?? '',
      ]);
    }
    download('operations.csv', rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv;charset=utf-8');
  };

  return (
    <>
      <PageHead
        title="Opérations"
        subtitle={`${filtered.length} opération(s) · solde ${money(total)}`}
        actions={
          <>
            <button
              onClick={() => {
                const n = linkTransfers();
                toast(n ? `${n} virement(s) entre vos comptes rapproché(s).` : 'Aucun nouveau virement entre vos comptes à rapprocher.');
              }}
              disabled={accounts.length < 2}
              title="Relie le débit d’un compte au crédit du même montant sur un autre de vos comptes"
            >
              ⇄ Rapprocher les virements
            </button>
            <button onClick={exportCsv} disabled={!filtered.length}>Exporter</button>
            <Link to="/import" className="btn">Importer un relevé</Link>
            <button className="primary" onClick={() => setShowAdd((v) => !v)} disabled={!accounts.length}>+ Ajouter</button>
          </>
        }
      />

      <div className="stack">
        {showAdd && <AddForm onDone={() => setShowAdd(false)} onAdd={addTransaction} />}

        {ruleOffer && (
          <div className="callout accent row between">
            <span>
              Classer automatiquement les libellés contenant « <strong>{ruleOffer.pattern}</strong> » dans{' '}
              <strong>{cats.get(ruleOffer.categoryId)?.name}</strong> ?
            </span>
            <span className="row">
              <button
                className="small primary"
                onClick={() => {
                  const n = addRule(ruleOffer.pattern, ruleOffer.categoryId, true);
                  toast(`Règle créée${n ? `, ${n} opération(s) classée(s)` : ''}.`);
                  setRuleOffer(null);
                }}
              >
                Créer la règle
              </button>
              <button className="small ghost" onClick={() => setRuleOffer(null)}>Non merci</button>
            </span>
          </div>
        )}

        <Card>
          <div className="row" style={{ marginBottom: 14 }}>
            <input placeholder="Rechercher un libellé…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
            <Segmented<Kind>
              value={kind}
              onChange={setKind}
              options={[
                { value: 'all', label: 'Toutes' },
                { value: 'expense', label: 'Dépenses' },
                { value: 'income', label: 'Revenus' },
                { value: 'wants', label: 'Envies' },
                { value: 'uncat', label: 'À classer' },
              ]}
            />
            <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ maxWidth: 170 }} aria-label="Mois">
              <option value="">Tous les mois</option>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select value={account} onChange={(e) => setAccount(e.target.value)} style={{ maxWidth: 170 }} aria-label="Compte">
              <option value="">Tous les comptes</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <div style={{ maxWidth: 220 }}><CategorySelect value={category} onChange={setCategory} /></div>
          </div>

          {selected.size > 0 && (
            <div className="callout row between" style={{ marginBottom: 12 }}>
              <span>{selected.size} sélectionnée(s)</span>
              <span className="row">
                <div style={{ width: 220 }}>
                  <CategorySelect value={null} onChange={(c) => { setCategoryFor([...selected], c); setSelected(new Set()); toast('Catégorie appliquée.'); }} />
                </div>
                <button
                  className="small danger"
                  onClick={() => {
                    if (confirm(`Supprimer ${selected.size} opération(s) ?`)) {
                      deleteTransactions([...selected]);
                      setSelected(new Set());
                    }
                  }}
                >
                  Supprimer
                </button>
              </span>
            </div>
          )}

          {filtered.length === 0 ? (
            <Empty icon="🧾" title="Aucune opération">
              {txs.length ? 'Modifiez les filtres.' : <>Ajoutez une opération ou <Link to="/import">importez un relevé bancaire</Link>.</>}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        aria-label="Tout sélectionner"
                        onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.slice(0, limit).map((t) => t.id)))}
                      />
                    </th>
                    <th>Date</th>
                    <th>Libellé</th>
                    <th>Catégorie</th>
                    <th className="amount">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, limit).map((t) => (
                    <tr key={t.id}>
                      <td><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label="Sélectionner" /></td>
                      <td className="muted small" style={{ whiteSpace: 'nowrap' }}>{dateLabel(t.date)}</td>
                      <td style={{ maxWidth: 360 }}>
                        <div className="ellipsis" title={t.label}>{merchantNames.get(t.id) ?? t.label}</div>
                        {merchantNames.has(t.id) && <div className="faint small ellipsis" title={t.label}>{t.label}</div>}
                        <div className="faint small">
                          {accounts.find((a) => a.id === t.accountId)?.name}
                          {t.transferId && (() => {
                            const peer = transferPeer.get(t.transferId)?.find((x) => x.id !== t.id);
                            const peerName = accounts.find((a) => a.id === peer?.accountId)?.name ?? 'autre compte';
                            return (
                              <span className="badge accent" style={{ marginLeft: 6 }} title="Virement entre vos comptes">
                                ⇄ {t.amount < 0 ? 'vers' : 'depuis'} {peerName}
                                <button className="ghost small" style={{ padding: '0 2px', marginLeft: 2 }} aria-label="Dissocier" title="Dissocier ce virement" onClick={() => unlinkTransfer(t.transferId!)}>×</button>
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td>
                        <CategorySelect value={t.categoryId} onChange={(c) => changeCategory(t.id, t.label, c)} />
                        {(() => {
                          const cat = cats.get(t.categoryId ?? '');
                          if (t.amount >= 0 || !cat || cat.kind !== 'expense') return null;
                          const g = needGroupOf(t, cat);
                          if (g === 'epargne') return null;
                          const set = (v: 'besoins' | 'envies') => updateTransaction(t.id, { need: v === cat.group ? undefined : v });
                          return (
                            <div className="need-toggle" role="group" aria-label="Besoin ou envie">
                              <button type="button" className={g === 'besoins' ? 'on' : ''} aria-pressed={g === 'besoins'} onClick={() => set('besoins')}>Besoin</button>
                              <button type="button" className={g === 'envies' ? 'on want' : ''} aria-pressed={g === 'envies'} onClick={() => set('envies')}>Envie</button>
                            </div>
                          );
                        })()}
                      </td>
                      <td className={`amount ${t.amount >= 0 ? 'pos' : ''}`}>{money(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > limit && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
              <button onClick={() => setLimit(limit + PAGE)}>Afficher plus ({filtered.length - limit} restantes)</button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function AddForm({ onAdd, onDone }: { onAdd: ReturnType<typeof useStore.getState>['addTransaction']; onDone: () => void }) {
  const accounts = useStore((s) => s.accounts);
  const [date, setDate] = useState(todayISO());
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState(0);
  const [isIncome, setIsIncome] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !amount || !accountId) return;
    onAdd({ date, label: label.trim(), amount: toCents(isIncome ? amount : -amount), accountId, categoryId });
    toast('Opération ajoutée.');
    setLabel('');
    setAmount(0);
    onDone();
  };

  return (
    <Card title="Nouvelle opération">
      <form onSubmit={submit} className="stack">
        <div className="form-grid">
          <div className="field"><span>Type</span>
            <Segmented value={isIncome ? 'in' : 'out'} onChange={(v) => setIsIncome(v === 'in')} options={[{ value: 'out', label: 'Dépense' }, { value: 'in', label: 'Revenu' }]} />
          </div>
          <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
          <label className="field"><span>Libellé</span><input value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="Ex. Boulangerie" /></label>
          <NumberField label="Montant" value={amount} onChange={setAmount} />
          <label className="field"><span>Compte</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Catégorie</span><CategorySelect value={categoryId} onChange={setCategoryId} /></label>
        </div>
        <div className="row">
          <button className="primary" type="submit">Enregistrer</button>
          <button type="button" className="ghost" onClick={onDone}>Annuler</button>
        </div>
      </form>
    </Card>
  );
}
