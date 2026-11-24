#!/usr/bin/env node
/* python/fc_agent_src.py + js/agent.js metinleri → python/fc_agent.py (tek dosya, uygulamalara kopyalanır). */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..', '..');
const tmp = path.join(__dirname, '..', 'dist', 'agent-dil.json');
cp.execFileSync(process.execPath, [path.join(__dirname, 'agent-dil.js'), tmp]);
const dil = fs.readFileSync(tmp, 'utf8');
const src = fs.readFileSync(path.join(root, 'python', 'fc_agent_src.py'), 'utf8');
const out = src.replace('DIL = __DIL__', 'DIL = ' + JSON.stringify(JSON.parse(dil), null, 1));
fs.writeFileSync(path.join(root, 'python', 'fc_agent.py'), '# ÜRETİLDİ — düzenlemeyin: python/fc_agent_src.py + web/js/agent.js → web/tools/build-agent-py.js\n' + out);
console.log('python/fc_agent.py');
