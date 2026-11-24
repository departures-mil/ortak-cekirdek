'use strict';
/* Asistan Agent'ın Python / .NET / Flutter sürümleri web sürümüyle aynı metinleri ve kuralları kullanmalı. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('üretilmiş dosyalar güncel (npm run build sonrası değişmez)', () => {
  const files = ['python/fc_agent.py', 'qt/fccore/_agent_engine.py', 'dotnet/FcAgentDil.cs', 'flutter/fc_agent_dil.dart'];
  const before = files.map(read);
  for (const t of ['build-agent-py.js', 'build-agent-net.js', 'build-agent-dart.js']) cp.execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', t)]);
  files.forEach((f, i) => assert.strictEqual(read(f), before[i], f + ' eski: cd web && npm run build'));
});

test('her sürümdeki kural ve metin anahtarları üç dilde var', () => {
  const dil = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist', 'agent-dil.json'), 'utf8'));
  const keys = new Set();
  const src = read('python/fc_agent_src.py') + read('dotnet/FcAgent.cs') + read('flutter/fc_agent.dart');
  for (const m of src.matchAll(/['"](r\.[a-z]+)['"]/g)) keys.add(m[1]);
  for (const m of src.matchAll(/\bT\(\s*['"]([a-zA-Z.]+)['"]|\bt\(\s*['"]([a-zA-Z.]+)['"]|self\.T\(\s*['"]([a-zA-Z.]+)['"]/g)) keys.add(m[1] || m[2] || m[3]);
  ['srcAi', 'srcOff', 'freq.instant', 'freq.daily', 'freq.weekly', 'freq.manual'].forEach((k) => keys.add(k));
  assert.ok(keys.size > 20, 'anahtar bulunamadı');
  for (const k of [...keys]) if (k.endsWith('.')) keys.delete(k);
  for (const l of ['tr', 'en', 'ar']) for (const k of keys) assert.ok(dil[l][k], l + ': ' + k + ' eksik');
});

test('kural kimlikleri dört sürümde aynı', () => {
  const ids = (s) => new Set([...s.matchAll(/'(r\.[a-z]+)'|"(r\.[a-z]+)"/g)].map((m) => m[1] || m[2]));
  const web = ids(read('web/js/agent.js').replace(/fc\.agent\.r\./g, 'r.'));
  for (const f of ['python/fc_agent_src.py', 'dotnet/FcAgent.cs', 'flutter/fc_agent.dart']) {
    const s = ids(read(f));
    for (const k of s) assert.ok(web.has(k), f + ': web sürümünde olmayan kural ' + k);
  }
});
