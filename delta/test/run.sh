#!/usr/bin/env bash
# FCD1 çapraz dil testi.
#   ./run.sh          -> standart testler
#   BIG=1 ./run.sh    -> ek olarak 100 MB hız testi
#   HUGE=1 ./run.sh   -> ek olarak 250 MB bellek/akış testi
# Node ile yama üretir; Node, Python, Java (varsa), Dart (varsa), Go (varsa) ile uygular; tüm çıktıların
# SHA-256'sı yeni dosyayla aynı olmalı.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DELTA="$(cd "$HERE/.." && pwd)"
NODE_CLI="$DELTA/node/fcdelta.js"
PY_CLI="$DELTA/python/fcdelta.py"
WORK="$(mktemp -d /tmp/fcdelta-test.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  OK   $*"; }
bad()  { fail=$((fail+1)); echo "  FAIL $*"; }
sha()  { sha256sum "$1" | cut -d' ' -f1; }

# ---- hangi diller var? ----
HAVE_JAVA=0; HAVE_DART=0
if command -v javac >/dev/null 2>&1 && command -v java >/dev/null 2>&1; then
  mkdir -p "$WORK/jcls"
  if javac -nowarn --release 8 -d "$WORK/jcls" "$DELTA/java/FcDelta.java" 2>"$WORK/javac.log" \
     || javac -nowarn -source 8 -target 8 -d "$WORK/jcls" "$DELTA/java/FcDelta.java" 2>"$WORK/javac.log"; then
    HAVE_JAVA=1
  else
    cat "$WORK/javac.log"; bad "javac FcDelta.java"
  fi
  # ApkPatchInstaller: Android taslaklarıyla yalnızca derleme kontrolü
  mkdir -p "$WORK/acls"
  if javac -nowarn --release 8 -d "$WORK/acls" -sourcepath "$HERE/android-stubs" \
       "$DELTA/java/FcDelta.java" "$DELTA/java/ApkPatchInstaller.java" 2>"$WORK/javac2.log"; then
    ok "javac ApkPatchInstaller.java (Android taslaklarıyla, Java 8)"
  else
    cat "$WORK/javac2.log"; bad "javac ApkPatchInstaller.java"
  fi
  # androidx'siz sürüm (FcApkProvider): üretilmiş dosya güncel mi + taslaklarla derleme + validName testi
  node "$DELTA/java/noandroidx/gen.js" --check >/dev/null && ok "noandroidx/ApkPatchInstaller.java güncel" || bad "noandroidx üretilmiş dosya eski (node delta/java/noandroidx/gen.js)"
  mkdir -p "$WORK/ncls"
  if javac -nowarn --release 8 -d "$WORK/ncls" -sourcepath "$HERE/android-stubs" \
       "$DELTA/java/FcDelta.java" "$DELTA/java/noandroidx/ApkPatchInstaller.java" "$DELTA/java/noandroidx/FcApkProvider.java" \
       "$HERE/java/FcApkProviderTest.java" 2>"$WORK/javac3.log"; then
    ok "javac noandroidx (ApkPatchInstaller + FcApkProvider, androidx yok)"
    if grep -q '^import androidx' "$DELTA/java/noandroidx/"*.java; then bad "noandroidx androidx içe aktarıyor"; fi
    java -cp "$WORK/ncls" FcApkProviderTest >/dev/null && ok "FcApkProvider.validName" || bad "FcApkProvider.validName"
  else
    cat "$WORK/javac3.log"; bad "javac noandroidx"
  fi
fi
command -v dart >/dev/null 2>&1 && HAVE_DART=1
echo "diller: node=$(node --version) python=$(python3 --version 2>&1 | cut -d' ' -f2) java=$HAVE_JAVA dart=$HAVE_DART"
JAVA_Q=(java -XX:+UseSerialGC -cp "$WORK/jcls" com.departuresmil.ortak.FcDelta)

GENARG=""; [[ "${BIG:-0}" == 1 ]] && GENARG=big
mapfile -t CASES < <(node "$HERE/gen.js" "$WORK/in" $GENARG)

