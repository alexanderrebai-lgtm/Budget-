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

/** Montant au format français : 1 234,56 / 1.234,56 / -12,50 / 12,50- / -100,00 € */
const AMOUNT_RE = /^[-+−]?\s?\d{1,3}(?:[ .  ]?\d{3})*,\d{2}-?(?:\s?€)?$/;
const DATE_RE = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/;
const SKIP_RE = /(ancien|nouveau)\s+solde|solde\s+(au|crediteur|debiteur|precedent|disponible)|total\s+des\s+op|^total|report|sous[- ]total|frais .* sur le mois|(debit|credit) sur le mois/i;
/** Colonne « n° d'opération » placée avant la date (relevés Nickel, néobanques). */
const INDEX_RE = /^(n°\s*)?\d{1,4}$/i;
/** Types d'opération sans information utile pour le libellé. */
const NOISE_TYPES = new Set(['achat', 'achat cb', 'paiement cb', 'carte']);

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

/** Fusionne les fragments voisins (« 1 », « 234,56 », « € ») pour reconstituer les montants. */
function mergeTokens(line: TextItem[]): TextItem[] {
  const out: TextItem[] = [];
  for (const it of line) {
    const prev = out[out.length - 1];
    const gap = prev ? it.x - (prev.x + prev.width) : Infinity;
    const numericJoin = /[\d,.\s-]$/.test(prev?.str ?? '') && /^[\d\s,.-]/.test(it.str);
    const euroJoin = /\d$/.test(prev?.str.trim() ?? '') && /^\s?€/.test(it.str);
    if (prev && gap < 4 && (numericJoin || euroJoin)) {
      prev.str = `${prev.str}${gap > 1 ? ' ' : ''}${it.str}`;
      prev.width = it.x + it.width - prev.x;
    } else out.push({ ...it });
  }
  return out;
}

/** Élément d'une ligne : date, montant ou mot, avec sa position estimée et le fragment d'origine. */
interface Token extends TextItem {
  item: number;
}

const TOKEN_RE = /(\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?(?!\d))|([-+−]?\d{1,3}(?:[ .\u00a0\u202f]\d{3})*,\d{2}-?(?:\s?€)?)|(\S+)/g;

/**
 * pdf.js regroupe souvent des colonnes voisines en un seul fragment (« 13 02/10/2026 ACHAT ») :
 * on redécoupe chaque fragment en dates, montants et mots, en estimant leur abscisse.
 */
function tokenize(line: TextItem[]): Token[] {
  const out: Token[] = [];
  line.forEach((it, idx) => {
    const len = Math.max(1, it.str.length);
    for (const m of it.str.matchAll(TOKEN_RE)) {
      const start = m.index ?? 0;
      out.push({ str: m[0], x: it.x + (it.width * start) / len, y: it.y, width: (it.width * m[0].length) / len, item: idx });
    }
  });
  return out;
}

export interface PdfParseResult {
  rows: ImportedRow[];
  /** true si le sens des montants est fiable (colonnes Débit / Crédit, ou montants signés). */
  columnsDetected: boolean;
  year: number;
}

interface Candidate {
  y: number;
  date: string;
  noYear: boolean;
  month: number;
  amount: number;
  explicitSign: boolean;
  amountX: number;
  labelX: number;
  parts: { y: number; x: number; text: string }[];
}

/**
 * Extrait les opérations d'un relevé PDF à partir des lignes de texte.
 * - Une ligne d'opération contient une date (éventuellement précédée d'un numéro) et un montant.
 * - Le sens vient des colonnes « Débit » / « Crédit », ou du signe quand les montants sont signés.
 * - Les lignes de texte sans date ni montant (libellé sur plusieurs lignes, placé au-dessus ou
 *   au-dessous de la date) sont rattachées à l'opération la plus proche verticalement.
 */
