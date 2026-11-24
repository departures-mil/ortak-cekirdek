# Ortak Çekirdek — Python / PySide6 (`fccore`)

Web/Electron çekirdeğinin (`../web`) PySide6 karşılığı: aynı Falcon görünümü ve renk şemaları, aynı sağ üst düğme sırası,
aynı metinler (tr/en/ar, Arapça RTL), aynı güncelleme kuralları (latest.json + FCD1 yama + SHA-256 + tam dosyaya otomatik geçiş),
aynı admin gelen kutusu, çökme raporu, Kullanım Limitleri, ilk açılış sihirbazı, "neler yeni", duyurular ve LAN birleştirme kuralı.
Sözleşme: `../SPEC.md`. Python 3.10+, PySide6 6.5+. İnternet/CDN gerekmez (Inter + Noto Sans Arabic TTF gömülü).

```
fccore/
  __init__.py        init(): depo + görünüm + iletişim + çökme + güncelleme + neler yeni + duyurular (tek çağrı)
  tokens.py          OTOMATİK ← web/tools/schemes.js   (_strings.py ← i18n.js+look.js, _icons.py ← ui.js)
  style.py           şema / mod / yazı boyutu (0.85–1.4), register_scheme('klasik'), tokenlardan tam QSS, yazı tipleri, RTL
  i18n.py            tr/en/ar, web ile aynı anahtarlar; add() ile uygulama sözlüğü; num() = toLocaleString
  window.py          FcWindow (çerçevesiz, her açılış tam ekran, Orta = %50×%50), TopBar, Shell (kenar çubuğu + sayfalar)
  updater.py         plan/semver/kanal, yama-önce + fcdelta, SHA-256, tam dosyaya geçiş, takas betiği + geri alma
  update_ui.py       Updater'ın Qt köprüsü (arka plan iş parçacığı → ana iş parçacığı sinyali)
  fcpack.py          PyInstaller klasörünün belirlenimci zip'i (win-app kanalı) — CI de bunu kullanır
  progress.py        yüzde · MB/MB · kalan · MB/sn · "yalnızca değişen kısımlar"
  contact.py crash.py usage.py onboarding.py whatsnew.py announcements.py lanmerge.py
  settings.py cards.py scheme_picker.py widgets.py icons.py storage.py _fcdelta.py demo.py
  fonts/             Inter 400–700 (latin+latin-ext birleşik) + Noto Sans Arabic 400–700, OFL lisansları
tools/gen_from_web.js  web'den tokens/_strings/_icons + test fikstürlerini üretir (--check: güncel mi)
tools/build_fonts.py   web/fonts/*.woff2 → fccore/fonts/*.ttf (fonttools + brotli)
tests/                 pytest (offscreen Qt)   ·   screens/  ekran görüntüleri
```

## Bir PySide6 uygulamasına ~10 satırda

```python
import sys, fccore
from PySide6.QtWidgets import QApplication
from fccore import settings, style
from fccore.window import FcWindow, Shell

app = QApplication(sys.argv)
core = fccore.init(app, app_id='organizer', repo='organizer', version=__version__, announcements=True,
                   onboarding={'ai': False, 'on_firebase': lambda cfg, kod: bulut.baglan(cfg)})
style.register_scheme('klasik', dark={'bg': '#0f172a', 'accent': '#2563eb', ...}, label={'tr': 'Klasik (eski görünüm)', 'en': 'Classic (previous look)', 'ar': 'الكلاسيكي (المظهر السابق)'})
win = FcWindow('Organizer'); shell = Shell(win, name='Organizer', tag='Ajanda ve kayıtlar', version=__version__, logo='box')
shell.nav_group('Genel'); shell.page('kayitlar', 'Kayıtlar', 'box', KayitlarSayfasi())          # metin ya da i18n anahtarı
shell.page('ayarlar', 'fc.settings.about', 'settings', settings.build(cards=[benim_kartim], usage={'firebase': True, 'ai': False},
           about={'version': __version__, 'on_check': core.updates.check}))
tb = shell.topbar.mount(sync={'on_click': esitle}, lan={'on_click': wifi_ac}, update=core.updates, before=[core.ann.button()])
win.start(); core.after_show(); sys.exit(app.exec())
```

