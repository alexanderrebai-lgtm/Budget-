import { parseAmount } from './format';
import type { ImportedRow } from './csv';

/* ---------------- OFX / QFX ---------------- */

/** Lit un fichier OFX (SGML 1.x ou XML 2.x), format proposé par la plupart des banques françaises. */
export function parseOfx(text: string): ImportedRow[] {
  const rows: ImportedRow[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const field = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : '';
  };
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const d = field(block, 'DTPOSTED') || field(block, 'DTUSER');
    const amount = Number(field(block, 'TRNAMT').replace(',', '.'));
    const name = field(block, 'NAME');
    const memo = field(block, 'MEMO');
    if (!/^\d{8}/.test(d) || !Number.isFinite(amount)) continue;
    const label = decodeEntities([name, memo && memo !== name ? memo : ''].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();
    rows.push({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, label: label || 'Opération', amount });
  }
  return rows;
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"');

/* ---------------- QIF ---------------- */

export function parseQif(text: string): ImportedRow[] {
  const rows: ImportedRow[] = [];
  let cur: { date?: string; amount?: number; payee?: string; memo?: string } = {};
  for (const line of text.split(/\r?\n/)) {
    const code = line[0];
    const val = line.slice(1).trim();
    if (code === 'D') {
      const m = val.match(/^(\d{1,2})[/.-](\d{1,2})[/.'-](\d{2,4})/);
      if (m) {
        let y = Number(m[3]);
        if (y < 100) y += 2000;
        cur.date = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      }
    } else if (code === 'T' || code === 'U') {
      const n = parseAmount(val);
      if (n !== null) cur.amount = n;
    } else if (code === 'P') cur.payee = val;
    else if (code === 'M') cur.memo = val;
    else if (code === '^') {
      if (cur.date && cur.amount !== undefined) {
        rows.push({ date: cur.date, amount: cur.amount, label: [cur.payee, cur.memo].filter(Boolean).join(' ') || 'Opération' });
      }
      cur = {};
    }
  }
  return rows;
}

/* ---------------- PDF ---------------- */

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

/** Montant au format français : 1 234,56 / 1.234,56 / -12,50 / 12,50- */
const AMOUNT_RE = /^[-+]?\d{1,3}(?:[ .  ]?\d{3})*,\d{2}-?$/;
const DATE_RE = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/;
const SKIP_RE = /(ancien|nouveau)\s+solde|solde\s+(au|crediteur|debiteur|precedent)|total\s+des\s+op|^total|report|sous[- ]total/i;

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Regroupe les fragments de texte d'une page en lignes (même ordonnée à 2,5 pt près). */
export function groupLines(items: TextItem[]): TextItem[][] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const it of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - it.y) <= 2.5) line.push(it);
    else lines.push([it]);
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x));
}

/** Fusionne les fragments voisins (« 1 », « 234,56 ») pour reconstituer les montants. */
function mergeTokens(line: TextItem[]): TextItem[] {
  const out: TextItem[] = [];
  for (const it of line) {
    const prev = out[out.length - 1];
    const gap = prev ? it.x - (prev.x + prev.width) : Infinity;
    if (prev && gap < 4 && /[\d,.\s-]$/.test(prev.str) && /^[\d\s,.-]/.test(it.str)) {
      prev.str = `${prev.str}${gap > 1 ? ' ' : ''}${it.str}`;
      prev.width = it.x + it.width - prev.x;
    } else out.push({ ...it });
  }
  return out;
}

export interface PdfParseResult {
  rows: ImportedRow[];
  /** true si les colonnes Débit / Crédit ont été repérées (signes fiables). */
  columnsDetected: boolean;
  year: number;
}

/**
 * Extrait les opérations d'un relevé PDF à partir des lignes de texte :
 * une ligne d'opération commence par une date et se termine par un montant.
 * Le sens (débit ou crédit) est déduit de la position du montant sous les
 * en-têtes de colonnes « Débit » et « Crédit ».
 */
