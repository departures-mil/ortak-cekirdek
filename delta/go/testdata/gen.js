#!/usr/bin/env node
/* Go testlerinin küçük, depoda duran FCD1 vektörleri (belirlenimci). node delta/go/testdata/gen.js [klasör] */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const fcdelta = require('../../node/fcdelta.js');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
let seed = 1;
const rnd = (n) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i += 32) crypto.createHash('sha256').update('g' + seed++).digest().copy(b, i, 0, Math.min(32, n - i)); return b; };
const text = (n) => { const w = ['güncelleme', 'kayıt', 'function', 'const', 'falcon', '{', '}', '\n']; let s = '', i = 0; while (s.length < n) s += w[(i * 7 + (i >> 2)) % w.length] + ' ', i++; return Buffer.from(s.slice(0, n)); };
(async () => {
  const a = text(30000);
  const cases = {
    'bos-abc': [Buffer.alloc(0), Buffer.from('abc')],
    metin: [a, Buffer.concat([a.subarray(0, 9000), Buffer.from('YENİ SATIR\n'.repeat(20)), a.subarray(9500, 25000), Buffer.from('son')])],
    ayni: [a, Buffer.from(a)],
    farkli: [rnd(3000), rnd(4000)]
  };
  for (const [n, [s, d]] of Object.entries(cases)) {
    const p = path.join(OUT, n);
    fs.writeFileSync(p + '.src', s); fs.writeFileSync(p + '.dst', d);
    const patch = await fcdelta.make(s, d);
    if (!Buffer.from(fcdelta.apply(s, patch)).equals(d)) throw new Error(n);
    fs.writeFileSync(p + '.bin', patch);
  }
  console.log('vektörler:', Object.keys(cases).join(' '));
})().catch((e) => { console.error(e); process.exit(1); });
