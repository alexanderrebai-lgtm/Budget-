import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, NumberField, PageHead, Segmented, toast, useCategoryMap } from '../components/ui';
import { taxTotals } from '../lib/analysis';
import { euros, percent } from '../lib/format';
import { useStore } from '../store/store';
import {
  computeTax,
  emptyProfile,
  estimatePerCeiling,
  mileageAllowance,
  type Declarant,
  type TaxProfile,
} from '../tax/engine';
import { suggest } from '../tax/optimizer';
import { CURRENT_PARAMS } from '../tax/params';

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="lever" open={defaultOpen}>
      <summary><h3>{title}</h3><span className="faint small" style={{ marginLeft: 'auto' }}>▾</span></summary>
      <div className="body">{children}</div>
    </details>
  );
}

export default function Taxes() {
  const profile = useStore((s) => s.taxProfile);
  const setProfile = useStore((s) => s.setTaxProfile);
  const txs = useStore((s) => s.transactions);
  const cats = useCategoryMap();

  const upd = (patch: Partial<TaxProfile>) => setProfile({ ...profile, ...patch });
  const updD = (i: 0 | 1, patch: Partial<Declarant>) => {
    const declarants = [...profile.declarants] as [Declarant, Declarant];
    declarants[i] = { ...declarants[i], ...patch };
    setProfile({ ...profile, declarants });
  };

  const result = useMemo(() => computeTax(profile), [profile]);
  const suggestions = useMemo(() => suggest(profile), [profile]);
  const couple = profile.status === 'couple';
  const year = CURRENT_PARAMS.incomeYear;

  const prefill = () => {
    const t = taxTotals(txs, cats, year);
    if (!Object.keys(t).length) {
      toast(`Aucune opération ${year} avec une catégorie fiscale.`);
      return;
    }
    const declarants = [...profile.declarants] as [Declarant, Declarant];
    if (t.per) declarants[0] = { ...declarants[0], perContributions: Math.round(t.per) };
    setProfile({
      ...profile,
      declarants,
      donationsHelp: Math.round(t.don_aide ?? profile.donationsHelp),
      donationsGeneral: Math.round(t.don ?? profile.donationsGeneral),
      homeEmployment: Math.round(t.emploi_domicile ?? profile.homeEmployment),
      childcare: Math.round(t.garde_enfant ?? profile.childcare),
      unionDues: Math.round(t.syndicat ?? profile.unionDues),
      rental: t.loyer_percu ? { ...profile.rental, grossRent: Math.round(t.loyer_percu), expenses: Math.round(t.charges_locatives ?? profile.rental.expenses) } : profile.rental,
      capital: { ...profile.capital, dividends: Math.round(t.dividendes ?? profile.capital.dividends), interest: Math.round(t.interets ?? profile.capital.interest) },
    });
    toast(`Montants ${year} repris depuis vos opérations. Le salaire net imposable est à saisir depuis vos bulletins.`);
  };

  return (
    <>
      <PageHead
        title="Impôt et optimisation"
        subtitle={`Impôt sur le revenu ${CURRENT_PARAMS.taxYear} (revenus ${year}) · estimation`}
        actions={
          <>
            <button onClick={prefill}>Reprendre mes opérations {year}</button>
            <button className="ghost" onClick={() => confirm('Effacer toutes les données du simulateur ?') && setProfile(emptyProfile())}>Réinitialiser</button>
          </>
        }
      />

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', alignItems: 'start' }} id="tax-layout">
        <div className="stack" style={{ gap: 10 }}>
          <Section title="Votre foyer">
            <div className="form-grid">
              <label className="field"><span>Situation</span>
                <select value={profile.status} onChange={(e) => upd({ status: e.target.value as TaxProfile['status'] })}>
                  <option value="single">Célibataire, divorcé(e), séparé(e)</option>
                  <option value="couple">Marié(e) ou pacsé(e)</option>
                  <option value="widowed">Veuf ou veuve</option>
                </select>
              </label>
              <NumberField label="Enfants à charge" suffix="" value={profile.childrenExclusive} onChange={(n) => upd({ childrenExclusive: Math.floor(n) })} />
              <NumberField label="Enfants en garde alternée" suffix="" value={profile.childrenShared} onChange={(n) => upd({ childrenShared: Math.floor(n) })} />
              <NumberField label="Dont moins de 6 ans" suffix="" value={profile.childrenUnder6} onChange={(n) => upd({ childrenUnder6: Math.floor(n) })} hint="Gardés hors du domicile" />
            </div>
            {profile.status === 'single' && profile.childrenExclusive + profile.childrenShared > 0 && (
              <label className="check">
                <input type="checkbox" checked={profile.singleParent} onChange={(e) => upd({ singleParent: e.target.checked })} />
                Je vis seul(e) avec mes enfants (case T, parent isolé)
              </label>
            )}
            <p className="faint small">Nombre de parts : <strong>{result.parts}</strong></p>
          </Section>

          {([0, 1] as const).filter((i) => i === 0 || couple).map((i) => {
            const d = profile.declarants[i];
            return (
              <Section key={i} title={couple ? `Revenus du déclarant ${i + 1}` : 'Vos revenus'}>
                <div className="form-grid">
                  <NumberField label="Salaires nets imposables" value={d.salary} onChange={(n) => updD(i, { salary: n })} hint="Cumul annuel sur le bulletin de décembre" />
                  <NumberField label="Frais réels" value={d.realExpenses} onChange={(n) => updD(i, { realExpenses: n })} hint="0 = abattement de 10 %" />
                  <NumberField label="Pensions de retraite" value={d.pension} onChange={(n) => updD(i, { pension: n })} />
                </div>
                <div className="form-grid">
                  <NumberField label="Chiffre d’affaires micro-entreprise" value={d.microRevenue} onChange={(n) => updD(i, { microRevenue: n })} />
                  {d.microRevenue > 0 && (
                    <label className="field"><span>Activité</span>
                      <select value={d.microKind} onChange={(e) => updD(i, { microKind: e.target.value as Declarant['microKind'] })}>
                        <option value="sales">Vente de marchandises (BIC 71 %)</option>
                        <option value="services">Prestations de services (BIC 50 %)</option>
                        <option value="bnc">Profession libérale (BNC 34 %)</option>
                      </select>
                    </label>
                  )}
                  {d.microRevenue > 0 && (
                    <label className="check" style={{ alignSelf: 'end', paddingBottom: 8 }}>
                      <input type="checkbox" checked={d.microLiberatoire} onChange={(e) => updD(i, { microLiberatoire: e.target.checked })} />
                      Versement libératoire
                    </label>
                  )}
                </div>
                <div className="form-grid">
                  <NumberField label="Versements PER de l’année" value={d.perContributions} onChange={(n) => updD(i, { perContributions: n })} />
                  <NumberField
                    label="Plafond épargne retraite"
                    value={d.perCeiling ?? 0}
                    onChange={(n) => updD(i, { perCeiling: n > 0 ? n : null })}
                    hint={d.perCeiling ? 'Repris de l’avis d’impôt' : `Estimé : ${euros(estimatePerCeiling(d))} (vide = estimation)`}
                  />
                </div>
              </Section>
            );
          })}

          <Section title="Immobilier locatif" defaultOpen={profile.rental.grossRent + profile.furnished.revenue > 0}>
            <h3 className="small muted">Location nue (revenus fonciers)</h3>
            <div className="form-grid">
              <NumberField label="Loyers bruts encaissés" value={profile.rental.grossRent} onChange={(n) => upd({ rental: { ...profile.rental, grossRent: n } })} />
              <NumberField label="Charges déductibles" value={profile.rental.expenses} onChange={(n) => upd({ rental: { ...profile.rental, expenses: n } })} hint="Intérêts, travaux, taxe foncière, assurance, gestion" />
              <NumberField label="Dont intérêts d’emprunt" value={profile.rental.loanInterest} onChange={(n) => upd({ rental: { ...profile.rental, loanInterest: n } })} />
              <label className="field"><span>Régime</span>
                <select value={profile.rental.regime} onChange={(e) => upd({ rental: { ...profile.rental, regime: e.target.value as TaxProfile['rental']['regime'] } })}>
                  <option value="auto">Le plus avantageux</option>
                  <option value="micro">Micro-foncier (30 %)</option>
                  <option value="real">Réel</option>
                </select>
              </label>
            </div>
            <h3 className="small muted" style={{ marginTop: 6 }}>Location meublée (LMNP)</h3>
            <div className="form-grid">
              <NumberField label="Recettes" value={profile.furnished.revenue} onChange={(n) => upd({ furnished: { ...profile.furnished, revenue: n } })} />
              <NumberField label="Charges" value={profile.furnished.expenses} onChange={(n) => upd({ furnished: { ...profile.furnished, expenses: n } })} />
              <NumberField label="Amortissements" value={profile.furnished.depreciation} onChange={(n) => upd({ furnished: { ...profile.furnished, depreciation: n } })} hint="Régime réel uniquement" />
              <label className="field"><span>Type</span>
                <select value={profile.furnished.kind} onChange={(e) => upd({ furnished: { ...profile.furnished, kind: e.target.value as TaxProfile['furnished']['kind'] } })}>
                  <option value="longTerm">Meublé longue durée</option>
                  <option value="classifiedTourism">Meublé de tourisme classé</option>
                  <option value="unclassifiedTourism">Meublé de tourisme non classé</option>
                </select>
              </label>
              <label className="field"><span>Régime</span>
                <select value={profile.furnished.regime} onChange={(e) => upd({ furnished: { ...profile.furnished, regime: e.target.value as TaxProfile['furnished']['regime'] } })}>
                  <option value="auto">Le plus avantageux</option>
                  <option value="micro">Micro-BIC</option>
                  <option value="real">Réel</option>
                </select>
              </label>
            </div>
          </Section>

          <Section title="Placements financiers" defaultOpen={profile.capital.dividends + profile.capital.interest + profile.capital.capitalGains > 0}>
            <div className="form-grid">
              <NumberField label="Dividendes" value={profile.capital.dividends} onChange={(n) => upd({ capital: { ...profile.capital, dividends: n } })} hint="Compte-titres (hors PEA)" />
              <NumberField label="Intérêts imposables" value={profile.capital.interest} onChange={(n) => upd({ capital: { ...profile.capital, interest: n } })} hint="Hors livret A, LDDS, LEP" />
              <NumberField label="Plus-values mobilières" value={profile.capital.capitalGains} onChange={(n) => upd({ capital: { ...profile.capital, capitalGains: n } })} />
              <label className="field"><span>Imposition</span>
                <select value={profile.capital.option} onChange={(e) => upd({ capital: { ...profile.capital, option: e.target.value as TaxProfile['capital']['option'] } })}>
                  <option value="auto">La plus avantageuse</option>
                  <option value="pfu">Flat tax (PFU 30 %)</option>
                  <option value="bareme">Barème progressif (case 2OP)</option>
                </select>
              </label>
            </div>
          </Section>

          <Section title="Charges, réductions et crédits d’impôt">
            <div className="form-grid">
              <NumberField label="Dons — aide aux personnes" value={profile.donationsHelp} onChange={(n) => upd({ donationsHelp: n })} hint="75 % jusqu’à 1 000 €" />
              <NumberField label="Autres dons" value={profile.donationsGeneral} onChange={(n) => upd({ donationsGeneral: n })} hint="66 %" />
              <NumberField label="Emploi à domicile" value={profile.homeEmployment} onChange={(n) => upd({ homeEmployment: n })} hint="Après aides, avant crédit" />
              <NumberField label="Majorations emploi à domicile" suffix="" value={profile.homeEmploymentDependents} onChange={(n) => upd({ homeEmploymentDependents: Math.floor(n) })} hint="Enfants à charge, membres de plus de 65 ans" />
              <NumberField label="Frais de garde (moins de 6 ans)" value={profile.childcare} onChange={(n) => upd({ childcare: n })} />
              <NumberField label="Cotisations syndicales" value={profile.unionDues} onChange={(n) => upd({ unionDues: n })} />
              <NumberField label="Pension alimentaire enfant majeur" value={profile.alimonyAdultChildren} onChange={(n) => upd({ alimonyAdultChildren: n })} />
              {profile.alimonyAdultChildren > 0 && (
                <NumberField label="Nombre d’enfants majeurs aidés" suffix="" value={profile.adultChildrenSupported} onChange={(n) => upd({ adultChildrenSupported: Math.floor(n) })} />
              )}
              <NumberField label="Autre pension alimentaire" value={profile.otherDeductibleAlimony} onChange={(n) => upd({ otherDeductibleAlimony: n })} hint="Ex-conjoint, ascendants" />
              <NumberField label="Enfants au collège" suffix="" value={profile.schoolingCollege} onChange={(n) => upd({ schoolingCollege: Math.floor(n) })} />
              <NumberField label="Enfants au lycée" suffix="" value={profile.schoolingLycee} onChange={(n) => upd({ schoolingLycee: Math.floor(n) })} />
              <NumberField label="Enfants dans le supérieur" suffix="" value={profile.schoolingSuperieur} onChange={(n) => upd({ schoolingSuperieur: Math.floor(n) })} />
              <NumberField label="Souscription au capital de PME" value={profile.smeInvestment} onChange={(n) => upd({ smeInvestment: n })} hint="IR-PME, FCPI, FIP" />
            </div>
          </Section>

          <Section title="Prélèvement à la source">
            <div className="form-grid">
              <NumberField label="Total prélevé sur l’année" value={profile.withholdingPaid} onChange={(n) => upd({ withholdingPaid: n })} hint="Somme des lignes « impôt sur le revenu prélevé à la source »" />
            </div>
          </Section>

          <MileageCalculator onApply={(amount) => { updD(0, { realExpenses: amount }); toast('Frais réels mis à jour.'); }} />
        </div>

        <div className="stack" style={{ position: 'sticky', top: 16 }}>
          <Result result={result} />
          <Card title="Vos leviers d’optimisation">
            {suggestions.length === 0 ? (
              <p className="muted">Renseignez vos revenus pour obtenir des recommandations.</p>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {suggestions.map((s) => (
                  <details key={s.id} className="lever">
                    <summary>
                      <div className="grow" style={{ flex: 1 }}>
                        <div style={{ fontWeight: 550 }}>{s.title}</div>
                        {s.action && <div className="faint small">{s.action}</div>}
                      </div>
                      {s.saving > 0 ? <span className="badge accent num">−{euros(s.saving)}</span> : <span className="badge">Conseil</span>}
                    </summary>
                    <div className="body">
                      <p>{s.detail}</p>
                      {s.netCost !== undefined && s.netCost > 0 && <p className="muted small">Effort réel après économie d’impôt : {euros(s.netCost)}.</p>}
                    </div>
                  </details>
                ))}
                <Link to="/guide" className="small">Voir tous les leviers fiscaux et patrimoniaux →</Link>
              </div>
            )}
          </Card>
        </div>
      </div>
      <style>{`@media (max-width: 1000px) { #tax-layout { grid-template-columns: 1fr !important; } #tax-layout > .stack:last-child { position: static !important; } }`}</style>
    </>
  );
}

