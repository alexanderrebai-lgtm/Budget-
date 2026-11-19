// Analyse des dépenses par Claude, depuis le logiciel PC.
//
// Comme Jarvis : le SDK officiel Claude Agent pilote le moteur Claude Code embarqué.
// Sans clé, il utilise la connexion à ton compte Claude sur ce PC (ton abonnement) ;
// avec une clé API (console.anthropic.com), il l'utilise à la place, facturée à l'usage.
const { app, ipcMain, safeStorage, shell } = require('electron');
const { spawn } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { homedir } = require('node:os');
const path = require('node:path');

const SYSTEM_PROMPT = `Tu es le conseiller budgétaire de l'application Cap Budget, pour un particulier vivant en France.
Tu reçois un résumé chiffré et anonymisé de ses finances (montants en euros) et une demande.
Règles :
- Réponds en français, de façon directe et bienveillante, avec des montants précis tirés des données.
- Appuie-toi uniquement sur les données fournies ; si une information manque, dis-le.
- Propose des actions concrètes et chiffrées (économie mensuelle et annuelle), classées par impact.
- Mets en évidence les dépenses inhabituelles, les abonnements à revoir, les catégories qui dérivent.
- Pas de conseil en investissement personnalisé sur des titres précis ; reste général sur les placements (livrets, PEA, assurance-vie, PER).
- Mise en forme Markdown simple : titres "##", listes "-", gras "**". Pas de tableau. 400 mots maximum sauf demande contraire.`;

/* ---------------- Moteur Claude ---------------- */

function findClaudeExecutable() {
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const pkg = `claude-agent-sdk-${process.platform}-${process.arch}`;
  const resources = process.resourcesPath;
  const candidates = [
    process.env.CLAUDE_CODE_CHEMIN,
    // moteur embarqué dans l'installateur (hors de l'archive asar)
    resources ? path.join(resources, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', pkg, exe) : null,
    // développement
    path.join(__dirname, '..', 'node_modules', '@anthropic-ai', pkg, exe),
    // Claude Code installé sur le PC
    path.join(homedir(), '.local', 'bin', exe),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'claude', exe) : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', exe) : null,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}

/* ---------------- Clé API facultative (chiffrée par le système) ---------------- */

const keyFile = () => path.join(app.getPath('userData'), 'ia.json');

function readApiKey() {
  try {
    const raw = JSON.parse(readFileSync(keyFile(), 'utf8'));
    if (!raw.key) return null;
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(raw.key, 'base64')) : null;
  } catch {
    return null;
  }
}

function writeApiKey(key) {
  mkdirSync(path.dirname(keyFile()), { recursive: true });
  if (!key) return writeFileSync(keyFile(), JSON.stringify({}));
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Le chiffrement du système n’est pas disponible : impossible d’enregistrer la clé en sécurité.');
  writeFileSync(keyFile(), JSON.stringify({ key: safeStorage.encryptString(key).toString('base64') }));
}

function loginStatus() {
  if (process.env.ANTHROPIC_API_KEY || readApiKey()) return 'cle';
  const home = homedir();
  const files = [path.join(home, '.claude', '.credentials.json'), path.join(home, '.claude.json')];
  return files.some((f) => existsSync(f)) ? 'abonnement' : 'aucun';
}

function explain(error) {
  if (/native cli binary|pathToClaudeCodeExecutable|ENOENT|spawn/i.test(error)) return 'Le moteur Claude est introuvable sur ce PC. Installe la dernière version de Cap Budget.';
  if (/login|auth|credential|401|not logged|invalid api key|oauth|please run/i.test(error)) return 'Cap Budget n’est pas connecté à ton compte Claude : clique sur « Se connecter à Claude ».';
  if (/rate|limit|429|usage/i.test(error)) return 'La limite d’utilisation de ton abonnement Claude est atteinte pour le moment. Réessaie plus tard.';
  if (/overloaded|529|503|502/i.test(error)) return 'Les serveurs de Claude sont surchargés. Réessaie dans un instant.';
  if (/ENOTFOUND|ECONNREFUSED|network|fetch failed/i.test(error)) return 'Pas de connexion Internet.';
  return `Claude n’a pas pu répondre : ${error}`;
}

/* ---------------- Requêtes ---------------- */

const running = new Map();

async function ask(sender, { requestId, prompt }) {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const executable = findClaudeExecutable();
  const abort = new AbortController();
  running.set(requestId, abort);
  const apiKey = process.env.ANTHROPIC_API_KEY || readApiKey();
  const workdir = path.join(app.getPath('userData'), 'ia');
  mkdirSync(workdir, { recursive: true });

  let text = '';
  let finalText = '';
  let error = null;
  try {
    const stream = query({
      prompt,
      options: {
        cwd: workdir,
        systemPrompt: SYSTEM_PROMPT,
        // aucun outil : Claude ne lit et n'écrit rien sur le PC, il répond seulement
        tools: [],
        settingSources: [],
        maxTurns: 1,
        includePartialMessages: true,
        abortController: abort,
        canUseTool: async () => ({ behavior: 'deny', message: 'Aucun outil autorisé.' }),
        env: { ...process.env, ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}), CLAUDE_AGENT_SDK_CLIENT_APP: `cap-budget/${app.getVersion()}` },
        ...(executable ? { pathToClaudeCodeExecutable: executable } : {}),
      },
    });
    for await (const message of stream) {
      if (message.type === 'stream_event') {
        const ev = message.event;
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          text += ev.delta.text;
          if (!sender.isDestroyed()) sender.send('ai:delta', { requestId, text: ev.delta.text });
        }
      } else if (message.type === 'result') {
        if (message.subtype === 'success') finalText = message.result;
        else error = message.subtype;
      }
    }
  } catch (caught) {
    if (abort.signal.aborted) return { text: text || '', stopped: true };
    error = caught instanceof Error ? caught.message : String(caught);
  } finally {
    running.delete(requestId);
  }
  const reply = (finalText || text).trim();
  if (!reply && error) {
    console.error('[ia]', error);
    return { text: '', error: explain(error) };
  }
  return { text: reply };
}

