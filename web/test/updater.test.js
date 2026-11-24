'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const FC = require('./_load')('progress', 'updater');
const U = FC.updater;
const H = (b) => crypto.createHash('sha256').update(b).digest('hex');

test('semver karşılaştırma', () => {
  assert.strictEqual(U.cmp('1.10.0', '1.9.9'), 1);
  assert.strictEqual(U.cmp('v1.2.3', '1.2.3'), 0);
  assert.strictEqual(U.cmp('1.2.3-beta.1', '1.2.3'), -1);
  assert.strictEqual(U.cmp('2.0.0', '10.0.0'), -1);
  assert.throws(() => U.cmp('1.2', '1.2.0'));
});

const FULL = Buffer.from('tam-dosya-icerigi-'.repeat(50));
const PATCH = Buffer.from('yama');
function manifest(extra) {
  return Object.assign({
    schema: 1, app: 'demo', version: '1.57.0', minVersion: '1.0.0', notes: { tr: 'Yeni', en: 'New', ar: 'جديد' },
    assets: {
      'win-app': { file: 'Demo-1.57.0-app.asar', size: FULL.length, sha256: H(FULL), patches: { '1.56.0': { file: 'Demo-app.patch-from-1.56.0.bin', size: PATCH.length, sha256: H(PATCH) } } },
      android: { file: 'Demo-1.57.0.apk', size: 10, sha256: 'a'.repeat(64) },
      'win-setup': { file: 'Demo-Setup-1.57.0.exe', size: 20, sha256: 'b'.repeat(64) }
    }
  }, extra || {});
}
const O = { repo: 'demo', app: 'demo', channel: 'win-app' };

test('plan: kendi sürümünün yamasını seçer', () => {
  const p = U.plan(manifest(), Object.assign({ version: '1.56.0' }, O));
  assert.strictEqual(p.mode, 'patch');
  assert.strictEqual(p.url, 'https://github.com/departures-mil/demo/releases/download/v1.57.0/Demo-app.patch-from-1.56.0.bin');
  assert.strictEqual(p.full.url, 'https://github.com/departures-mil/demo/releases/download/v1.57.0/Demo-1.57.0-app.asar');
  assert.strictEqual(p.targetSha256, H(FULL));
});
test('plan: yama yoksa tam, güncelse null, kanal seçimi', () => {
  assert.strictEqual(U.plan(manifest(), Object.assign({ version: '1.50.0' }, O)).mode, 'full');
  assert.strictEqual(U.plan(manifest(), Object.assign({ version: '1.57.0' }, O)), null);
  assert.strictEqual(U.plan(manifest(), Object.assign({ version: '1.58.0' }, O)), null);
  assert.strictEqual(U.plan(manifest(), Object.assign({}, O, { version: '1.0.0', channel: 'android' })).file, 'Demo-1.57.0.apk');
  assert.throws(() => U.plan(manifest(), Object.assign({}, O, { version: '1.0.0', channel: 'win-exe' })), /NO_CHANNEL/);
  assert.throws(() => U.plan({ schema: 2, version: '1.0.0' }, Object.assign({ version: '1.0.0' }, O)), /BAD_MANIFEST/);
  assert.throws(() => U.plan(manifest({ app: 'baska' }), Object.assign({ version: '1.0.0' }, O)), /WRONG_APP/);
});
test('plan: yama tam dosyadan büyükse yok sayılır; minVersion altında kurulum kanalı', () => {
  const m = manifest(); m.assets['win-app'].patches['1.56.0'].size = FULL.length + 1;
  assert.strictEqual(U.plan(m, Object.assign({ version: '1.56.0' }, O)).mode, 'full');
  const m2 = manifest({ minVersion: '1.40.0' });
  const p = U.plan(m2, Object.assign({ version: '1.30.0', setupChannel: 'win-setup' }, O));
  assert.strictEqual(p.channel, 'win-setup'); assert.strictEqual(p.mode, 'full'); assert.ok(p.belowMin);
});