function Result({ result: r }: { result: ReturnType<typeof computeTax> }) {
  const [view, setView] = useState<'synthese' | 'detail'>('synthese');
  return (
    <Card title="Résultat" actions={<Segmented value={view} onChange={setView} options={[{ value: 'synthese', label: 'Synthèse' }, { value: 'detail', label: 'Détail' }]} />}>
      <div className="stack" style={{ gap: 12 }}>
        <div>
          <div className="muted small">Total impôt et prélèvements</div>
          <div className="num" style={{ fontSize: 30, fontWeight: 650 }}>{euros(r.total)}</div>
          {r.incomeTaxNet < 0 && <div className="pos small">Crédit d’impôt remboursé : {euros(-r.incomeTaxNet)}</div>}
        </div>
        <div className="grid g3" style={{ gap: 10 }}>
          <MiniStat label="Tranche marginale" value={percent(r.marginalRate)} />
          <MiniStat label="Taux marginal réel" value={percent(r.effectiveMarginalRate)} />
          <MiniStat label="Taux moyen" value={percent(r.averageRate)} />
        </div>
        {r.balanceDue !== r.incomeTaxNet && (
          <div className={`callout ${r.balanceDue > 0 ? 'warn' : 'accent'}`}>
            {r.balanceDue > 0 ? `Solde à payer en septembre : environ ${euros(r.balanceDue)}.` : `Remboursement attendu en été : environ ${euros(-r.balanceDue)}.`}
          </div>
        )}

        {view === 'detail' && (
          <table className="tax-lines num small">
            <tbody>
              {r.grossIncomeLines.map((l) => (
                <tr key={l.label} className="sub"><td>{l.label}{l.hint && <span className="faint"> · {l.hint}</span>}</td><td className="amount">{euros(l.amount)}</td></tr>
              ))}
              <tr className="total"><td>Revenu brut global</td><td className="amount">{euros(r.grossIncome)}</td></tr>
              {r.deductions.map((l) => (
                <tr key={l.label} className="sub"><td>− {l.label}{l.hint && <span className="faint"> · {l.hint}</span>}</td><td className="amount">{euros(l.amount)}</td></tr>
              ))}
              <tr className="total"><td>Revenu net imposable</td><td className="amount">{euros(r.taxableIncome)}</td></tr>
              <tr className="sub"><td>Impôt au barème ({r.parts} part{r.parts > 1 ? 's' : ''})</td><td className="amount">{euros(r.taxBeforeCap)}</td></tr>
              {r.qfCapApplied && <tr className="sub"><td>Plafonnement du quotient familial</td><td className="amount">+{euros(r.taxAfterQf - r.taxBeforeCap)}</td></tr>}
              {r.decote > 0 && <tr className="sub"><td>− Décote</td><td className="amount">{euros(r.decote)}</td></tr>}
              {r.reductions.map((l) => <tr key={l.label} className="sub"><td>− {l.label}</td><td className="amount">{euros(l.amount)}</td></tr>)}
              {r.credits.map((l) => <tr key={l.label} className="sub"><td>− {l.label}</td><td className="amount">{euros(l.amount)}</td></tr>)}
              <tr className="total"><td>Impôt sur le revenu net</td><td className="amount">{euros(r.incomeTaxNet)}</td></tr>
              {r.flatTaxes.map((l) => <tr key={l.label} className="sub"><td>+ {l.label}</td><td className="amount">{euros(l.amount)}</td></tr>)}
              {r.socialContributions > 0 && <tr className="sub"><td>+ Prélèvements sociaux 17,2 %</td><td className="amount">{euros(r.socialContributions)}</td></tr>}
              {r.cehr > 0 && <tr className="sub"><td>+ Contribution hauts revenus</td><td className="amount">{euros(r.cehr)}</td></tr>}
              <tr className="total"><td>Total</td><td className="amount">{euros(r.total)}</td></tr>
            </tbody>
          </table>
        )}

        {r.regimes.capital && <div className="small muted">Revenus de capitaux : {r.regimes.capital === 'pfu' ? 'flat tax (PFU)' : 'barème progressif'} retenu.</div>}
        {r.regimes.rental && <div className="small muted">Foncier : régime {r.regimes.rental === 'micro' ? 'micro-foncier' : 'réel'} retenu.</div>}
        {r.regimes.furnished && <div className="small muted">LMNP : régime {r.regimes.furnished === 'micro' ? 'micro-BIC' : 'réel'} retenu.</div>}
        {r.warnings.map((w) => <div key={w} className="callout warn small">{w}</div>)}
        <p className="faint small">
          Estimation indicative fondée sur la loi de finances 2026. Certains cas particuliers (revenus exceptionnels, quotient, plus-values immobilières,
          CDHR…) ne sont pas modélisés. Vérifiez avec le simulateur officiel d’impots.gouv.fr.
        </p>
      </div>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px' }}>
      <div className="faint small">{label}</div>
      <div className="num" style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function MileageCalculator({ onApply }: { onApply: (amount: number) => void }) {
  const [km, setKm] = useState(0);
  const [daysPerYear, setDays] = useState(0);
  const [distance, setDistance] = useState(0);
  const [cv, setCv] = useState<'3' | '4' | '5' | '6' | '7'>('5');
  const [electric, setElectric] = useState(false);
  const [meals, setMeals] = useState(0);
  const [other, setOther] = useState(0);
  // Trajets domicile-travail : 40 km aller simple maximum sauf justification.
  const commuteKm = daysPerYear * Math.min(distance, 40) * 2;
  const totalKm = km + commuteKm;
  const mileage = mileageAllowance(totalKm, cv, electric);
  const total = mileage + meals + other;

  return (
    <Section title="Calculateur de frais réels" defaultOpen={false}>
      <div className="form-grid">
        <NumberField label="Distance domicile-travail (aller)" suffix="km" value={distance} onChange={setDistance} hint="Plafonnée à 40 km sauf justification" />
        <NumberField label="Jours travaillés sur site" suffix="j" value={daysPerYear} onChange={setDays} />
        <NumberField label="Autres km professionnels" suffix="km" value={km} onChange={setKm} />
        <label className="field"><span>Puissance fiscale</span>
          <select value={cv} onChange={(e) => setCv(e.target.value as typeof cv)}>
            <option value="3">3 CV et moins</option><option value="4">4 CV</option><option value="5">5 CV</option><option value="6">6 CV</option><option value="7">7 CV et plus</option>
          </select>
        </label>
        <NumberField label="Frais de repas (part déductible)" value={meals} onChange={setMeals} hint="Coût du repas moins la valeur forfaitaire d’un repas à domicile" />
        <NumberField label="Autres frais" value={other} onChange={setOther} hint="Formation, matériel, double résidence…" />
      </div>
      <label className="check"><input type="checkbox" checked={electric} onChange={(e) => setElectric(e.target.checked)} />Véhicule électrique (+20 %)</label>
      <div className="row between">
        <span>{Math.round(totalKm).toLocaleString('fr-FR')} km → <strong>{euros(mileage)}</strong> d’indemnités · total <strong>{euros(total)}</strong></span>
        <button className="small primary" disabled={total <= 0} onClick={() => onApply(total)}>Utiliser pour le déclarant 1</button>
      </div>
    </Section>
  );
}
