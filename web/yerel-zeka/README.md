# Yerel zeka — çevrimdışı OCR + çeviri (masaüstü)

İnternet yokken en yüksek kalitede metin okuma ve tr ↔ en ↔ ar çeviri. Tüm uygulamalar aynı modülü kullanır.

| Paket | İçerik | Boyut |
|---|---|---|
| `runtime-win32-x64` | onnxruntime-node 1.30 (CPU + **DirectML** GPU), transformers.js 4.3, tesseract.js 7 | ~93 MB |
| `ocr` | PaddleOCR **PP-OCRv5** sunucu + hızlı algılama, Latin (tr/en) ve Arapça tanıma; Tesseract tur/eng | ~110 MB |
| `mt` | **NLLB-200** (Meta) 600M, tam duyarlık fp32 | ~3.4 GB |

Paketler `yerel-zeka-v1` ön sürümünde (CI: `.github/workflows/yerel-zeka.yml` hazırlar, uçtan uca dener, yükler).
Uygulama paketi kullanıcı veri klasörüne (`<userData>/yerel-zeka`) bir kez indirir: program güncellemeleri etkilemez.
İndirme penceresinde yüzde, inen/toplam MB, kalan MB, hız ve süre görünür; yarıda kalan indirme kaldığı yerden sürer; SHA-256 doğrulanır.

## Ölçüm (temiz baskı, karakter hata oranı)
| | İngilizce | Türkçe | Arapça |
|---|---|---|---|
| Eski: Tesseract best_int | %0,0 | %0,0 | %7,8 (rakamlar yanlış: ٢٥٠٠٠٠ → 170٠0٠٠١) |
| Tesseract best (float) | %0,0 | %0,0 | %8,1 (tesseract.js 7'de çalışmıyor) |
| **Yeni: PP-OCRv5 + Tesseract** | **%0,0** | **%0,2** | **%0,0** |

Eğik + gürültülü + JPEG fotoğrafta da tutar ve işlem numarası doğru okunur (eski: `1300005`, yeni: `١٢٥٠٠٠٠`).
Yöntem: algılama (DB) → eğiklik düzeltme → aynı satırdaki kutuları birleştirme → Arapça satır üç genişlikte okunur
(yan yana aynı rakamlar CTC'de birleşmesin) → Latin satırda Paddle + Tesseract uzlaşması (Türkçe ı/İ/ş/ğ).

## Çeviri sırası
1. Uygulamanın çeviri belleği / terim sözlüğü birebir (`memory: [[tr, en, ar], …]`).
2. Bilgisayarda **Ollama** varsa (gemma3 / qwen / aya …) havacılık çevirmeni yönergesi + zorunlu terimlerle (Ayarlar'dan kapatılabilir).
3. NLLB-200 cümle cümle; satır yapısı korunur. Windows'ta önce DirectML (GPU), olmazsa CPU.

## Uygulamaya bağlama (Electron)
```js
// main.js
require('./cekirdek/yerel-zeka/fc-yerel-zeka-main').install({ app, ipcMain });
// preload.js
require('./cekirdek/yerel-zeka/fc-yerel-zeka-preload').expose(contextBridge, ipcRenderer);
// arayüz: <script src="fc-yerel-zeka-ui.js">  →  FCYZ.card({lang}), FCYZ.ocr(img), FCYZ.translate(t, 'tr', 'ar', {memory})
```
Ana süreç dosyaları (`fc-yerel-zeka-main.js`, `fc-yerel-zeka-preload.js`, `yz-worker.js`, `fc-ocr.js`, `fc-mt.js`, `fc-tar.js`) asar içinde
kalabilir: iş parçacığı kaynakları ana süreçte okunur; yerel çalışma zamanı (DLL) kullanıcı klasöründen yüklenir.

Lisanslar: PaddleOCR / Tesseract Apache-2.0 · NLLB-200 CC-BY-NC-4.0 (ticari olmayan; uygulamalar ücretsiz dağıtılıyor) · onnxruntime MIT · transformers.js Apache-2.0.
