'use strict';
const test = require('node:test');
const assert = require('node:assert');
const FC = require('./_load')('look', 'onboarding');

test('t: arama, yedek dil, değişken', () => {
  FC.i18n.add({ tr: { 'x.a': 'Merhaba {ad}' }, en: { 'x.a': 'Hello {ad}', 'x.b': 'Only EN' }, ar: {} });
  FC.i18n.set('tr');
  assert.strictEqual(FC.i18n.t('x.a', { ad: 'Ali' }), 'Merhaba Ali');
  FC.i18n.set('ar');
  assert.strictEqual(FC.i18n.t('x.a', { ad: 'Ali' }), 'Hello Ali');   // ar yok → en
  assert.strictEqual(FC.i18n.t('x.b'), 'Only EN');
  assert.strictEqual(FC.i18n.t('yok.anahtar'), 'yok.anahtar');
  assert.strictEqual(FC.i18n.t('x.a', null, 'tr'), 'Merhaba {ad}');
});

test('set: lang/dir, kalıcılık, dinleyici', () => {
  const attrs = {};
  globalThis.document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } };
  let heard = null; const off = FC.i18n.onChange((l) => { heard = l; });
  FC.i18n.set('en'); FC.i18n.set('ar');
  assert.deepStrictEqual(attrs, { lang: 'ar', dir: 'rtl' });
  assert.strictEqual(heard, 'ar');
  assert.strictEqual(FC.storage.get('lang'), 'ar');
  FC.i18n.set('tr'); assert.strictEqual(attrs.dir, 'ltr');
  FC.i18n.set('xx'); assert.strictEqual(FC.i18n.lang(), 'tr');
  off(); delete globalThis.document;
});

test('çekirdek metinleri üç dilde eksiksiz', () => {
  // i18n'in iç sözlüğüne t ile erişip her tr anahtarının en/ar karşılığını denetle
  const src = require('fs').readFileSync(require.resolve('../js/i18n.js'), 'utf8') + require('fs').readFileSync(require.resolve('../js/look.js'), 'utf8');
  const keys = [...new Set([...src.matchAll(/'(fc\.[\w.-]+)':/g)].map((m) => m[1]))];
  assert.ok(keys.length > 150, 'anahtar sayısı ' + keys.length);
  const AR = /[؀-ۿ]/;
  for (const k of keys) {
    for (const l of ['tr', 'en', 'ar']) {
      const v = FC.i18n.t(k, null, l);
      assert.notStrictEqual(v, k, `${l} eksik: ${k}`);
      assert.ok(String(v).trim(), `${l} boş: ${k}`);
    }
    const ar = FC.i18n.t(k, null, 'ar'), en = FC.i18n.t(k, null, 'en');
    if (!/^(fc\.lan|fc\.p\.speed)$/.test(k) && ar === en && !/^v?\{|^[A-Z0-9 -]+$/.test(en)) assert.fail('ar çevrilmemiş: ' + k);
    if (/[a-z]{4,}/i.test(en) && !/^fc\.(lan)$/.test(k)) assert.ok(AR.test(ar), 'ar Arapça değil: ' + k + ' = ' + ar);
  }
});

test('sayı biçimi: tr virgül, ar Batı rakamı', () => {
  assert.strictEqual(FC.i18n.num(1.25, 1, 'tr').replace(/\s/g, ''), '1,3');
  assert.strictEqual(FC.i18n.num(1234.5, 1, 'en'), '1,234.5');
  assert.match(FC.i18n.num(42, 0, 'ar'), /^42$/);
});

test('onboarding: firebaseConfig ayrıştırma (JSON ve kod)', () => {
  const key = 'AIza' + 'B'.repeat(35);
  assert.deepStrictEqual(FC.onboarding.parseFirebase(`{"apiKey":"${key}","projectId":"benim-proje-1"}`), { apiKey: key, projectId: 'benim-proje-1' });
  const code = `const firebaseConfig = {\n  apiKey: "${key}",\n  authDomain: 'x.firebaseapp.com', // yorum\n  projectId: "benim-proje-1",\n  appId: "1:2:web:3",\n};`;
  const c = FC.onboarding.parseFirebase(code);
  assert.strictEqual(c.authDomain, 'x.firebaseapp.com'); assert.strictEqual(c.appId, '1:2:web:3');
  assert.strictEqual(FC.onboarding.parseFirebase('{"apiKey":"nope","projectId":"p"}'), null);
  assert.strictEqual(FC.onboarding.parseFirebase('çöp'), null);
});

test('onboarding: bağlantı denemesi sonuçları', async () => {
  const c = { apiKey: 'AIza' + 'x'.repeat(35), projectId: 'pp-1234' };
  const r = (status, msg) => async () => ({ ok: status === 200, status, json: async () => ({ error: { message: msg } }) });
  assert.strictEqual((await FC.onboarding.testFirebase(c, r(404, 'Document "x" not found.'))).code, 'ok');
  assert.strictEqual((await FC.onboarding.testFirebase(c, r(404, 'The database (default) does not exist for project pp-1234'))).code, 'nodb');
  assert.strictEqual((await FC.onboarding.testFirebase(c, r(403, 'Missing or insufficient permissions.'))).code, 'rules');
  assert.strictEqual((await FC.onboarding.testFirebase(c, r(400, 'API key not valid.'))).code, 'badkey');
  assert.strictEqual((await FC.onboarding.testFirebase(c, async () => { throw new Error('x'); })).code, 'net');
});
