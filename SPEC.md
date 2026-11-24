# Ortak Çekirdek — Sözleşme (tüm parçalar buna uyar)

Sahip: GitHub departures-mil. Uygulamalar kar amacı gütmeden dağıtılıyor; her kullanıcı kendi Firebase/AI hesabını kullanır, sahibin kotası kullanılmaz.

## Sürüm
semver X.Y.Z, yeni uygulamalar 1.0.0'dan başlar. Release etiketi `vX.Y.Z` (kısaltma YOK).

## Güncelleme manifesti
Her GitHub Release'e `latest.json` asset'i eklenir. Uygulama şuradan okur:
`https://github.com/departures-mil/<repo>/releases/latest/download/latest.json`
```json
{
  "schema": 1,
  "app": "falcon-ofis",
  "version": "1.57.0",
  "published": "2026-11-24T10:00:00Z",
  "notes": {"tr": "...", "en": "...", "ar": "..."},
  "minVersion": "1.0.0",
  "assets": {
    "<kanal>": {
      "file": "FalconOfis-1.57.0-app.asar",
      "size": 12345678,
      "sha256": "hex",
      "patches": {
        "1.56.0": {"file": "FalconOfis-app.patch-from-1.56.0.bin", "size": 123, "sha256": "hex"}
      }
    }
  }
}
```
Kanal örnekleri: `win-app` (Electron app.asar ya da web bundle zip), `win-setup` (tam kurulum exe), `android` (APK), `win-exe` (tek exe).
Asset URL: `https://github.com/departures-mil/<repo>/releases/download/v<version>/<file>`.

## Yama kuralları
- CI son 5 sürümün her biri için `patch-from-X.Y.Z` üretir, yamayı CI içinde uygulayıp sonucun SHA-256'sının tam dosyayla aynı olduğunu doğrular.
- Yama tam dosyanın %70'inden büyükse yayınlanmaz.
- Format: DesktopDuzenSabitleyici `DDSD1` formatının dilden bağımsız sürümü `FCD1` (bkz. delta/FORMAT.md). Kaynak ve hedef uzunluk+SHA-256 başlıkta.
- İstemci: önce kendi sürümüne ait yamayı indirir, kurulu dosyaya uygular, SHA-256 ile doğrular; yama yoksa ya da hata olursa otomatik tam dosyaya geçer.
- Android: kurulu APK (`applicationInfo.sourceDir`) + yama → yeni APK → kurulum.

## İndirme göstergesi
Her iki modda: yüzde, "X.X MB / Y.Y MB", "kalan Z.Z MB", hız "N.N MB/sn". Yama modunda ayrıca "yalnızca değişen kısımlar" (en: "changed parts only", ar: "الأجزاء المتغيرة فقط").

## Admin gelen kutusu (tek nokta)
Firestore REST, proje `comm-calc-103111111`, koleksiyon `mesajlar` (yalnız ekleme yapılabilir). Alanlar (stringValue): `tur` ("oneri" | "hata" | "cokme"), `uygulama`, `surum`, `platform`, `dil`, `mesaj`, `iletisim` (isteğe bağlı), `zaman` (ISO), `cihaz` (rastgele anonim id). Gönderilemeyenler yerel kuyruğa alınır, sonra tekrar denenir. Yedek: FormSubmit.
Çökme raporları da aynı koleksiyona `tur:"cokme"` ile gider; günde en çok 5 rapor, aynı hata imzası bir kez.

## Diller
tr, en, ar. ar → `dir=rtl`. Yazı tipi: Inter + Noto Sans Arabic (gömülü woff2).

## Tasarım
Falcon Ofis tasarım tokenları (bkz. /home/claude/plan/falcon-ref.css, `:root` ve `html.theme-light`). Sağ üst sıra (LTR): ... Eşitle, Wi-Fi(LAN), Güncelle | Küçült, Orta(yarım/geri), Tam ekran, Kapat.
Masaüstü her açılışta tam ekran.

## Eşitleme kuralı
Hiçbir kayıt silinmez ya da üstüne yazılmaz: çakışmada yeni olan kalır, eski hal çakışma yedeğine; uzak silme yerelde "arşivlendi" olur, kalıcı silme yapılmaz.

## Renk şemaları (kullanıcı isteği 2026-11-24)
Varsayılan şema her uygulamada "falcon". Ayarlar → Görünüm'de seçilebilir: falcon, klasik (uygulamanın eski görünümü — entegrasyon agent'ı uygulamanın eski renklerini çıkarıp `FC.look.registerScheme('klasik',...)` ile kaydeder), zumrut, gunbatimi, mor, okyanus, grafit, yuksek-kontrast. Koyu/açık/otomatik moddan bağımsız.
