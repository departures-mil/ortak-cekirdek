#!/usr/bin/env bash
# release-prep.js uçtan uca testi (sahte gh ile, ağ yok).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CI="$(cd "$HERE/.." && pwd)"
FCDELTA="$(cd "$CI/../delta/node" && pwd)/fcdelta.js"
W="$(mktemp -d /tmp/release-prep-test.XXXXXX)"; trap 'rm -rf "$W"' EXIT
mkdir -p "$W/bin" "$W/root"; cp "$HERE/fake-gh" "$W/bin/gh"
export PATH="$W/bin:$PATH" FAKE_GH_ROOT="$W/root" FCDELTA REPO=departures-mil/test-app APP_ID=test-app FILE_PREFIX=TestApp
pass=0; fail=0; ok(){ pass=$((pass+1)); echo "  OK   $*"; }; bad(){ fail=$((fail+1)); echo "  FAIL $*"; }

# Sürüm başına "derleme": app.asar (küçük değişir), Setup exe (her sürüm tamamen farklı -> yama >%70 atılmalı)
build() { # $1 = sürüm
  mkdir -p "$W/in/$1/resources"
  node -e '
    const fs=require("fs"),c=require("crypto");const v=process.argv[1];
    const base=Buffer.alloc(3<<20);for(let i=0;i<base.length;i+=32)c.createHash("sha256").update("b"+i).digest().copy(base,i);
    const extra=Buffer.from(("sürüm "+v+" değişikliği\n").repeat(500));
    fs.writeFileSync(process.argv[2]+"/resources/app.asar",Buffer.concat([base.subarray(0,1<<20),extra,base.subarray(1<<20)]));
    fs.writeFileSync(process.argv[2]+"/TestApp Setup "+v+".exe",c.randomBytes(1<<20));
  ' "$1" "$W/in/$1"
}
publish() { mkdir -p "$W/root/v$1"; cp "$W/out/"* "$W/root/v$1/"; }
prep() { # $1 sürüm
  (cd "$W" && IN_DIR="$W/in/$1" OUT_DIR="$W/out" VERSION="$1" NOTES_TR="Türkçe not $1" NOTES_EN="English $1" NOTES_AR="ملاحظة $1" \
    ASSETS=$'win-app=resources/app.asar\nwin-setup=TestApp Setup *.exe' \
    LEGACY_ASSETS='win-app=app.asar' node "$CI/release-prep.js")
}

# v1.0.0: latest.json olmayan eski (legacy) release, yalnızca app.asar
build 1.0.0; mkdir -p "$W/root/v1.0.0"; cp "$W/in/1.0.0/resources/app.asar" "$W/root/v1.0.0/app.asar"
for v in 1.1.0 1.2.0 1.3.0 1.4.0 1.5.0; do build $v; prep $v > "$W/log-$v.txt"; publish $v; done
# v1.5.1-rc ön sürüm: yok sayılmalı
mkdir -p "$W/root/v1.6.0"; touch "$W/root/v1.6.0/prerelease"
# v1.4.0'ın app.asar'ını boz -> sha uyuşmazlığı -> o yama atlanmalı (release devam)
printf 'X' >> "$W/root/v1.4.0/TestApp-1.4.0-win-app.asar"
build 1.6.0; prep 1.6.0 | tee "$W/log-final.txt" | sed 's/^/    | /'

M="$W/out/latest.json"
node -e '
const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
const a=m.assets["win-app"], s=m.assets["win-setup"];
const req=(c,msg)=>{ if(!c){console.error("assert: "+msg);process.exit(1);} };
req(m.schema===1&&m.app==="test-app"&&m.version==="1.6.0"&&m.minVersion==="1.0.0","üst alanlar");
req(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(m.published),"published biçimi");
req(m.notes.tr==="Türkçe not 1.6.0"&&m.notes.ar==="ملاحظة 1.6.0","notlar");
req(a.file==="TestApp-1.6.0-win-app.asar"&&/^[0-9a-f]{64}$/.test(a.sha256)&&a.size>0,"win-app asset");
const pv=Object.keys(a.patches).sort();
req(JSON.stringify(pv)===JSON.stringify(["1.1.0","1.2.0","1.3.0","1.5.0"]),"win-app yamaları (1.4.0 bozuk, 1.0.0 son 5 dışında): "+pv);
req(Object.keys(s.patches).length===0,"win-setup yamaları %70 kuralıyla atılmalı");
req(a.patches["1.5.0"].file==="TestApp-win-app.patch-from-1.5.0.bin","yama adı");
' "$M" && ok "latest.json içeriği" || bad "latest.json içeriği"
grep -q "yama atlanmalı\|v1.4.0/win-app: yama atlandı" "$W/log-final.txt" && ok "bozuk eski asset uyarıyla atlandı" || bad "1.4.0 uyarısı yok"

# legacy: v1.1.0 hazırlanırken v1.0.0'dan (latest.json'suz) yama üretilmiş olmalı
grep -q 'patch-from-1.0.0' "$W/root/v1.1.0/latest.json" && ok "legacy (latest.json'suz) release'ten yama" || bad "legacy yama"

# her yamayı uygula ve manifest sha'sıyla karşılaştır
for v in 1.1.0 1.2.0 1.3.0 1.5.0; do
  f=$(node -e 'const m=require(process.argv[1]);console.log(m.assets["win-app"].patches[process.argv[2]].file)' "$M" $v)
  node "$FCDELTA" apply "$W/root/v$v/TestApp-$v-win-app.asar" "$W/out/$f" "$W/x" >/dev/null
  want=$(node -e 'console.log(require(process.argv[1]).assets["win-app"].sha256)' "$M")
  [[ "$(sha256sum "$W/x" | cut -d' ' -f1)" == "$want" ]] && ok "yama $v -> 1.6.0 uygulanıyor" || bad "yama $v"
