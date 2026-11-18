import { useEffect, useMemo } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from './components/ui';
import { SyncBadge } from './components/SyncCard';
import { InstallButton } from './components/InstallCard';
import { accountBalance } from './lib/analysis';
import { todayISO } from './lib/format';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Import from './pages/Import';
import Budgets from './pages/Budgets';
import Recurring from './pages/Recurring';
import Goals from './pages/Goals';
import Wealth from './pages/Wealth';
import Taxes from './pages/Taxes';
import Investments from './pages/Investments';
import Guide from './pages/Guide';
import SettingsPage from './pages/Settings';
import Welcome from './pages/Welcome';
import { useStore } from './store/store';
import { useSync } from './sync/engine';

const useSyncEmail = () => useSync((s) => s.email);

const NAV: { section: string; items: { to: string; label: string; icon: string }[] }[] = [
  {
    section: 'Budget',
    items: [
      { to: '/', label: 'Tableau de bord', icon: '◧' },
      { to: '/transactions', label: 'Opérations', icon: '≡' },
      { to: '/import', label: 'Importer', icon: '⇪' },
      { to: '/budgets', label: 'Budgets', icon: '◔' },
      { to: '/recurrents', label: 'Abonnements', icon: '↻' },
    ],
  },
  {
    section: 'Patrimoine',
    items: [
      { to: '/patrimoine', label: 'Comptes et patrimoine', icon: '▤' },
      { to: '/objectifs', label: 'Objectifs', icon: '◎' },
      { to: '/placements', label: 'Simulateurs', icon: '↗' },
    ],
  },
  {
    section: 'Fiscalité',
    items: [
      { to: '/impots', label: 'Impôt et optimisation', icon: '§' },
      { to: '/guide', label: 'Guide des leviers', icon: '✦' },
    ],
  },
];

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}

/** Enregistre la valeur du patrimoine du mois en cours (historique). */
function useNetWorthSnapshot() {
  const accounts = useStore((s) => s.accounts);
  const txs = useStore((s) => s.transactions);
  const record = useStore((s) => s.recordSnapshot);
  const total = useMemo(() => accounts.filter((a) => !a.archived).reduce((s, a) => s + accountBalance(a, txs), 0), [accounts, txs]);
  useEffect(() => {
    if (accounts.length) record(todayISO().slice(0, 7), total);
  }, [accounts.length, total, record]);
}

export default function App() {
  useTheme();
  useNetWorthSnapshot();
  const onboarded = useStore((s) => s.settings.onboarded);
  const syncEmail = useSyncEmail();
  const all = NAV.flatMap((s) => s.items);

  if (!onboarded) return <Welcome />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">€</span> Cap Budget
        </div>
        {NAV.map((s) => (
          <nav key={s.section} className="nav" aria-label={s.section}>
            <div className="nav-section">{s.section}</div>
            {s.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.to === '/'}>
                <span className="ico" aria-hidden>{i.icon}</span>
                {i.label}
              </NavLink>
            ))}
          </nav>
        ))}
        <nav className="nav">
          <div className="nav-section">Application</div>
          <NavLink to="/reglages">
            <span className="ico" aria-hidden>⚙</span>Réglages
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <SyncBadge />
          <div style={{ marginTop: 8 }}><InstallButton /></div>
          <div style={{ marginTop: 8 }}>Données stockées sur cet appareil{syncEmail ? ' et synchronisées' : ''}.</div>
        </div>
      </aside>

      <div className="content">
        <div className="mobile-bar">
          <div className="brand">
            <span className="brand-mark">€</span> Cap Budget
          </div>
          <span style={{ marginLeft: 'auto' }}><SyncBadge /></span>
        </div>
        <nav className="mobile-nav" aria-label="Navigation">
          {[...all, { to: '/reglages', label: 'Réglages', icon: '⚙' }].map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'}>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/import" element={<Import />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/recurrents" element={<Recurring />} />
            <Route path="/patrimoine" element={<Wealth />} />
            <Route path="/objectifs" element={<Goals />} />
            <Route path="/placements" element={<Investments />} />
            <Route path="/impots" element={<Taxes />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/reglages" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
