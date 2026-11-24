'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { transform } = require('../tools/scope-css');
const CSS = path.join(__dirname, '..', 'css');

test('core-scoped.css güncel (node tools/scope-css.js)', () => {
  assert.strictEqual(fs.readFileSync(path.join(CSS, 'core-scoped.css'), 'utf8'), transform(fs.readFileSync(path.join(CSS, 'core.css'), 'utf8')));
});
test('kapsamlı CSS: genel html/body/* kuralı yok, her seçici .fc-scope altında, rem yok', () => {
  const out = fs.readFileSync(path.join(CSS, 'core-scoped.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\brem\b/.test(out.replace(/calc\([^)]*\)/g, '')), 'rem kalmamalı');
  let n = 0;
  for (const m of out.matchAll(/(^|[}\n])\s*([^@{}\n][^{}]*)\{/g)) {
    const sel = m[2].trim();
    if (/^(from|to|\d+%)/.test(sel)) continue;   // @keyframes adımları
    for (const p of sel.split(/,(?![^(]*\))/)) { assert.match(p, /\.fc-scope/, 'kapsamsız seçici: ' + p); n++; }
    assert.ok(!/(^|,)\s*(html|body|\*)\s*(,|$)/.test(sel), 'genel kural: ' + sel);
  }
  assert.ok(n > 200);
});
test('transform: örnek kurallar', () => {
  const r = transform('*{a:1}html{font-size:14px}html,body{margin:0}html[lang=ar] body{x:1}.btn,.x:hover{p:1.5rem}html[dir=rtl] .nav{q:1}@media (max-width:9px){.a{b:2}}@keyframes k{to{c:3}}', { remPx: 14 });
  assert.match(r, /\.fc-scope,\.fc-scope \*\{a:1\}/);
  assert.ok(!/font-size:14px|margin:0|\{x:1\}/.test(r));
  assert.match(r, /\.fc-scope \.btn,\.fc-scope\.btn,\.fc-scope \.x:hover,\.fc-scope\.x:hover\{p:calc\(1\.5 \* 14px \* var\(--font-scale\)\)\}/);
  assert.match(r, /html\[dir=rtl\] \.fc-scope \.nav,html\[dir=rtl\] \.fc-scope\.nav\{q:1\}/);
  assert.match(r, /@media \(max-width:9px\)\{\n\.fc-scope \.a,\.fc-scope\.a\{b:2\}\n\}/);
  assert.match(r, /@keyframes k\{to\{c:3\}\}/);
  assert.match(transform('.a{b:1}', { scope: '#kok' }), /#kok \.a,#kok\.a\{b:1\}/);
});
