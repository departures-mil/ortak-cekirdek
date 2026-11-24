'use strict';
const test = require('node:test');
const assert = require('node:assert');
const FC = require('./_load')('contact', 'crash');
const sent = [];
FC.contact.post = (o, opt) => { sent.push([o, opt]); return Promise.resolve('sent'); };
let now = new Date('2026-11-24T10:00:00Z');
FC.crash._config({ app: 'demo', version: '1.0.0', now: () => now });
const E = (m, s) => ({ message: m, stack: 'Error: ' + m + '\n    at f (app.js:1:2)\n    at g (app.js:3:4)' + (s || '') });

test('aynı imza bir kez; günde en çok 5', () => {
  assert.strictEqual(FC.crash.report(E('boom')), true);
  assert.strictEqual(FC.crash.report(E('boom')), false);
  for (let i = 1; i <= 4; i++) assert.strictEqual(FC.crash.report(E('hata ' + i)), true);
  assert.strictEqual(FC.crash.report(E('hata 5')), false, '6. rapor gitmemeli');
  assert.strictEqual(sent.length, 5);
  assert.strictEqual(sent[0][0].tur, 'cokme'); assert.deepStrictEqual(sent[0][1], { mail: false });
  now = new Date('2026-11-25T10:00:00Z');
  assert.strictEqual(FC.crash.report(E('hata 5')), true, 'yeni gün sayaç sıfırlanır');
  assert.strictEqual(FC.crash.report(E('boom')), false, 'görülmüş imza yeni günde de gitmez');
});
test('satır/sütun farkı imzayı değiştirmez; gürültü yok sayılır', () => {
  const a = FC.crash._signature('x is undefined', 'Error\n at f (a.js:1:2)\n at g (a.js:3:4)');
  const b = FC.crash._signature('x is undefined', 'Error\n at f (a.js:9:9)\n at g (a.js:8:8)');
  assert.strictEqual(a, b);
  assert.strictEqual(FC.crash.report({ message: 'ResizeObserver loop limit exceeded' }), false);
  assert.strictEqual(FC.crash.report({ message: 'TypeError: Failed to fetch' }), false);
});
test('kullanıcı verisi maskelenir', () => {
  const s = FC.crash._sanitize('ali.veli@ornek.com C:\\Users\\Ahmet\\AppData\\x.js file:///C:/Users/Ahmet/a.js /home/zeynep/app https://x.com/a?token=SECRET 05321234567 JSON "Ayşe Yılmaz, TC 123" (reading \'name\')');
  for (const bad of ['ali.veli', 'Ahmet', 'zeynep', 'SECRET', '05321234567', 'Ayşe']) assert.ok(!s.includes(bad), bad + ' sızdı: ' + s);
  assert.ok(s.includes("'name'"), 'tanımlayıcılar kalmalı');
});
test('kapatılınca gönderilmez', () => {
  FC.storage.set('crash.enabled', false);
  assert.strictEqual(FC.crash.report(E('kapalıyken')), false);
  FC.storage.set('crash.enabled', true);
});
