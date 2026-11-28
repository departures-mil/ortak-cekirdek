# ortak-cekirdek

Tüm uygulamalar için ortak çekirdek.

- `delta/` — FCD1 delta yama biçimi: Node (yapma + uygulama), Python, Java/Android (androidx'li ve `java/noandroidx/`), Dart/Flutter,
  Go (`delta/go`, `package fcd1` — Go/WebView2 kabukları için; kopyalanır) (uygulama). Bkz. `delta/FORMAT.md`. Çapraz test: `delta/test/run.sh`.
- `.github/workflows/reusable-release.yml` — uygulamaların çağırdığı ortak yayın iş akışı: son 5 sürüm için yama üretir, CI içinde doğrular, %70'ten büyükse atar, `latest.json` ile birlikte yayınlar. Örnekler: `ci/README.md`.
- `SPEC.md` — sözleşme (manifest biçimi, admin gelen kutusu, diller, tasarım, eşitleme kuralları).
- `web/` — Falcon Ofis tarzı ortak arayüz: üst çubuk, tek tık güncelleme, 3 dil + RTL, renk şemaları (falcon, klasik, zümrüt, gün batımı, mor, okyanus, grafit, yüksek kontrast), admin iletişimi, çökme raporu, kullanım limitleri, ilk açılış rehberi, neler yeni, Asistan Agent (tüm uygulamalardaki çalışmayı izleyip yorum yapar). Bkz. `web/README.md`, demo: `web/demo/index.html`.
- `web/yerel-zeka/` — çevrimdışı yapay zekâ (masaüstü): PaddleOCR PP-OCRv5 + Tesseract OCR ve NLLB-200 çeviri, onnxruntime-node (DirectML). Paketler `yerel-zeka-v1` sürümünden bir kez iner. Bkz. `web/yerel-zeka/README.md`.
