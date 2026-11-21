// Mises à jour automatiques du logiciel PC depuis les versions publiées sur GitHub.
// Windows (NSIS) et Linux (AppImage, .deb) : téléchargement en arrière-plan puis installation au
// redémarrage. macOS : l'installation automatique exige une application signée ; on signale
// simplement la nouvelle version avec un lien de téléchargement.
const { app, ipcMain, shell, BrowserWindow } = require('electron');

const RELEASES = 'https://github.com/alexanderrebai-lgtm/Budget-/releases/latest';
let state = { status: 'idle', version: null, percent: 0, error: null };
let checkNowImpl = () => {};

function broadcast(patch) {
  state = { ...state, ...patch };
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('update:state', state);
}

function semverGreater(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

/** macOS non signé : simple vérification de la dernière version publiée. */
async function checkWithoutInstall() {
  try {
    const res = await fetch('https://api.github.com/repos/alexanderrebai-lgtm/Budget-/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return broadcast({ status: 'idle' });
    const rel = await res.json();
    if (rel.tag_name && semverGreater(rel.tag_name, app.getVersion())) broadcast({ status: 'available-manual', version: rel.tag_name.replace(/^v/, '') });
    else broadcast({ status: 'up-to-date' });
  } catch (e) {
    broadcast({ status: 'error', error: String(e.message ?? e) });
  }
}

function setupUpdater() {
  ipcMain.handle('update:state', () => state);
  ipcMain.handle('update:openReleases', () => shell.openExternal(RELEASES));
  if (!app.isPackaged) return;

  if (process.platform === 'darwin') {
    checkNowImpl = () => void checkWithoutInstall();
    ipcMain.handle('update:check', () => checkWithoutInstall());
    ipcMain.handle('update:install', () => shell.openExternal(RELEASES));
    setTimeout(() => void checkWithoutInstall(), 8_000);
    return;
  }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => broadcast({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (info) => broadcast({ status: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('update-not-available', () => broadcast({ status: 'up-to-date' }));
  autoUpdater.on('download-progress', (p) => broadcast({ status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => broadcast({ status: 'ready', version: info.version, percent: 100 }));
  autoUpdater.on('error', (e) => broadcast({ status: 'error', error: String(e?.message ?? e) }));

  const check = () => autoUpdater.checkForUpdates().catch((e) => broadcast({ status: 'error', error: String(e?.message ?? e) }));
  checkNowImpl = () => void check();
  ipcMain.handle('update:check', () => check());
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall(false, true));
  // au démarrage, puis toutes les 6 heures
  setTimeout(check, 8_000);
  setInterval(check, 6 * 3_600_000);
}

module.exports = { setupUpdater, checkNow: () => checkNowImpl() };
