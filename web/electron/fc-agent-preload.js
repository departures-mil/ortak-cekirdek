/* Asistan Agent — preload parçası: window.fcAgentHost (fc-agent-main.js ile birlikte). */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const unwrap = (p) => p.then((r) => { if (r && r.ok) return r.data; throw new Error((r && r.error) || 'ERR'); });
const api = {
  read: () => unwrap(ipcRenderer.invoke('fc:agent:read')),
  write: (key, json) => unwrap(ipcRenderer.invoke('fc:agent:write', key, json)),
  remove: (key) => unwrap(ipcRenderer.invoke('fc:agent:remove', key))
};
try { contextBridge.exposeInMainWorld('fcAgentHost', api); } catch (e) { try { window.fcAgentHost = api; } catch (e2) {} }
