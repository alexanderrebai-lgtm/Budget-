// Logique pure de la fonction « bank » : signature JWT et normalisation des
// réponses Enable Banking. Sans dépendance à Deno, pour être testée avec Vitest.

/* ---------------- JWT RS256 ---------------- */

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

function derLength(n: number): Uint8Array {
  if (n < 0x80) return Uint8Array.of(n);
  const bytes: number[] = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}
function der(tag: number, content: Uint8Array): Uint8Array {
  const len = derLength(content.length);
  const out = new Uint8Array(1 + len.length + content.length);
  out[0] = tag;
  out.set(len, 1);
  out.set(content, 1 + len.length);
  return out;
}
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/** Convertit une clé PEM (PKCS#8 « PRIVATE KEY » ou PKCS#1 « RSA PRIVATE KEY ») en PKCS#8 DER. */
export function pemToPkcs8(pem: string): Uint8Array {
  const clean = pem.replace(/\\n/g, '\n').trim();
  const isPkcs1 = /BEGIN RSA PRIVATE KEY/.test(clean);
  const body = clean.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '');
  const raw = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  if (!isPkcs1) return raw;
  // PrivateKeyInfo ::= SEQUENCE { version 0, AlgorithmIdentifier rsaEncryption, OCTET STRING pkcs1 }
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const rsaOid = Uint8Array.of(0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00);
  const algo = der(0x30, rsaOid);
  return der(0x30, concat(version, algo, der(0x04, raw)));
}

/** JWT attendu par Enable Banking : RS256, kid = identifiant de l'application, durée ≤ 24 h. */
export async function signEnableBankingJwt(appId: string, privateKeyPem: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKeyPem) as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const header = { typ: 'JWT', alg: 'RS256', kid: appId };
  const payload = { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 };
  const input = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input)));
  return `${input}.${b64url(sig)}`;
}

/* ---------------- Normalisation ---------------- */

export interface EbAmount {
  amount: string;
  currency: string;
}
export interface EbTransaction {
  entry_reference?: string | null;
  transaction_amount: EbAmount;
  credit_debit_indicator: 'CRDT' | 'DBIT';
  status: string;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  remittance_information?: string[] | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  bank_transaction_code?: { description?: string | null } | null;
  note?: string | null;
}

export interface BankRow {
  date: string;
  label: string;
  /** Euros, signé (négatif = débit). */
  amount: number;
  ref: string | null;
  pending: boolean;
}

/** Libellé lisible : contrepartie puis informations de remise, sans doublons. */
export function transactionLabel(t: EbTransaction): string {
  const counterparty = t.credit_debit_indicator === 'DBIT' ? t.creditor?.name : t.debtor?.name;
  const parts = [counterparty, ...(t.remittance_information ?? []), t.note, t.bank_transaction_code?.description]
    .map((p) => (p ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  // une partie contenue dans une autre (« LIDL » dans « CB LIDL PARIS ») est retirée
  const kept = parts.filter(
    (p, i) => !parts.some((q, j) => j !== i && q.toLowerCase().includes(p.toLowerCase()) && (q.length > p.length || j < i)),
  );
  const out: string[] = [];
  for (const p of kept) {
    if (out.join(' ').length > 140) break;
    out.push(p);
  }
  return out.join(' ') || 'Opération bancaire';
}

export function normalizeTransactions(list: EbTransaction[]): BankRow[] {
  const rows: BankRow[] = [];
  for (const t of list) {
    if (t.status === 'CNCL' || t.status === 'RJCT') continue;
    const date = t.booking_date || t.transaction_date || t.value_date;
    const value = Number(t.transaction_amount?.amount);
    if (!date || !Number.isFinite(value)) continue;
    rows.push({
      date: date.slice(0, 10),
      label: transactionLabel(t),
      amount: t.credit_debit_indicator === 'DBIT' ? -Math.abs(value) : Math.abs(value),
      ref: t.entry_reference || null,
      pending: t.status !== 'BOOK',
    });
  }
  return rows;
}

export interface EbBalance {
  balance_amount: EbAmount;
  balance_type: string;
}

/** Solde le plus représentatif : comptabilisé (CLBD), puis disponible, puis le premier. */
export function pickBalance(balances: EbBalance[]): number | null {
  const order = ['CLBD', 'ITBD', 'XPCD', 'ITAV', 'CLAV', 'OPBD', 'VALU', 'OTHR'];
  for (const type of order) {
    const b = balances.find((x) => x.balance_type === type);
    if (b && Number.isFinite(Number(b.balance_amount.amount))) return Number(b.balance_amount.amount);
  }
  const first = balances[0];
  return first ? Number(first.balance_amount.amount) : null;
}

export const maskIban = (iban?: string | null) => (iban ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : null);
