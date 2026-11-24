'use strict';
/* fc-electron-main.js — sahte 'electron' modülüyle (Electron kurmadan) */
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const handlers = {};
const fake = {
  app: { isPackaged: true, exitCode: null, exit(c) { this.exitCode = c; }, relaunch() {}, getVersion: () => '1.0.0', getName: () => 'demo', getPath: () => os.tmpdir(), on() {} },
  BrowserWindow: { fromWebContents: (wc) => wc.__win },
  ipcMain: { handle: (ch, f) => { handlers[ch] = f; }, removeHandler: (ch) => { delete handlers[ch]; }, removeAllListeners() {}, on() {} },
  screen: {}, shell: {}, net: {}
};
const origLoad = Module._load;
Module._load = function (req, ...a) { return req === 'electron' ? fake : origLoad.call(this, req, ...a); };
const fcm = require('../electron/fc-electron-main.js');
const H = (b) => crypto.createHash('sha256').update(b).digest('hex');

function fakeWin() {
  const w = new EventEmitter();
  w.shown = 0; w.fs = 0;
  w.webContents = Object.assign(new EventEmitter(), { send() {}, isLoading: () => false, __win: w });
  w.webContents.__win = w;
  Object.assign(w, { isFullScreen: () => false, isDestroyed: () => false, show() { w.shown++; }, setFullScreen() { w.fs++; } });
  return w;
}
const call = (win, ch, ...a) => handlers[ch]({ sender: win.webContents }, ...a);

test('install({show:false}): pencere açılışta gösterilmez; varsayılan gösterir', () => {
  const w1 = fakeWin(); fcm.install(w1, { cleanup: false, show: false }); w1.emit('ready-to-show');
  assert.strictEqual(w1.shown, 0); assert.strictEqual(w1.fs, 0);
  const w2 = fakeWin(); fcm.install(w2, { cleanup: false }); w2.emit('ready-to-show');
  assert.strictEqual(w2.shown, 1); assert.strictEqual(w2.fs, 1);
});

test('beforeUpdate: doğrulanmış tam dosya hazırlandıktan sonra, takastan önce; hata → güncelleme yok', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcm-'));
  const asar = path.join(dir, 'app.asar'); fs.writeFileSync(asar, 'eski');
  const NEW = Buffer.from('yeni-app-asar');
  const log = [];
  const w = fakeWin();
  fcm.install(w, { cleanup: false, asarPath: asar, _swap: (o, st) => log.push(['swap', fs.existsSync(st.next)]),
    beforeUpdate: async (meta, kind) => { log.push(['before', kind, meta.version, fs.existsSync(asar + '.next')]); } });
  let r = await call(w, 'fc:update:full', new Uint8Array(NEW), { version: '1.1.0', targetSha256: H(NEW), targetSize: NEW.length, channel: 'win-app' });
  assert.deepStrictEqual(r, { ok: true, data: 'restarting' });
  assert.deepStrictEqual(log, [['before', 'full', '1.1.0', true], ['swap', true]]);
  // yedek alınamazsa: takas yok, hazırlık dosyası silinir
  log.length = 0;
  fcm.install(w, { cleanup: false, asarPath: asar, _swap: () => log.push('swap'), beforeUpdate: async () => { throw Object.assign(new Error('x'), { code: 'BACKUP_FAILED' }); } });
  r = await call(w, 'fc:update:full', new Uint8Array(NEW), { version: '1.1.0', targetSha256: H(NEW), targetSize: NEW.length });
  assert.deepStrictEqual(r, { ok: false, error: 'BACKUP_FAILED' });
  assert.deepStrictEqual(log, []); assert.ok(!fs.existsSync(asar + '.next'));
  // bozuk dosya: yedek hiç alınmaz
  let called = 0;
  fcm.install(w, { cleanup: false, asarPath: asar, _swap: () => {}, beforeUpdate: () => { called++; } });
  r = await call(w, 'fc:update:full', new Uint8Array(NEW), { targetSha256: 'a'.repeat(64) });
  assert.deepStrictEqual(r, { ok: false, error: 'BAD_HASH' }); assert.strictEqual(called, 0);
});

