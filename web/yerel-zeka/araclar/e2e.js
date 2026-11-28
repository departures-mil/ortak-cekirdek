#!/usr/bin/env node
/* Uçtan uca deneme (CI): paket klasörünü yerel http ile sunar, ana süreç modülüyle indirip kurar (ilerleme + SHA-256),
   iş parçacığında OCR ve çeviri yapar, sonuçları yazdırır ve temel doğrulamaları yapar.
   node e2e.js <paket-klasörü> [ocr] [mt]      (sharp: test görüntüsünü çözmek için) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const DIR = path.resolve(process.argv[2]), want = process.argv.slice(3).length ? process.argv.slice(3) : ['ocr', 'mt'];
const sharp = require(require.resolve('sharp', { paths: [process.cwd()] }));
const srv = http.createServer((q, r) => {
  const f = path.join(DIR, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  const st = fs.statSync(f), rg = q.headers.range && /bytes=(\d+)-/.exec(q.headers.range);
  if (rg) { const s = +rg[1]; r.writeHead(206, { 'content-length': st.size - s }); fs.createReadStream(f, { start: s }).pipe(r); }
  else { r.writeHead(200, { 'content-length': st.size }); fs.createReadStream(f).pipe(r); }
});
let fail = 0; const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fail++; };
srv.listen(0, async () => {
  const user = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-e2e-')), H = {};
  const api = require('../fc-yerel-zeka-main').install({ app: { getPath: () => user, on() {} }, ipcMain: { handle: (n, f) => { H[n] = f; } }, releaseUrl: `http://127.0.0.1:${srv.address().port}/` });
  let last = 0; const sender = { isDestroyed: () => false, send: (ch, d) => { if (d.phase !== 'indiriliyor' || Date.now() - last > 2000) { last = Date.now(); console.log('  ilerleme', JSON.stringify(d)); } } };
  const t0 = Date.now(); await H['fcyz:kur']({ sender }, want); console.log('kurulum', ((Date.now() - t0) / 1000).toFixed(1) + ' sn');
  const st = await H['fcyz:durum']({ sender }); check(want.every((w) => st.packs[w].installed), 'paketler kurulu: ' + want.join(', '));
  if (want.includes('ocr')) for (const [img, exp] of [['belge.png', ['88213470', '١٢٥٠٠٠٠', 'Ayşe Yılmaz', 'takımı', 'AGL']], ['belge-zor.jpg', ['88213470', '١٢٥٠٠٠٠', 'Yılmaz']]]) {
    const { data, info } = await sharp(path.join(__dirname, '..', 'test', img)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const r = await H['fcyz:ocr']({}, { data: new Uint8Array(data), width: info.width, height: info.height });
    console.log(`OCR ${img} (${r.ms} ms):\n${r.text}`);
    for (const e of exp) check(r.text.includes(e), `OCR ${img} içinde "${e}"`);
  }
  if (want.includes('mt') || want.includes('llm')) {
    const memory = [['iniş takımı', 'landing gear', 'جهاز الهبوط'], ['pist', 'runway', 'المدرج'], ['insansız hava aracı', 'unmanned aerial vehicle', 'طائرة بدون طيار']];
    const cases = [
      ['tr', 'en', 'Pilot, kalkıştan önce iniş takımını ve yakıt miktarını kontrol etmelidir.'],
      ['tr', 'ar', 'Kule, uçağa 27 numaralı pistten kalkış izni verdi.'],
      ['tr', 'ar', 'İnsansız hava aracının pusula kalibrasyonu her uçuştan önce yapılmalıdır.'],
      ['en', 'tr', 'The student must complete the pre-flight checklist before engine start.'],
      ['en', 'ar', 'Maintain visual meteorological conditions and report position every five minutes.'],
      ['ar', 'tr', 'يجب على الطيار التحقق من نظام الهبوط قبل الإقلاع.'],
      ['ar', 'en', 'تم استلام المبلغ من حساب شام كاش.'],
      ['tr', 'en', 'iniş takımı'],
    ];
    const engines = [want.includes('llm') ? true : null, want.includes('mt') ? false : null].filter((x) => x !== null);
    for (const llm of engines) for (const [ci, [f, t, s]] of cases.entries()) {
      if (ci === 0) await H['fcyz:ayar']({}, {}); // iş parçacığını yenile: önceki model bellekten çıksın
      const a = Date.now(), r = await H['fcyz:cevir']({}, { text: s, from: f, to: t, memory, ollama: false, llm });
      console.log(`MT ${f}→${t} [${r.engine}, ${Date.now() - a} ms]\n  ${s}\n  → ${r.text}`);
      check(r.text && r.text.trim() && r.text !== s, `${f}→${t} boş değil`);
      if (llm && s.split(' ').length > 2) check(/^translategemma/.test(r.engine), 'TranslateGemma kullanıldı');
      if (t === 'ar') check(/[؀-ۿ]/.test(r.text), 'Arapça yazı');
      if (t === 'en') check(/^[\x00-\x7F’“”—–\s]+$/.test(r.text), 'İngilizce (Latin)');
    }
    const r = await H['fcyz:cevir']({}, { text: 'iniş takımı', from: 'tr', to: 'ar', memory, ollama: false });
    check(r.text === 'جهاز الهبوط' && r.engine === 'bellek', 'terim sözlüğü birebir');
    for (const llm of engines) {
      const ml = await H['fcyz:cevir']({}, { text: 'Uçuş 1: Isınma.\n\nUçuş 2: Askıda kalma testi.', from: 'tr', to: 'en', ollama: false, llm });
      console.log(`çok satırlı [${ml.engine}] →\n` + ml.text); check(ml.text.split('\n').length === 3, 'satır yapısı korunur');
    }
  }
  srv.close(); console.log(fail ? `\n${fail} doğrulama BAŞARISIZ` : '\nTüm doğrulamalar geçti'); process.exit(fail ? 1 : 0);
});
