'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { TOKENS, SCHEMES } = require('../tools/schemes.js');
const { build } = require('../tools/build-tokens.js');
const NEW = Object.keys(SCHEMES).filter((k) => k !== 'falcon');

/* ---- renk yardımcıları ---- */
function rgba(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) throw new Error('renk değil: ' + hex);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
}
function over(top, base) { const t = rgba(top), b = rgba(base); const a = t[3]; return '#' + [0, 1, 2].map((i) => Math.round(t[i] * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join(''); }
function lum(hex) { return rgba(hex).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); }
function ratio(fg, bg) { const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }

test('her şema her tokenı iki modda da tanımlar; fazlası yok', () => {
  assert.ok(Object.keys(SCHEMES).length >= 7);
  for (const [id, s] of Object.entries(SCHEMES)) for (const m of ['dark', 'light']) {
    for (const k of TOKENS) assert.ok(s[m][k] !== undefined && String(s[m][k]).trim(), `${id}.${m} eksik --${k}`);
    for (const k of Object.keys(s[m])) assert.ok(TOKENS.includes(k), `${id}.${m} bilinmeyen --${k}`);
  }
});
test('css/tokens.css şemalardan üretilmiş ve güncel', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'tokens.css'), 'utf8');
  assert.strictEqual(css, build(), 'node tools/build-tokens.js çalıştırın');
  for (const id of Object.keys(SCHEMES)) assert.ok(css.includes(`[data-scheme="${id}"]`), id);
});
test('core.css yalnız token kullanır (sabit renk yok)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'core.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const hex = css.match(/#[0-9a-f]{3,8}\b/gi) || [];
  assert.deepStrictEqual(hex, []);
  for (const t of css.matchAll(/var\(--([\w-]+)\)/g)) assert.ok(TOKENS.includes(t[1]) || ['radius', 'radius-sm', 'radius-md', 'radius-lg', 'sidebar-w', 'font-scale', 'font-ui', 'font-ar', 'font-mono', 'grad-primary', 'grad-active'].includes(t[1]), 'tanımsız token --' + t[1]);
});
test('kontrast: metin / soluk metin zeminde ve panelde ≥ 4.5 (WCAG AA) — tüm şemalar', () => {
  for (const [id, s] of Object.entries(SCHEMES)) for (const m of ['dark', 'light']) {
    const t = s[m], bg = t.bg, panel = over(t.panel, bg);
    for (const surf of [['bg', bg], ['panel', panel], ['panel-solid', t['panel-solid']], ['modal-bg', t['modal-bg']]])
      for (const fg of ['text', 'muted']) {
        const r = ratio(t[fg], surf[1]);
        assert.ok(r >= 4.5, `${id}.${m}: --${fg} / --${surf[0]} = ${r.toFixed(2)}`);
      }
  }
});
test('kontrast: yeni şemalarda etiketler, durum renkleri, düğmeler', () => {
  for (const id of NEW) for (const m of ['dark', 'light']) {
    const t = SCHEMES[id][m], ps = t['panel-solid'], side = over(t['sidebar-bg'], t.bg);
    const chk = (fg, bg, min, what) => { const r = ratio(fg, bg); if (process.env.ALL && r < min) { console.log(`${id}.${m}: ${what} = ${r.toFixed(2)}`); return; } assert.ok(r >= min, `${id}.${m}: ${what} = ${r.toFixed(2)} < ${min}`); };
    chk(t.label, ps, 4.5, 'label/panel'); chk(t['nav-text'], side, 4.5, 'nav-text/sidebar'); chk(t['nav-title'], side, 4.5, 'nav-title/sidebar');
    for (const k of ['ok-text', 'danger-text', 'warn-text']) chk(t[k], ps, 4.5, k + '/panel');
    chk(t.accent, ps, 3, 'accent/panel (UI)'); chk(t.accent, t.bg, 3, 'accent/bg (UI)');
    chk(t['on-accent'], t['primary-1'], 4.5, 'on-accent/primary-1'); chk(t['on-accent'], t['primary-2'], 4.5, 'on-accent/primary-2');
    chk(t['toast-text'], t['toast-bg'], 4.5, 'toast'); chk(t['toast-err-text'], t['toast-err-bg'], 4.5, 'toast-err');
    chk(t['on-badge'], t.accent, 4.5, 'on-badge/accent'); chk(t['badge-text'], over(t['badge-bg'], ps), 4.5, 'badge');
    chk(t.focus, t.bg, 3, 'focus/bg');
  }
});
test('yüksek kontrast: kalın kenar, kalın odak, ≥ 7:1 metin', () => {
  for (const m of ['dark', 'light']) {
    const t = SCHEMES['yuksek-kontrast'][m];
    assert.strictEqual(t['border-w'], '2px'); assert.strictEqual(t['focus-w'], '3px');
    assert.ok(ratio(t.text, t.bg) >= 7 && ratio(t.muted, t.bg) >= 7);
  }
});
