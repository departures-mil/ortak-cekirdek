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

## Asistan Agent (kullanıcı isteği 2026-11-24)
Her uygulamada `FC.agent` (web/js/agent.js) açıktır; `FC.init` başlatır, `FC.topbar` ✦ düğmesini, `FC.settings` "Asistan Agent" kartını kendisi ekler.
- **İzler:** etkin dakika (2 dk girdisiz = boşta), oturum, düğme/sekme adları (e-posta ve sayılar maskelenir, en çok 40 karakter), saat dağılımı, en uzun kesintisiz süre, hata sayısı, açık işler (`FC.agent.task`). Metin/kayıt içeriği ASLA tutulmaz.
- **Tüm uygulamalar birlikte:** kaynak anahtarı `uygulama@cihaz`. Paylaşım: (1) Electron `%APPDATA%/FalconCekirdek/agent/*.json` (`fcHost.agent.read/write/remove`), (2) kullanıcının KENDİ Firestore'u `fc_agent/{uygulama}_{cihaz}` alanı `veri` (JSON string), 30 dk'da bir, sayaçlı, (3) LAN: `exportShare()` → karşı tarafta `importShare(obj)`. Kaynak başına `u` büyük olan kalır; kendi kaydı dışarıdan ezilmez. 60 gün tutulur.
- **Yorum:** çevrim dışı kurallar (artış/düşüş, en çok kullanılan uygulama, gece çalışması, mola, verimli saat, tekrar eden işlem, eşitleme yok, hata, kullanılmayan uygulama, bölünmüş oturum, 3 günden eski açık iş, süreklilik, bekleyen güncelleme) + kullanıcının kendi AI anahtarıyla çevrim içi öneri (gemini/openai/anthropic/groq; yalnız sayı özeti gider; günde en çok 4 çağrı; hata/çevrimdışı → yalnız kurallar). Aynı yorum 3 gün tekrar edilmez.
- **Teslim:** bildirim (Electron/tarayıcı `Notification`, Android `AndroidBridge.notify(baslik, metin)` varsa) + uygulama içi panel. Ayarlar: agent aç/kapa, bildirim, panel, çevrim içi AI, sıklık (anlık/günlük/haftalık/istenince; varsayılan günlük), izlenen uygulamalar, şimdi analiz et, kayıtları sil.
- Android yerel tarafı: `@JavascriptInterface void notify(String title, String body)` → NotificationCompat (kanal "Asistan Agent").

### Asistan Agent — sürümler ve uygulama durumu (devir notu, 2026-11-24)
Agent oturumu yalnız bu depoda çalışır; uygulama depolarına yayın/gönderim ortak-cekirdek oturumunundur.
- **Sürümler** (hepsi aynı kurallar, aynı veri biçimi, metinler `web/js/agent.js`'ten ÜRETİLİR — `cd web && npm run build`):
  `web/js/agent.js` (FC.agent, tam çekirdek) · `web/dist/fc-agent.js` (bağımsız eklenti, Shadow DOM; tam çekirdek yüklüyse kendini kapatır) ·
  `python/fc_agent.py` (PySide6, tek dosya) · `qt/fccore/agent.py` (fccore'a bağlı; motor `_agent_engine.py` üretilir) · `dotnet/FcAgent.cs` + `FcAgentDil.cs` (WinForms) · `flutter/fc_agent.dart` + `fc_agent_dil.dart`.
  `test/agent-ports.test.js` üretilmiş dosyaların güncel ve metin/kural anahtarlarının dört sürümde tutarlı olduğunu denetler.
- **Uygulamalarda bugünkü durum** (çekirdeğe geçerken bağımsız eklenti dosyaları silinmeli; FC.init agent'ı zaten başlatır):
  - Tam çekirdek (FC.agent): Ajandam 5.7.0, Merkezi Servis 1.2.0.
  - Bağımsız eklenti `fc-agent.js` + `agent-baslat.js` (+ Electron'da `fc-agent-main.js`/preload `fcAgentHost`): Kitaplık 2.14.1, CV Maker 2.0.7,
    Baskı Hesabı 1.13, Comm Calc 1.12.2, Sınav Hazırlama 1.9.11, Falcon Ofis 1.57.0 (masaüstü+telefon), Mahzen 3.8 (sayfaya gömülü),
    İHA Müfredat 3.3, İngilizce Müfredat 2.5.1, Organizer telefon 2.1.0.13, Bereket telefon 1.19+.
    Ofis Günlüğü: kaynakta eklendi, YAYINLANMADI (imza anahtarı claude.ai projesinde).
  - Python: Bereket masaüstü 1.20, Organizer masaüstü 2.1.0.13, Pixhawk 1.0.7 (CI'ya gönderildi; sonucu denetlenmedi).
  - .NET: Desktop Düzen Sabitleyici 1.0.12. Flutter: Kalori Hesaplayıcı 1.0.12 (CI'ya gönderildi; derleme sonucu denetlenmedi —
    yerelde Dart/Flutter yoktu, `flutter analyze` hatası olursa `lib/services/fc_agent.dart` düzeltilmeli).
  - TV Bakım: GitHub'da kaynağı yok, eklenmedi.
- **Bilinen sınırlar:** Android'de uygulamalar arası ortak klasör yok (paylaşım Firebase/LAN ile); Flutter/.NET sürümünde bildirim
  uygulama içi SnackBar / tepsi balonudur; .NET sürümünde çevrim içi AI yok (uygulamada anahtar ayarı yok).
