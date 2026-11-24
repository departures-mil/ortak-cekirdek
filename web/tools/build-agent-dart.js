#!/usr/bin/env node
/* flutter/fc_agent_dil.dart: Asistan Agent metinleri (js/agent.js → Dart ham dize). */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const tmp = path.join(__dirname, '..', 'dist', 'agent-dil.json');
cp.execFileSync(process.execPath, [path.join(__dirname, 'agent-dil.js'), tmp]);
const j = JSON.stringify(JSON.parse(fs.readFileSync(tmp, 'utf8')));
if (j.includes("'''")) throw new Error("ham dizede ''' olamaz");
fs.mkdirSync(path.join(__dirname, '..', '..', 'flutter'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', '..', 'flutter', 'fc_agent_dil.dart'),
  "// ÜRETİLDİ — düzenlemeyin: web/js/agent.js → web/tools/build-agent-dart.js\n// ignore_for_file: lines_longer_than_80_chars\nconst String fcAgentDilJson = r'''" + j + "''';\n");
console.log('flutter/fc_agent_dil.dart');
