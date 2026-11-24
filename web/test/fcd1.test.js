'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { applyFcd1, makeFcd1 } = require('../electron/fcd1.js');

test('FCD1: kopya + yeni veri, doğrulama', () => {
  const oldB = Buffer.from('AAAAABBBBBCCCCC'), newB = Buffer.from('AAAAAxyzCCCCC!');
  const p = makeFcd1(oldB, newB, [['copy', 0, 5], ['data', 'xyz'], ['copy', 10, 5], ['data', '!']]);
  assert.deepStrictEqual(applyFcd1(oldB, p), newB);
  assert.throws(() => applyFcd1(Buffer.from('baska dosya'), p), /PATCH_SOURCE_MISMATCH/);
  const bad = makeFcd1(oldB, newB, [['copy', 0, 5], ['data', 'xyZ'], ['copy', 10, 5], ['data', '!']]);
  assert.throws(() => applyFcd1(oldB, bad), /PATCH_RESULT_MISMATCH/);
  assert.throws(() => applyFcd1(oldB, Buffer.from('NOPE')), /PATCH_BAD_MAGIC/);
});

test('FCD1: FORMAT.md §6 test vektörü (boş kaynak → "abc")', () => {
  const zlib = require('zlib'), crypto = require('crypto');
  const h = (b) => crypto.createHash('sha256').update(b).digest();
  const hdr = Buffer.alloc(85); hdr.write('FCD1', 0, 'latin1'); hdr[4] = 1; h(Buffer.alloc(0)).copy(hdr, 13); hdr.writeBigUInt64LE(3n, 45); h(Buffer.from('abc')).copy(hdr, 53);
  const patch = Buffer.concat([hdr, zlib.deflateSync(Buffer.from([2, 3, 0x61, 0x62, 0x63, 0]))]);
  assert.strictEqual(applyFcd1(Buffer.alloc(0), patch).toString(), 'abc');
  const badCodec = Buffer.from(patch); badCodec[4] = 2;
  assert.throws(() => applyFcd1(Buffer.alloc(0), badCodec), /PATCH_BAD_CODEC/);
  assert.throws(() => applyFcd1(Buffer.alloc(0), Buffer.concat([patch, Buffer.from([0])])), /PATCH_TRAILING_DATA/);
});

test('FCD1: başvuru üreticisiyle (delta/node/fcdelta.js) uyum — varsa', async (t) => {
  let ref; try { ref = require('/home/claude/ortak-cekirdek/delta/node/fcdelta.js'); } catch (e) { return t.skip('başvuru uygulaması yok'); }
  const crypto = require('crypto');
  const oldB = crypto.randomBytes(300000), newB = Buffer.concat([oldB.slice(0, 120000), crypto.randomBytes(5000), oldB.slice(125000)]);
  const p = await ref.make(oldB, newB);
  assert.ok(Buffer.from(p.patch || p).length < newB.length / 2);
  assert.deepStrictEqual(applyFcd1(oldB, Buffer.from(p.patch || p)), newB);
});
