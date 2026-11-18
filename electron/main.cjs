// Application PC Cap Budget : une fenêtre qui charge la version web compilée (dist/).
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('node:path');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV_URL;

// Une seule instance : relancer l'application ramène la fenêtre existante.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 380,
    minHeight: 560,
    title: 'Cap Budget',
    backgroundColor: '#f6f7f9',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Les liens externes s'ouvrent dans le navigateur par défaut.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const internal = url.startsWith('file:') || (isDev && url.startsWith(process.env.ELECTRON_DEV_URL));
    if (!internal) {
      event.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });

  if (isDev) void win.loadURL(process.env.ELECTRON_DEV_URL);
  else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  // Refuse toute demande de permission (caméra, micro, géolocalisation…) : l'application n'en a pas besoin.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  const template = [
    {
      label: 'Fichier',
      submenu: [{ role: 'quit', label: 'Quitter' }],
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'resetZoom', label: 'Taille réelle' },
        { role: 'zoomIn', label: 'Zoom avant' },
        { role: 'zoomOut', label: 'Zoom arrière' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Outils de développement' }]),
      ],
    },
  ];
  if (process.platform === 'darwin') template.unshift({ role: 'appMenu', label: 'Cap Budget' });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
