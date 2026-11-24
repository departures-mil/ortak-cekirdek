'use strict';
const test = require('node:test');
const assert = require('node:assert');
const FC = require('./_load')('progress', 'updater', 'whatsnew', 'init');
const W = FC.whatsnew;

/* DOM'suz en küçük FC.ui: modal gövdesindeki metinleri toplar */
const shown = [];
function el(tag, o, kids) { return { tag, text: (o && o.text) || '', kids: [], appendChild(c) { this.kids.push(c); } }; }
function texts(n) { return [n.text].concat(...n.kids.map(texts)).filter(Boolean); }
FC.ui = { el, icon: () => '', esc: (s) => s, modal: (o) => { shown.push({ title: o.title, body: texts(o.body).join(' | ') }); return {}; } };
FC.look = FC.look || { init() {} };
const tick = () => new Promise((r) => setTimeout(r, 5));

test('shouldShow: ilk kurulum/aynı/eski → hayır; yeni ya da semver olmayan eski değer → evet', () => {
  assert.strictEqual(W.shouldShow('1.2.0', null), false);
  assert.strictEqual(W.shouldShow('1.2.0', '1.2.0'), false);
  assert.strictEqual(W.shouldShow('1.2.0', '1.3.0'), false);
  assert.strictEqual(W.shouldShow('1.3.0', '1.2.0'), true);
  assert.strictEqual(W.shouldShow('3.9.0', '3.3'), true);
  assert.strictEqual(W.shouldShow('3.9.0', 3.3), true);
  assert.strictEqual(W.shouldShow('2.2.0', '2.1.0.4'), true);
});
test('FC.init({whatsnew:{notes}}): notlar iletilir; eski "3.3" görüldü değeri pencereyi açar', async () => {
  FC.i18n.set('tr'); FC.storage.set('whatsnew.seen', '3.3');
  FC.init({ app: 'demo', version: '3.9.0', update: false, crash: false, agent: false, whatsnew: { delayMs: 0, notes: (v) => (v === '3.9.0' ? { tr: 'Yeni A\nYeni B', en: 'New' } : null) } });
  await tick();
  assert.strictEqual(shown.length, 1);
  assert.match(shown[0].body, /Yeni A \| Yeni B/);
  assert.strictEqual(FC.storage.get('whatsnew.seen'), '3.9.0');
  // aynı sürüm tekrar açılınca pencere yok
  FC.init({ app: 'demo', version: '3.9.0', update: false, crash: false, agent: false, whatsnew: { delayMs: 0, notes: { tr: 'x' } } });
  await tick();
  assert.strictEqual(shown.length, 1);
  // whatsnew:false → hiç bakılmaz
  FC.storage.set('whatsnew.seen', '1.0.0');
  FC.init({ app: 'demo', version: '4.0.0', update: false, crash: false, agent: false, whatsnew: false });
  await tick();
  assert.strictEqual(shown.length, 1); assert.strictEqual(FC.storage.get('whatsnew.seen'), '1.0.0');
});