/** Ouvre le moteur Claude dans un terminal : au premier lancement, il propose la connexion au compte. */
function openLogin() {
  const exe = findClaudeExecutable();
  if (!exe) return { ok: false, message: 'Le moteur Claude n’est pas inclus dans cette version : installe la dernière version de Cap Budget.' };
  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', 'Connexion à Claude', exe], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    } else if (process.platform === 'darwin') {
      spawn('osascript', ['-e', `tell application "Terminal" to do script "${exe.replace(/"/g, '\\"')}"`, '-e', 'tell application "Terminal" to activate'], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const term = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'].find((t) => existsSync(`/usr/bin/${t}`));
      if (!term) return { ok: false, message: `Ouvre un terminal et lance : ${exe}` };
      spawn(`/usr/bin/${term}`, term === 'gnome-terminal' ? ['--', exe] : ['-e', exe], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (e) {
    return { ok: false, message: `Impossible d’ouvrir la fenêtre de connexion : ${e.message}` };
  }
  return {
    ok: true,
    message: 'Une fenêtre s’ouvre : choisis un thème (Entrée), puis « Claude account with subscription », et valide dans le navigateur. Quand c’est fait, tape /exit dans la fenêtre puis clique sur « Vérifier ».',
  };
}

function registerAi() {
  ipcMain.handle('ai:status', () => ({ engine: Boolean(findClaudeExecutable()), login: loginStatus() }));
  ipcMain.handle('ai:login', () => openLogin());
  ipcMain.handle('ai:setKey', (_e, key) => {
    writeApiKey(typeof key === 'string' && key.trim() ? key.trim() : null);
    return { login: loginStatus() };
  });
  ipcMain.handle('ai:ask', (e, payload) => ask(e.sender, payload));
  ipcMain.handle('ai:stop', (_e, requestId) => {
    running.get(requestId)?.abort();
    return true;
  });
  ipcMain.handle('ai:openConsole', () => shell.openExternal('https://console.anthropic.com/settings/keys'));
}

module.exports = { registerAi, findClaudeExecutable };
