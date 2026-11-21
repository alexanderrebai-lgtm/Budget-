// Sauvegardes quotidiennes du logiciel PC : Documents/Cap Budget/Sauvegardes (30 derniers jours).
const { app, ipcMain, shell } = require('electron');
const { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync, renameSync } = require('node:fs');
const path = require('node:path');

const KEEP = 30;
const folder = () => path.join(app.getPath('documents'), 'Cap Budget', 'Sauvegardes');
const safeName = (name) => /^cap-budget-[\w.-]+\.json$/.test(name);

function list() {
  mkdirSync(folder(), { recursive: true });
  return readdirSync(folder())
    .filter(safeName)
    .map((name) => {
      const st = statSync(path.join(folder(), name));
      return { name, size: st.size, mtime: st.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

function registerBackup() {
  ipcMain.handle('backup:folder', () => folder());
  ipcMain.handle('backup:list', () => list());
  ipcMain.handle('backup:openFolder', () => {
    mkdirSync(folder(), { recursive: true });
    return shell.openPath(folder());
  });
  ipcMain.handle('backup:read', (_e, name) => {
    if (!safeName(name)) throw new Error('Nom de sauvegarde invalide.');
    return readFileSync(path.join(folder(), name), 'utf8');
  });
  ipcMain.handle('backup:write', (_e, name, json) => {
    if (!safeName(name)) throw new Error('Nom de sauvegarde invalide.');
    if (typeof json !== 'string' || !json.startsWith('{')) throw new Error('Contenu invalide.');
    mkdirSync(folder(), { recursive: true });
    const target = path.join(folder(), name);
    // écriture atomique : fichier temporaire puis renommage
    writeFileSync(`${target}.tmp`, json, 'utf8');
    renameSync(`${target}.tmp`, target);
    const files = list();
    for (const f of files.slice(KEEP)) unlinkSync(path.join(folder(), f.name));
    return { path: target, kept: Math.min(files.length, KEEP) };
  });
}

module.exports = { registerBackup };
