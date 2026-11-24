#!/usr/bin/env node
/* noandroidx/ApkPatchInstaller.java ← ../ApkPatchInstaller.java (androidx FileProvider → FcApkProvider adresi).
   node delta/java/noandroidx/gen.js [--check] */
'use strict';
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'ApkPatchInstaller.java'), OUT = path.join(__dirname, 'ApkPatchInstaller.java');
function rep(s, a, b) { if (!s.includes(a)) throw new Error('kaynakta bulunamadı: ' + a.trim().slice(0, 60)); return s.replace(a, b); }
let s = fs.readFileSync(SRC, 'utf8');
s = rep(s, 'import androidx.core.content.FileProvider;\n\n', '');
s = rep(s, '            uri = FileProvider.getUriForFile(ctx, authority, apk);\n',
  '            // androidx\'siz: FcApkProvider (aynı klasörde) content://<authority>/updates/<dosya> → cacheDir/updates/<dosya>\n' +
  '            uri = Uri.parse("content://" + authority + "/updates/" + Uri.encode(apk.getName()));\n');
s = rep(s, '    private final String authority; // ör. context.getPackageName() + ".fileprovider"',
  '    private final String authority; // ör. context.getPackageName() + ".guncelleme" (FcApkProvider\'ın authorities değeri)');
s = rep(s, ' * ARKA PLAN İŞ PARÇACIĞINDA',
  ' * ANDROIDX\'SİZ SÜRÜM (Gradle\'sız / apktool kabukları): FileProvider yerine FcApkProvider. ÜRETİLİR: delta/java/ApkPatchInstaller.java\'dan\n' +
  ' * (node delta/java/noandroidx/gen.js; delta/test/run.sh denetler) — elle düzenlemeyin.\n *\n * ARKA PLAN İŞ PARÇACIĞINDA');
if (s.includes('androidx')) { /* yalnız açıklamada geçebilir */ }
if (process.argv.includes('--check')) {
  if (fs.readFileSync(OUT, 'utf8') !== s) { console.error('noandroidx/ApkPatchInstaller.java güncel değil: node delta/java/noandroidx/gen.js'); process.exit(1); }
  console.log('noandroidx/ApkPatchInstaller.java güncel');
} else { fs.writeFileSync(OUT, s); console.log('yazıldı', OUT); }