done
grep -q "## العربية" "$W/release-notes.md" && ok "release-notes.md" || bad "release-notes.md"
ls "$W/out" | sed 's/^/    out: /'

# ---- ek girdiler: EXTRA_FILES, sürüme göre notes_json, MANIFEST_EXTRA_JSON, MANIFEST_HOOK ----
publish 1.6.0; build 1.7.0
mkdir -p "$W/in/1.7.0/eski"; printf 'DDSD1a' > "$W/in/1.7.0/eski/App-patch-from-1.0.1.bin"; printf 'DDSD1b' > "$W/in/1.7.0/eski/App-patch-from-1.0.2.bin"
printf 'not' > "$W/in/1.7.0/benioku.txt"
cat > "$W/notes.json" <<'J'
{"1.6.0": {"tr": "eski"}, "1.7.0": {"tr": "Yedi", "en": "Seven", "ar": "سبعة"}}
J
cat > "$W/hook.js" <<'J'
module.exports = { augment(m, repo) { const a = m.assets['win-setup']; return Object.assign({}, m, { installer: { fileName: a.file, repo } }); } };
J
(cd "$W" && IN_DIR="$W/in/1.7.0" OUT_DIR="$W/out" VERSION=1.7.0 NOTES_JSON="$W/notes.json" \
  ASSETS=$'win-app=resources/app.asar\nwin-setup=TestApp Setup *.exe' \
  EXTRA_FILES=$'eski/App-patch-from-*.bin\nbenioku.txt=BENIOKU-{version}.txt' \
  MANIFEST_EXTRA_JSON='{"displayVersion":"{version}","url":"{win-setup.url}","size":"{win-setup.size}","date":"{published}"}' \
  MANIFEST_HOOK="$W/hook.js" node "$CI/release-prep.js" > "$W/log-1.7.0.txt") && ok "1.7.0 ek girdilerle hazırlandı" || { cat "$W/log-1.7.0.txt"; bad "1.7.0 hazırlanamadı"; }
node -e '
const fs=require("fs"),m=JSON.parse(fs.readFileSync(process.argv[1]+"/latest.json","utf8"));
const req=(c,msg)=>{ if(!c){console.error("assert: "+msg);process.exit(1);} };
req(m.notes.tr==="Yedi"&&m.notes.en==="Seven"&&m.notes.ar==="سبعة","sürüme göre notlar");
req(m.displayVersion==="1.7.0"&&m.url==="https://github.com/departures-mil/test-app/releases/download/v1.7.0/TestApp-1.7.0-win-setup.exe","ek alanlar");
req(m.size===m.assets["win-setup"].size&&typeof m.size==="number"&&m.date===m.published,"sayı yer tutucusu");
req(m.installer&&m.installer.fileName==="TestApp-1.7.0-win-setup.exe"&&m.installer.repo==="departures-mil/test-app","hook");
req(!JSON.stringify(m.assets).includes("DDSD1")&&!JSON.stringify(m.assets).includes("BENIOKU"),"ek dosyalar manifestte yok");
for (const f of ["App-patch-from-1.0.1.bin","App-patch-from-1.0.2.bin","BENIOKU-1.7.0.txt"]) req(fs.existsSync(process.argv[1]+"/"+f),"ek dosya yüklenecekler arasında: "+f);
' "$W/out" && ok "extra_files / notes_json (sürüm) / manifest_extra_json / manifest_hook" || bad "ek girdiler"
# ezilemeyen alan ve ad çakışması reddedilir
if (cd "$W" && IN_DIR="$W/in/1.7.0" OUT_DIR="$W/out2" VERSION=1.7.0 PATCH_COUNT=0 ASSETS='win-app=resources/app.asar' \
     MANIFEST_EXTRA_JSON='{"version":"9.9.9"}' node "$CI/release-prep.js" >/dev/null 2>&1); then bad "version ezildi"; else ok "MANIFEST_EXTRA_JSON zorunlu alanı ezemez"; fi
if (cd "$W" && IN_DIR="$W/in/1.7.0" OUT_DIR="$W/out2" VERSION=1.7.0 PATCH_COUNT=0 ASSETS='win-app=resources/app.asar=X.bin' \
     EXTRA_FILES='benioku.txt=X.bin' node "$CI/release-prep.js" >/dev/null 2>&1); then bad "ad çakışması kabul"; else ok "EXTRA_FILES ad çakışması reddedildi"; fi
# eski biçim notes_json ({tr,en,ar}) aynen çalışır
printf '{"tr":"düz","en":"flat"}' > "$W/flat.json"
(cd "$W" && IN_DIR="$W/in/1.7.0" OUT_DIR="$W/out3" VERSION=1.7.0 PATCH_COUNT=0 NOTES_JSON="$W/flat.json" ASSETS='win-app=resources/app.asar' node "$CI/release-prep.js" >/dev/null)
node -e 'const m=require(process.argv[1]);process.exit(m.notes.tr==="düz"&&m.notes.en==="flat"?0:1)' "$W/out3/latest.json" && ok "notes_json düz biçim" || bad "notes_json düz biçim"
cmp -s "$CI/reusable-release.yml" "$CI/../.github/workflows/reusable-release.yml" && ok "ci/ ve .github/workflows/ reusable-release.yml aynı" || bad "reusable-release.yml kopyaları farklı"
echo "sonuç: $pass geçti, $fail başarısız"; [[ $fail == 0 ]]