export function parseStatementLines(pages: TextItem[][][], fallbackYear = new Date().getFullYear()): PdfParseResult {
  // Année du relevé : la plus fréquente parmi les dates complètes du document.
  const years = new Map<number, number>();
  for (const page of pages) for (const line of page) for (const it of line) {
    for (const m of it.str.matchAll(/\b\d{1,2}[/.]\d{1,2}[/.](20\d{2})\b/g)) years.set(Number(m[1]), (years.get(Number(m[1])) ?? 0) + 1);
  }
  const year = [...years.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallbackYear;

  let debitX: number | null = null;
  let creditX: number | null = null;
  let columnsDetected = false;
  const all: Candidate[] = [];

  for (const page of pages) {
    const txs: Candidate[] = [];
    const orphans: { y: number; items: TextItem[] }[] = [];

    for (const rawLine of page) {
      const merged = mergeTokens(rawLine);
      const line = tokenize(merged);
      const text = strip(merged.map((t) => t.str).join(' '));

      // En-têtes de colonnes
      const debitHead = line.find((t) => /^d[eé]bits?$/i.test(t.str.trim()));
      const creditHead = line.find((t) => /^cr[eé]dits?$/i.test(t.str.trim()));
      if (debitHead && creditHead) {
        debitX = debitHead.x + debitHead.width / 2;
        creditX = creditHead.x + creditHead.width / 2;
        columnsDetected = true;
        continue;
      }
      if (/\bdate\b/i.test(text) && /(libelle|operation|montant|nature)/i.test(text)) continue; // ligne d'en-tête
      if (SKIP_RE.test(text)) continue;

      // la date peut être précédée d'un numéro d'opération
      let dateIdx = -1;
      for (let i = 0; i < Math.min(3, line.length); i++) {
        if (DATE_RE.test(line[i].str.trim())) { dateIdx = i; break; }
        if (!INDEX_RE.test(line[i].str.trim())) break;
      }
      const amounts = line.filter((t) => AMOUNT_RE.test(t.str.trim()));

      if (dateIdx >= 0 && amounts.length) {
        const dm = line[dateIdx].str.trim().match(DATE_RE)!;
        const day = Number(dm[1]);
        const month = Number(dm[2]);
        if (month < 1 || month > 12 || day < 1 || day > 31) continue;
        let y = dm[3] ? Number(dm[3]) : year;
        if (y < 100) y += 2000;

        const amountItem = amounts[amounts.length - 1];
        const rawAmount = amountItem.str.replace(/€/g, '').replace('−', '-').trim();
        const explicitSign = /^[-+]/.test(rawAmount) || rawAmount.endsWith('-');
        let value = Math.abs(parseAmount(rawAmount.replace(/-$/, '').replace(/^\+/, '')) ?? 0);
        if (rawAmount.startsWith('-') || rawAmount.endsWith('-')) value = -value;

        // Libellé : mots après la date, regroupés par fragment d'origine (une colonne = une phrase).
        const labelTokens = line
          .slice(dateIdx + 1)
          .filter((t) => !AMOUNT_RE.test(t.str.trim()) && !DATE_RE.test(t.str.trim()) && t.str.trim() !== '€');
        const phrases: { y: number; x: number; text: string }[] = [];
        for (const tok of labelTokens) {
          const last = phrases[phrases.length - 1] as ({ y: number; x: number; text: string; item?: number }) | undefined;
          if (last && last.item === tok.item) last.text += ` ${tok.str}`;
          else phrases.push({ y: tok.y, x: tok.x, text: tok.str, item: tok.item } as { y: number; x: number; text: string });
        }
        txs.push({
          y: line[0].y,
          date: `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          noYear: !dm[3],
          month,
          amount: value,
          explicitSign,
          amountX: amountItem.x + amountItem.width / 2,
          labelX: labelTokens[0]?.x ?? line[dateIdx].x + line[dateIdx].width,
          parts: phrases.map((p) => ({ y: p.y, x: p.x, text: p.text.trim() })),
        });
      } else if (dateIdx < 0 && amounts.length === 0 && text.length < 100) {
        orphans.push({ y: merged[0].y, items: merged });
      }
    }

    // Rattachement des lignes de libellé orphelines à l'opération la plus proche.
    if (txs.length) {
      const gaps = txs.slice(1).map((t, i) => Math.abs(txs[i].y - t.y)).sort((a, b) => a - b);
      const spacing = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 14;
      const maxDist = Math.max(8, spacing * 0.85);
      for (const o of orphans) {
        let best: Candidate | null = null;
        let bestD = Infinity;
        for (const t of txs) {
          // à égalité, une ligne située sous l'opération lui appartient (suite de libellé)
          const d = Math.abs(t.y - o.y) * (o.y < t.y ? 0.95 : 1);
          if (d < bestD) { bestD = d; best = t; }
        }
        if (!best || bestD > maxDist) continue;
        if (o.items[0].x < best.labelX - 6) continue; // hors de la colonne libellé (titre, marge)
        for (const it of o.items) best.parts.push({ y: it.y, x: it.x, text: it.str.trim() });
      }
    }
    all.push(...txs);
  }

  // Sens des montants
  const signed = !columnsDetected && all.some((t) => t.explicitSign && t.amount < 0);
  const rows: ImportedRow[] = all.map((t) => {
    let amount = t.amount;
    if (!t.explicitSign) {
      if (columnsDetected && debitX !== null && creditX !== null) {
        amount = Math.abs(t.amountX - creditX) < Math.abs(t.amountX - debitX) ? Math.abs(amount) : -Math.abs(amount);
      } else if (signed) {
        amount = Math.abs(amount); // colonne unique signée : sans signe = crédit
      } else {
        amount = -Math.abs(amount); // par défaut : débit (à corriger dans l'aperçu)
      }
    }
    // lecture colonne par colonne (type d'opération, puis libellé), de haut en bas dans chaque colonne
    const words = t.parts
      .sort((a, b) => Math.round(a.x / 12) - Math.round(b.x / 12) || b.y - a.y || a.x - b.x)
      .map((p) => p.text)
      .filter((w, i) => !(i === 0 && NOISE_TYPES.has(w.toLowerCase())));
    const label = words.join(' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    return { date: t.date, label: label || 'Opération', amount };
  });

  // Relevé à cheval sur deux années (décembre → janvier) quand l'année n'est pas imprimée.
  const monthsSeen = all.filter((t) => t.noYear).map((t) => t.month);
  if (monthsSeen.includes(12) && monthsSeen.includes(1)) {
    for (const r of rows) if (r.date.slice(5, 7) === '12' && r.date.startsWith(String(year))) r.date = `${year - 1}${r.date.slice(4)}`;
  }

  return { rows, columnsDetected: columnsDetected || signed, year };
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

/* ---------------- Plusieurs relevés à la fois ---------------- */

/**
 * Fusionne les opérations de plusieurs relevés. Deux relevés qui se chevauchent
 * contiennent les mêmes opérations : une opération identique (date, montant,
 * libellé) n'est gardée qu'autant de fois qu'elle apparaît dans le relevé qui
 * en contient le plus, ce qui préserve les achats identiques d'un même jour.
 */
export function mergeStatementRows(files: ImportedRow[][]): ImportedRow[] {
  const key = (r: ImportedRow) => r.ref ? `ref:${r.ref}` : `${r.date}|${Math.round(r.amount * 100)}|${r.label.toLowerCase().replace(/\s+/g, ' ').trim()}`;
  const kept = new Map<string, number>();
  const out: ImportedRow[] = [];
  for (const rows of files) {
    const inFile = new Map<string, number>();
    for (const r of rows) {
      const k = key(r);
      const n = (inFile.get(k) ?? 0) + 1;
      inFile.set(k, n);
      if (n > (kept.get(k) ?? 0)) {
        kept.set(k, n);
        out.push(r);
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
