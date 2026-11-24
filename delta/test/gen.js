'use strict';
// Test dosyaları üretir: node gen.js <dir> [big]
// Her durum için <dir>/<ad>.old ve <dir>/<ad>.new yazar; listeyi stdout'a basar.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const dir = process.argv[2];
const big = process.argv[3] === 'big';
fs.mkdirSync(dir, { recursive: true });

// Deterministik rastgele (tekrarlanabilir testler)
let seed = 12345;
function rnd(n) {
  const out = Buffer.allocUnsafe(n);
  for (let i = 0; i < n; i += 32) {
    const h = crypto.createHash('sha256').update(String(seed++)).digest();
    h.copy(out, i, 0, Math.min(32, n - i));
  }
  return out;
}
function text(n, tag) {
  const words = ['güncelleme', 'falcon', 'ofis', 'kitaplık', 'mahzen', 'bereket', 'ajanda', 'function', 'return', 'const', tag];
  let s = '';
  let i = 0;
  while (s.length < n) s += words[(i * 7 + (i >> 3)) % words.length] + (i++ % 13 === 0 ? '\n' : ' ');
  return Buffer.from(s.slice(0, n));
}
const cases = [];
function put(name, oldB, newB) {
  fs.writeFileSync(path.join(dir, name + '.old'), oldB);
  fs.writeFileSync(path.join(dir, name + '.new'), newB);
  cases.push(name);
}

// asar benzeri: 4+4 bayt + JSON başlık + dosyalar arka arkaya
function asar(files) {
  let off = 0;
  const hdr = { files: {} };
  for (const [n, b] of files) { hdr.files[n] = { size: b.length, offset: String(off) }; off += b.length; }
  const j = Buffer.from(JSON.stringify(hdr));
  const pre = Buffer.alloc(16);
  pre.writeUInt32LE(4, 0); pre.writeUInt32LE(j.length + 8, 4); pre.writeUInt32LE(j.length + 4, 8); pre.writeUInt32LE(j.length, 12);
  return Buffer.concat([pre, j, ...files.map((f) => f[1])]);
}
// zip benzeri: yerel başlık + deflate edilmiş içerik + merkezi dizin (gerçek zip değil, ama yapısı benzer)
function ziplike(files) {
  const parts = [], central = [];
  let off = 0;
  for (const [n, b] of files) {
    const comp = zlib.deflateRawSync(b, { level: 6 });
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(b.length, 22); h.writeUInt16LE(n.length, 26);
    parts.push(h, Buffer.from(n), comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt32LE(off, 42);
    central.push(c, Buffer.from(n));
    off += 30 + n.length + comp.length;
  }
  return Buffer.concat([...parts, ...central, Buffer.from('PK\x05\x06' + '\0'.repeat(18))]);
}

const R = rnd(4 * 1024 * 1024);
put('identical', R, R);
put('empty-both', Buffer.alloc(0), Buffer.alloc(0));
put('empty-to-data', Buffer.alloc(0), rnd(100000));
put('data-to-empty', rnd(50000), Buffer.alloc(0));
put('tiny', Buffer.from('merhaba dünya'), Buffer.from('merhaba güzel dünya!'));
put('insert-middle', R, Buffer.concat([R.subarray(0, 1500000), rnd(3333), R.subarray(1500000)]));
put('delete-middle', R, Buffer.concat([R.subarray(0, 1000000), R.subarray(1200000)]));
put('append', R, Buffer.concat([R, rnd(70000)]));
put('prepend', R, Buffer.concat([rnd(10), R]));
{
  const m = Buffer.from(R);
  for (let i = 0; i < 40; i++) m[(i * 104729 * 7) % m.length] ^= 0xFF; // dağınık bayt değişiklikleri
  put('scattered-bytes', R, m);
}
put('all-different', rnd(1000000), rnd(1000000));
put('reorder', R, Buffer.concat([R.subarray(2000000), R.subarray(0, 2000000)]));
{
  const T = text(3000000, 'v1');
  const T2 = Buffer.from(T.toString().replace(/kitaplık/g, 'KİTAPLIK').slice(0, 2900000) + 'yeni satır\n');
  put('text-edit', T, T2);
}
{
  const files = [];
  for (let i = 0; i < 40; i++) files.push([`dist/f${i}.js`, i % 3 ? text(40000 + i * 997, 'f' + i) : rnd(30000 + i * 101)]);
  const files2 = files.map(([n, b], i) => [n, i === 17 ? Buffer.concat([b, text(5000, 'yeni')]) : b]);
  files2.splice(5, 0, ['dist/new-module.js', text(12345, 'nm')]);
  put('asar-like', asar(files), asar(files2));
  put('zip-like', ziplike(files), ziplike(files2));
}
if (big) {
  // 100 MB: asar benzeri, ortada birkaç dosya değişmiş + sonda ek
  const n = 100;
  const files = [];
  for (let i = 0; i < n; i++) files.push([`res/r${i}.bin`, rnd(1024 * 1024)]);
  const files2 = files.map(([nm, b], i) => [nm, i % 30 === 7 ? Buffer.concat([b.subarray(0, 500000), rnd(20000), b.subarray(510000)]) : b]);
  files2.push(['res/extra.bin', rnd(300000)]);
  put('big-100mb', asar(files), asar(files2));
}
console.log(cases.join('\n'));