export function parseStatementLines(pages: TextItem[][][], fallbackYear = new Date().getFullYear()): PdfParseResult {
  // Année du relevé : la plus fréquente parmi les dates complètes du document.
  const years = new Map<number, number>();
  for (const page of pages) for (const line of page) for (const it of line) {
    for (const m of it.str.matchAll(/\b\d{1,2}[/.]\d{1,2}[/.](20\d{2})\b/g)) years.set(Number(m[1]), (years.get(Number(m[1])) ?? 0) + 1);
  }
  const year = [...years.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallbackYear;

  const rows: ImportedRow[] = [];
  let debitX: number | null = null;
  let creditX: number | null = null;
  let columnsDetected = false;
  let last: ImportedRow | null = null;
  const monthsSeen: number[] = [];

  for (const page of pages) {
    for (const rawLine of page) {
      const line = mergeTokens(rawLine);
      const text = strip(line.map((t) => t.str).join(' '));

      // En-têtes de colonnes
      const debitHead = line.find((t) => /^d[eé]bits?(\s|$)/i.test(t.str.trim()));
      const creditHead = line.find((t) => /^cr[eé]dits?(\s|$)/i.test(t.str.trim()));
      if (debitHead && creditHead) {
        debitX = debitHead.x + debitHead.width / 2;
        creditX = creditHead.x + creditHead.width / 2;
        columnsDetected = true;
        last = null;
        continue;
      }

      const first = line[0]?.str.trim() ?? '';
      const dm = first.match(DATE_RE);
      const amounts = line.filter((t) => AMOUNT_RE.test(t.str.trim()));

      if (dm && amounts.length && !SKIP_RE.test(text)) {
        const day = Number(dm[1]);
        const month = Number(dm[2]);
        if (month < 1 || month > 12 || day < 1 || day > 31) continue;
        let y = dm[3] ? Number(dm[3]) : year;
        if (y < 100) y += 2000;
        if (!dm[3]) monthsSeen.push(month);

        // Le montant de l'opération est le premier en partant de la droite qui n'est pas dans une colonne « solde ».
        const amountItem = amounts[amounts.length - 1];
        const rawAmount = amountItem.str.trim();
        let value = parseAmount(rawAmount.replace(/-$/, '')) ?? 0;
        const explicitSign = /^[-+]/.test(rawAmount) || rawAmount.endsWith('-');
        if (rawAmount.endsWith('-')) value = -Math.abs(value);
        if (!explicitSign) {
          if (debitX !== null && creditX !== null) {
            const cx = amountItem.x + amountItem.width / 2;
            value = Math.abs(cx - creditX) < Math.abs(cx - debitX) ? Math.abs(value) : -Math.abs(value);
          } else {
            value = -Math.abs(value); // par défaut : débit (à corriger dans l'aperçu)
          }
        }

        // Libellé : tout ce qui est entre la (les) date(s) et les montants.
        const labelParts = line
          .slice(1)
          .filter((t) => !AMOUNT_RE.test(t.str.trim()) && !DATE_RE.test(t.str.trim()))
          .map((t) => t.str.trim());
        const label = labelParts.join(' ').replace(/\s+/g, ' ').trim();
        last = {
          date: `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          label: label || 'Opération',
          amount: value,
        };
        rows.push(last);
      } else if (last && !dm && amounts.length === 0 && line.length <= 4 && !SKIP_RE.test(text) && text.length < 80) {
        // Ligne de complément du libellé (référence, nom du bénéficiaire…)
        if (last.label.length < 120) last.label = `${last.label} ${line.map((t) => t.str.trim()).join(' ')}`.trim();
      } else {
        last = null;
      }
    }
  }

  // Relevé à cheval sur deux années (décembre → janvier) quand l'année n'est pas imprimée.
  if (monthsSeen.includes(12) && monthsSeen.includes(1)) {
    for (const r of rows) if (r.date.slice(5, 7) === '12' && r.date.startsWith(String(year))) r.date = `${year - 1}${r.date.slice(4)}`;
  }

  return { rows, columnsDetected, year };
}

/** Charge pdf.js à la demande (≈ 1 Mo) et extrait les lignes de chaque page. */
export async function readPdf(file: File): Promise<PdfParseResult> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: TextItem[][][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const it of content.items) {
      if (!('str' in it)) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width });
    }
    pages.push(groupLines(items));
  }
  return parseStatementLines(pages);
}
