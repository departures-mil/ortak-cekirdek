#!/usr/bin/env node
/* dotnet/FcAgentDil.cs: Asistan Agent metinleri (js/agent.js → C# ham dize). */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const tmp = path.join(__dirname, '..', 'dist', 'agent-dil.json');
cp.execFileSync(process.execPath, [path.join(__dirname, 'agent-dil.js'), tmp]);
const j = JSON.stringify(JSON.parse(fs.readFileSync(tmp, 'utf8')));
if (j.includes('"""')) throw new Error('ham dizede """ olamaz');
const out = '// ÜRETİLDİ — düzenlemeyin: web/js/agent.js → web/tools/build-agent-net.js\nnamespace FcAgent;\n\ninternal static class Dil\n{\n    public const string Json = """\n' + j + '\n""";\n}\n';
fs.writeFileSync(path.join(__dirname, '..', '..', 'dotnet', 'FcAgentDil.cs'), out);
console.log('dotnet/FcAgentDil.cs');
