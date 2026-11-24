#!/usr/bin/env node
/* dist/fc-core.js: bütün modüller tek dosyada (tek <script> ile yüklemek için). node tools/bundle.js */
'use strict';
const fs = require('fs'), path = require('path');
const ORDER = ['storage', 'i18n', 'ui', 'host', 'look', 'progress', 'updater', 'contact', 'crash', 'usage', 'onboarding', 'whatsnew', 'announcements', 'lan-sync-merge', 'agent', 'settings', 'topbar', 'init'];
const dir = path.join(__dirname, '..');
const out = '/* Ortak çekirdek (web) — tek dosya. Kaynak: js/*.js. Üreten: tools/bundle.js */\n' +
  ORDER.map((n) => `/* ---- ${n}.js ---- */\n` + fs.readFileSync(path.join(dir, 'js', n + '.js'), 'utf8')).join('\n');
fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
fs.writeFileSync(path.join(dir, 'dist', 'fc-core.js'), out);
console.log('dist/fc-core.js', out.length, 'bayt');
module.exports = { ORDER };
