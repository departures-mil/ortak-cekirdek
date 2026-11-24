'use strict';
const test = require('node:test');
const assert = require('node:assert');
const FC = require('./_load')('lan-sync-merge');
const M = FC.lanMerge.merge;
const byId = (r) => Object.fromEntries(r.records.map((x) => [x.id, x]));

test('tek tarafta olan eklenir; aynı içerik çakışma sayılmaz', () => {
  const r = M([{ id: 1, a: 1, updatedAt: 5 }], [{ id: 2, b: 2, updatedAt: 3 }, { id: 1, a: 1, updatedAt: 9 }]);
  assert.strictEqual(r.records.length, 2); assert.strictEqual(r.conflicts.length, 0);
  assert.strictEqual(byId(r)[1].updatedAt, 9);
});
test('çakışmada yeni kalır, eski yedeğe; hiçbiri kaybolmaz', () => {
  const L = [{ id: 'k', ad: 'yerel', updatedAt: '2026-11-20T10:00:00Z' }];
  const R = [{ id: 'k', ad: 'uzak', updatedAt: '2026-11-21T10:00:00Z' }];
  const r = M(L, R);
  assert.strictEqual(byId(r).k.ad, 'uzak');
  assert.deepStrictEqual(r.conflicts, [{ id: 'k', kept: R[0], lost: L[0], keptFrom: 'remote' }]);
  const r2 = M(R, L);   // öbür cihaz aynı sonuca varır
  assert.strictEqual(byId(r2).k.ad, 'uzak'); assert.strictEqual(r2.conflicts[0].keptFrom, 'local');
});
test('eşit zamanda iki cihaz da aynı kaydı seçer', () => {
  const a = { id: 1, v: 'a', updatedAt: 7 }, b = { id: 1, v: 'b', updatedAt: 7 };
  assert.deepStrictEqual(byId(M([a], [b]))[1], byId(M([b], [a]))[1]);
});
test('UZAK SİLME YERELDE SİLMEZ: kayıt arşivlenir, veri korunur', () => {
  const L = [{ id: 1, ad: 'Ali', not: 'önemli', updatedAt: 100 }];
  const R = [{ id: 1, deleted: true, deletedAt: 200, updatedAt: 200 }];
  const r = M(L, R);
  assert.strictEqual(r.records.length, 1);
  const x = r.records[0];
  assert.strictEqual(x.ad, 'Ali'); assert.strictEqual(x.not, 'önemli');
  assert.strictEqual(x.archived, true); assert.strictEqual(x.archivedAt, 200); assert.strictEqual(x.updatedAt, 200);
  assert.strictEqual(x.deleted, undefined);
  assert.strictEqual(r.archived.length, 1); assert.strictEqual(r.archived[0].from, 'remote');
  assert.strictEqual(L[0].archived, undefined, 'girdi değiştirilmemeli');
  // silen cihaz da aynı arşivlenmiş kaydı alır (yakınsama)
  assert.deepStrictEqual(M(R, L).records, r.records);
});
test('silmeden SONRA düzenlenen kayıt canlı kalır', () => {
  const r = M([{ id: 1, ad: 'yeni', updatedAt: 300 }], [{ id: 1, deleted: true, deletedAt: 200 }]);
  assert.strictEqual(r.records[0].archived, undefined); assert.strictEqual(r.archived.length, 0);
});
test('iki tarafta silinmiş / yalnız silme işareti: kayıt yok ama hata da yok', () => {
  assert.deepStrictEqual(M([{ id: 1, deleted: true, updatedAt: 1 }], [{ id: 1, deleted: true, updatedAt: 2 }]).records, []);
  assert.deepStrictEqual(M([], [{ id: 9, deleted: true, updatedAt: 2 }]).records, []);
});
test('arşivlenmiş kayıt sonraki eşitlemelerde arşivli kalır', () => {
  const first = M([{ id: 1, a: 1, updatedAt: 1 }], [{ id: 1, deleted: true, deletedAt: 5 }]).records;
  const again = M(first, [{ id: 1, a: 1, updatedAt: 1 }]);
  assert.strictEqual(again.records[0].archived, true);
});
test('özel anahtar adları ve ISO zaman', () => {
  const r = M([{ key: 'x', ua: '2026-01-01T00:00:00Z', v: 1 }], [{ key: 'x', gone: true, ua: '2026-02-01T00:00:00Z' }], { idKey: 'key', updatedKey: 'ua', deletedKey: 'gone', archivedKey: 'arsiv', archivedAtKey: 'arsivZaman' });
  assert.strictEqual(r.records[0].arsiv, true); assert.strictEqual(r.records[0].arsivZaman, '2026-02-01T00:00:00.000Z'); assert.strictEqual(r.records[0].v, 1);
});
