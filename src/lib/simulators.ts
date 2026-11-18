/** Simulateurs patrimoniaux : enveloppes, crédit, investissement locatif. */

export interface EnvelopeInput {
  initial: number;
  monthly: number;
  years: number;
  /** Rendement brut annuel (ex. 0.05). */
  grossReturn: number;
  /** TMI pendant la phase d'épargne. */
  tmiNow: number;
  /** TMI estimée à la retraite (sortie du PER). */
  tmiRetirement: number;
  couple: boolean;
  livretRate: number;
  pfuTotal: number; // 12,8 % + prélèvements sociaux
  socialRate: number;
}

export interface EnvelopeResult {
  id: string;
  name: string;
  contributions: number;
  grossValue: number;
  tax: number;
  /** Économies d'impôt à l'entrée (PER). */
  entrySaving: number;
  net: number;
  note: string;
  series: number[];
}

function grow(initial: number, monthly: number, years: number, annual: number) {
  const r = Math.pow(1 + annual, 1 / 12) - 1;
  let v = initial;
  const series = [initial];
  for (let m = 1; m <= years * 12; m++) {
    v = v * (1 + r) + monthly;
    if (m % 12 === 0) series.push(v);
  }
  return { value: v, series };
}

export function compareEnvelopes(i: EnvelopeInput): EnvelopeResult[] {
  const contributions = i.initial + i.monthly * 12 * i.years;
  const out: EnvelopeResult[] = [];

  // Livret A / LDDS : net d'impôt, plafonné
  {
    const g = grow(i.initial, i.monthly, i.years, i.livretRate);
    out.push({
      id: 'livret', name: 'Livret A / LDDS', contributions, grossValue: g.value, tax: 0, entrySaving: 0, net: g.value, series: g.series,
      note: 'Disponible à tout moment, sans impôt. Plafonds : 22 950 € (livret A) et 12 000 € (LDDS) ; le rendement suit l’inflation.',
    });
  }
  // Compte-titres : frais 0,2 %/an, PFU sur les gains à la sortie
  {
    const g = grow(i.initial, i.monthly, i.years, i.grossReturn - 0.002);
    const tax = Math.max(0, g.value - contributions) * i.pfuTotal;
    out.push({
      id: 'cto', name: 'Compte-titres', contributions, grossValue: g.value, tax, entrySaving: 0, net: g.value - tax, series: g.series,
      note: 'Aucun plafond, tous les supports. Dividendes et plus-values imposés au PFU (ou au barème sur option).',
    });
  }
  // PEA : prélèvements sociaux seuls après 5 ans
  {
    const g = grow(i.initial, i.monthly, i.years, i.grossReturn - 0.002);
    const gains = Math.max(0, g.value - contributions);
    const tax = gains * (i.years >= 5 ? i.socialRate : i.pfuTotal);
    out.push({
      id: 'pea', name: 'PEA', contributions, grossValue: g.value, tax, entrySaving: 0, net: g.value - tax, series: g.series,
      note: 'Actions européennes, versements jusqu’à 150 000 €. Après 5 ans, gains exonérés d’impôt (prélèvements sociaux seuls).',
    });
  }
  // Assurance-vie : frais 0,6 %/an, après 8 ans abattement 4 600 / 9 200 € et 7,5 %
  {
    const g = grow(i.initial, i.monthly, i.years, i.grossReturn - 0.006);
    const gains = Math.max(0, g.value - contributions);
    let tax: number;
    if (i.years >= 8) {
      const allowance = i.couple ? 9_200 : 4_600;
      tax = Math.max(0, gains - allowance) * 0.075 + gains * i.socialRate;
    } else {
      tax = gains * i.pfuTotal;
    }
    out.push({
      id: 'av', name: 'Assurance-vie', contributions, grossValue: g.value, tax, entrySaving: 0, net: g.value - tax, series: g.series,
      note: 'Disponible, fiscalité allégée après 8 ans (abattement annuel sur les gains retirés) et transmission avantageuse (152 500 € par bénéficiaire).',
    });
  }
  // PER : versements déductibles, sortie en capital imposée
  {
    const g = grow(i.initial, i.monthly, i.years, i.grossReturn - 0.007);
    const gains = Math.max(0, g.value - contributions);
    const entrySaving = contributions * i.tmiNow;
    const tax = contributions * i.tmiRetirement + gains * i.pfuTotal;
    out.push({
      id: 'per', name: 'PER (sortie en capital)', contributions, grossValue: g.value, tax, entrySaving, net: g.value - tax + entrySaving, series: g.series,
      note: `Versements déduits à ${Math.round(i.tmiNow * 100)} % aujourd’hui, capital imposé à ${Math.round(i.tmiRetirement * 100)} % à la sortie. Bloqué jusqu’à la retraite, sauf achat de la résidence principale. L’économie d’impôt est comptée sans être réinvestie.`,
    });
  }
  return out;
}

/** Mensualité d'un prêt amortissable. */
export function monthlyPayment(capital: number, annualRate: number, years: number) {
  const n = years * 12;
  const r = annualRate / 12;
  if (n <= 0) return 0;
  if (r === 0) return capital / n;
  return (capital * r) / (1 - Math.pow(1 + r, -n));
}

/** Capital empruntable pour une mensualité donnée (hors assurance). */
export function borrowingCapacity(payment: number, annualRate: number, years: number) {
  const n = years * 12;
  const r = annualRate / 12;
  if (n <= 0 || payment <= 0) return 0;
  if (r === 0) return payment * n;
  return (payment * (1 - Math.pow(1 + r, -n))) / r;
}

export interface RentalInput {
  price: number;
  notaryRate: number;
  works: number;
  furniture: number;
  monthlyRent: number;
  annualCharges: number; // copropriété non récupérable, assurance PNO, gestion
  propertyTax: number;
  vacancyMonths: number;
  downPayment: number;
  loanRate: number;
  loanYears: number;
  insuranceRate: number;
}

export function rentalYield(i: RentalInput) {
  const totalCost = i.price * (1 + i.notaryRate) + i.works + i.furniture;
  const annualRent = i.monthlyRent * (12 - i.vacancyMonths);
  const gross = totalCost > 0 ? (i.monthlyRent * 12) / totalCost : 0;
  const net = totalCost > 0 ? (annualRent - i.annualCharges - i.propertyTax) / totalCost : 0;
  const loan = Math.max(0, totalCost - i.downPayment);
  const payment = monthlyPayment(loan, i.loanRate, i.loanYears) + (loan * i.insuranceRate) / 12;
  const cashflow = (annualRent - i.annualCharges - i.propertyTax) / 12 - payment;
  return { totalCost, gross, net, loan, payment, cashflow };
}