test('runSetup / win-setup: setupArgs (true → NSIS /S), beforeUpdate "setup", cwd geçici klasör', async () => {
  assert.deepStrictEqual(fcm.setupArgsFor(undefined), ['/S', '--force-run'], 'varsayılan: sessiz + yeniden aç');
  assert.deepStrictEqual(fcm.setupArgsFor(false), []);
  assert.deepStrictEqual(fcm.setupArgsFor(true), ['/S']);
  assert.deepStrictEqual(fcm.setupArgsFor('inno')[0], '/VERYSILENT');
  assert.deepStrictEqual(fcm.setupArgsFor(['/S', '--force-run']), ['/S', '--force-run']);
  const EXE = Buffer.from('MZ-kurulum');
  const spawned = [], kinds = [];
  const sp = (exe, args, opt) => { spawned.push([path.basename(exe), args, opt.cwd === path.dirname(exe)]); return { unref() {} }; };
  const w = fakeWin();
  fcm.install(w, { cleanup: false, setupArgs: true, _platform: 'win32', _spawn: sp, beforeUpdate: (m, k) => { kinds.push(k); } });
  const r = await call(w, 'fc:update:full', new Uint8Array(EXE), { channel: 'win-setup', file: 'Demo Setup 1.2.0.exe', targetSha256: H(EXE), targetSize: EXE.length });
  assert.deepStrictEqual(r, { ok: true, data: 'restarting' });
  assert.deepStrictEqual(kinds, ['setup']);
  assert.deepStrictEqual(spawned, [['Demo_Setup_1.2.0.exe', ['/S'], true]]);
  assert.throws(() => fcm.runSetup(EXE, { targetSha256: H(EXE) }, { platform: 'linux' }), /SETUP_WINDOWS_ONLY/);
  assert.throws(() => fcm.runSetup(EXE, { targetSha256: 'b'.repeat(64) }, { platform: 'win32', spawn: sp }), /BAD_HASH/);
  // argüman verilmezse sessiz kurulum + yeniden aç; pencere gizli
  spawned.length = 0; fcm.runSetup(EXE, { targetSha256: H(EXE), file: 'a.exe' }, { platform: 'win32', spawn: sp });
  assert.deepStrictEqual(spawned[0][1], ['/S', '--force-run']);
});

test('fc:net:download: net.fetch yoksa https ile (yönlendirme izlenir, izinsiz alan adı reddedilir)', async () => {
  const https = require('https');
  const orig = https.get;
  const seen = [];
  https.get = (u, opt, cb) => {
    seen.push(String(u));
    const req = new EventEmitter();
    const res = new EventEmitter(); res.resume = () => {};
    if (String(u).includes('/redirect')) { res.statusCode = 302; res.headers = { location: 'https://objects.githubusercontent.com/dosya' }; }
    else if (String(u).includes('/yok')) { res.statusCode = 404; res.headers = {}; }
    else { res.statusCode = 200; res.headers = {}; }
    setImmediate(() => { cb(res); if (res.statusCode === 200) { res.emit('data', Buffer.from('mer')); res.emit('data', Buffer.from('haba')); res.emit('end'); } });
    return req;
  };
  try {
    delete fake.net.fetch;
    const w = fakeWin(); const prog = [];
    w.webContents.send = (...a) => prog.push(a);
    fcm.install(w, { cleanup: false });
    const b = await call(w, 'fc:net:download', 7, 'https://github.com/x/y/redirect');
    assert.strictEqual(Buffer.from(b).toString(), 'merhaba');
    assert.deepStrictEqual(seen, ['https://github.com/x/y/redirect', 'https://objects.githubusercontent.com/dosya']);
    assert.deepStrictEqual(prog[prog.length - 1], ['fc:net:progress', 7, 7, true]);
    await assert.rejects(call(w, 'fc:net:download', 8, 'https://github.com/x/y/yok'), /HTTP_404/);
    await assert.rejects(call(w, 'fc:net:download', 9, 'https://ornek.com/a'), /URL_NOT_ALLOWED/);
    // net.fetch varsa o kullanılır
    seen.length = 0;
    fake.net.fetch = async () => ({ ok: true, body: { getReader() { let d = false; return { read: async () => (d ? { done: true } : (d = true, { done: false, value: new Uint8Array([65, 66]) })) }; } } });
    assert.strictEqual(Buffer.from(await call(w, 'fc:net:download', 10, 'https://github.com/a')).toString(), 'AB');
    assert.deepStrictEqual(seen, []);
  } finally { https.get = orig; }
});

