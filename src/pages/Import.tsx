import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, PageHead, toast, useCategoryMap } from '../components/ui';
import { categorize } from '../lib/analysis';
import { applyMapping, guessMapping, parseCsv, readFileText, type ImportedRow, type ParsedCsv } from '../lib/csv';
import { dateLabel, money, toCents } from '../lib/format';
import { parseOfx, parseQif, readPdf } from '../lib/statements';
import type { CsvMapping } from '../lib/types';
import { useStore } from '../store/store';

type Source =
  | { kind: 'csv'; parsed: ParsedCsv }
  | { kind: 'rows'; format: 'OFX' | 'QIF' | 'PDF'; note?: string };

const PREVIEW = 15;

export default function Import() {
  const accounts = useStore((s) => s.accounts);
  const rules = useStore((s) => s.rules);
  const savedMapping = useStore((s) => s.csvMapping);
  const { importRows, setCsvMapping } = useStore.getState();
  const cats = useCategoryMap();
  const navigate = useNavigate();

  const [fileName, setFileName] = useState('');
  const [source, setSource] = useState<Source | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.type === 'courant')?.id ?? accounts[0]?.id ?? '');
  const [invert, setInvert] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const reset = () => {
    setSource(null);
    setMapping(null);
    setRows([]);
    setInvert(false);
    setShowAll(false);
  };

  const onFile = async (file: File) => {
    setError(null);
    reset();
    setLoading(true);
    try {
      const ext = file.name.toLowerCase().split('.').pop() ?? '';
      setFileName(file.name);
      if (ext === 'pdf' || file.type === 'application/pdf') {
        const r = await readPdf(file);
        if (!r.rows.length) {
          throw new Error(
            'Aucune opération reconnue dans ce PDF. S’il s’agit d’un scan (image), il ne contient pas de texte lisible : exportez plutôt un fichier CSV ou OFX depuis votre banque.',
          );
        }
        setRows(r.rows);
        setSource({
          kind: 'rows',
          format: 'PDF',
          note: r.columnsDetected
            ? 'Colonnes Débit / Crédit repérées. Vérifiez quelques lignes avant d’importer.'
            : 'Colonnes Débit / Crédit non repérées : les montants sont comptés comme des dépenses. Cliquez sur un montant pour inverser son sens.',
        });
        return;
      }
      const text = await readFileText(file);
      if (ext === 'ofx' || ext === 'qfx' || /<OFX>/i.test(text)) {
        const r = parseOfx(text);
        if (!r.length) throw new Error('Aucune opération trouvée dans ce fichier OFX.');
        setRows(r);
        setSource({ kind: 'rows', format: 'OFX' });
        return;
      }
      if (ext === 'qif' || /^!Type:/m.test(text)) {
        const r = parseQif(text);
        if (!r.length) throw new Error('Aucune opération trouvée dans ce fichier QIF.');
        setRows(r);
        setSource({ kind: 'rows', format: 'QIF' });
        return;
      }
      const p = parseCsv(text);
      if (!p.headers.length || !p.rows.length) throw new Error('Fichier vide ou illisible.');
      const reuse = savedMapping && p.headers.includes(savedMapping.dateColumn) && p.headers.includes(savedMapping.labelColumn);
      setSource({ kind: 'csv', parsed: p });
      setMapping(reuse ? savedMapping : guessMapping(p));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const result = useMemo(() => {
    if (!source) return null;
    let out: { rows: ImportedRow[]; errors: number };
    if (source.kind === 'csv') {
      if (!mapping) return null;
      out = applyMapping(source.parsed, mapping);
    } else {
      out = { rows, errors: 0 };
    }
    if (invert) out = { ...out, rows: out.rows.map((x) => ({ ...x, amount: -x.amount })) };
    return out;
  }, [source, mapping, rows, invert]);

  const categorized = result ? result.rows.filter((r) => categorize(r.label, rules)).length : 0;
  const total = result ? result.rows.reduce((s, r) => s + r.amount, 0) : 0;
  const editable = source?.kind === 'rows';

  const doImport = () => {
    if (!result || !accountId) return;
    if (source?.kind === 'csv' && mapping) setCsvMapping(mapping);
    const { added, duplicates } = importRows(result.rows, accountId);
    toast(`${added} opération(s) importée(s)${duplicates ? `, ${duplicates} doublon(s) ignoré(s)` : ''}.`);
    navigate('/transactions');
  };

  const flip = (i: number) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, amount: -r.amount } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  const col = (key: keyof CsvMapping, label: string, optional = false) => (
    <label className="field">
      <span>{label}</span>
      <select
        value={(mapping?.[key] as string | undefined) ?? ''}
        onChange={(e) => setMapping((m) => (m ? { ...m, [key]: e.target.value || undefined } : m))}
      >
        {optional && <option value="">—</option>}
        {source?.kind === 'csv' && source.parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  );

  const amountMode = mapping?.amountColumn ? 'single' : 'split';
  const visible = result ? (showAll ? result.rows : result.rows.slice(0, PREVIEW)) : [];

  return (
    <>
      <PageHead title="Importer un relevé" subtitle="CSV, OFX, QIF ou PDF téléchargé depuis votre banque en ligne." />
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
                <span>Fichier du relevé</span>
                <input
                  type="file"
                  accept=".csv,.txt,.ofx,.qfx,.qif,.pdf,text/csv,application/pdf,application/x-ofx"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                />
              </label>
            </div>
            {loading && <div className="callout">Lecture du fichier…</div>}
            {error && <div className="callout danger">{error}</div>}
            {!source && !loading && (
              <div className="callout">
                <strong>Quel format choisir ?</strong> Dans votre espace bancaire, cherchez « Exporter » ou « Télécharger les opérations ».
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  <li><strong>OFX</strong> (parfois « Money » ou « Quicken ») : le plus fiable, montants et dates sans ambiguïté.</li>
                  <li><strong>CSV</strong> : vous choisissez les colonnes, l’association est mémorisée.</li>
                  <li><strong>PDF</strong> : le relevé mensuel classique. La lecture est automatique ; vérifiez l’aperçu.</li>
                </ul>
                Les doublons sont détectés : vous pouvez réimporter une période qui chevauche la précédente.
              </div>
            )}
          </div>
        </Card>

        {source?.kind === 'csv' && mapping && (
          <Card title={`Colonnes de « ${fileName} »`}>
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
                        ? { ...mapping, amountColumn: source.parsed.headers[0], debitColumn: undefined, creditColumn: undefined }
                        : { ...mapping, amountColumn: undefined, debitColumn: source.parsed.headers[0], creditColumn: source.parsed.headers[0] },
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
          </Card>
        )}

        {result && (
          <Card title={editable ? `Aperçu de « ${fileName} » (${source.format})` : 'Aperçu'}>
            <div className="stack">
              {editable && source.note && <div className="callout small">{source.note}</div>}
              <div className="row small">
                <span className="badge accent">{result.rows.length} opérations</span>
                <span className="badge">{categorized} catégorisées automatiquement</span>
                <span className="badge">Solde des opérations : {money(toCents(total))}</span>
                {result.errors > 0 && <span className="badge warn">{result.errors} ligne(s) ignorée(s)</span>}
              </div>
              <label className="check">
                <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
                Inverser tous les signes (si les dépenses apparaissent en positif)
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th><th>Libellé</th><th>Catégorie proposée</th><th className="amount">Montant</th>
                      {editable && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r, i) => {
                      const c = cats.get(categorize(r.label, rules) ?? '');
                      return (
                        <tr key={i}>
                          <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{dateLabel(r.date)}</td>
                          <td className="ellipsis" style={{ maxWidth: 340 }} title={r.label}>{r.label}</td>
                          <td className="small">{c ? `${c.icon} ${c.name}` : <span className="faint">À catégoriser</span>}</td>
                          <td className={`amount ${r.amount >= 0 ? 'pos' : ''}`}>
                            {editable ? (
                              <button className="ghost small num" title="Inverser le sens" onClick={() => flip(i)} style={{ color: 'inherit' }}>
                                {money(toCents(r.amount))} ⇅
                              </button>
                            ) : (
                              money(toCents(r.amount))
                            )}
                          </td>
                          {editable && (
                            <td><button className="ghost small danger" onClick={() => remove(i)} aria-label="Retirer la ligne">×</button></td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {result.rows.length > PREVIEW && (
                <button className="ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Réduire' : `Afficher les ${result.rows.length - PREVIEW} autres lignes`}
                </button>
              )}
              <div className="row">
                <button className="primary" onClick={doImport} disabled={!result.rows.length || !accountId}>
                  Importer {result.rows.length} opérations
                </button>
                <button className="ghost" onClick={reset}>Annuler</button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
