# ortak-cekirdek

Tüm uygulamalar için ortak çekirdek.

- `delta/` — FCD1 delta yama biçimi: Node (yapma + uygulama), Python, Java/Android, Dart/Flutter (uygulama). Bkz. `delta/FORMAT.md`.
- `.github/workflows/reusable-release.yml` — uygulamaların çağırdığı ortak yayın iş akışı: son 5 sürüm için yama üretir, CI içinde doğrular, %70'ten büyükse atar, `latest.json` ile birlikte yayınlar. Örnekler: `ci/README.md`.
- `SPEC.md` — sözleşme (manifest biçimi, admin gelen kutusu, diller, tasarım, eşitleme kuralları).
- `web/` — Falcon Ofis tarzı ortak arayüz modülleri (yakında).