function mockFetch(files, log) {
  return async (url) => {
    log && log.push(url);
    const name = decodeURIComponent(String(url).split('/').pop());
    const body = files[name];
    if (body === undefined) return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) };
    const buf = typeof body === 'string' ? Buffer.from(body) : body;
    return {
      ok: true, status: 200, headers: { get: (h) => (h === 'content-length' ? String(buf.length) : null) },
      json: async () => JSON.parse(buf.toString()),
      body: { getReader() { let sent = false; return { read: async () => (sent ? { done: true } : (sent = true, { done: false, value: new Uint8Array(buf) })) }; } }
    };
  };
}
function fakeHost(behaviour) {
  const calls = [];
  FC.host = {
    kind: 'electron', can: { update: true }, version: () => '1.56.0',
    update: {
      channel: 'win-app',
      applyPatch: async (b, meta) => { calls.push(['patch', Buffer.from(b).toString(), meta]); if (behaviour.patchFails) throw Object.assign(new Error('PATCH_SOURCE_MISMATCH'), { code: 'PATCH_SOURCE_MISMATCH' }); return 'restarting'; },
      installFull: async (b, meta) => { calls.push(['full', Buffer.from(b).length, meta]); return behaviour.android ? { ok: true } : 'restarting'; }
    }
  };
  return calls;
}
async function runWith(files, behaviour) {
  U._reset();
  const calls = fakeHost(behaviour || {});
  const log = [];
  U.start({ repo: 'demo', app: 'demo', version: '1.56.0', autoCheck: false, fetch: mockFetch(files, log) });
  const states = []; U.subscribe((s) => states.push(s.status));
  const p = await U.check();
  const r = await U.run();
  return { p, r, calls, log, states, st: U.state() };
}

test('run: yama → doğrulama → applyPatch; not önbelleğe alınır', async () => {
  const m = manifest();
  const { r, calls, log, states } = await runWith({ 'latest.json': JSON.stringify(m), 'Demo-app.patch-from-1.56.0.bin': PATCH, 'Demo-1.57.0-app.asar': FULL });
  assert.strictEqual(r, 'patch');
  assert.strictEqual(calls.length, 1); assert.strictEqual(calls[0][0], 'patch'); assert.strictEqual(calls[0][2].targetSha256, H(FULL));
  assert.ok(log[0].endsWith('/releases/latest/download/latest.json'));
  assert.ok(!log.some((u) => u.endsWith('.asar')), 'tam dosya indirilmemeli');
  assert.deepStrictEqual(FC.storage.get('whatsnew.pending'), { version: '1.57.0', notes: m.notes });
  for (const s of ['checking', 'available', 'downloading', 'verifying', 'installing', 'restarting']) assert.ok(states.includes(s), s);
});
test('run: yama uygulanamazsa kendiliğinden tam dosya', async () => {
  const { r, calls } = await runWith({ 'latest.json': JSON.stringify(manifest()), 'Demo-app.patch-from-1.56.0.bin': PATCH, 'Demo-1.57.0-app.asar': FULL }, { patchFails: true });
  assert.strictEqual(r, 'full'); assert.deepStrictEqual(calls.map((c) => c[0]), ['patch', 'full']);
});
test('run: yamanın SHA-256 tutmazsa tam dosya; tam da tutmazsa hata', async () => {
  let x = await runWith({ 'latest.json': JSON.stringify(manifest()), 'Demo-app.patch-from-1.56.0.bin': 'bozk', 'Demo-1.57.0-app.asar': FULL });
  assert.strictEqual(x.r, 'full'); assert.deepStrictEqual(x.calls.map((c) => c[0]), ['full']);
  await assert.rejects(runWith({ 'latest.json': JSON.stringify(manifest()), 'Demo-app.patch-from-1.56.0.bin': 'bozk', 'Demo-1.57.0-app.asar': Buffer.alloc(FULL.length) }), /BAD_HASH/);
  assert.strictEqual(U.state().status, 'error');
});
test('check: yayın yoksa (404) güncel sayılır', async () => {
  U._reset(); fakeHost({});
  U.start({ repo: 'demo', version: '1.0.0', autoCheck: false, fetch: mockFetch({}) });
  assert.strictEqual(await U.check(), null);
  assert.strictEqual(U.state().status, 'none');
});
test('sha256 (WebCrypto)', async () => {
  assert.strictEqual(await U.sha256(new Uint8Array(Buffer.from('abc'))), H(Buffer.from('abc')));
});
test('Android: kurulum ekranı açılınca durum "done" olur (yeniden başlatma beklenmez)', async () => {
  const { st } = await runWith({ 'latest.json': JSON.stringify(manifest()), 'Demo-1.57.0-app.asar': FULL }, { android: true });
  assert.strictEqual(st.status, 'done');
});

