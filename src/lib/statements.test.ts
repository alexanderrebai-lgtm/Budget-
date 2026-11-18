import { groupLines, mergeStatementRows, parseOfx, parseQif, parseStatementLines, type TextItem } from './statements';

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

describe('plusieurs relevés', () => {
  const r = (date: string, amount: number, label = 'CB LIDL') => ({ date, amount, label });
  it('supprime les doublons entre relevés qui se chevauchent', () => {
    const oct = [r('2026-10-28', 2450, 'SALAIRE'), r('2026-10-31', -20)];
    const nov = [r('2026-10-31', -20), r('2026-11-03', -45)];
    expect(mergeStatementRows([oct, nov])).toEqual([r('2026-10-28', 2450, 'SALAIRE'), r('2026-10-31', -20), r('2026-11-03', -45)]);
  });
  it('garde deux achats identiques le même jour', () => {
    const a = [r('2026-11-03', -2.5, 'CB CAFE'), r('2026-11-03', -2.5, 'CB CAFE')];
    expect(mergeStatementRows([a, [r('2026-11-03', -2.5, 'CB CAFE')]])).toHaveLength(2);
  });
  it('trie par date', () => {
    expect(mergeStatementRows([[r('2026-12-01', -1)], [r('2026-11-01', -1)]]).map((x) => x.date)).toEqual(['2026-11-01', '2026-12-01']);
  });
});

describe('relevé à colonne unique signée (type Nickel)', () => {
  const t = (str: string, x: number, y: number, width = str.length * 5): TextItem => ({ str, x, y, width });
  const page = groupLines([
    t('RELEVES DE COMPTE', 400, 800), t('Du 01/10/2026 au 31/10/2026', 400, 790),
    t('Débit sur le mois', 60, 700), t('1 823,96 €', 500, 700),
    t('Crédit sur le mois', 60, 688), t('1 883,04 €', 500, 688),
    t('Solde disponible le 31/10/2026', 60, 676), t('1 236,13 €', 500, 676),
    t('Frais nickel sur le mois', 60, 664), t('-12,10 €', 500, 664),
    t('VOS OPÉRATIONS', 40, 640),
    t('N°', 40, 625), t('DATE', 70, 625), t('TYPE D\'OPÉRATION', 140, 625), t('LIBELLÉ', 280, 625), t('MONTANT', 500, 625),
    t('1', 40, 610), t('01/10/2026', 70, 610), t('RETRAIT AGENCE', 140, 610), t('7013275 5290XXXXXXXX1133', 280, 610), t('-100,00 €', 500, 610),
    t('2', 40, 596), t('01/10/2026', 70, 596), t('ACHAT', 140, 596), t('SAS LUDIVAN BEAUVAIS', 280, 596), t('-14,95', 500, 596, 30), t('€', 532, 596, 6),
    // libellé sur deux lignes, date centrée verticalement
    t('ALEXANDER REBAI Virement depuis BoursoBank', 280, 586), t('14', 40, 580), t('03/10/2026', 70, 580), t('VIREMENT', 140, 580), t('108,00 €', 500, 580),
    t('FR7640618804710004071121037', 280, 574),
    t('15', 40, 562), t('03/10/2026', 70, 562), t('ACHAT', 140, 562), t('SAS LUDIVAN BEAUVAIS', 280, 562), t('-7,59 €', 500, 562),
    t('25', 40, 548), t('14/10/2026', 70, 548), t('ANNULATION PRELEVEMENT', 140, 548), t('ORANGE SA Precursor direct debit was cancelled', 280, 548), t('50,35 €', 500, 548),
    t('Sous réserve des régularisations ou annulations éventuelles.', 40, 480),
    t('RELEVE DE COMPTE NICKEL', 260, 60),
  ]);

  it('lit les opérations, le sens et les libellés sur deux lignes', () => {
    const r = parseStatementLines([page]);
    expect(r.columnsDetected).toBe(true); // montants signés : sens fiable
    expect(r.rows).toEqual([
      { date: '2026-10-01', label: 'RETRAIT AGENCE 7013275 5290XXXXXXXX1133', amount: -100 },
      { date: '2026-10-01', label: 'SAS LUDIVAN BEAUVAIS', amount: -14.95 },
      { date: '2026-10-03', label: 'VIREMENT ALEXANDER REBAI Virement depuis BoursoBank FR7640618804710004071121037', amount: 108 },
      { date: '2026-10-03', label: 'SAS LUDIVAN BEAUVAIS', amount: -7.59 },
      { date: '2026-10-14', label: 'ANNULATION PRELEVEMENT ORANGE SA Precursor direct debit was cancelled', amount: 50.35 },
    ]);
  });
});

