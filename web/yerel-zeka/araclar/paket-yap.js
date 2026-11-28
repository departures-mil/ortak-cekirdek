#!/usr/bin/env node
/* Yerel zeka paketlerini hazırlar (CI: .github/workflows/yerel-zeka.yml).
   node paket-yap.js runtime <platform: win32-x64|linux-x64> <çıktı>   → runtime-<platform>.tar
   node paket-yap.js ocr <model-klasörü> <çıktı>                      → ocr.tar
   node paket-yap.js mt <nllb-klasörü> <çıktı>                        → mt-meta.tar + büyük .onnx dosyaları ayrı varlık
   node paket-yap.js manifest <çıktı> <sürüm>                         → paketler.json (boyut + SHA-256) */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const tar = require('../fc-tar');

const VER = { ort: '1.30.0', transformers: '4.3.2', tesseract: '7.0.0', tessCore: '7.0.0' };
const [, , cmd, a1, a2, a3] = process.argv;
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const rm = (p) => fs.rmSync(p, { recursive: true, force: true });

function runtime(plat, out) {
  const [osName, arch] = plat.split('-');
  const st = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-rt-'));
  fs.writeFileSync(path.join(st, 'package.json'), JSON.stringify({ name: 'yz-runtime', private: true }));
  execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--os=' + osName, '--cpu=' + arch,
    `onnxruntime-node@${VER.ort}`, `@huggingface/transformers@${VER.transformers}`, `tesseract.js@${VER.tesseract}`, `tesseract.js-core@${VER.tessCore}`], { cwd: st, stdio: 'inherit', shell: process.platform === 'win32' });
  const nm = path.join(st, 'node_modules');
  // yalnız hedef platformun yerel dosyaları
  const bin = path.join(nm, 'onnxruntime-node', 'bin', 'napi-v6');
  for (const o of fs.readdirSync(bin)) for (const a of fs.readdirSync(path.join(bin, o))) if (o !== osName || a !== arch) rm(path.join(bin, o, a));
  for (const o of fs.readdirSync(bin)) if (!fs.readdirSync(path.join(bin, o)).length) rm(path.join(bin, o));
  // metin işi için gereksiz büyük bağımlılıklar
  for (const d of ['onnxruntime-web', '@img', 'sharp', 'typescript']) rm(path.join(nm, d));
  fs.mkdirSync(path.join(nm, 'sharp'), { recursive: true });
  fs.writeFileSync(path.join(nm, 'sharp', 'package.json'), JSON.stringify({ name: 'sharp', version: '0.0.0-yz', main: 'index.js' }));
  fs.writeFileSync(path.join(nm, 'sharp', 'index.js'), "module.exports = function () { throw new Error('sharp yok (yalnız metin)'); };\n");
  const tdist = path.join(nm, '@huggingface', 'transformers', 'dist');
  for (const f of fs.readdirSync(tdist)) if (!/^transformers\.node\.cjs$/.test(f)) rm(path.join(tdist, f));
  rm(path.join(nm, '@huggingface', 'transformers', 'src'));
  const pj = path.join(nm, '@huggingface', 'transformers', 'package.json'), p = JSON.parse(fs.readFileSync(pj));
  p.main = 'dist/transformers.node.cjs'; delete p.module; p.exports = { '.': { require: './dist/transformers.node.cjs', default: './dist/transformers.node.cjs' } }; fs.writeFileSync(pj, JSON.stringify(p, null, 1));
  const core = path.join(nm, 'tesseract.js-core');
  for (const f of fs.readdirSync(core)) if (/\.wasm\.js$/.test(f)) rm(path.join(core, f)); // Node: X.js + X.wasm yeter
  for (const d of ['docs', 'examples', 'benchmarks', 'tests', 'scripts']) rm(path.join(nm, 'tesseract.js', d));
  // kaynak haritaları, d.ts, belgeler
  const walk = (d) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n), s = fs.lstatSync(f); if (s.isDirectory()) walk(f); else if (/\.(map|d\.ts|md|markdown)$/i.test(n) && !/^LICEN/i.test(n)) fs.unlinkSync(f); } };
  walk(nm);
  rm(path.join(st, 'package-lock.json')); rm(path.join(st, 'package.json'));
  fs.writeFileSync(path.join(st, 'SURUMLER.json'), JSON.stringify(Object.assign({ platform: plat }, VER), null, 1));
  fs.mkdirSync(out, { recursive: true });
  const f = path.join(out, `runtime-${plat}.tar`); tar.pack(st, f); rm(st);
  console.log('→', f, (fs.statSync(f).size / 1048576).toFixed(1), 'MB');
}