# Küçük değişikliklerde beklenen en yüksek yama oranı
declare -A MAXRATIO=(
  [identical]=0.01 [insert-middle]=0.02 [delete-middle]=0.01 [append]=0.03 [prepend]=0.01
  [scattered-bytes]=0.15 [reorder]=0.01 [asar-like]=0.10 [zip-like]=0.15 [big-100mb]=0.02
)

for c in "${CASES[@]}"; do
  old="$WORK/in/$c.old"; new="$WORK/in/$c.new"; p="$WORK/$c.patch"
  want="$(sha "$new")"
  echo "[$c] $(stat -c %s "$old") -> $(stat -c %s "$new") bayt"
  t0=$(date +%s%N)
  out="$(node "$NODE_CLI" make "$old" "$new" "$p")"
  t1=$(date +%s%N)
  echo "    $(echo "$out" | head -1)"
  ratio="$(echo "$out" | tail -1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).ratio))')"
  if [[ -n "${MAXRATIO[$c]:-}" ]]; then
    if node -e "process.exit(($ratio) <= ${MAXRATIO[$c]} ? 0 : 1)"; then ok "oran $ratio <= ${MAXRATIO[$c]}"; else bad "oran $ratio > ${MAXRATIO[$c]} ($c)"; fi
  fi
  [[ "$c" == big-* ]] && echo "    make süresi: $(( (t1-t0)/1000000 )) ms"

  # node apply
  t0=$(date +%s%N)
  node "$NODE_CLI" apply "$old" "$p" "$WORK/o.node" >/dev/null
  t1=$(date +%s%N)
  [[ "$c" == big-* ]] && echo "    node apply süresi: $(( (t1-t0)/1000000 )) ms"
  [[ "$(sha "$WORK/o.node")" == "$want" ]] && ok "node apply" || bad "node apply ($c)"

  # node verify
  node "$NODE_CLI" verify "$old" "$p" "$new" >/dev/null && ok "node verify" || bad "node verify ($c)"

  # python apply
  t0=$(date +%s%N)
  python3 "$PY_CLI" apply "$old" "$p" "$WORK/o.py" >/dev/null
  t1=$(date +%s%N)
  [[ "$c" == big-* ]] && echo "    python apply süresi: $(( (t1-t0)/1000000 )) ms"
  [[ "$(sha "$WORK/o.py")" == "$want" ]] && ok "python apply" || bad "python apply ($c)"

  # java apply
  if [[ $HAVE_JAVA == 1 ]]; then
    t0=$(date +%s%N)
    "${JAVA_Q[@]}" apply "$old" "$p" "$WORK/o.java" >/dev/null 2>"$WORK/java.err" || cat "$WORK/java.err"
    t1=$(date +%s%N)
    [[ "$c" == big-* ]] && echo "    java apply süresi: $(( (t1-t0)/1000000 )) ms"
    [[ -f "$WORK/o.java" && "$(sha "$WORK/o.java")" == "$want" ]] && ok "java apply" || bad "java apply ($c)"
  fi

  # dart apply
  if [[ $HAVE_DART == 1 ]]; then
    dart run "$DELTA/dart/fcdelta.dart" apply "$old" "$p" "$WORK/o.dart" >/dev/null
    [[ "$(sha "$WORK/o.dart")" == "$want" ]] && ok "dart apply" || bad "dart apply ($c)"
  fi

  # python make -> node apply (büyük dosyalarda atla: saf Python yavaş)
  if [[ "$(stat -c %s "$new")" -lt 6000000 && "$c" != big-* ]]; then
    python3 "$PY_CLI" make "$old" "$new" "$WORK/p.py.patch" >/dev/null
    node "$NODE_CLI" apply "$old" "$WORK/p.py.patch" "$WORK/o.pn" >/dev/null
    [[ "$(sha "$WORK/o.pn")" == "$want" ]] && ok "python make -> node apply" || bad "python make ($c)"
  fi
  rm -f "$WORK"/o.* "$WORK/p.py.patch"
done