/* Kabuk indirmesi (Electron fcHost.net.download): IPC hatası kodu iletide taşır */
function shellHost(download) {
  FC.host = { kind: 'electron', can: { update: true }, version: () => '1.56.0', net: { download }, update: { channel: 'win-app' } };
}
test('check (kabuk indirmesi): IPC iletisinde HTTP_404 → güncel; başka hata kodu çıkarılır', async () => {
  U._reset();
  shellHost(async () => { throw new Error("Error invoking remote method 'fc:net:download': Error: HTTP_404"); });
  U.start({ repo: 'demo', version: '1.0.0', autoCheck: false });
  assert.strictEqual(await U.check(), null);
  assert.strictEqual(U.state().status, 'none');
  U._reset();
  shellHost(async () => { throw new Error("Error invoking remote method 'fc:net:download': Error: HTTP_503"); });
  U.start({ repo: 'demo', version: '1.0.0', autoCheck: false });
  assert.strictEqual(await U.check(), null);
  assert.strictEqual(U.state().status, 'error'); assert.strictEqual(U.state().error, 'HTTP_503');
  U._reset();
  shellHost(async () => Buffer.from(JSON.stringify(manifest())));
  U.start({ repo: 'demo', app: 'demo', version: '1.56.0', autoCheck: false });
  assert.strictEqual((await U.check()).mode, 'patch');
  delete FC.host;
});

/* Yerel kabuk kendisi indirip kurar: FC.host.update.run(plan, ilerleme) */
test('run: FC.host.update.run varsa indirme/yama/kurulum kabukta; ilerleme ve yedek olayları', async () => {
  U._reset();
  const seen = [];
  FC.host = {
    kind: 'android', can: { update: true }, version: () => '1.56.0',
    update: {
      channel: 'win-app',
      applyPatch: async () => { throw new Error('çağrılmamalı'); }, installFull: async () => { throw new Error('çağrılmamalı'); },
      run: async (plan, progress) => {
        seen.push(plan.mode, plan.url, plan.full.url);
        progress({ patch: true, done: 2, total: 4 });
        progress({ patchFailed: true, error: 'PATCH_SOURCE_MISMATCH' });
        progress({ patch: false, done: FULL.length, total: FULL.length, finished: true });
        progress({ installing: true });
        return 'done';
      }
    }
  };
  const states = [];
  U.start({ repo: 'demo', app: 'demo', version: '1.56.0', autoCheck: false, fetch: mockFetch({ 'latest.json': JSON.stringify(manifest()) }) });
  U.subscribe((s) => states.push([s.status, s.mode, s.fallback]));
  await U.check();
  assert.strictEqual(await U.run(), 'done');
  assert.strictEqual(seen[0], 'patch'); assert.ok(seen[2].endsWith('Demo-1.57.0-app.asar'));
  const st = U.state();
  assert.strictEqual(st.status, 'done'); assert.strictEqual(st.fallback, true); assert.strictEqual(st.patchError, 'PATCH_SOURCE_MISMATCH');
  assert.ok(states.some((s) => s[0] === 'downloading' && s[1] === 'full'));
  assert.ok(states.some((s) => s[0] === 'installing'));
  // hata → durum error
  U._reset();
  FC.host.update.run = async () => { throw Object.assign(new Error('x'), { code: 'NATIVE_FAIL' }); };
  U.start({ repo: 'demo', app: 'demo', version: '1.56.0', autoCheck: false, fetch: mockFetch({ 'latest.json': JSON.stringify(manifest()) }) });
  await U.check();
  await assert.rejects(U.run(), /x/);
  assert.strictEqual(U.state().error, 'NATIVE_FAIL');
  delete FC.host;
});

