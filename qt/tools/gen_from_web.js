#!/usr/bin/env node
/* Web çekirdeğinden Qt paketine OTOMATİK üretilen dosyalar (iki taraf aynı kaynaktan beslenir):
     fccore/tokens.py   ← web/tools/schemes.js   (TOKENS, SCHEMES)
     fccore/_strings.py ← web/js/i18n.js + look.js (çekirdek metinleri tr/en/ar)
     fccore/_icons.py   ← web/js/ui.js (SVG yolları)
     tests/fixtures/web_*.json ← parite testleri (node olmadan da çalışsın diye)
   Kullanım: node tools/gen_from_web.js [web klasörü]          (yazar)
             node tools/gen_from_web.js [web klasörü] --check  (güncel değilse çıkış 1)
   web klasörü verilmezse: ../web (ortak-cekirdek/qt yerleşimi), sonra /home/claude/ortak-cekirdek/web */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
function webDir() {
  const a = args.find((x) => !x.startsWith('--'));
  for (const c of [a, process.env.FC_WEB_DIR, path.join(ROOT, '..', 'web'), '/home/claude/ortak-cekirdek/web']) if (c && fs.existsSync(path.join(c, 'tools', 'schemes.js'))) return path.resolve(c);
  console.error('web çekirdeği bulunamadı'); process.exit(2);
}
const WEB = webDir();
const { TOKENS, SCHEMES } = require(path.join(WEB, 'tools', 'schemes.js'));
for (const n of ['storage', 'i18n', 'ui', 'look', 'progress', 'lan-sync-merge']) require(path.join(WEB, 'js', n + '.js'));
const FC = globalThis.FC;

/** JS değeri → Python sabiti (dizelere dokunmadan) */
function py(v, ind) {
  ind = ind || '';
  const n = ind + ' ';
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True'; if (v === false) return 'False';
  if (typeof v === 'number' || typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return v.length ? '[\n' + v.map((x) => n + py(x, n)).join(',\n') + '\n' + ind + ']' : '[]';
  const k = Object.keys(v);
  return k.length ? '{\n' + k.map((x) => n + JSON.stringify(x) + ': ' + py(v[x], n)).join(',\n') + '\n' + ind + '}' : '{}';
}
const HEAD = (src) => `# -*- coding: utf-8 -*-\n# OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Kaynak: ${src}\n# Yeniden üret: node tools/gen_from_web.js\n`;

/* ---- sözlükler: i18n.js'in iç D nesnesine erişim yok; anahtarları t() ile topla ---- */
function dicts() {
  const src = ['i18n.js', 'look.js'].map((f) => fs.readFileSync(path.join(WEB, 'js', f), 'utf8')).join('\n');
  const keys = [...new Set([...src.matchAll(/'(fc\.[\w.-]+)'\s*:/g)].map((m) => m[1]))].sort();
  const out = { tr: {}, en: {}, ar: {} };
  for (const l of ['tr', 'en', 'ar']) for (const k of keys) { const s = FC.i18n.t(k, null, l); if (s !== k) out[l][k] = s; }
  return out;
}
const STR = dicts();
const files = {};
files['fccore/tokens.py'] = HEAD('web/tools/schemes.js') +
  `"""Renk şeması tokenları (CSS #rrggbbaa biçiminde; Qt için style.qcolor() ile çevrilir)."""\n\n` +
  `TOKENS = ${py(TOKENS)}\n\nSCHEMES = ${py(Object.fromEntries(Object.entries(SCHEMES).map(([id, s]) => [id, { dark: Object.fromEntries(TOKENS.map((k) => [k, s.dark[k]])), light: Object.fromEntries(TOKENS.map((k) => [k, s.light[k]])) }])))}\n\nBUILTIN = ${py(Object.keys(SCHEMES))}\n`;
files['fccore/_strings.py'] = HEAD('web/js/i18n.js + web/js/look.js') + `\nSTRINGS = ${py(STR)}\n`;
files['fccore/_icons.py'] = HEAD('web/js/ui.js') + `\nPATHS = ${py(FC.ui.icons)}\n`;

/* ---- parite fikstürleri ---- */
files['tests/fixtures/web_tokens.json'] = JSON.stringify({ TOKENS, SCHEMES }, null, 1) + '\n';
files['tests/fixtures/web_strings.json'] = JSON.stringify(STR, null, 1) + '\n';
const MB = 1048576;
const progressCases = [];
for (const lang of ['tr', 'en', 'ar']) for (const patch of [false, true]) {
  for (const p of [{ done: 1.25 * MB, total: 3 * MB, pct: 41.6, remaining: 1.75 * MB, speed: 1.8 * MB, finished: false },
    { done: 0, total: 52428800, pct: 0, remaining: 52428800, speed: 0, finished: false },
    { done: 734003, total: 0, pct: 0, remaining: 0, speed: 123456, finished: false },
    { done: 99.99 * MB, total: 100 * MB, pct: 99.99, remaining: 0.01 * MB, speed: 12.345 * MB, finished: false },
    { done: 1234567890, total: 1234567890, pct: 100, remaining: 0, speed: 0, finished: true }]) {
    const f = FC.progress.format(p, { lang, patch });
    progressCases.push({ p, lang, patch, out: f });
  }
}
files['tests/fixtures/web_progress.json'] = JSON.stringify(progressCases, null, 1) + '\n';
const vecFile = path.join(ROOT, 'tests', 'fixtures', 'merge_vectors.json');
if (fs.existsSync(vecFile)) {
  const vec = JSON.parse(fs.readFileSync(vecFile, 'utf8'));
  files['tests/fixtures/merge_expected.json'] = JSON.stringify(vec.map((v) => ({ name: v.name, out: FC.lanMerge.merge(v.local, v.remote, v.opt) })), null, 1) + '\n';
}

let stale = 0;
for (const [rel, body] of Object.entries(files)) {
  const f = path.join(ROOT, rel), cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  if (cur === body) continue;
  if (check) { console.error('güncel değil:', rel); stale++; } else { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); console.log('yazıldı', rel); }
}
if (check && stale) process.exit(1);
if (check) console.log('hepsi güncel (' + WEB + ')');