- Eşitleme durumu: `tb.set_sync('idle'|'syncing'|'error'|'off'|'offline', bekleyen_sayisi)`, Wi-Fi: `tb.set_lan('on'|'off'|'busy')`.
  Eşitleme yoksa `sync=False`, Wi-Fi yoksa `lan=False` (düğme gizlenir).
- Uygulama metinleri: `fccore.i18n.add({'tr': {...}, 'en': {...}, 'ar': {...}})`, `i18n.t('anahtar', {'n': 3})`,
  dil değişimi: `i18n.on_change(lambda dil: self.retranslate())`. Uygulamanın kendi ek dilleri varsa çekirdek bilmediği dilde `en` gösterir.
- Kendi widget'larınız Falcon görünümünü sınıfla alır: `w.setProperty('fc', 'btn primary small')`, kart için `widgets.Card(...)`,
  ayrıca tablolar, girişler, sekmeler, kaydırma çubukları, menüler, ipuçları, ilerleme çubukları genel QSS ile zaten boyanır.
  Renk gerekiyorsa `style.tok('accent')`, `style.qcolor(style.tok('panel'))`; değişimi `style.on_change(f)` ile izleyin.
- Bulut/AI kullanmayan uygulama: `usage={'firebase': False, 'ai': False}` → "sınırlı hizmet yok" kartı.
  Firestore REST / AI çağrısından sonra `fccore.usage.count_http(method, url, body, status, json)` ya da elle `usage.count('firebase.read', n)`.
- LAN birleştirme: `fccore.lanmerge.merge(yerel, uzak, idKey='id', updatedKey='updatedAt')` → `records / conflicts / archived`
  (web `FC.lanMerge` ile bayt bayt aynı sonuç; uzak silme yerelde arşivlenir, çakışmada eski hal `conflicts` → çakışma yedeğine).
- Veri: `storage` varsayılanı `%APPDATA%\FalconCekirdek\<app_id>\fccore.json` (atomik yazma). Uygulamanın kendi veri klasörü
  kullanılacaksa `fccore.init(..., data_dir=yol)`. Anahtarlar web ile aynı (`lang`, `theme`, `scheme`, `fontScale`, `firebase.config`, `ai` …).
- Pencere: `FcWindow` her açılışta `showFullScreen()`. Orta → çalışma alanının yarısı, ortada; tekrar → tam ekran. Tam ekran düğmesi
  tam ekran ↔ büyütülmüş. Üst çubuğun boş yerinden sürüklenir (`startSystemMove`), çift tık = Orta. Orta kipinde sağ altta boyut tutamağı.

## Güncelleme (PyInstaller one-dir)

Kanallar (SPEC): `win-app` = uygulama klasörünün **fcpack zip'i**, `win-setup` = kurulum exe'si.
1. `latest.json` (`releases/latest/download`) okunur; 404 → "güncel". Yeni sürüm varsa önce kurulu sürüme ait yama (`patches["X.Y.Z"]`).
2. Yamanın tabanı: son güncellemede saklanan zip, yoksa kurulu klasörden **yeniden üretilen** zip. FCD1 başlığındaki kaynak SHA-256 tutmazsa,
   yama bozuksa ya da herhangi bir hata olursa kendiliğinden tam zip indirilir (`fallback` → popup "Yama uygulanamadı, tam sürüm indiriliyor…").
3. Sonuç zip'in SHA-256'sı manifestle doğrulanır → `<klasör>.new`'e açılır → program kapanır → yardımcı betik (`takas-<sürüm>.cmd`)
   eski klasörü `.bak` yapar, yenisini koyar, yeni exe'yi `--fc-updated=X` ile açar. Yeni sürüm 90 sn içinde "açıldım" işareti
   bırakmazsa (`fccore.init` bunu kendisi yapar) eski klasör geri konur ve eski sürüm `--fc-update-failed=X` ile açılır (kullanıcıya bildirim).