# go apply: bütün durumların Node yamaları Go uygulayıcısına (delta/go) verilir
if command -v go >/dev/null 2>&1; then
  mkdir -p "$WORK/govec"
  for c in "${CASES[@]}"; do
    [[ "$c" == big-* ]] && continue
    cp "$WORK/in/$c.old" "$WORK/govec/$c.src"; cp "$WORK/in/$c.new" "$WORK/govec/$c.dst"; cp "$WORK/$c.patch" "$WORK/govec/$c.bin"
  done
  if (cd "$DELTA/go" && go vet ./... && FCD1_TESTDATA="$WORK/govec" go test -count=1 ./...) >"$WORK/go.log" 2>&1; then
    ok "go apply (delta/go, $(ls "$WORK/govec"/*.bin | wc -l) Node vektörü + ret testleri)"
  else
    cat "$WORK/go.log"; bad "go test (delta/go)"
  fi
else
  echo "not: go bulunamadı, Go uygulayıcısı bu ortamda test edilmedi"
fi

echo "[negatif testler]"
c=insert-middle; old="$WORK/in/$c.old"; new="$WORK/in/$c.new"; p="$WORK/$c.patch"
# yanlış kaynak dosya
if node "$NODE_CLI" apply "$new" "$p" "$WORK/x" 2>/dev/null; then bad "yanlış kaynak kabul edildi (node)"; else ok "yanlış kaynak reddedildi (node)"; fi
if python3 "$PY_CLI" apply "$new" "$p" "$WORK/x" 2>/dev/null; then bad "yanlış kaynak kabul edildi (python)"; else ok "yanlış kaynak reddedildi (python)"; fi
if [[ $HAVE_JAVA == 1 ]]; then
  if "${JAVA_Q[@]}" apply "$new" "$p" "$WORK/x" 2>/dev/null; then bad "yanlış kaynak (java)"; else ok "yanlış kaynak reddedildi (java)"; fi
fi
[[ -e "$WORK/x" ]] && bad "başarısız apply çıktı dosyası bıraktı" || ok "başarısız apply çıktı bırakmadı"
# verify uyuşmazlık -> çıkış 1
set +e; node "$NODE_CLI" verify "$old" "$p" "$old" >/dev/null 2>&1; rc=$?; set -e
[[ $rc == 1 ]] && ok "verify uyuşmazlıkta çıkış 1" || bad "verify çıkış kodu $rc"
# bozuk yama: zlib gövdesinin ortasında bir bayt değiştir
cp "$p" "$WORK/bad.patch"
node -e 'const fs=require("fs");const b=fs.readFileSync(process.argv[1]);b[Math.floor(85+(b.length-85)/2)]^=0x55;fs.writeFileSync(process.argv[1],b)' "$WORK/bad.patch"
if node "$NODE_CLI" apply "$old" "$WORK/bad.patch" "$WORK/x" 2>/dev/null; then bad "bozuk yama kabul (node)"; else ok "bozuk yama reddedildi (node)"; fi
if python3 "$PY_CLI" apply "$old" "$WORK/bad.patch" "$WORK/x" 2>/dev/null; then bad "bozuk yama kabul (python)"; else ok "bozuk yama reddedildi (python)"; fi
if [[ $HAVE_JAVA == 1 ]]; then
  if "${JAVA_Q[@]}" apply "$old" "$WORK/bad.patch" "$WORK/x" 2>/dev/null; then bad "bozuk yama (java)"; else ok "bozuk yama reddedildi (java)"; fi
fi
# kesik yama
head -c $(( $(stat -c %s "$p") - 7 )) "$p" > "$WORK/cut.patch"
if node "$NODE_CLI" apply "$old" "$WORK/cut.patch" "$WORK/x" 2>/dev/null; then bad "kesik yama kabul (node)"; else ok "kesik yama reddedildi (node)"; fi
if python3 "$PY_CLI" apply "$old" "$WORK/cut.patch" "$WORK/x" 2>/dev/null; then bad "kesik yama kabul (python)"; else ok "kesik yama reddedildi (python)"; fi
if [[ $HAVE_JAVA == 1 ]]; then
  if "${JAVA_Q[@]}" apply "$old" "$WORK/cut.patch" "$WORK/x" 2>/dev/null; then bad "kesik yama (java)"; else ok "kesik yama reddedildi (java)"; fi
