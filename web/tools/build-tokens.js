#!/usr/bin/env node
/* css/tokens.css üretir: gömülü yazı tipleri + sabit tokenlar + renk şemaları (tools/schemes.js).
   Kullanım: node tools/build-tokens.js            (yazar)
             node tools/build-tokens.js --check    (güncel değilse çıkış kodu 1) */
'use strict';
const fs = require('fs');
const path = require('path');
const { TOKENS, SCHEMES } = require('./schemes.js');

const R = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  arabic: 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC'
};
function fonts() {
  const out = [];
  for (const w of [400, 500, 600, 700]) {
    for (const s of ['latin', 'latin-ext']) out.push(`@font-face{font-family:Inter;font-style:normal;font-display:swap;font-weight:${w};src:url(../fonts/inter-${s}-${w}-normal.woff2) format('woff2');unicode-range:${R[s]}}`);
    out.push(`@font-face{font-family:'Noto Sans Arabic';font-style:normal;font-display:swap;font-weight:${w};src:url(../fonts/noto-sans-arabic-arabic-${w}-normal.woff2) format('woff2');unicode-range:${R.arabic}}`);
  }
  return out.join('\n');
}
function decl(t) { return TOKENS.map((k) => `--${k}:${t[k]}`).join(';'); }
/** Bir şemanın CSS kuralları. Seçici her öğede çalışır: önizleme kutucukları da data-scheme ile kendi renklerini alır. */
function schemeCss(id, s) {
  const d = id === 'falcon' ? `:root,[data-scheme="falcon"]` : `[data-scheme="${id}"]`;
  const l = id === 'falcon' ? `:root.theme-light,[data-scheme="falcon"].theme-light,.theme-light [data-scheme="falcon"]` : `[data-scheme="${id}"].theme-light,.theme-light [data-scheme="${id}"]`;
  return `${d}{${decl(s.dark)};color-scheme:dark}\n${l}{${decl(s.light)};color-scheme:light}`;
}
function build() {
  for (const [id, s] of Object.entries(SCHEMES)) for (const m of ['dark', 'light']) for (const k of TOKENS) if (s[m][k] === undefined) throw new Error(`${id}.${m} eksik: --${k}`);
  return `/* OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Kaynak: tools/schemes.js → node tools/build-tokens.js
   Ortak çekirdek tasarım tokenları. Varsayılan şema "falcon" (Falcon Ofis). Şema: <html data-scheme="…">, açık mod: <html class="theme-light">.
   Bileşenler yalnız bu tokenları kullanır. Yazı tipleri gömülüdür (çevrimdışı). */
${fonts()}

:root{--radius:14px;--radius-sm:8px;--radius-md:10px;--radius-lg:18px;--sidebar-w:264px;--font-scale:1;
  --font-ui:Inter,'Noto Sans Arabic',system-ui,'Segoe UI',sans-serif;--font-ar:'Noto Sans Arabic',Inter,system-ui,'Segoe UI',Tahoma,sans-serif;--font-mono:ui-monospace,Consolas,monospace}
:root,[data-scheme]{--grad-primary:linear-gradient(135deg,var(--primary-1),var(--primary-2));--grad-active:linear-gradient(90deg,var(--active-1),var(--active-2))}
[dir=rtl],[dir=rtl] [data-scheme]{--grad-active:linear-gradient(270deg,var(--active-1),var(--active-2))}

${Object.entries(SCHEMES).map(([id, s]) => schemeCss(id, s)).join('\n')}
`;
}
if (require.main === module) {
  const file = path.join(__dirname, '..', 'css', 'tokens.css');
  const css = build();
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (cur !== css) { console.error('tokens.css güncel değil: node tools/build-tokens.js'); process.exit(1); }
    console.log('tokens.css güncel');
  } else { fs.writeFileSync(file, css); console.log('yazıldı', file, css.length, 'bayt'); }
}
module.exports = { build, schemeCss };
