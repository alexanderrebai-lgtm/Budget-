import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/app.css';
import { initSync } from './sync/engine';
import { initPwa } from './pwa';

initPwa();
void initSync();
void import('./backup/backups').then((b) => b.dailyBackup());
void import('./lib/conjoncture').then((c) => c.refreshConjoncture());
void import('./alerts/notify').then((n) => n.startReminders());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
