// Pont entre la page (sans accès au système) et le processus principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('capBudgetDesktop', {
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
