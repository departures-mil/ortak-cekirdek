'use strict';
const test = require('node:test');
const assert = require('node:assert');
const FC = require('./_load')('progress');
const P = FC.progress, MB = 1048576;
const sp = (s) => s.replace(/\u00a0/g, ' ');

test('tracker: yüzde, kalan, hız (kayan pencere)', () => {
  let t = 0; const tr = P.tracker(10 * MB, () => t);
  t = 1000; let p = tr.update(2 * MB);
  assert.strictEqual(p.pct, 20); assert.strictEqual(p.remaining, 8 * MB); assert.strictEqual(p.speed, 2 * MB);
  t = 5000; p = tr.update(6 * MB);   // eski örnekler düşer: son 3 sn'lik pencere
  assert.strictEqual(Math.round(p.speed), 1 * MB);
  t = 5100; p = tr.update(10 * MB, true); assert.ok(p.finished); assert.strictEqual(p.pct, 100);
});
test('format: tr / en / ar, tam ve yama kipi', () => {
  const p = { done: 1.25 * MB, total: 3 * MB, pct: 41.6, remaining: 1.75 * MB, speed: 1.8 * MB, finished: false };
  assert.strictEqual(sp(P.format(p, { lang: 'tr' }).detail), '%41 · 1,3 MB / 3,0 MB · kalan 1,8 MB · 1,8 MB/sn');
  assert.strictEqual(sp(P.format(p, { lang: 'en' }).detail), '41% · 1.3 MB / 3.0 MB · 1.8 MB left · 1.8 MB/s');
  const ar = P.format(p, { lang: 'ar', patch: true });
  assert.strictEqual(sp(ar.detail), '41% · 1.3 MB / 3.0 MB · متبقٍّ 1.8 MB · 1.8 م.ب/ث');
  assert.strictEqual(ar.modeText, 'الأجزاء المتغيرة فقط');
  assert.strictEqual(P.format(p, { lang: 'tr', patch: true }).modeText, 'yalnızca değişen kısımlar');
  assert.strictEqual(P.format(p, { lang: 'en', patch: true }).modeText, 'changed parts only');
  assert.strictEqual(P.format(p, { lang: 'tr' }).modeText, '');
  assert.match(P.format(Object.assign({}, p, { speed: 0 }), { lang: 'tr' }).detail, /hız hesaplanıyor/);
  assert.strictEqual(P.format({ done: 5, total: 0, pct: 0, speed: 0 }, { lang: 'en' }).percent, null);
});
test('download: parça parça okur, ilerleme bildirir, toplamı manifestten alır', async () => {
  const chunks = [new Uint8Array(400), new Uint8Array(600)];
  const f = async () => ({ ok: true, status: 200, headers: { get: (h) => (h === 'content-encoding' ? 'gzip' : h === 'content-length' ? '10' : null) },
    body: { getReader() { let i = 0; return { read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }) }; } } });
  const seen = [];
  const out = await P.download('https://x/y', { fetch: f, total: 1000, onProgress: (p) => seen.push(p) });
  assert.strictEqual(out.length, 1000);
  assert.strictEqual(seen[seen.length - 1].finished, true); assert.strictEqual(seen[seen.length - 1].total, 1000);
  await assert.rejects(P.download('u', { fetch: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
});
