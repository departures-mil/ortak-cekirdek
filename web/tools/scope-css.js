#!/usr/bin/env node
/* css/core-scoped.css ← css/core.css: her kural .fc-scope altına alınır, genel html/body/* kuralları atlanır (ya da kapsama taşınır).
   Kendi CSS'i olan uygulamalar (React/Falcon Ofis, eski arayüzlü kabuklar) core.css yerine bunu yükler: uygulamanın kendi görünümü
   değişmez, yalnız çekirdeğin çizdiği parçalar (class="fc-scope" taşıyan kapsayıcıların içi) etkilenir.
   core.css <html>'e 14px × --font-scale verir; kapsamlı sürümde <html> uygulamanındır, bu yüzden rem → calc(n × 14px × --font-scale).
   Kaynak: falcon-ofis araclar/cekirdek-css.js.   node tools/scope-css.js [--check] [--scope .fc-scope] [--rem-px 14] [--in core.css] [--out core-scoped.css] */
'use strict';
const fs = require('fs');
const path = require('path');

function splitSel(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function makeScoper(S) {
  function scopeOne(p) {
    if (/^(html|body|:root)$/.test(p) || /^html\S*\s+body$/.test(p)) return [];
    if (p === '*') return [S, `${S} *`];
    const m = /^(html\S*)\s+(.+)$/.exec(p);
    if (m) return scopeOne(m[2]).map((x) => `${m[1]} ${x}`);
    const out = [`${S} ${p}`];
    if (/^[.[:]/.test(p) && !/^::/.test(p)) out.push(`${S}${p}`);   // kapsayıcının kendisi de (ör. <div class="fc-scope card">)
    return out;
  }
  return (sel) => [...new Set(splitSel(sel).flatMap(scopeOne))].join(',');
}
function transform(css, o) {
  o = o || {};
  const S = o.scope || '.fc-scope', remPx = o.remPx == null ? 14 : o.remPx, scopeSel = makeScoper(S);
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (remPx) css = css.replace(/(\d*\.?\d+)rem\b/g, (m, n) => `calc(${n} * ${remPx}px * var(--font-scale))`);
  let i = 0;
  function block() {
    let res = '';
    while (i < css.length) {
      const open = css.indexOf('{', i), close = css.indexOf('}', i);
      if (close !== -1 && (open === -1 || close < open)) { i = close + 1; return res; }
      if (open === -1) { i = css.length; break; }
      const head = css.slice(i, open).trim();
      i = open + 1;
      if (/^@(-webkit-)?keyframes|^@font-face/.test(head)) {
        let depth = 1, j = i;
        while (depth && j < css.length) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
        res += `${head}{${css.slice(i, j - 1).trim()}}\n`; i = j; continue;
      }
      if (/^@(media|supports|container)/.test(head)) { const inner = block(); if (inner.trim()) res += `${head}{\n${inner}}\n`; continue; }
      const end = css.indexOf('}', i);
      const body = css.slice(i, end).trim();
      i = end + 1;
      const sel = scopeSel(head);
      if (sel && body) res += `${sel}{${body}}\n`;
    }
    return res;
  }
  const head = `/* OTOMATİK ÜRETİLDİ (tools/scope-css.js ← css/core.css) — elle düzenlemeyin. Her kural ${S} ile kapsanır;
   html/body/* kuralları yok. Kullanım: web/README.md → "Kendi CSS'i olan uygulamalar". */\n` +
    `${S}{font-family:var(--font-ui);color:var(--text);line-height:1.45;-webkit-font-smoothing:antialiased}\n` +
    `html[lang=ar] ${S}{font-family:var(--font-ar);line-height:1.6}\n`;
  return head + block();
}
module.exports = { transform, splitSel };

if (require.main === module) {
  const args = process.argv.slice(2), opt = (k, d) => { const j = args.indexOf(k); return j >= 0 ? args[j + 1] : d; };
  const dir = path.join(__dirname, '..', 'css');
  const src = opt('--in', path.join(dir, 'core.css')), out = opt('--out', path.join(dir, 'core-scoped.css'));
  const res = transform(fs.readFileSync(src, 'utf8'), { scope: opt('--scope', '.fc-scope'), remPx: +opt('--rem-px', '14') });
  if (args.includes('--check')) {
    const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (cur !== res) { console.error(path.basename(out) + ' güncel değil: node tools/scope-css.js'); process.exit(1); }
    console.log(path.basename(out) + ' güncel');
  } else { fs.writeFileSync(out, res); console.log(path.basename(out), res.length, 'bayt'); }
}
