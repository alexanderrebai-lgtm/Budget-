// Pont entre la page (sans accès au système) et le processus principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('capBudgetDesktop', {
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    openReleases: () => ipcRenderer.invoke('update:openReleases'),
    onState: (cb) => {
      const listener = (_e, s) => cb(s);
      ipcRenderer.on('update:state', listener);
      return () => ipcRenderer.removeListener('update:state', listener);
    },
  },
  backup: {
    folder: () => ipcRenderer.invoke('backup:folder'),
    list: () => ipcRenderer.invoke('backup:list'),
    read: (name) => ipcRenderer.invoke('backup:read', name),
    write: (name, json) => ipcRenderer.invoke('backup:write', name, json),
    openFolder: () => ipcRenderer.invoke('backup:openFolder'),
  },
  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    login: () => ipcRenderer.invoke('ai:login'),
    setKey: (key) => ipcRenderer.invoke('ai:setKey', key),
    openConsole: () => ipcRenderer.invoke('ai:openConsole'),
    stop: (requestId) => ipcRenderer.invoke('ai:stop', requestId),
    ask: (requestId, prompt, onDelta) => {
      const listener = (_e, msg) => {
        if (msg.requestId === requestId) onDelta(msg.text);
      };
      ipcRenderer.on('ai:delta', listener);
      return ipcRenderer.invoke('ai:ask', { requestId, prompt }).finally(() => ipcRenderer.removeListener('ai:delta', listener));
    },
  },
});
