import { useState } from 'react';
import SyncCard from '../components/SyncCard';
import InstallCard from '../components/InstallCard';
import { Card, CategorySelect, PageHead, Segmented, download, toast, useCategoryMap } from '../components/ui';
import { demoData } from '../lib/demo';
import type { Category, NeedGroup, TaxTag } from '../lib/types';
import { exportData, parseBackup, useStore } from '../store/store';

const TAX_TAGS: Record<TaxTag, string> = {
  salaire: 'Salaire',
  don_aide: 'Dons 75 %',
  don: 'Dons 66 %',
  emploi_domicile: 'Emploi à domicile',
  garde_enfant: 'Garde d’enfants',
  per: 'Versement PER',
  syndicat: 'Cotisation syndicale',
  loyer_percu: 'Loyers perçus',
  charges_locatives: 'Charges locatives',
  dividendes: 'Dividendes',
  interets: 'Intérêts',
};

export default function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const categories = useStore((s) => s.categories);
  const rules = useStore((s) => s.rules);
  const txCount = useStore((s) => s.transactions.length);
  const { updateSettings, addCategory, updateCategory, deleteCategory, addRule, deleteRule, recategorizeUncategorized, replaceAll, reset } = useStore.getState();
  const cats = useCategoryMap();

  const [newCat, setNewCat] = useState({ name: '', icon: '📁', kind: 'expense' as Category['kind'] });
  const [rulePattern, setRulePattern] = useState('');
  const [ruleCat, setRuleCat] = useState<string | null>(null);
  const [ruleFilter, setRuleFilter] = useState('');

  const backup = () => {
    download(`cap-budget-${new Date().toISOString().slice(0, 10)}.json`, exportData());
    toast('Sauvegarde téléchargée.');
  };

  const restore = async (file: File) => {
    try {
      const data = parseBackup(await file.text());
      if (confirm('Remplacer toutes vos données par cette sauvegarde ?')) {
        replaceAll(data);
        toast('Sauvegarde restaurée.');
      }
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title="Réglages" />
      <div className="stack">
        <SyncCard />
        <InstallCard />
        <div className="grid g2">
          <Card title="Apparence">
            <Segmented
              value={settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={[{ value: 'system', label: 'Système' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }]}
            />
          </Card>
          <Card title="Sauvegarde et données">
            <div className="stack" style={{ gap: 10 }}>
              <p className="muted small">
                Vos {txCount} opérations sont stockées sur cet appareil. Sans synchronisation, exportez régulièrement une sauvegarde pour ne rien perdre
                (changement d’appareil, nettoyage du navigateur).
              </p>
              <div className="row">
                <button className="primary" onClick={backup}>Exporter une sauvegarde</button>
                <label className="btn" style={{ cursor: 'pointer' }}>
                  Restaurer
                  <input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
                </label>
              </div>
              <div className="row">
                <button className="small" onClick={() => confirm('Remplacer vos données par le jeu de démonstration ?') && replaceAll(demoData())}>Charger la démo</button>
                <button className="small danger" onClick={() => confirm('Effacer définitivement toutes les données ?') && reset()}>Tout effacer</button>
              </div>
            </div>
          </Card>
        </div>

        <Card title="Catégories" actions={<span className="faint small">L’étiquette fiscale alimente le simulateur d’impôt</span>}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Catégorie</th><th>Type</th><th>Groupe 50/30/20</th><th>Étiquette fiscale</th><th /></tr></thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <input value={c.icon} onChange={(e) => updateCategory(c.id, { icon: e.target.value })} style={{ width: 46, textAlign: 'center' }} aria-label="Icône" />
                        <input value={c.name} onChange={(e) => updateCategory(c.id, { name: e.target.value })} aria-label="Nom" style={{ minWidth: 160 }} />
                      </div>
                    </td>
                    <td className="small muted">{{ expense: 'Dépense', income: 'Revenu', transfer: 'Épargne / virement' }[c.kind]}</td>
                    <td>
                      <select value={c.group ?? ''} onChange={(e) => updateCategory(c.id, { group: (e.target.value || undefined) as NeedGroup | undefined })} aria-label="Groupe">
                        <option value="">—</option>
                        <option value="besoins">Besoins</option>
                        <option value="envies">Envies</option>
                        <option value="epargne">Épargne</option>
                      </select>
                    </td>
                    <td>
                      <select value={c.taxTag ?? ''} onChange={(e) => updateCategory(c.id, { taxTag: (e.target.value || undefined) as TaxTag | undefined })} aria-label="Étiquette fiscale">
                        <option value="">—</option>
                        {Object.entries(TAX_TAGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td><button className="small ghost danger" onClick={() => confirm(`Supprimer « ${c.name} » ?`) && deleteCategory(c.id)}>Supprimer</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form
            className="row"
            style={{ marginTop: 14 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!newCat.name.trim()) return;
              addCategory({ ...newCat, name: newCat.name.trim(), color: '#64748b', group: newCat.kind === 'expense' ? 'envies' : undefined });
              setNewCat({ ...newCat, name: '' });
            }}
          >
            <input value={newCat.icon} onChange={(e) => setNewCat({ ...newCat, icon: e.target.value })} style={{ width: 46, textAlign: 'center' }} aria-label="Icône" />
            <input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="Nouvelle catégorie" style={{ maxWidth: 240 }} />
            <select value={newCat.kind} onChange={(e) => setNewCat({ ...newCat, kind: e.target.value as Category['kind'] })} style={{ maxWidth: 170 }}>
              <option value="expense">Dépense</option>
              <option value="income">Revenu</option>
              <option value="transfer">Épargne / virement</option>
            </select>
            <button type="submit">Ajouter</button>
          </form>
        </Card>

        <Card
          title={`Règles de catégorisation (${rules.length})`}
          actions={<button className="small" onClick={() => toast(`${recategorizeUncategorized()} opération(s) catégorisée(s).`)}>Appliquer aux opérations non classées</button>}
        >
          <form
            className="row"
            style={{ marginBottom: 14 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!rulePattern.trim() || !ruleCat) return;
              const n = addRule(rulePattern.trim().toLowerCase(), ruleCat, true);
              toast(`Règle ajoutée${n ? `, ${n} opération(s) classée(s)` : ''}.`);
              setRulePattern('');
            }}
          >
            <input value={rulePattern} onChange={(e) => setRulePattern(e.target.value)} placeholder="Le libellé contient…" style={{ maxWidth: 240 }} />
            <div style={{ width: 240 }}><CategorySelect value={ruleCat} onChange={setRuleCat} allowEmpty /></div>
            <button type="submit">Ajouter la règle</button>
            <input value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)} placeholder="Filtrer les règles" style={{ maxWidth: 200, marginLeft: 'auto' }} />
          </form>
          <div className="row" style={{ gap: 6 }}>
            {rules
              .filter((r) => !ruleFilter || r.pattern.includes(ruleFilter.toLowerCase()) || cats.get(r.categoryId)?.name.toLowerCase().includes(ruleFilter.toLowerCase()))
              .map((r) => (
                <span key={r.id} className="badge" style={{ padding: '4px 6px 4px 10px' }}>
                  « {r.pattern.trim()} » → {cats.get(r.categoryId)?.icon} {cats.get(r.categoryId)?.name}
                  <button className="small ghost" style={{ padding: '0 4px' }} onClick={() => deleteRule(r.id)} aria-label="Supprimer la règle">×</button>
                </span>
              ))}
          </div>
        </Card>
      </div>
    </>
  );
}
