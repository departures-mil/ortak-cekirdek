# Ortak release iş akışı (CI)

`reusable-release.yml`, uygulamalar derlendikten sonra çağrılan **yeniden kullanılabilir
GitHub Actions iş akışıdır** (`on: workflow_call`). Yaptıkları:

1. `v<version>` zaten yayınlanmışsa atlar (`on_existing: fail` ise hata verir); yarım kalmış taslak
   release'i temizler.
2. Derleme artifact'larını indirir (`artifact_pattern`, varsayılan `release-*`, hepsi tek klasörde birleşir).
3. `fcdelta.js` + `release-prep.js` dosyalarını `departures-mil/ortak-cekirdek` deposundan,
   `core_ref` ref'inde alır.
4. `gh release list --limit 6` ile önceki 5 sürümü bulur, her birinin `latest.json`'unu ve ilgili
   kanal dosyasını `gh release download` ile indirir (SHA-256'sı manifestle doğrulanır), sonra
   `fcdelta make` + `fcdelta verify` çalıştırır. Doğrulanamayan yama atılır, tam dosyanın
   %70'inden büyük yama atılır. **Yama hatası release'i hiçbir zaman durdurmaz** (yalnızca uyarı).
5. SPEC.md'ye uygun `latest.json` yazar, release'i taslak olarak oluşturur, tüm dosyaları yükler,
   `latest.json`'u en son yükler ve release'i yayınlar (`--latest`).
   İş akışı özetinde (Summary) her yamanın boyutu ve oranı tablo olarak görünür.

## Kurulum (bir kez, ortak-cekirdek deposunda)

- Bu dosyayı `ortak-cekirdek` deposunda **`.github/workflows/reusable-release.yml`** olarak
  koyun (GitHub reusable workflow'ları yalnızca bu klasörden çağırır). `ci/release-prep.js` ve
  `delta/node/fcdelta.js` aynı yerlerinde kalmalı (iş akışı onları `core_ref`'ten checkout eder).
- Depo **özel** ise: Settings → Actions → General → Access → "Accessible from repositories owned
  by the user" seçilmeli ve `core_token` secret'ı verilmeli. Genel depoda gerek yok.
- Sabitleme: kararlı bir etiket (ör. `v1`) oluşturup çağıranlarda hem `uses: ...@v1` hem
  `core_ref: v1` kullanın. İkisi aynı ref olmalı.

## Girdiler

| girdi | zorunlu | açıklama |
|---|---|---|
| `app_id` | evet | `latest.json` → `app` (ör. `falcon-ofis`) |
| `version` | evet | `X.Y.Z` (etiket `vX.Y.Z` olur) |
| `files` | evet | satır satır `kanal=yol` ya da `kanal=yol=asset-adı` (asset-adı'nda `{version}`); yol artifact köküne göre, son parçada `*` olabilir |
| `file_prefix` | | asset adı öneki (varsayılan `app_id`). Varsayılan adlar: `<önek>-<sürüm>-<kanal><uzantı>`, yamalar `<önek>-<kanal>.patch-from-<X.Y.Z>.bin` |
| `notes_tr` / `notes_en` / `notes_ar` | | sürüm notları |
| `notes_json` | | `{"tr":..,"en":..,"ar":..}` ya da sürüme göre `{"X.Y.Z":{"tr":..,"en":..,"ar":..}, ...}` dosyası (çağıran depoda ya da artifact'ta; sürüme göre biçimde bu sürümün anahtarı alınır). Doğrudan notlar boş değilse onu ezer |
| `min_version` | | varsayılan `1.0.0` |
| `artifact_pattern` | | varsayılan `release-*` |
| `patch_count` | | varsayılan 5 |
| `max_patch_ratio` | | varsayılan `0.70` |
| `legacy_assets` | | `latest.json`'u olmayan eski release'ler için `kanal=asset-adı` (ör. `win-exe=DesktopDuzenSabitleyici.exe`) |
| `extra_files` | | `latest.json`'a GİRMEYEN ek asset'ler: satır satır `yol` ya da `yol=asset-adı` (artifact köküne göre, son parçada `*` → 0..n dosya). Ör. eski DDSD1 köprü yamaları: `legacy/DesktopDuzenSabitleyici-patch-from-*.bin` — ikinci iş gerekmez |
| `manifest_extra_json` | | `latest.json`'a eklenecek üst düzey alanlar (JSON nesnesi). Yer tutucular `{version}` `{tag}` `{repo}` `{published}` `{<kanal>.file\|url\|size\|sha256}`; değer tam `"{win-setup.size}"` ise sayı. `schema/app/version/published/notes/minVersion/assets` ezilemez |
| `manifest_hook` | | `latest.json`'u son kez değiştiren JS modülü (çağıran depoda): `module.exports = (manifest, repo, {version, tag}) => manifest` (ya da `.augment` / `.manifestHook`). Eski güncelleyicilerin alanları (cv-maker `installer`, `url` …) ayrı bir işe gerek kalmadan eklenir; zorunlu alanlar değişirse hata |
| `on_existing` | | `skip` (varsayılan) / `fail` |
| `core_repo` / `core_ref` | | varsayılan `departures-mil/ortak-cekirdek` / `main` |
| `release_title` | | varsayılan `<app_id> v<version>` |

Çıktılar: `released` (`'true'`/`'false'`), `tag`.

## Test kapısı

Release işi **mutlaka** `needs: [test, build]` ile bağlanmalı; test işi başarısız olursa build ve
release çalışmaz. Ayrıca yalnızca `main`'e push'ta release yapın.

## Örnek: Electron (win-app = app.asar, win-setup = NSIS exe)

```yaml
# .github/workflows/release.yml (uygulama deposu)
name: release
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm test

  build:
    needs: test                       # testler geçmeden derleme yok
    runs-on: windows-latest
    outputs:
      version: ${{ steps.ver.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - id: ver
        shell: bash
        run: echo "version=$(node -p "require('./package.json').version")" >> "$GITHUB_OUTPUT"
      - run: npx electron-builder --win nsis --publish never
      # Yayınlanacak dosyaları tek klasörde topla (artifact kökü = bu klasör)
      - shell: bash
        run: |
          mkdir release
          cp dist/win-unpacked/resources/app.asar release/app.asar
          cp dist/*Setup*.exe release/
      - uses: actions/upload-artifact@v4
        with:
          name: release-win
          path: release/
          retention-days: 3

  release:
    needs: [test, build]
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: write
    uses: departures-mil/ortak-cekirdek/.github/workflows/reusable-release.yml@main
    with:
      app_id: falcon-ofis
      version: ${{ needs.build.outputs.version }}
      file_prefix: FalconOfis
      files: |
        win-app=app.asar
        win-setup=*Setup*.exe
      notes_json: release-notes.json
      core_ref: main
```

## Örnek: Android (APK)

```yaml
name: release
on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - run: ./gradlew testReleaseUnitTest

  build:
    needs: test
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.ver.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - id: ver
        run: echo "version=$(grep -oP 'versionName\s*=?\s*"\K[^"]+' app/build.gradle*)" >> "$GITHUB_OUTPUT"
      - name: İmzalı APK
        env:
          KEYSTORE_B64: ${{ secrets.KEYSTORE_B64 }}
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
        run: |
          echo "$KEYSTORE_B64" | base64 -d > app/release.jks
          ./gradlew assembleRelease
          mkdir release && cp app/build/outputs/apk/release/app-release.apk release/
      - uses: actions/upload-artifact@v4
        with: { name: release-android, path: release/, retention-days: 3 }

  release:
    needs: [test, build]
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: write
    uses: departures-mil/ortak-cekirdek/.github/workflows/reusable-release.yml@main
    with:
      app_id: bereket
      version: ${{ needs.build.outputs.version }}
      file_prefix: Bereket
      files: |
        android=app-release.apk
      notes_tr: "Hata düzeltmeleri"
      notes_en: "Bug fixes"
      notes_ar: "إصلاحات الأخطاء"
```

Masaüstü + Android aynı depodaysa iki build işi `release-win` ve `release-android` artifact'larını
yükler; varsayılan `artifact_pattern: release-*` ikisini tek klasörde birleştirir (dosya adları
çakışmamalı), `files` iki kanalı da listeler ve `needs: [test, build-win, build-android]`.

## Entegratörün bilmesi gerekenler

- **NSIS (windows-latest):** `makensis` her imajda hazır olmayabilir; NSIS kullanan derleme adımından önce
  `choco install nsis -y --no-progress` (sonra `"C:\Program Files (x86)\NSIS\makensis.exe"` ya da PATH'e ekleyin). electron-builder kendi NSIS'ini indirir, gerekmez.
- **Satır sonları:** Windows derleyicisi (`core.autocrlf=true`) metin dosyalarını CRLF ile çıkarır → paket ve yama tabanı
  bayt bayt farklı olur, yama hiç tutmaz. Depoya `.gitattributes` ekleyin: `* text=auto eol=lf` (ikili dosyalar için `*.png binary` vb.).
  Ya da checkout'tan önce `git config --global core.autocrlf false`.

- **Kararlı derleme**: yama, CI'da üretilen tam dosyaya göre doğrulanır; istemci kurulu dosyası bu
  dosyayla bayt bayt aynı olmalı. Electron'da `app.asar`'ı kurulumdan sonra değiştirmeyin.
  `asarUnpack` kullanılıyorsa `app.asar.unpacked` yamaya dahil değildir — o dosyalar değişirse
  tam kurulum (`win-setup`) gerekir; `minVersion` ile zorlayın.
- **Electron istemcisi**: `app.asar`'ı okumak için `original-fs` kullanın (`fcdelta.js` Electron
  içinde bunu kendiliğinden yapar). Çalışan uygulama `app.asar`'ı açık tutar; yeni dosyayı
  `app.asar.new` olarak yazıp yeniden başlatmada değiştirin.
- **Android**: tüm sürümler aynı anahtarla imzalanmalı. Bkz. `delta/java/ApkUpdater-notes.md`.
- İlk release'te (önceki sürüm yok) yalnızca tam dosyalar + `latest.json` yüklenir.
- Ön sürümler (prerelease) ve taslaklar yama kaynağı olarak kullanılmaz; `--limit 6` listesinde
  ön sürüm varsa o kadar az yama üretilir.
- Yerel test: `ci/test/run.sh` (sahte `gh` ile uçtan uca; ağ gerekmez).
