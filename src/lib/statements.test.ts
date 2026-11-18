import { groupLines, parseOfx, parseQif, parseStatementLines, type TextItem } from './statements';

describe('OFX', () => {
  it('lit les opérations SGML', () => {
    const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003<TRNAMT>-45.30<FITID>1<NAME>CB LIDL<MEMO>PARIS 15
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261028120000<TRNAMT>2450,00<FITID>2<NAME>VIR SALAIRE ACME &amp; CO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    expect(parseOfx(ofx)).toEqual([
      { date: '2026-10-03', label: 'CB LIDL PARIS 15', amount: -45.3 },
      { date: '2026-10-28', label: 'VIR SALAIRE ACME & CO', amount: 2450 },
    ]);
  });
});

describe('QIF', () => {
  it('lit les opérations', () => {
    const qif = '!Type:Bank\nD03/10/2026\nT-45,30\nPCB LIDL\n^\nD28/10/26\nT2 450,00\nPSALAIRE\n^\n';
    expect(parseQif(qif)).toEqual([
      { date: '2026-10-03', label: 'CB LIDL', amount: -45.3 },
      { date: '2026-10-28', label: 'SALAIRE', amount: 2450 },
    ]);
  });
});

describe('relevé PDF', () => {
  // Reproduit la mise en page d'un relevé : Date | Libellé | Débit | Crédit
  const t = (str: string, x: number, y: number, width = str.length * 5): TextItem => ({ str, x, y, width });
  const page = groupLines([
    t('RELEVE DE COMPTE du 01/10/2026 au 31/10/2026', 40, 800),
    t('Date', 40, 700), t('Libellé', 100, 700), t('Débit', 400, 700), t('Crédit', 480, 700),
    t('SOLDE PRECEDENT', 100, 685), t('1 200,00', 480, 685),
    t('03/10', 40, 670), t('CB LIDL', 100, 670), t('45,30', 400, 670),
    t('05/10', 40, 655), t('PRLV SEPA EDF', 100, 655), t('78,12', 400, 655),
    t('REF 123456 ECHEANCE', 100, 643),
    t('28/10', 40, 630), t('VIR SALAIRE ACME', 100, 630), t('2 450', 480, 630, 22), t(',00', 503, 630, 12),
    t('NOUVEAU SOLDE', 100, 600), t('3 526,58', 480, 600),
  ]);

  it('extrait dates, libellés et sens des montants', () => {
    const r = parseStatementLines([page]);
    expect(r.columnsDetected).toBe(true);
    expect(r.year).toBe(2026);
    expect(r.rows).toEqual([
      { date: '2026-10-03', label: 'CB LIDL', amount: -45.3 },
      { date: '2026-10-05', label: 'PRLV SEPA EDF REF 123456 ECHEANCE', amount: -78.12 },
      { date: '2026-10-28', label: 'VIR SALAIRE ACME', amount: 2450 },
    ]);
  });

  it('gère un relevé à cheval sur deux années', () => {
    const p = groupLines([
      t('Relevé du 15/12/2025 au 14/01/2026', 40, 800), t('01/01/2026', 40, 790),
      t('Date', 40, 700), t('Opération', 100, 700), t('Débit', 400, 700), t('Crédit', 480, 700),
      t('20/12', 40, 670), t('CB FNAC', 100, 670), t('30,00', 400, 670),
      t('05/01', 40, 655), t('CB MONOPRIX', 100, 655), t('12,00', 400, 655),
    ]);
    expect(parseStatementLines([p]).rows.map((r) => r.date)).toEqual(['2025-12-20', '2026-01-05']);
  });
});
