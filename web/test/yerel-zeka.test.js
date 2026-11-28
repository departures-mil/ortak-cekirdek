'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const tar = require('../yerel-zeka/fc-tar');
const FCOCR = require('../yerel-zeka/fc-ocr');
const MT = require('../yerel-zeka/fc-mt');

test('tar: yaz → aç birebir (uzun yol, Türkçe ad, boş klasör)', () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-')), out = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-'));
  const deep = path.join(src, 'node_modules', '@huggingface', 'transformers', 'dist', 'çok-uzun-bir-klasör-adı-'.repeat(3));
  fs.mkdirSync(deep, { recursive: true }); fs.writeFileSync(path.join(deep, 'dosya.cjs'), 'x'.repeat(1000));
  fs.writeFileSync(path.join(src, 'ışık.txt'), 'ğüşiöç'); fs.mkdirSync(path.join(src, 'bos'));
  const big = Buffer.alloc(3 * 1024 * 1024 + 7, 7); fs.writeFileSync(path.join(src, 'buyuk.bin'), big);
  const t = path.join(out, 'a.tar'); tar.pack(src, t); tar.extract(t, path.join(out, 'x'));
  assert.strictEqual(fs.readFileSync(path.join(out, 'x', 'ışık.txt'), 'utf8'), 'ğüşiöç');
  assert.ok(fs.readFileSync(path.join(out, 'x', 'buyuk.bin')).equals(big));
  assert.ok(fs.existsSync(path.join(out, 'x', path.relative(src, deep), 'dosya.cjs')));
  assert.ok(fs.statSync(path.join(out, 'x', 'bos')).isDirectory());
  const t2 = path.join(out, 'b.tar'); tar.pack(src, t2); assert.ok(fs.readFileSync(t).equals(fs.readFileSync(t2)), 'kararlı çıktı');
});

test('tar: klasör dışına yazmaz', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tar-')), h = Buffer.alloc(512);
  h.write('../kacak.txt', 0); h.write('0000644\0', 100); h.write('00000000001\0', 124); h.write('0', 156); h.write('ustar\0', 257);
  fs.writeFileSync(path.join(d, 'k.tar'), Buffer.concat([h, Buffer.alloc(512, 65), Buffer.alloc(1024)]));
  assert.throws(() => tar.extract(path.join(d, 'k.tar'), path.join(d, 'x')), /geçersiz yol/);
});

test('OCR: döndürülmüş dikdörtgen ve Arapça sıra', () => {
  const pts = []; for (let x = 0; x < 100; x++) for (let y = 0; y < 10; y++) pts.push([x, y]);
  const r = FCOCR._t.minAreaRect(pts);
  assert.ok(Math.abs(r.w - 100) < 1.5 && Math.abs(r.h - 10) < 1.5 && Math.abs(r.uy) < 0.01);
  // model görsel sırada verir: "ش ي ر" → mantıksal "ريش"; rakamlar yerinde kalır
  assert.strictEqual(FCOCR._t.arabicLogical('2025 خيرات'), 'تاريخ 2025');
});

test('MT: bellek birebir, terim bulma, cümle bölme, dil sezme', () => {
  const m = new MT.Memory(); m.load([['iniş takımı', 'landing gear', 'جهاز الهبوط'], ['pist', 'runway', 'المدرج']]);
  assert.strictEqual(m.exact('İniş takımı.', 'tr', 'en'), 'landing gear');
  assert.strictEqual(m.exact('LANDING GEAR', 'en', 'ar'), 'جهاز الهبوط');
  assert.deepStrictEqual(m.termsIn('Pilot iniş takımı ve pist ışıklarını kontrol eder', 'tr').map((e) => e[1]).sort(), ['landing gear', 'runway']);
  const s = MT.sentences('Birinci cümle. İkinci cümle!\n\nÜçüncü satır');
  assert.strictEqual(s.length, 5); assert.strictEqual(s[0].segs.length, 2);
  assert.strictEqual(MT.detect('مرحبا'), 'ar'); assert.strictEqual(MT.detect('Uçuş öncesi'), 'tr'); assert.strictEqual(MT.detect('Before flight'), 'en');
});
