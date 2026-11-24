#!/usr/bin/env node
/* dist/fc-agent.js: Asistan Agent'ın bağımsız eklentisi (storage + i18n + ui + agent + agent-standalone + Shadow DOM CSS).
   Tam çekirdeği kullanmayan uygulamalar için. node tools/bundle-agent.js */
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
function shadowCss(css) {
  css = css.replace(/@font-face\{[^}]*\}/g, '');
  css = css.replace(/(^|[},])\s*html,body\{/g, '$1.fc-root{').replace(/(^|[},])\s*(html|body)\{/g, '$1.fc-root{');
  css = css.replace(/:root/g, '.fc-root').replace(/html(\[[^\]]+\]|\.[\w-]+)?\s+body\b/g, (m, a) => '.fc-root' + (a || ''));
  css = css.replace(/html(\[[^\]]+\]|\.[\w-]+)/g, '.fc-root$1');
  return css.replace(/\n\s*/g, '\n');
}
const css = shadowCss(read('css/tokens.css') + '\n' + read('css/core.css'));
const mods = ['storage', 'i18n', 'ui', 'agent', 'agent-standalone'];
const out = '/* Asistan Agent — bağımsız eklenti (Shadow DOM). Kaynak: ortak-cekirdek/web/js. Üreten: tools/bundle-agent.js\n' +
  '   Tam çekirdek (fc-core.js) zaten yüklüyse hiçbir şey yapmaz: agent orada FC.init ile gelir. */\n' +
  'if (typeof FC === "undefined" || !FC.topbar) {\n' +
  '(function(g){(g.FC=g.FC||{})._agentCss=' + JSON.stringify(css) + ';})(typeof globalThis!=="undefined"?globalThis:this);\n' +
  mods.map((n) => `/* ---- ${n}.js ---- */\n` + read('js/' + n + '.js')).join('\n') +
  '\n} else if (typeof window !== "undefined" && !window.FCAgent) { window.FCAgent = { mount: function () { return window.FCAgent; }, settings: function () {}, watchSettings: function () {}, refresh: function () {}, agent: function () { return FC.agent; }, track: function (n, k) { FC.agent && FC.agent.track(n, k); }, task: function (a, b, c) { FC.agent && FC.agent.task(a, b, c); }, show: function () { return FC.agent && FC.agent.show(); }, exportShare: function () { return FC.agent.exportShare(); }, importShare: function (x) { return FC.agent.importShare(x); } }; }\n';
fs.writeFileSync(path.join(dir, 'dist', 'fc-agent.js'), out);
console.log('dist/fc-agent.js', out.length, 'bayt');