function ocr(src, out) {
  const st = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-ocr-'));
  const map = { 'det-server.onnx': 'pp-ocrv5_server_det.onnx', 'det-mobile.onnx': 'pp-ocrv5_mobile_det.onnx', 'rec-latin.onnx': 'latin_pp-ocrv5_mobile_rec.onnx', 'rec-arabic.onnx': 'arabic_pp-ocrv5_mobile_rec.onnx', 'dict-latin.txt': 'ppocrv5_latin_dict.txt', 'dict-arabic.txt': 'ppocrv5_arabic_dict.txt' };
  for (const [to, from] of Object.entries(map)) fs.copyFileSync(path.join(src, from), path.join(st, to));
  fs.mkdirSync(path.join(st, 'tessdata'));
  for (const l of ['tur', 'eng']) fs.copyFileSync(path.join(src, 'tessdata', l + '.traineddata.gz'), path.join(st, 'tessdata', l + '.traineddata.gz'));
  fs.writeFileSync(path.join(st, 'LISANS.txt'), 'PaddleOCR PP-OCRv5 modelleri — Apache License 2.0 (https://github.com/PaddlePaddle/PaddleOCR)\nTesseract tessdata 4.0.0_best_int — Apache License 2.0 (https://github.com/tesseract-ocr/tessdata)\n');
  fs.mkdirSync(out, { recursive: true }); const f = path.join(out, 'ocr.tar'); tar.pack(st, f); rm(st);
  console.log('→', f, (fs.statSync(f).size / 1048576).toFixed(1), 'MB');
}

function mt(src, out) { // src: Xenova/nllb-200-distilled-600M kopyası
  const id = 'nllb-200-distilled-600M', st = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-mt-')), d = path.join(st, id);
  fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(src)) if (/\.json$/.test(f)) fs.copyFileSync(path.join(src, f), path.join(d, f));
  fs.writeFileSync(path.join(st, 'LISANS.txt'), 'NLLB-200 (Meta AI) — CC-BY-NC 4.0, ticari olmayan kullanım. https://huggingface.co/facebook/nllb-200-distilled-600M\n');
  fs.mkdirSync(out, { recursive: true }); tar.pack(st, path.join(out, 'mt-meta.tar')); rm(st);
  for (const f of ['encoder_model.onnx', 'decoder_model_merged.onnx']) fs.copyFileSync(path.join(src, 'onnx', f), path.join(out, 'nllb600-' + f));
  console.log('→ mt hazır');
}

function manifest(out, version) {
  const files = fs.readdirSync(out);
  const ent = (asset, x) => Object.assign({ asset, size: fs.statSync(path.join(out, asset)).size, sha256: sha(path.join(out, asset)) }, x);
  const packs = {};
  for (const f of files) { const m = f.match(/^runtime-(.+)\.tar$/); if (m) packs['runtime-' + m[1]] = { files: [ent(f, { extract: true })] }; }
  if (files.includes('ocr.tar')) packs.ocr = { files: [ent('ocr.tar', { extract: true })] };
  if (files.includes('mt-meta.tar')) packs.mt = { files: [ent('mt-meta.tar', { extract: true }),
    ent('nllb600-encoder_model.onnx', { path: 'nllb-200-distilled-600M/onnx/encoder_model.onnx' }),
    ent('nllb600-decoder_model_merged.onnx', { path: 'nllb-200-distilled-600M/onnx/decoder_model_merged.onnx' })] };
  for (const p of Object.values(packs)) p.version = crypto.createHash('sha256').update(p.files.map((f) => f.sha256).join('')).digest('hex').slice(0, 16);
  const m = { version: String(version || 1), created: new Date().toISOString(), packs };
  fs.writeFileSync(path.join(out, 'paketler.json'), JSON.stringify(m, null, 1));
  console.log(JSON.stringify(m, null, 1));
}

if (cmd === 'runtime') runtime(a1, a2);
else if (cmd === 'ocr') ocr(a1, a2);
else if (cmd === 'mt') mt(a1, a2);
else if (cmd === 'manifest') manifest(a1, a2);
else { console.error('kullanım: paket-yap.js runtime|ocr|mt|manifest …'); process.exit(2); }
