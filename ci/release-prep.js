#!/usr/bin/env node
'use strict';
/*
 * Release hazırlığı (reusable-release.yml tarafından çağrılır; yerelde de çalışır).
 * Sıfır bağımlılık, Node 18+. `gh` CLI'ı PATH'te olmalı (GH_TOKEN ile).
 *
 * Yapar:
 *  1. ASSETS listesindeki her "kanal=yol[=ad]" dosyasını OUT_DIR'e son adıyla kopyalar, SHA-256 + boyut.
 *  2. Son PATCH_COUNT (5) release'in latest.json'unu indirir; her kanal için eski dosyayı indirip
 *     (SHA-256'sını manifestle doğrular) fcdelta make + fcdelta verify ile yama üretir.
 *     Yama hatası ASLA release'i durdurmaz: o yama atlanır, uyarı yazılır.
 *     Tam dosyanın MAX_RATIO'sundan (0.70) büyük yamalar atılır.
 *  3. SPEC'e uygun latest.json ve release-notes.md yazar.
 *
 * Ortam değişkenleri:
 *  FCDELTA        fcdelta.js yolu (zorunlu)
 *  REPO           owner/repo (varsayılan GITHUB_REPOSITORY)
 *  APP_ID         ör. falcon-ofis (zorunlu)
 *  VERSION        X.Y.Z (zorunlu, "v" öneki olmadan)
 *  ASSETS         satır satır "kanal=yol" ya da "kanal=yol=ad" (ad içinde {version} kullanılabilir;
 *                 yolun son parçasında * joker karakteri olabilir, tam 1 dosyayla eşleşmeli)
 *  FILE_PREFIX    asset adı öneki (varsayılan APP_ID). Varsayılan ad: <önek>-<sürüm>-<kanal><uzantı>
 *  IN_DIR         yolların göreli olduğu klasör (varsayılan .)
 *  OUT_DIR        çıktı klasörü (varsayılan dist-release)
 *  NOTES_JSON     {"tr":..,"en":..,"ar":..} dosyası (isteğe bağlı)
 *  NOTES_TR/EN/AR doğrudan notlar (boş değilse NOTES_JSON'u ezer)
 *  MIN_VERSION    varsayılan 1.0.0
 *  PATCH_COUNT    varsayılan 5
 *  MAX_RATIO      varsayılan 0.70
 *  NOTES_OUT      release gövdesi dosyası (varsayılan release-notes.md)
 *  LEGACY_ASSETS  latest.json'u olmayan eski release'ler için "kanal=asset-adı-deseni"
 *                 ({version} yer tutucusu; ör. win-exe=DesktopDuzenSabitleyici.exe)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const env = process.env;
const die = (m) => { console.error('::error::' + m); process.exit(1); };
const warn = (m) => console.log('::warning::' + m);
const log = (m) => console.log(m);

const FCDELTA = env.FCDELTA || die('FCDELTA gerekli');
const REPO = env.REPO || env.GITHUB_REPOSITORY || die('REPO gerekli');
const APP_ID = (env.APP_ID || '').trim() || die('APP_ID gerekli');
const VERSION = (env.VERSION || '').trim().replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) die(`VERSION X.Y.Z olmalı: "${env.VERSION}"`);
const PREFIX = (env.FILE_PREFIX || '').trim() || APP_ID;
const IN_DIR = path.resolve(env.IN_DIR || '.');
const OUT_DIR = path.resolve(env.OUT_DIR || 'dist-release');
const WORK = path.resolve(env.WORK_DIR || '.release-work');
const MIN_VERSION = (env.MIN_VERSION || '').trim() || '1.0.0';
const PATCH_COUNT = parseInt(env.PATCH_COUNT || '5', 10);
const MAX_RATIO = parseFloat(env.MAX_RATIO || '0.70');
const TAG = 'v' + VERSION;
const NOTES_OUT = path.resolve(env.NOTES_OUT || 'release-notes.md');

const cmpVer = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

function sha256File(p) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.allocUnsafe(1 << 20);
  let n;
  try { while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

function gh(args, opts = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'inherit'] });
}

function resolveInput(rel) {
  const full = path.resolve(IN_DIR, rel);
  const base = path.basename(full);
  if (!base.includes('*')) {
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) die(`dosya yok: ${rel}`);
    return full;
  }
  const dir = path.dirname(full);
  const re = new RegExp('^' + base.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  const hits = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f) && fs.statSync(path.join(dir, f)).isFile()) : [];
  if (hits.length !== 1) die(`"${rel}" tam 1 dosyayla eşleşmeli, eşleşen: ${hits.length} (${hits.join(', ')})`);
  return path.join(dir, hits[0]);
}

function safeName(s) {
  return s.replace(/[\s]+/g, '-').replace(/[^A-Za-z0-9._+-]/g, '_');
}

// ---- 1) mevcut asset'ler ----
function parseAssets() {
  const lines = (env.ASSETS || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!lines.length) die('ASSETS boş');
  const out = [];
  const seen = new Set();
  for (const l of lines) {
    const parts = l.split('=');
    if (parts.length < 2 || parts.length > 3) die(`geçersiz ASSETS satırı: "${l}" (kanal=yol[=ad])`);
    const channel = parts[0].trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(channel)) die(`geçersiz kanal adı: "${channel}"`);
    if (seen.has(channel)) die(`kanal iki kez: ${channel}`);
    seen.add(channel);
    const src = resolveInput(parts[1].trim());
    const name = safeName(parts[2] ? parts[2].trim().replace(/\{version\}/g, VERSION)
      : `${PREFIX}-${VERSION}-${channel}${path.extname(src)}`);
    out.push({ channel, src, name });
  }
  const names = new Set();
  for (const a of out) { if (names.has(a.name)) die(`asset adı çakışıyor: ${a.name}`); names.add(a.name); }
  return out;
}

function parseLegacy() {
  const m = {};
  for (const l of (env.LEGACY_ASSETS || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
    const i = l.indexOf('=');
    if (i > 0) m[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return m;
}

function readNotes() {
  let notes = { tr: '', en: '', ar: '' };
  if (env.NOTES_JSON && env.NOTES_JSON.trim()) {
    const p = path.resolve(IN_DIR, env.NOTES_JSON.trim());
    const p2 = fs.existsSync(p) ? p : path.resolve(env.NOTES_JSON.trim());
    try { Object.assign(notes, JSON.parse(fs.readFileSync(p2, 'utf8'))); } catch (e) { die('NOTES_JSON okunamadı: ' + e.message); }
  }
  for (const k of ['tr', 'en', 'ar']) {
    const v = env['NOTES_' + k.toUpperCase()];
    if (v && v.trim()) notes[k] = v.trim();
  }
  return { tr: String(notes.tr || ''), en: String(notes.en || ''), ar: String(notes.ar || '') };
}

// ---- 2) önceki sürümler ----
function previousReleases() {
  let list;
  try {
    // yeni release henüz yok; yeniden çalıştırmaya karşı PATCH_COUNT+1 alıp kendi etiketimizi eleriz
    list = JSON.parse(gh(['release', 'list', '--repo', REPO, '--limit', String(PATCH_COUNT + 1),
      '--exclude-drafts', '--json', 'tagName,isPrerelease']));
  } catch (e) {
    warn('release listesi alınamadı, yama üretilmeyecek: ' + e.message);
    return [];
  }
  return list
    .filter((r) => !r.isPrerelease && /^v\d+\.\d+\.\d+$/.test(r.tagName) && r.tagName !== TAG)
    .map((r) => r.tagName.slice(1))
    .filter((v) => cmpVer(v, VERSION) < 0)
    .sort((a, b) => cmpVer(b, a))
    .slice(0, PATCH_COUNT);
}

function download(tag, pattern, dir) {
  fs.mkdirSync(dir, { recursive: true });
  // gh -p glob kabul eder; adlarda joker karakter yok (safeName)
  gh(['release', 'download', tag, '--repo', REPO, '-p', pattern, '-D', dir, '--clobber'], { quiet: true });
  const files = fs.readdirSync(dir);
  if (files.length !== 1) throw new Error(`"${pattern}" için ${files.length} dosya indi`);
  return path.join(dir, files[0]);
}

function runFcdelta(args) {
  return execFileSync(process.execPath, [FCDELTA, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function main() {
  const assets = parseAssets();
  const legacy = parseLegacy();
  const notes = readNotes();
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(WORK, { recursive: true });

  const manifest = {
    schema: 1,
    app: APP_ID,
    version: VERSION,
    published: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    notes,
    minVersion: MIN_VERSION,
    assets: {},
  };

  for (const a of assets) {
    const dst = path.join(OUT_DIR, a.name);
    fs.copyFileSync(a.src, dst);
    a.out = dst;
    a.size = fs.statSync(dst).size;
    a.sha256 = sha256File(dst);
    manifest.assets[a.channel] = { file: a.name, size: a.size, sha256: a.sha256, patches: {} };
    log(`asset ${a.channel}: ${a.name} ${(a.size / 1048576).toFixed(2)} MB sha256=${a.sha256}`);
  }

  const prev = PATCH_COUNT > 0 ? previousReleases() : [];
  log(`önceki sürümler: ${prev.join(', ') || '(yok)'}`);
  const summary = [];

  for (const v of prev) {
    const tag = 'v' + v;
    const vdir = path.join(WORK, v);
    let prevManifest = null;
    try {
      const lj = download(tag, 'latest.json', path.join(vdir, 'manifest'));
      prevManifest = JSON.parse(fs.readFileSync(lj, 'utf8'));
    } catch (_) {
      log(`  ${tag}: latest.json yok`);
    }
    for (const a of assets) {
      let oldFile;
      try {
        const pa = prevManifest && prevManifest.assets && prevManifest.assets[a.channel];
        if (pa && pa.file) {
          oldFile = download(tag, pa.file, path.join(vdir, a.channel));
          const got = sha256File(oldFile);
          if (pa.sha256 && got !== pa.sha256) throw new Error(`eski dosyanın SHA-256'sı manifestle uyuşmuyor`);
        } else if (legacy[a.channel]) {
          oldFile = download(tag, legacy[a.channel].replace(/\{version\}/g, v), path.join(vdir, a.channel));
        } else {
          log(`  ${tag}/${a.channel}: eski asset yok, atlandı`);
          continue;
        }
        const pname = safeName(`${PREFIX}-${a.channel}.patch-from-${v}.bin`);
        const ppath = path.join(OUT_DIR, pname);
        try {
          runFcdelta(['make', oldFile, a.out, ppath]);
          runFcdelta(['verify', oldFile, ppath, a.out]); // uyuşmazlıkta çıkış 1 -> catch
        } catch (e) {
          fs.rmSync(ppath, { force: true });
          throw new Error('fcdelta make/verify başarısız: ' + String(e.stderr || e.message).trim());
        }
        const psize = fs.statSync(ppath).size;
        const ratio = a.size ? psize / a.size : 1;
        if (ratio > MAX_RATIO) {
          fs.rmSync(ppath, { force: true });
          log(`  ${tag}/${a.channel}: yama %${(ratio * 100).toFixed(1)} > %${(MAX_RATIO * 100).toFixed(0)}, yayınlanmıyor`);
          summary.push(`| ${a.channel} | ${v} | ${(psize / 1048576).toFixed(2)} MB | ${(ratio * 100).toFixed(1)}% | atlandı (büyük) |`);
          continue;
        }
        manifest.assets[a.channel].patches[v] = { file: pname, size: psize, sha256: sha256File(ppath) };
        log(`  ${tag}/${a.channel}: ${pname} ${(psize / 1048576).toFixed(2)} MB (%${(ratio * 100).toFixed(2)}) doğrulandı`);
        summary.push(`| ${a.channel} | ${v} | ${(psize / 1048576).toFixed(2)} MB | ${(ratio * 100).toFixed(2)}% | yayınlandı |`);
      } catch (e) {
        warn(`${tag}/${a.channel}: yama atlandı — ${e.message}`);
        summary.push(`| ${a.channel} | ${v} | - | - | hata: ${String(e.message).split('\n')[0].slice(0, 80)} |`);
      } finally {
        if (oldFile) fs.rmSync(path.dirname(oldFile), { recursive: true, force: true }); // disk tasarrufu
      }
    }
    fs.rmSync(vdir, { recursive: true, force: true });
  }

  fs.writeFileSync(path.join(OUT_DIR, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const body = [];
  if (notes.tr) body.push('## Türkçe\n\n' + notes.tr);
  if (notes.en) body.push('## English\n\n' + notes.en);
  if (notes.ar) body.push('## العربية\n\n<div dir="rtl">\n\n' + notes.ar + '\n\n</div>');
  if (!body.length) body.push(`${APP_ID} ${VERSION}`);
  fs.writeFileSync(NOTES_OUT, body.join('\n\n') + '\n');

  const table = ['| kanal | kaynak sürüm | yama | oran | durum |', '|---|---|---|---|---|', ...summary].join('\n');
  log('\n' + table);
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `### ${APP_ID} ${TAG}\n\n` +
      assets.map((a) => `- \`${a.channel}\`: ${a.name} (${(a.size / 1048576).toFixed(2)} MB)`).join('\n') +
      '\n\n' + (summary.length ? table : '_yama yok_') + '\n');
  }
  fs.rmSync(WORK, { recursive: true, force: true });
}

main();
