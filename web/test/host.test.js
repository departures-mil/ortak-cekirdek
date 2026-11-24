'use strict';
const test = require('node:test');
const assert = require('node:assert');
const FC = require('./_load')('host');

function shellHost(kind, extra) {
  return Object.assign({
    kind, shell: 'go', platform: 'win32', version: '2.0.0',
    window: { minimize: async () => 'min', half: async () => {}, toggleFullscreen: async () => {}, close: async () => {} },
    update: { channel: 'win-app', applyPatch: async (b, m) => ['patch', m.version], installFull: async (b, m) => ['full', m.version] },
    net: { download: async () => new Uint8Array([1]) }
  }, extra || {});
}
test('tarayıcı: fcHost yok', () => {
  delete globalThis.fcHost;
  const h = FC.host.redetect();
  assert.strictEqual(h.kind, 'browser'); assert.strictEqual(h.can.update, false);
});
test("özel kabuk: kind:'shell' electron sözleşmesiyle çalışır, türü 'shell' kalır", async () => {
  globalThis.fcHost = shellHost('shell');
  const h = FC.host.redetect();
  assert.strictEqual(h.kind, 'shell'); assert.strictEqual(h.shell, 'go'); assert.strictEqual(h.platform, 'win32');
  assert.deepStrictEqual(h.can, { minimize: true, half: true, fullscreen: true, close: true, update: true });
  assert.strictEqual(h.version(), '2.0.0');
  assert.deepStrictEqual(await h.update.applyPatch(new Uint8Array(), { version: '2.1.0' }), ['patch', '2.1.0']);
  assert.strictEqual(await h.window.minimize(), 'min');
  assert.ok(h.net && h.net.download); assert.strictEqual(h.update.run, undefined);
});
test('özel kabuk: update.run geçirilir, can.update true; version işlev olabilir', async () => {
  globalThis.fcHost = shellHost('shell', { version: () => '3.0.0', update: { channel: 'win-app', run: async (p) => 'ran:' + p.version } });
  const h = FC.host.redetect();
  assert.strictEqual(h.can.update, true); assert.strictEqual(h.version(), '3.0.0');
  assert.strictEqual(await h.update.run({ version: '3.1.0' }), 'ran:3.1.0');
  await assert.rejects(h.update.applyPatch(new Uint8Array(), {}), /UNSUPPORTED/);
});
test("geriye uyum: kind:'electron' ve bilinmeyen tür ('webview2') eskisi gibi electron", () => {
  globalThis.fcHost = shellHost('electron');
  assert.strictEqual(FC.host.redetect().kind, 'electron'); assert.strictEqual(FC.host.shell, '');
  globalThis.fcHost = shellHost('webview2');
  assert.strictEqual(FC.host.redetect().kind, 'electron');
  delete globalThis.fcHost; FC.host.redetect();
});