describe('relevé Nickel tel que découpé par pdf.js', () => {
  // fragments réels (texte, x, y, largeur) : pdf.js regroupe « n° + date + type » en un seul fragment
  const raw: [string, number, number, number][] = [
    ["NiCKEL", 36, 799, 61],
    ["RELEVES DE COMPTE", 470, 807, 90],
    ["Du 01/10/2026 au 31/10/2026", 450, 798, 110],
    ["Date d'émission : 07/11/2026", 449, 789, 111],
    ["Numéro de compte : 40001361520", 433, 772, 128],
    ["IBAN : FR76165980000140001361520 80", 406, 763, 154],
    ["RELEVES DE COMPTE OCTOBRE 2026", 36, 739, 231],
    ["SITUATION DE VOTRE COMPTE NICKEL", 36, 718, 186],
    ["Débit sur le mois", 40, 691, 89],
    ["1 823,96 €", 500, 691, 57],
    ["Crédit sur le mois", 40, 672, 93],
    ["1 883,04 €", 500, 672, 57],
    ["Solde disponible le 31/10/2026", 40, 652, 164],
    ["1 236,13 €", 500, 652, 57],
    ["Frais nickel sur le mois", 40, 633, 122],
    ["-12,10 €", 512, 633, 44],
    ["VOS OPÉRATIONS", 36, 607, 86],
    ["N° DATE", 38, 583, 50],
    ["TYPE D'OPÉRATION", 121, 583, 117],
    ["LIBELLÉ", 248, 583, 50],
    ["MONTANT", 499, 583, 59],
    ["1", 38, 563, 7],
    ["01/10/2026 RETRAIT AGENCE", 56, 563, 169],
    ["7013275 5290XXXXXXXX1133", 248, 563, 167],
    ["-100,00 €", 507, 563, 51],
    ["2", 38, 545, 7],
    ["01/10/2026 ACHAT", 56, 545, 104],
    ["SAS LUDIVAN BEAUVAIS", 248, 545, 141],
    ["-14,95 €", 514, 545, 44],
    ["3", 38, 527, 7],
    ["01/10/2026 ACHAT", 56, 527, 104],
    ["PARIS CALAIS BEAUVAIS", 248, 527, 144],
    ["-43,00 €", 514, 527, 44],
    ["4", 38, 509, 7],
    ["01/10/2026 ACHAT", 56, 509, 104],
    ["CARREFOUR CITY BEAUVAIS", 248, 509, 169],
    ["-9,64 €", 521, 509, 37],
    ["5", 38, 491, 7],
    ["01/10/2026 ACHAT", 56, 491, 104],
    ["MC DONALD S BEAUVAIS", 248, 491, 146],
    ["-24,89 €", 514, 491, 44],
    ["13 02/10/2026 ACHAT", 38, 473, 122],
    ["OPAC DE L OISE BEAUVAIS", 248, 473, 157],
    ["-450,00 €", 507, 473, 51],
    ["14 03/10/2026 VIREMENT", 38, 442, 145],
    ["ALEXANDER REBAI Virement depuis", 248, 455, 202],
    ["BoursoBank", 248, 442, 65],
    ["FR7640618804710004071121037", 248, 428, 182],
    ["108,00 €", 511, 442, 47],
    ["16 03/10/2026 ACHAT", 38, 410, 122],
    ["B&M FRANCE ALLONNE", 248, 410, 137],
    ["-62,87 €", 514, 410, 44],
    ["25 14/10/2026 ", 38, 385, 83],
    ["ANNULATION", 121, 392, 76],
    ["PRELEVEMENT", 121, 379, 89],
    ["ORANGE SA Precursor direct debit was", 248, 392, 213],
    ["cancelled by the client", 248, 379, 118],
    ["50,35 €", 518, 385, 40],
    ["26 15/10/2026 RETRAIT AGENCE", 38, 361, 187],
    ["7013275 5290XXXXXXXX1133", 248, 361, 167],
    ["-30,00 €", 514, 361, 44],
    ["Sous réserve des régularisations ou annulations éventuelles.", 36, 320, 162],
    ["Conservez ce relevé au moins 5 ans.", 36, 313, 99],
    ["RELEVE DE COMPTE NICKEL", 240, 296, 116],
    ["1/2", 292, 287, 11],
  ];
  const page = groupLines(raw.map(([str, x, y, width]) => ({ str, x, y, width })));

  it('reconnaît toutes les opérations avec le bon sens', () => {
    const r = parseStatementLines([page]);
    expect(r.rows.map((x) => [x.date, x.amount])).toEqual([
      ['2026-10-01', -100], ['2026-10-01', -14.95], ['2026-10-01', -43], ['2026-10-01', -9.64], ['2026-10-01', -24.89],
      ['2026-10-02', -450], ['2026-10-03', 108], ['2026-10-03', -62.87], ['2026-10-14', 50.35], ['2026-10-15', -30],
    ]);
  });
  it('reconstitue les libellés sur plusieurs lignes', () => {
    const r = parseStatementLines([page]);
    expect(r.rows[1].label).toBe('SAS LUDIVAN BEAUVAIS');
    expect(r.rows[6].label).toBe('VIREMENT ALEXANDER REBAI Virement depuis BoursoBank FR7640618804710004071121037');
    expect(r.rows[8].label).toBe('ANNULATION PRELEVEMENT ORANGE SA Precursor direct debit was cancelled by the client');
  });
});
