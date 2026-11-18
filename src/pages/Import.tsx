import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, PageHead, toast, useCategoryMap } from '../components/ui';
import { categorize } from '../lib/analysis';
import { applyMapping, guessMapping, parseCsv, readFileText, type ParsedCsv } from '../lib/csv';
import { dateLabel, money, toCents } from '../lib/format';
import type { CsvMapping } from '../lib/types';
import { useStore } from '../store/store';

export default function Import() {
  const accounts = useStore((s) => s.accounts);
  const rules = useStore((s) => s.rules);
  const savedMapping = useStore((s) => s.csvMapping);
  const { importRows, setCsvMapping } = useStore.getState();
  const cats = useCategoryMap();
  const navigate = useNavigate();

  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.type === 'courant')?.id ?? accounts[0]?.id ?? '');
  const [invert, setInvert] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    try {
      const p = parseCsv(await readFileText(file));
      if (!p.headers.length || !p.rows.length) throw new Error('Fichier vide ou illisible.');
      setParsed(p);
      setFileName(file.name);
      // réutilise la dernière association si les colonnes correspondent
      const reuse = savedMapping && p.headers.includes(savedMapping.dateColumn) && p.headers.includes(savedMapping.labelColumn);
      setMapping(reuse ? savedMapping : guessMapping(p));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const result = useMemo(() => {
    if (!parsed || !mapping) return null;
    const r = applyMapping(parsed, mapping);
    if (invert) r.rows = r.rows.map((x) => ({ ...x, amount: -x.amount }));
    return r;
  }, [parsed, mapping, invert]);

  const categorized = result ? result.rows.filter((r) => categorize(r.label, rules)).length : 0;

  const doImport = () => {
    if (!result || !mapping || !accountId) return;
    setCsvMapping(mapping);
    const { added, duplicates } = importRows(result.rows, accountId);
    toast(`${added} opération(s) importée(s)${duplicates ? `, ${duplicates} doublon(s) ignoré(s)` : ''}.`);
    navigate('/transactions');
  };

  const col = (key: keyof CsvMapping, label: string, optional = false) => (
    <label className="field">
      <span>{label}</span>
      <select
        value={(mapping?.[key] as string | undefined) ?? ''}
        onChange={(e) => setMapping((m) => (m ? { ...m, [key]: e.target.value || undefined } : m))}
      >
        {optional && <option value="">—</option>}
        {parsed?.headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  );

  const amountMode = mapping?.amountColumn ? 'single' : 'split';

  return (
    <>
      <PageHead title="Importer un relevé" subtitle="Fichier CSV exporté depuis votre banque en ligne." />
      <div className="stack">
        <Card>
          <div className="stack">
            <div className="form-grid">
              <label className="field">
                <span>Compte de destination</span>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Fichier CSV</span>
                <input type="file" accept=".csv,text/csv,.txt" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              </label>
            </div>
            {error && <div className="callout danger">{error}</div>}
            {!parsed && (
              <div className="callout">
                Dans votre espace bancaire, cherchez « Exporter les opérations » ou « Télécharger » et choisissez le format CSV (ou Excel CSV).
                Les formats à colonne unique « Montant » et à colonnes « Débit / Crédit » sont reconnus, ainsi que les séparateurs « ; » et « , ».
                Les doublons sont détectés : vous pouvez réimporter un relevé qui chevauche le précédent.
              </div>
            )}
          </div>
        </Card>

        {parsed && mapping && (
          <Card title={`Colonnes de « ${fileName} »`}>
            <div className="stack">
              <div className="form-grid">
                {col('dateColumn', 'Date')}
                <label className="field">
                  <span>Format de date</span>
                  <select value={mapping.dateFormat} onChange={(e) => setMapping({ ...mapping, dateFormat: e.target.value as CsvMapping['dateFormat'] })}>
                    <option value="dd/mm/yyyy">JJ/MM/AAAA</option>
                    <option value="yyyy-mm-dd">AAAA-MM-JJ</option>
                    <option value="mm/dd/yyyy">MM/JJ/AAAA</option>
                  </select>
                </label>
                {col('labelColumn', 'Libellé')}
                <label className="field">
                  <span>Montants</span>
                  <select
                    value={amountMode}
                    onChange={(e) =>
                      setMapping(
                        e.target.value === 'single'
                          ? { ...mapping, amountColumn: parsed.headers[0], debitColumn: undefined, creditColumn: undefined }
                          : { ...mapping, amountColumn: undefined, debitColumn: parsed.headers[0], creditColumn: parsed.headers[0] },
                      )
                    }
                  >
                    <option value="single">Une colonne signée</option>
                    <option value="split">Colonnes Débit et Crédit</option>
                  </select>
                </label>
                {amountMode === 'single' ? col('amountColumn', 'Colonne montant') : (
                  <>
                    {col('debitColumn', 'Colonne débit', true)}
                    {col('creditColumn', 'Colonne crédit', true)}
                  </>
                )}
              </div>
              <label className="check">
                <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
                Inverser les signes (si les dépenses apparaissent en positif)
              </label>

              {result && (
                <>
                  <div className="row small">
                    <span className="badge accent">{result.rows.length} opérations lues</span>
                    <span className="badge">{categorized} catégorisées automatiquement</span>
                    {result.errors > 0 && <span className="badge warn">{result.errors} ligne(s) ignorée(s)</span>}
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Date</th><th>Libellé</th><th>Catégorie proposée</th><th className="amount">Montant</th></tr>
                      </thead>
                      <tbody>
                        {result.rows.slice(0, 12).map((r, i) => {
                          const c = cats.get(categorize(r.label, rules) ?? '');
                          return (
                            <tr key={i}>
                              <td className="small muted">{dateLabel(r.date)}</td>
                              <td className="ellipsis" style={{ maxWidth: 340 }}>{r.label}</td>
                              <td className="small">{c ? `${c.icon} ${c.name}` : <span className="faint">À catégoriser</span>}</td>
                              <td className={`amount ${r.amount >= 0 ? 'pos' : ''}`}>{money(toCents(r.amount))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {result.rows.length > 12 && <p className="faint small">… et {result.rows.length - 12} autres.</p>}
                  <div className="row">
                    <button className="primary" onClick={doImport} disabled={!result.rows.length || !accountId}>
                      Importer {result.rows.length} opérations
                    </button>
                    <button className="ghost" onClick={() => { setParsed(null); setMapping(null); }}>Annuler</button>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
