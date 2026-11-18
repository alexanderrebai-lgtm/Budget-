import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, PageHead, toast, useCategoryMap } from '../components/ui';
import { classify } from '../lib/merchants';
import { applyMapping, guessMapping, parseCsv, readFileText, type ImportedRow, type ParsedCsv } from '../lib/csv';
import { dateLabel, money, toCents } from '../lib/format';
import { mergeStatementRows, parseOfx, parseQif, readPdf } from '../lib/statements';
import type { CsvMapping } from '../lib/types';
import { classifierContext, useStore } from '../store/store';

type Source =
  | { kind: 'csv'; parsed: ParsedCsv }
  | { kind: 'rows'; format: string; note?: string };

interface FileReport {
  name: string;
  format: string;
  count?: number;
  note?: string;
  error?: string;
}

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
  const [reports, setReports] = useState<FileReport[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setSource(null);
    setMapping(null);
    setRows([]);
    setInvert(false);
    setShowAll(false);
    setReports([]);
  };

  /** Lit un fichier de relevé (hors CSV à paramétrer) et renvoie ses opérations. */
  const readOne = async (file: File, csvAuto: boolean): Promise<FileReport & { rows: ImportedRow[]; csv?: ParsedCsv }> => {
    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    const base = { name: file.name };
    try {
      if (ext === 'pdf' || file.type === 'application/pdf') {
        const r = await readPdf(file);
        if (!r.rows.length) {
          return { ...base, format: 'PDF', rows: [], error: 'Aucune opération reconnue (PDF scanné ou mise en page inconnue).' };
        }
        return {
          ...base,
          format: 'PDF',
          rows: r.rows,
          note: r.columnsDetected ? undefined : 'Sens des montants non repéré : montants comptés comme des dépenses, vérifiez-les.',
        };
      }
      const text = await readFileText(file);
      if (ext === 'ofx' || ext === 'qfx' || /<OFX>/i.test(text)) {
        const r = parseOfx(text);
        return { ...base, format: 'OFX', rows: r, error: r.length ? undefined : 'Aucune opération trouvée.' };
      }
      if (ext === 'qif' || /^!Type:/m.test(text)) {
        const r = parseQif(text);
        return { ...base, format: 'QIF', rows: r, error: r.length ? undefined : 'Aucune opération trouvée.' };
      }
      const p = parseCsv(text);
      if (!p.headers.length || !p.rows.length) return { ...base, format: 'CSV', rows: [], error: 'Fichier vide ou illisible.' };
      if (!csvAuto) return { ...base, format: 'CSV', rows: [], csv: p };
      const reuse = savedMapping && p.headers.includes(savedMapping.dateColumn) && p.headers.includes(savedMapping.labelColumn);
      const { rows: csvRows, errors } = applyMapping(p, reuse ? savedMapping! : guessMapping(p));
      return {
        ...base,
        format: 'CSV',
        rows: csvRows,
        error: csvRows.length ? undefined : 'Colonnes non reconnues : importez ce CSV seul pour choisir les colonnes.',
        note: errors ? `${errors} ligne(s) ignorée(s)` : undefined,
      };
    } catch (e) {
      return { ...base, format: ext.toUpperCase() || '?', rows: [], error: (e as Error).message };
    }
  };

  const onFiles = async (list: FileList | File[]) => {
    const files = [...list];
    if (!files.length) return;
    setError(null);
    reset();
    setLoading(true);
    try {
      // Un seul CSV : on garde le choix des colonnes.
      if (files.length === 1) {
        const one = await readOne(files[0], false);
        setFileName(one.name);
        if (one.csv) {
          const p = one.csv;
          const reuse = savedMapping && p.headers.includes(savedMapping.dateColumn) && p.headers.includes(savedMapping.labelColumn);
          setSource({ kind: 'csv', parsed: p });
          setMapping(reuse ? savedMapping : guessMapping(p));
          return;
        }
        if (one.error) throw new Error(
          one.format === 'PDF'
            ? 'Aucune opération reconnue dans ce PDF. S’il s’agit d’un scan (image), il ne contient pas de texte lisible : exportez plutôt un fichier CSV ou OFX depuis votre banque.'
            : one.error,
        );
        setRows(one.rows);
        setSource({
          kind: 'rows',
          format: one.format,
          note: one.format === 'PDF'
            ? one.note ?? 'Sens des montants repéré (colonnes Débit / Crédit ou montants signés). Vérifiez quelques lignes avant d’importer.'
            : one.note,
        });
        return;
      }
      // Plusieurs fichiers : lecture successive (pdf.js est gourmand en mémoire), puis fusion sans doublons.
      const results: Awaited<ReturnType<typeof readOne>>[] = [];
      for (let i = 0; i < files.length; i++) {
        setProgress(`Lecture de ${files[i].name} (${i + 1}/${files.length})…`);
        results.push(await readOne(files[i], true));
      }
      const ok = results.filter((r) => r.rows.length);
      setReports(results.map(({ name, format, note, error, rows: r }) => ({ name, format, note, error, count: r.length })));
      if (!ok.length) throw new Error('Aucune opération reconnue dans ces fichiers.');
      const merged = mergeStatementRows(ok.map((r) => r.rows));
      const overlap = ok.reduce((s, r) => s + r.rows.length, 0) - merged.length;
      setFileName(`${files.length} fichiers`);
      setRows(merged);
      setSource({
        kind: 'rows',
        format: [...new Set(ok.map((r) => r.format))].join(' + '),
        note: overlap > 0 ? `${overlap} opération(s) présente(s) dans plusieurs relevés n’ont été gardées qu’une fois.` : undefined,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setProgress(null);
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

  const txsForMemory = useStore((s) => s.transactions);
  const ctx = useMemo(() => classifierContext({ rules, transactions: txsForMemory }), [rules, txsForMemory]);
  const guesses = useMemo(() => (result ? result.rows.map((r) => classify(r.label, r.amount, ctx)) : []), [result, ctx]);
  const categorized = guesses.filter((g) => g.categoryId).length;
  const total = result ? result.rows.reduce((s, r) => s + r.amount, 0) : 0;
  const editable = source?.kind === 'rows';

  const doImport = () => {
    if (!result || !accountId) return;
    if (source?.kind === 'csv' && mapping) setCsvMapping(mapping);
    const { added, duplicates, transfers } = importRows(result.rows, accountId);
    toast(`${added} opération(s) importée(s)${duplicates ? `, ${duplicates} doublon(s) ignoré(s)` : ''}${transfers ? `, ${transfers} virement(s) entre vos comptes rapproché(s)` : ''}.`);
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
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void onFiles(e.dataTransfer.files); }}
          style={{ outline: dragging ? '2px dashed var(--accent)' : 'none', borderRadius: 'var(--radius)' }}
        >
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
                <span>Fichiers des relevés</span>
                <input
                  type="file"
                  multiple
                  accept=".csv,.txt,.ofx,.qfx,.qif,.pdf,text/csv,application/pdf,application/x-ofx"
                  onChange={(e) => { if (e.target.files?.length) void onFiles(e.target.files); e.target.value = ''; }}
                />
                <span className="hint">Plusieurs fichiers possibles (ex. 12 relevés PDF), ou glissez-les ici.</span>
              </label>
            </div>
            {loading && <div className="callout">{progress ?? 'Lecture du fichier…'}</div>}
            {reports.length > 0 && (
              <div className="list">
                {reports.map((r) => (
                  <div key={r.name} className="list-item small">
                    <span className={`badge ${r.error ? 'danger' : 'accent'}`}>{r.format}</span>
                    <span className="grow ellipsis" title={r.name}>{r.name}</span>
                    {r.error ? <span className="neg">{r.error}</span> : <span className="muted">{r.count} opération(s){r.note ? ` · ${r.note}` : ''}</span>}
                  </div>
                ))}
              </div>
            )}
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
        </div>

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
                      const g = guesses[i];
                      const c = cats.get(g?.categoryId ?? '');
                      return (
                        <tr key={i}>
                          <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{dateLabel(r.date)}</td>
                          <td className="ellipsis" style={{ maxWidth: 340 }} title={r.label}>{r.label}</td>
                          <td className="small">
                            {c ? `${c.icon} ${c.name}` : <span className="faint">À catégoriser</span>}
                            {g?.merchant && <div className="faint">{g.merchant}{g.source === 'appris' ? ' · appris' : ''}</div>}
                            {!g?.merchant && g?.source === 'appris' && <div className="faint">d’après vos choix</div>}
                            {!g?.merchant && g?.source === 'mot-cle' && <div className="faint">type de commerce</div>}
                          </td>
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
