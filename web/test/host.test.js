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

/* Android ağ köprüsü: WebView'den GitHub'a fetch CORS'a takılır ("Failed to fetch"); httpGet/apkUpdate varsa çekirdek bunları kullanır. */
function androidBridge(extra) {
  delete globalThis.fcHost;
  globalThis.AndroidBridge = Object.assign({ moveTaskToBack() {}, appVersion: () => '1.0.0' }, extra || {});
  return FC.host.redetect();
}
test('android: httpGet yoksa net yok, apkUpdate yoksa update.run yok (eski kabuklar değişmez)', () => {
  const h = androidBridge();
  assert.strictEqual(h.kind, 'android'); assert.strictEqual(h.net, null);
  assert.strictEqual(h.update.run, undefined); assert.strictEqual(h.can.update, false);
});
test('android: httpGet → net.download (latest.json yerel indirilir), hata kodları', async () => {
  const yanit = { 'https://x/ok': { status: 200, body: '{"a":1}' }, 'https://x/yok': { status: 404, body: '' }, 'https://x/kopuk': { error: 'timeout' } };
  const h = androidBridge({ httpGet(id, url) { setTimeout(() => globalThis.__fcHttp(id, yanit[url]), 1); } });
  assert.ok(h.net && h.net.maxBytes > 0);
  const b = await h.net.download('https://x/ok');
  assert.ok(b instanceof Uint8Array); assert.strictEqual(new TextDecoder().decode(b), '{"a":1}');
  await assert.rejects(h.net.download('https://x/yok'), (e) => e.code === 'HTTP_404');
  await assert.rejects(h.net.download('https://x/kopuk'), (e) => e.code === 'NETWORK');
});
test('android: apkUpdate → update.run; ilerleme, yama hatası, kurulum, bitiş ve hata olayları', async () => {
  let gonderilen = null;
  const h = androidBridge({ apkUpdate(j) { gonderilen = JSON.parse(j); const f = globalThis.__fcApk;
    setTimeout(() => { f({ type: 'progress', patch: true, done: 5, total: 10 }); f({ type: 'patchFailed', error: 'SRC' }); f({ type: 'installing' }); f({ type: 'done', result: 'done' }); }, 1); } });
  assert.strictEqual(h.can.update, true); assert.strictEqual(typeof h.update.run, 'function');
  const ev = [];
  const plan = { version: '1.2.0', mode: 'patch', url: 'https://github.com/p', sha256: 'a'.repeat(64), size: 10, full: { url: 'https://github.com/f', sha256: 'b'.repeat(64), size: 99, file: 'f.apk' } };
  assert.strictEqual(await h.update.run(plan, (e) => ev.push(e)), 'done');
  assert.deepStrictEqual(gonderilen.patch, { url: 'https://github.com/p', sha256: 'a'.repeat(64), size: 10 });
  assert.strictEqual(gonderilen.full.size, 99);
  assert.deepStrictEqual(ev.map((e) => e.patchFailed ? 'pf' : e.installing ? 'in' : 'pr'), ['pr', 'pf', 'in']);
  const h2 = androidBridge({ apkUpdate() { setTimeout(() => globalThis.__fcApk({ type: 'error', error: 'IZIN' }), 1); } });
  await assert.rejects(h2.update.run(Object.assign({}, plan, { mode: 'full' })), (e) => e.code === 'IZIN');
  delete globalThis.AndroidBridge; FC.host.redetect();
});
