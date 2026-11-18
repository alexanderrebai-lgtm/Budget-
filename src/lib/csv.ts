import Papa from 'papaparse';
import { normalize, parseAmount } from './format';
import type { CsvMapping, ISODate } from './types';

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

/** Les relevés français sont souvent en Windows-1252 : on tente UTF-8 puis on retombe sur latin1. */
export async function readFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(buf);
}

export function parseCsv(text: string): ParsedCsv {
  // Certaines banques ajoutent des lignes d'en-tête (n° de compte, solde…) : on cherche
  // la première ligne qui ressemble à une ligne d'intitulés.
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /date/i.test(l) && /(libell|label|montant|amount|d[ée]bit|cr[ée]dit|op[ée]ration)/i.test(normalize(l)));
  const body = (headerIdx > 0 ? lines.slice(headerIdx) : lines).join('\n');
  const res = Papa.parse<Record<string, string>>(body, {
    header: true,
    skipEmptyLines: 'greedy',
    delimitersToGuess: [';', ',', '\t', '|'],
    transformHeader: (h) => h.trim(),
  });
  const headers = (res.meta.fields ?? []).filter((h) => h !== '');
  return { headers, rows: res.data, delimiter: res.meta.delimiter };
}

/** Devine l'association des colonnes à partir des intitulés. */
export function guessMapping(parsed: ParsedCsv): CsvMapping {
  const find = (...needles: string[]) =>
    parsed.headers.find((h) => needles.some((n) => normalize(h).includes(n)));
  const dateColumn = find('date op', 'date de l', 'date') ?? parsed.headers[0] ?? '';
  const labelColumn = find('libelle', 'label', 'description', 'intitule', 'operation', 'detail') ?? parsed.headers[1] ?? '';
  const debitColumn = find('debit');
  const creditColumn = find('credit');
  const amountColumn = find('montant', 'amount', 'valeur', 'somme');
  const sample = parsed.rows.slice(0, 20).map((r) => r[dateColumn] ?? '').join(' ');
  const dateFormat: CsvMapping['dateFormat'] = /\d{4}-\d{2}-\d{2}/.test(sample) ? 'yyyy-mm-dd' : 'dd/mm/yyyy';
  return {
    delimiter: parsed.delimiter,
    dateColumn,
    labelColumn,
    amountColumn: amountColumn && !(debitColumn && creditColumn) ? amountColumn : undefined,
    debitColumn: debitColumn && creditColumn ? debitColumn : undefined,
    creditColumn: debitColumn && creditColumn ? creditColumn : undefined,
    dateFormat,
  };
}

export function parseDate(raw: string, format: CsvMapping['dateFormat']): ISODate | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  if (format === 'yyyy-mm-dd') {
    const x = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (!x) return null;
    [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
  } else {
    const x = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!x) return null;
    const a = Number(x[1]);
    const b = Number(x[2]);
    y = Number(x[3]);
    if (y < 100) y += 2000;
    [d, m] = format === 'dd/mm/yyyy' ? [a, b] : [b, a];
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface ImportedRow {
  date: ISODate;
  label: string;
  /** Euros, signé. */
  amount: number;
  /** Référence unique fournie par la banque (connexion bancaire), prioritaire pour le dédoublonnage. */
  ref?: string | null;
}

export function applyMapping(parsed: ParsedCsv, mapping: CsvMapping): { rows: ImportedRow[]; errors: number } {
  const rows: ImportedRow[] = [];
  let errors = 0;
  for (const r of parsed.rows) {
    const date = parseDate(r[mapping.dateColumn] ?? '', mapping.dateFormat);
    const label = (r[mapping.labelColumn] ?? '').replace(/\s+/g, ' ').trim();
    let amount: number | null = null;
    if (mapping.amountColumn) {
      amount = parseAmount(r[mapping.amountColumn] ?? '');
    } else if (mapping.debitColumn || mapping.creditColumn) {
      const debit = parseAmount(r[mapping.debitColumn ?? ''] ?? '');
      const credit = parseAmount(r[mapping.creditColumn ?? ''] ?? '');
      if (debit !== null || credit !== null) amount = (credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (!date || amount === null || !label) {
      errors++;
      continue;
    }
    rows.push({ date, label, amount });
  }
  return { rows, errors };
}

/** Empreinte stable d'une opération ; un compteur distingue les opérations identiques le même jour. */
export function importHash(row: ImportedRow, accountId: string, occurrence: number) {
  if (row.ref) return `${accountId}|ref|${row.ref}`;
  return `${accountId}|${row.date}|${Math.round(row.amount * 100)}|${normalize(row.label)}|${occurrence}`;
}
