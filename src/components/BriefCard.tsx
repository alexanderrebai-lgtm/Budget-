import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { generateDailyBrief, useDailyBrief } from '../ai/dailyBrief';
import { desktopAi } from '../ai/desktop';
import type { Brief, Tone } from '../lib/brief';
import { useConjoncture } from '../lib/conjoncture';
import type { Estimates } from '../lib/estimates';
import { shortMonth } from '../lib/format';
import { useStore } from '../store/store';
import Markdown from './Markdown';
import { ChartTooltip } from './ui';

const TONE_COLOR: Record<Tone, string> = { pos: 'var(--pos)', info: 'var(--accent)', warn: 'var(--warn)', neg: 'var(--danger)' };
const pct = (r: number, d = 1) => `${(r * 100).toLocaleString('fr-FR', { maximumFractionDigits: d })} %`;

function Gauge({ score, tone }: { score: number; tone: Tone }) {
  // demi-cercle de 180°
  const r = 52;
  const c = Math.PI * r;
  const filled = (score / 100) * c;
  return (
    <svg viewBox="0 0 128 74" width="150" height="87" role="img" aria-label={`Note de santé financière : ${score} sur 100`}>
      <path d="M 12 68 A 52 52 0 0 1 116 68" fill="none" stroke="var(--surface-2)" strokeWidth="11" strokeLinecap="round" />
      <path d="M 12 68 A 52 52 0 0 1 116 68" fill="none" stroke={TONE_COLOR[tone]} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${filled} ${c}`} />
      <text x="64" y="58" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--text)">{score}</text>
      <text x="64" y="71" textAnchor="middle" fontSize="9" fill="var(--text-3)">sur 100</text>
    </svg>
  );
}

export default function BriefCard({ brief, est }: { brief: Brief; est: Estimates }) {
  const data = useStore();
  const CONJONCTURE = useConjoncture((s) => s.data);
  const live = useConjoncture((s) => s.live);
  const ai = desktopAi();
  const daily = useDailyBrief();

  // Mot de Claude : généré automatiquement une fois par jour (logiciel PC, compte connecté).
  useEffect(() => {
    if (!brief.ready) return;
    const t = setTimeout(() => void generateDailyBrief(useStore.getState()), 2500);
    return () => clearTimeout(t);
  }, [brief.ready]);

  if (!brief.ready) {
    return (
      <section className="card brief">
        <h2>Bilan express</h2>
        <p className="muted" style={{ marginTop: 6 }}>Le bilan apparaîtra après un premier mois complet d’opérations (revenus et dépenses).</p>
      </section>
    );
  }

  // Dépenses mensuelles indexées (base 100) comparées à la hausse des prix
  const hist = est.history.filter((h) => h.expense > 0);
  const base = hist.length ? hist.slice(0, Math.min(3, hist.length)).reduce((s, h) => s + h.expense, 0) / Math.min(3, hist.length) : 0;
  const chart = hist.map((h, i) => ({
    name: shortMonth(h.month),
    'Vos dépenses': base ? Math.round((h.expense / base) * 1000) / 10 : 100,
    Inflation: Math.round(100 * Math.pow(1 + CONJONCTURE.inflation.yoy, i / 12) * 10) / 10,
  }));

  return (
    <section className="card brief">
      <div className="brief-top">
        <div className="brief-gauge">
          <Gauge score={brief.score} tone={brief.tone} />
          <div className="brief-label" style={{ color: TONE_COLOR[brief.tone] }}>Situation {brief.label.toLowerCase()}</div>
          <details className="brief-detail">
            <summary className="faint small">Détail de la note</summary>
            {brief.components.map((c) => (
              <div key={c.label} className="row between small"><span>{c.label}</span><span className="num">{c.points}/{c.max}</span></div>
            ))}
          </details>
        </div>

        <div className="brief-text">
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <h2>Bilan express</h2>
            <span className="faint small">mis à jour à l’instant</span>
          </div>
          <p style={{ marginTop: 6 }}>{brief.headline}</p>
          {brief.next && (
            <Link to={brief.next.to} className="brief-next">
              <span>➜</span>
              <span><strong>Prochaine étape :</strong> {brief.next.text}</span>
            </Link>
          )}

          {ai && (
            <div className="brief-ai">
              <div className="row between">
                <strong className="small">✦ Le mot de Claude</strong>
                <span className="row" style={{ gap: 6 }}>
                  <label className="check small faint">
                    <input type="checkbox" checked={daily.auto} onChange={(e) => daily.setAuto(e.target.checked)} />
                    chaque jour
                  </label>
                  <button className="ghost small" disabled={daily.running} onClick={() => void generateDailyBrief(data, true)}>
                    {daily.running ? 'Rédaction…' : 'Actualiser'}
                  </button>
                </span>
              </div>
              {daily.text ? (
                <Markdown text={daily.text} />
              ) : daily.error ? (
                <p className="small neg">{daily.error} <Link to="/analyse">Connexion à Claude</Link></p>
              ) : daily.running ? (
                <p className="small muted">Claude analyse tes dépenses…</p>
              ) : (
                <p className="small muted">Connecte ton compte Claude dans <Link to="/analyse">Analyse IA</Link> pour recevoir un commentaire personnalisé chaque jour.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="brief-signals">
        {brief.signals.map((s) => (
          <Link key={s.id} to={s.to ?? '/'} className={`signal signal-${s.tone}`}>
            <div className="signal-metric num">{s.metric}</div>
            <div className="signal-title">{s.title}</div>
            <div className="signal-detail">{s.detail}</div>
          </Link>
        ))}
      </div>

      <div className="brief-bottom">
        {chart.length >= 3 && (
          <div className="brief-chart">
            <div className="small" style={{ fontWeight: 600 }}>Vos dépenses face à l’inflation <span className="faint">(base 100)</span></div>
            <div style={{ height: 120 }}>
              <ResponsiveContainer>
                <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--text-3)', fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip content={<ChartTooltip format={(n) => `${n.toLocaleString('fr-FR')}`} />} />
                  <Line dataKey="Vos dépenses" stroke="#f59e0b" strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
                  <Line dataKey="Inflation" stroke="var(--text-3)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className="brief-macro">
          <div className="small" style={{ fontWeight: 600 }}>Conjoncture <span className="faint">au {new Date(`${CONJONCTURE.asOf}T12:00:00`).toLocaleDateString('fr-FR')}</span></div>
          <div className="macro-chips">
            <span className="macro" title={`${CONJONCTURE.inflation.source}, ${CONJONCTURE.inflation.period}`}><span className="faint">Inflation{live ? ' (IPCH)' : ''}</span><strong>{pct(CONJONCTURE.inflation.yoy)}</strong></span>
            <span className="macro"><span className="faint">Énergie</span><strong>+{pct(CONJONCTURE.inflation.energy, 0)}</strong></span>
            <span className="macro"><span className="faint">Livret A</span><strong>{pct(CONJONCTURE.savings.livretA)}</strong></span>
            <span className="macro"><span className="faint">LEP</span><strong>{pct(CONJONCTURE.savings.lep)}</strong></span>
            <span className="macro"><span className="faint">Crédit 20 ans</span><strong>~{pct(CONJONCTURE.credit.mortgage20)}</strong></span>
          </div>
          <p className="faint small" style={{ marginTop: 6 }}>
            Rendement réel du livret A : <strong className="neg">{pct(CONJONCTURE.savings.livretA - CONJONCTURE.inflation.yoy)}</strong>.
            {brief.cashErosion > 0 && ` Sur vos livrets : environ ${Math.round(brief.cashErosion / 100).toLocaleString('fr-FR')} € de pouvoir d’achat perdus par an.`}
          </p>
        </div>
      </div>
    </section>
  );
}
