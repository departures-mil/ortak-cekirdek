#!/usr/bin/env node
/* Asistan Agent metinleri (fc.agent.*, 3 dil) → JSON. Python/Dart/C# sürümleri bu dosyayı gömer: metinler tek yerde (js/agent.js). */
'use strict';
const path = require('path'), fs = require('fs');
const D = { tr: {}, en: {}, ar: {} };
global.FC = { i18n: { add: (o) => { for (const l in o) if (D[l]) Object.assign(D[l], o[l]); }, pick: (x) => x, lang: () => 'tr', onChange() {} }, storage: {} };
require(path.join(__dirname, '..', 'js', 'agent.js'));
const out = {};
for (const l in D) { out[l] = {}; for (const k in D[l]) if (k.startsWith('fc.agent.')) out[l][k.slice(9)] = D[l][k]; }
const f = process.argv[2] || path.join(__dirname, '..', 'dist', 'agent-dil.json');
fs.writeFileSync(f, JSON.stringify(out, null, 1));
console.log(f, Object.keys(out.tr).length, 'anahtar');
