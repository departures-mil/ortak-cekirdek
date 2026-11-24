# ortak-cekirdek

Tüm uygulamalar için ortak çekirdek.

- `delta/` — FCD1 delta yama biçimi: Node (yapma + uygulama), Python, Java/Android, Dart/Flutter (uygulama). Bkz. `delta/FORMAT.md`.
- `.github/workflows/reusable-release.yml` — uygulamaların çağırdığı ortak yayın iş akışı: son 5 sürüm için yama üretir, CI içinde doğrular, %70'ten büyükse atar, `latest.json` ile birlikte yayınlar. Örnekler: `ci/README.md`.
- `SPEC.md` — sözleşme (manifest biçimi, admin gelen kutusu, diller, tasarım, eşitleme kuralları).
- `web/` — Falcon Ofis tarzı ortak arayüz: üst çubuk, tek tık güncelleme, 3 dil + RTL, renk şemaları (falcon, klasik, zümrüt, gün batımı, mor, okyanus, grafit, yüksek kontrast), admin iletişimi, çökme raporu, kullanım limitleri, ilk açılış rehberi, neler yeni. Bkz. `web/README.md`, demo: `web/demo/index.html`.