4. Kurulum klasörü yazılamıyorsa (`NO_WRITE`) ya da kurulu sürüm `minVersion` altındaysa `win-setup` exe'si indirilir, doğrulanır, ayrık süreç
   olarak çalıştırılır ve program kapanır. Geliştirme modunda (`sys.frozen` yok) Güncelle → Releases sayfası açılır.

CI (ortak `reusable-release.yml`): Windows derlemesinden sonra
```
python -m fccore.fcpack dist/Organizer Organizer-win-app.zip      # belirlenimci: sıralı yollar, sabit tarih/izin, deflate 6
files: |
  win-app=Organizer-win-app.zip
  win-setup=Organizer-Setup-*.exe
```
İstemcinin yeniden ürettiği zip'in CI'dakiyle aynı olması için **aynı Python sürümüyle** (aynı zlib) derleyin; olmazsa yalnızca yama
kullanılamaz, tam zip iner (doğruluk SHA-256 ile korunur). Yükseltme sonrası saklanan zip (`base-win-app.zip`, veri klasöründe) bir sonraki
yamanın tabanıdır — bu yüzden ikinci güncellemeden itibaren yama her zaman çalışır.

## PyInstaller notları

```python
# .spec
from PyInstaller.utils.hooks import collect_data_files
datas += collect_data_files('fccore')            # fonts/*.ttf + lisanslar (ZORUNLU; yoksa sistem yazı tipine düşer)
hiddenimports += ['PySide6.QtSvg']               # simgeler QSvgRenderer ile çizilir
# excludes listesine PySide6.QtSvg EKLEMEYİN.
```
- one-dir (`COLLECT`) derleyin; `win-app` kanalı klasör takası yapar. Tek exe (`win-exe`) de desteklenir (dosya takası).
- Program kurulum klasörüne veri yazmamalı (fcpack `__pycache__` ve `.fc-*` dışındaki her dosyayı paketler).
- Kurulum NSIS per-user (`%LOCALAPPDATA%\Programs\...`) olmalı ki takas için yazma izni olsun; yoksa otomatik `win-setup`.
- `fccore/fonts` yaklaşık 1,2 MB; QSS ve simgeler çalışma anında üretilir (SVG önbelleği `%TEMP%\fccore-icons`).

## Web ile eşitlik

- `node tools/gen_from_web.js [web klasörü]` — tokenlar, metinler, simgeler ve test fikstürleri web'den yeniden üretilir.
  `--check` güncel değilse çıkış 1 (testlerde de çalışır). Web'de yeni şema/metin eklenince bunu çalıştırın.
- Testler: `python -m pytest` (offscreen). Eşlik testleri: token/metin birebir, ilerleme metni 30 durumda web çıktısıyla aynı,
  LAN birleştirme ortak vektörler (`tests/fixtures/merge_vectors.json` → web çıktısı `merge_expected.json`) + node varsa 60 rastgele vektör canlı.
- Demo: `python -m fccore.demo [--lang ar --theme light --scheme zumrut --klasik]`; ekran görüntüsü:
  `QT_QPA_PLATFORM=offscreen python -m fccore.demo --shot screens/x.png --size 1440x900`.

## Bilinen farklar / eksikler

- Asistan Agent (`FC.agent`) bu sürümde yok (web'de var).
- Dar pencere (<900 px) için web'deki çekmece menü yok; Orta kipinde içerik kırpılabilir.
- Gölge (box-shadow) yalnız modalda; açılır pencere ve bildirimlerde düz kenarlık.
- Windows takas betiği (`.cmd`) bu ortamda yalnız metin olarak test edildi; aynı akışın `sh` sürümü uçtan uca (takas + geri alma) test edildi.
