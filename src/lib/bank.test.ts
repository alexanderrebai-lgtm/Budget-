import { generateKeyPairSync, createVerify } from 'node:crypto';
import { normalizeTransactions, pemToPkcs8, pickBalance, signEnableBankingJwt, transactionLabel } from '../../supabase/functions/bank/lib';

describe('JWT Enable Banking', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pkcs1 = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

  const check = async (pem: string) => {
    const jwt = await signEnableBankingJwt('app-123', pem, 1_800_000_000);
    const [h, p, sig] = jwt.split('.');
    const dec = (x: string) => JSON.parse(Buffer.from(x, 'base64url').toString());
    expect(dec(h)).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'app-123' });
    expect(dec(p)).toEqual({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: 1_800_000_000, exp: 1_800_003_600 });
    const v = createVerify('RSA-SHA256');
    v.update(`${h}.${p}`);
    expect(v.verify(publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
  };

  it('signe avec une clé PKCS#8', () => check(pkcs8));
  it('signe avec une clé PKCS#1 (openssl genrsa)', () => check(pkcs1));
  it('accepte une clé collée avec des \\n littéraux', () => check(pkcs8.replace(/\n/g, '\\n')));
  it('produit un DER PKCS#8 valide depuis PKCS#1', () => {
    expect(pemToPkcs8(pkcs1)[0]).toBe(0x30);
  });
});

describe('normalisation des opérations', () => {
  it('signe les montants, choisit la date et construit le libellé', () => {
    const rows = normalizeTransactions([
      { entry_reference: 'A1', transaction_amount: { amount: '45.30', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: '2026-11-03', creditor: { name: 'LIDL' }, remittance_information: ['CB LIDL PARIS 15 02/11'] },
      { entry_reference: 'A2', transaction_amount: { amount: '2450.00', currency: 'EUR' }, credit_debit_indicator: 'CRDT', status: 'BOOK', value_date: '2026-11-28', debtor: { name: 'ACME SAS' }, remittance_information: ['SALAIRE NOVEMBRE'] },
      { transaction_amount: { amount: '12.00', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'PDNG', transaction_date: '2026-11-29', remittance_information: ['CB UBER'] },
      { transaction_amount: { amount: '9.99', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'CNCL', booking_date: '2026-11-29' },
    ]);
    expect(rows).toEqual([
      { date: '2026-11-03', label: 'CB LIDL PARIS 15 02/11', amount: -45.3, ref: 'A1', pending: false },
      { date: '2026-11-28', label: 'ACME SAS SALAIRE NOVEMBRE', amount: 2450, ref: 'A2', pending: false },
      { date: '2026-11-29', label: 'CB UBER', amount: -12, ref: null, pending: true },
    ]);
  });
  it('libellé par défaut', () => {
    expect(transactionLabel({ transaction_amount: { amount: '1', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'BOOK' })).toBe('Opération bancaire');
  });
  it('choisit le solde comptable', () => {
    expect(pickBalance([
      { balance_type: 'ITAV', balance_amount: { amount: '900.00', currency: 'EUR' } },
      { balance_type: 'CLBD', balance_amount: { amount: '850.50', currency: 'EUR' } },
    ])).toBe(850.5);
  });
});
