'use strict';
const test = require('node:test');
const assert = require('node:assert');
let clock = new Date(2026, 10, 24, 10, 0, 0).getTime();
const FC = require('./_load')('agent');
const A = FC.agent;
const calls = [];
let aiReply = null;
const fakeFetch = async (url, o) => {
  calls.push([url, o]);
  if (/generativelanguage/.test(url)) { if (!aiReply) return { ok: false, status: 500 }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: aiReply }] } }] }) }; }
  return { ok: false, status: 404 };
};
A.start({ app: 'kitaplik', version: '2.5.0', now: () => new Date(clock), fetch: fakeFetch, timers: false });
const DAY = 86400000;
function work(min, hour) { for (let i = 0; i < min; i++) { A._input(); A._tick(); clock += 60000; } }

test('etkin dakika, oturum ve eylemler sayılır; içerik maskelenir', () => {
  work(10);
  A.track('Kaydet'); A.track('Kaydet'); A.track('ali@ornek.com 12.500 TL');
  const s = A.summary();
  assert.strictEqual(s.tot.w, 10);
  assert.strictEqual(s.apps.kitaplik.a.Kaydet, 2);
  assert.ok(!JSON.stringify(s).includes('ali@ornek.com'));
  assert.ok(!JSON.stringify(s).includes('12.500'));
  assert.strictEqual(A._clean('x'.repeat(80)).length, 40);
});

test('boşta (girdi yok) süre sayılmaz', () => {
  const before = A.summary().tot.w;
  clock += 10 * 60000; A._tick(); A._tick();
  assert.strictEqual(A.summary().tot.w, before);
});

test('diğer uygulamaların kayıtları birleşir, yeni olan kalır, kendi kaydımız ezilmez', () => {
  const d = {}; d[new Date(clock).getFullYear() + '-11-24'] = { act: 300, ses: 4, a: {}, h: [], err: 0 };
  assert.strictEqual(A.importShare({ sources: [{ app: 'mahzen', dev: 'x1', u: 5, days: d }] }), 1);
  assert.strictEqual(A.importShare({ sources: [{ app: 'mahzen', dev: 'x1', u: 3, days: {} }] }), 0, 'eski kayıt yeniyi ezmemeli');
  const me = A.exportShare().sources[0];
  assert.strictEqual(A.importShare({ sources: [Object.assign({}, me, { u: me.u + 999, days: {} })] }), 0);
  const s = A.summary();
  assert.strictEqual(s.apps.mahzen.w, 300);
  assert.ok(A.knownApps().includes('mahzen'));
  assert.ok(A.rules(s).some((r) => r.id === 'top'), 'en çok kullanılan uygulama yorumu');
});

test('izlenecek uygulama seçimi analize uyar', () => {
  A.configure({ apps: ['kitaplik'] });
  assert.ok(!A.summary().apps.mahzen);
  A.configure({ apps: null });
  assert.ok(A.summary().apps.mahzen);
});

test('kurallar: gece çalışması, uzun oturum, tekrar eden işlem, açık iş', () => {
  clock = new Date(2026, 10, 25, 23, 0, 0).getTime();
  work(100);
  for (let i = 0; i < 35; i++) A.track('Kitap ekle');
  A.task('t1', 'start', 'Envanter');
  clock += 4 * DAY;
  const ids = A.rules().map((r) => r.id);
  for (const id of ['night', 'break', 'rep:kitaplik', 'tasks']) assert.ok(ids.includes(id), id + ' bekleniyordu: ' + ids);
  A.task('t1', 'done');
  assert.ok(!A.rules().some((r) => r.id === 'tasks'));
});

test('analiz: çevrim dışı yorum + kullanıcının kendi AI anahtarı; tekrar eden yorum yazılmaz; günlük AI sınırı', async () => {
  FC.storage.set('ai', { provider: 'gemini', key: 'K' });
  aiReply = '```json\n["Molaları planlayın.","Şablon kullanın."]\n```';
  const f1 = await A.analyze(true);
  assert.ok(f1.some((n) => n.src === 'offline'));
  assert.ok(f1.some((n) => n.src === 'ai' && A.noteText(n) === 'Molaları planlayın.'));
  const gem = calls.find((c) => /generativelanguage/.test(c[0]));
  assert.ok(!gem[1].body.includes('ali@'), 'AI\'a içerik gitmemeli');
  const f2 = await A.analyze(true);
  assert.ok(!f2.some((n) => n.src === 'offline' && f1.some((m) => m.sig === n.sig)), 'aynı yorum 3 gün içinde tekrar edilmemeli');
  const dd = new Date(clock); FC.storage.set('agent.ai', { d: dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0') + '-' + String(dd.getDate()).padStart(2, '0'), n: 99 });
  const before = calls.filter((c) => /generativelanguage/.test(c[0])).length;
  await A.analyze(true);
  assert.strictEqual(calls.filter((c) => /generativelanguage/.test(c[0])).length, before, 'sınır dolunca AI çağrılmamalı');
});

test('AI hata verirse çevrim dışı yorumlarla sürer', async () => {
  FC.storage.remove('agent.ai'); aiReply = null; clock += 4 * DAY; work(5);
  const f = await A.analyze(true);
  assert.ok(f.every((n) => n.src === 'offline'));
});

test('sıklık: manuel asla kendiliğinden çalışmaz; günlük günde bir', () => {
  FC.storage.set('agent.lastRun', clock);
  assert.strictEqual(A._due({ freq: 'manual' }), false);
  assert.strictEqual(A._due({ freq: 'daily' }), false);
  clock += DAY;
  assert.strictEqual(A._due({ freq: 'daily' }), true);
  assert.strictEqual(A._due({ freq: 'weekly' }), false);
});

test('üç dilde tüm anahtarlar var', () => {
  const keys = ['fc.agent.title', 'fc.agent.r.night', 'fc.agent.r.repeat', 'fc.agent.freq.manual', 'fc.agent.privacy', 'fc.agent.panel'];
  for (const l of ['tr', 'en', 'ar']) for (const k of keys) assert.notStrictEqual(FC.t(k, {}, l), k, l + ' ' + k);
  const n = A.rules()[0]; FC.i18n.set('ar'); assert.ok(/[؀-ۿ]/.test(A.noteText(n))); FC.i18n.set('tr');
});

test('agent kapalıyken hiçbir şey sayılmaz', () => {
  A.configure({ on: false });
  const w = A.summary().tot.w; work(5); A.track('X');
  assert.strictEqual(A.summary().tot.w, w);
  A.configure({ on: true });
});