test('otomatik: kabuk "hazırla, kapanınca kur" destekliyorsa yeni sürüm sorulmadan arka planda indirilir ve hazırlanır', async () => {
  U._reset();
  const calls = [];
  FC.host = {
    kind: 'electron', can: { update: true }, version: () => '1.56.0',
    update: {
      channel: 'win-app', deferred: true,
      applyPatch: async (b, meta) => { calls.push(['patch', !!meta.deferred]); return meta.deferred ? 'staged' : 'restarting'; },
      installFull: async (b, meta) => { calls.push(['full', !!meta.deferred]); return meta.deferred ? 'staged' : 'restarting'; },
      applyStaged: async () => { calls.push(['apply']); return 'restarting'; }
    }
  };
  const files = { 'latest.json': JSON.stringify(manifest()), 'Demo-app.patch-from-1.56.0.bin': PATCH, 'Demo-1.57.0-app.asar': FULL };
  U.start({ repo: 'demo', app: 'demo', version: '1.56.0', autoCheck: false, fetch: mockFetch(files, []) });
  const states = []; U.subscribe((s) => states.push(s.status));
  await U.check({ silent: true });
  for (let i = 0; i < 50 && U.state().status !== 'ready'; i++) await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(U.state().status, 'ready');
  assert.ok(!states.includes('available'), '"yeni sürüm" penceresi tetiklenmez');
  assert.deepStrictEqual(calls, [['patch', true]]);
  // denetim hazır güncellemeyi bozmaz; Güncelle → hemen kur
  await U.check({ silent: true }); assert.strictEqual(U.state().status, 'ready');
  assert.strictEqual(await U.run(), 'staged');
  assert.deepStrictEqual(calls.at(-1), ['apply']);
  // autoInstall:false → eskisi gibi "available"
  U._reset(); calls.length = 0;
  U.start({ repo: 'demo', app: 'demo', version: '1.56.0', autoCheck: false, autoInstall: false, fetch: mockFetch(files, []) });
  await U.check({ silent: true });
  assert.strictEqual(U.state().status, 'available'); assert.deepStrictEqual(calls, []);
});
test('otomatik: arka plan indirmesi başarısızsa sessizce "available" olur (elle güncelleme çalışır)', async () => {
  U._reset();
  FC.host = { kind: 'electron', can: { update: true }, version: () => '1.56.0', update: { channel: 'win-app', deferred: true,
    applyPatch: async () => 'staged', installFull: async () => 'staged', applyStaged: async () => 'restarting' } };
  const files = { 'latest.json': JSON.stringify(manifest()), 'Demo-app.patch-from-1.56.0.bin': 'bozk', 'Demo-1.57.0-app.asar': Buffer.alloc(FULL.length) };
  U.start({ repo: 'demo', app: 'demo', version: '1.56.0', autoCheck: false, fetch: mockFetch(files, []) });
  await U.check({ silent: true });
  for (let i = 0; i < 50 && U.state().status !== 'available'; i++) await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(U.state().status, 'available'); assert.strictEqual(U.state().error, null);
});