fi
# sona fazladan bayt
cp "$p" "$WORK/trail.patch"; printf 'X' >> "$WORK/trail.patch"
if node "$NODE_CLI" apply "$old" "$WORK/trail.patch" "$WORK/x" 2>/dev/null; then bad "fazla bayt kabul (node)"; else ok "fazla bayt reddedildi (node)"; fi
if python3 "$PY_CLI" apply "$old" "$WORK/trail.patch" "$WORK/x" 2>/dev/null; then bad "fazla bayt kabul (python)"; else ok "fazla bayt reddedildi (python)"; fi
if [[ $HAVE_JAVA == 1 ]]; then
  if "${JAVA_Q[@]}" apply "$old" "$WORK/trail.patch" "$WORK/x" 2>/dev/null; then bad "fazla bayt (java)"; else ok "fazla bayt reddedildi (java)"; fi
fi
# info
node "$NODE_CLI" info "$p" | grep -q '"dstSha256"' && ok "info" || bad "info"
# kütüphane API (Buffer)
node -e '
const f=require(process.argv[1]);const fs=require("fs");
(async()=>{const o=fs.readFileSync(process.argv[2]),n=fs.readFileSync(process.argv[3]);
const p=await f.make(o,n); const r=f.apply(o,p); if(!r.equals(n)) process.exit(1);})().catch(e=>{console.error(e);process.exit(1)})' \
  "$NODE_CLI" "$old" "$new" && ok "node kütüphane make/apply (Buffer)" || bad "node kütüphane"

# süre + en yüksek RSS ölçümü (python resource ile; /usr/bin/time gerekmez)
measure() {
  local label="$1"; shift
  python3 -c 'import resource,subprocess,sys,time
t=time.time(); r=subprocess.run(sys.argv[2:], stdout=subprocess.DEVNULL)
m=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
print("    %s: %.2f sn, en yüksek RSS %d MB" % (sys.argv[1], time.time()-t, m//1024)); sys.exit(r.returncode)' "$label" "$@"
}

# ---- 250 MB akış testi (bellek) ----
if [[ "${HUGE:-0}" == 1 ]]; then
  echo "[huge-250mb]"
  head -c $((250*1024*1024)) /dev/urandom > "$WORK/h.old"
  { head -c $((120*1024*1024)) "$WORK/h.old"; head -c 2000000 /dev/urandom; tail -c +$((125*1024*1024)) "$WORK/h.old"; } > "$WORK/h.new"
  measure "make" node "$NODE_CLI" make "$WORK/h.old" "$WORK/h.new" "$WORK/h.patch"
  measure "node apply" node "$NODE_CLI" apply "$WORK/h.old" "$WORK/h.patch" "$WORK/h.out"
  [[ "$(sha "$WORK/h.out")" == "$(sha "$WORK/h.new")" ]] && ok "250MB node" || bad "250MB node"
  measure "python apply" python3 "$PY_CLI" apply "$WORK/h.old" "$WORK/h.patch" "$WORK/h.out"
  [[ "$(sha "$WORK/h.out")" == "$(sha "$WORK/h.new")" ]] && ok "250MB python" || bad "250MB python"
  if [[ $HAVE_JAVA == 1 ]]; then
    measure "java apply" "${JAVA_Q[@]}" apply "$WORK/h.old" "$WORK/h.patch" "$WORK/h.out"
    [[ "$(sha "$WORK/h.out")" == "$(sha "$WORK/h.new")" ]] && ok "250MB java" || bad "250MB java"
  fi
fi

echo
echo "sonuç: $pass geçti, $fail başarısız (java=$HAVE_JAVA dart=$HAVE_DART)"
[[ $HAVE_DART == 0 ]] && echo "not: dart bulunamadı, Dart uygulaması bu ortamda test edilmedi"
[[ $fail == 0 ]]