test('otomatik güncelleme: deferred → hazırla (staged), kapanışta kur; applyStaged → hemen; sonraki açılışta da hazır', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcm-'));
  const asar = path.join(dir, 'app.asar'); fs.writeFileSync(asar, 'eski');
  const NEW = Buffer.from('yeni-app-asar-2');
  const log = [];
  const quit = [];
  fake.app.on = (ev, f) => { if (ev === 'will-quit') quit.push(f); };
  fcm.install.quitHooked = false;
  const w = fakeWin();
  fcm.install(w, { cleanup: false, asarPath: asar, _swap: (o, st, noRelaunch) => log.push(['swap', fs.existsSync(st.next), !!noRelaunch]) });
  const r = await call(w, 'fc:update:full', new Uint8Array(NEW), { version: '1.2.0', targetSha256: H(NEW), targetSize: NEW.length, channel: 'win-app', deferred: true });
  assert.deepStrictEqual(r, { ok: true, data: 'staged' });
  assert.deepStrictEqual(log, [], 'hemen takas yok');
  assert.ok(fs.existsSync(asar + '.next') && fs.existsSync(asar + '.next.json'));
  // program yeniden açıldı (kurulmadan kapanmış): hazır güncelleme hatırlanır, kapanışta kurulur
  const w2 = fakeWin();
  fcm.install(w2, { cleanup: false, asarPath: asar, _swap: (o, st, noRelaunch) => log.push(['swap', fs.existsSync(st.next), !!noRelaunch]) });
  assert.ok(quit.length >= 1);
  quit.forEach((f) => f());
  assert.deepStrictEqual(log, [['swap', true, true]], 'kapanışta yeniden açmadan takas');
  // applyStaged: hemen takas + yeniden aç
  log.length = 0;
  await call(w2, 'fc:update:full', new Uint8Array(NEW), { version: '1.2.0', targetSha256: H(NEW), targetSize: NEW.length, deferred: true });
  assert.deepStrictEqual(await call(w2, 'fc:update:applyStaged'), { ok: true, data: 'restarting' });
  assert.deepStrictEqual(log, [['swap', true, false]]);
  assert.deepStrictEqual(await call(w2, 'fc:update:applyStaged'), { ok: false, error: 'NOTHING_STAGED' });
  // bozuk hazır dosya: açılışta silinir
  fs.writeFileSync(asar + '.next', 'bozuk'); fs.writeFileSync(asar + '.next.json', JSON.stringify({ version: '1.2.0', sha256: H(NEW) }));
  fcm.install(fakeWin(), { cleanup: false, asarPath: asar, _swap: () => log.push('x') });
  assert.ok(!fs.existsSync(asar + '.next'));
  fake.app.on = () => {};
});

test('takas yardımcısı (pencere açmaz): program kapanınca eskisini .bak yapar, yenisini koyar, yeniden açar; kurulumu sessiz çalıştırır', () => {
  const cp = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fch-'));
  const t = path.join(dir, 'app.asar'); fs.writeFileSync(t, 'eski'); fs.writeFileSync(t + '.next', 'yeni');
  const child = cp.spawn(process.execPath, ['-e', 'setTimeout(()=>{},700)']);
  const opened = path.join(dir, 'acildi');
  const cfg = { pid: child.pid, target: t, next: t + '.next', exe: process.execPath, args: ['-e', "require('fs').writeFileSync(" + JSON.stringify(opened) + ",'1')"], relaunch: true, log: path.join(dir, 'log') };
  const js = path.join(dir, 'h.js'); fs.writeFileSync(js, '(' + fcm.swapHelper.toString() + ')(' + JSON.stringify(cfg) + ');');
  cp.execFileSync(process.execPath, [js]);
  assert.strictEqual(fs.readFileSync(t, 'utf8'), 'yeni'); assert.strictEqual(fs.readFileSync(t + '.bak', 'utf8'), 'eski');
  assert.ok(!fs.existsSync(js), 'betik kendini siler');
  const until = Date.now() + 5000; while (!fs.existsSync(opened) && Date.now() < until) cp.execFileSync('sleep', ['0.1']);
  assert.ok(fs.existsSync(opened), 'program yeniden açıldı');
  assert.match(fs.readFileSync(cfg.log, 'utf8'), /takas tamam/);
  // kurulum: sessiz çalıştırılır, argümanlar geçer
  const sdir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcs-')), out = path.join(dir, 'kurulum');
  const setup = path.join(sdir, 'kur.sh'); fs.writeFileSync(setup, '#!/bin/sh\necho "$@" > ' + JSON.stringify(out) + '\n'); fs.chmodSync(setup, 0o755);
  const cfg2 = { pid: 999999, setup, setupArgs: ['/S'], exe: process.execPath, args: [], relaunch: false, log: cfg.log };
  fs.writeFileSync(js, '(' + fcm.swapHelper.toString() + ')(' + JSON.stringify(cfg2) + ');');
  cp.execFileSync(process.execPath, [js]);
  assert.strictEqual(fs.readFileSync(out, 'utf8').trim(), '/S');
  assert.ok(!fs.existsSync(sdir), 'geçici kurulum klasörü silinir');
  assert.ok(!/tasklist \/FI|'cmd\.exe'/.test(fs.readFileSync(path.join(__dirname, '../electron/fc-electron-main.js'), 'utf8')), 'konsol betiği yok');
});
