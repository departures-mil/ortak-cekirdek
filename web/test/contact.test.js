'use strict';
const test = require('node:test');
const assert = require('node:assert');
const FC = require('./_load')('contact');
const posts = []; let up = false;
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
FC.contact.init({ app: 'demo', version: '1.2.3', fetch: async (url, o) => { posts.push([url, JSON.parse(o.body)]); if (!up) throw new Error('offline'); return { ok: true, json: async () => ({ success: 'true' }) }; } });

test('SPEC alanları stringValue olarak gider; çevrimdışıysa kuyruk, sonra boşaltılır', async () => {
  assert.strictEqual(await FC.contact.send({ tur: 'hata', mesaj: 'Düğme çalışmıyor', iletisim: 'x@y.z' }), 'queued');
  assert.strictEqual(FC.contact.queue().length, 1);
  const inbox = posts.find((p) => /comm-calc-103111111\/databases\/\(default\)\/documents\/mesajlar/.test(p[0]));
  const f = inbox[1].fields;
  for (const k of ['tur', 'uygulama', 'surum', 'platform', 'dil', 'mesaj', 'iletisim', 'zaman', 'cihaz']) assert.ok(f[k] && typeof f[k].stringValue === 'string', k);
  assert.strictEqual(f.tur.stringValue, 'hata'); assert.strictEqual(f.surum.stringValue, '1.2.3'); assert.match(f.cihaz.stringValue, /^[0-9a-f]{18}$/);
  assert.ok(posts.some((p) => /formsubmit\.co/.test(p[0])), 'kullanıcı mesajında yedek denenmeli');
  up = true; await FC.contact.flush();
  assert.strictEqual(FC.contact.queue().length, 0);
});
test('çökme raporu e-posta yedeğine gitmez', async () => {
  up = false; posts.length = 0;
  await FC.contact.post({ tur: 'cokme', mesaj: 'x' }, { mail: false });
  assert.ok(!posts.some((p) => /formsubmit/.test(p[0])));
  assert.ok(!JSON.stringify(posts).includes('@'), 'e-posta adresi düz metin geçmemeli');
});
