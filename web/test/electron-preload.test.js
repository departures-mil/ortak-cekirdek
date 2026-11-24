'use strict';
/* fc-preload.js — contextIsolation açık (contextBridge) ve kapalı (window) kipleri, sahte 'electron' ile */
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

const exposed = {};
const fake = {
  contextBridge: { exposeInMainWorld: (k, v) => { exposed[k] = v; } },
  ipcRenderer: { sendSync: () => ({ version: '9.9.9', platform: 'win32', channel: 'win-app' }), invoke: async (ch) => ({ ok: true, data: ch }), on() {}, removeListener() {} }
};
const origLoad = Module._load;
Module._load = function (req, ...a) { return req === 'electron' ? fake : origLoad.call(this, req, ...a); };
const FILE = path.join(__dirname, '..', 'electron', 'fc-preload.js');
function load(isolated) {
  delete require.cache[FILE];
  Object.defineProperty(process, 'contextIsolated', { value: isolated, configurable: true, writable: true });
  globalThis.window = {};
  return require(FILE);
}

test('contextIsolation açık: contextBridge ile', async () => {
  load(true);
  assert.ok(exposed.fcHost); assert.strictEqual(globalThis.window.fcHost, undefined);
  assert.strictEqual(exposed.fcHost.version, '9.9.9');
  assert.strictEqual(await exposed.fcHost.update.applyPatch(new Uint8Array(), {}), 'fc:update:patch');
});
test('contextIsolation kapalı: window.fcHost doğrudan', () => {
  delete exposed.fcHost;
  const m = load(false);
  assert.strictEqual(exposed.fcHost, undefined);
  assert.strictEqual(globalThis.window.fcHost, m.fcHost);
  assert.strictEqual(globalThis.window.fcHost.kind, 'electron');
  delete process.contextIsolated; delete globalThis.window;
});
