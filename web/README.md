# Ortak Çekirdek — web

Çerçevesiz (framework-free) ortak arayüz çekirdeği: Falcon Ofis görünümü, sağ üst düğme sırası, tek tuşla güncelleme
(yama + tam dosyaya otomatik geçiş), Admin ile iletişim, çökme raporu, Kullanım Limitleri, ilk açılış sihirbazı,
"neler yeni", duyurular, renk şemaları, Wi-Fi/LAN birleştirme kuralı. Sözleşme: `../SPEC.md`.
Çalışırken internet/CDN gerekmez (yazı tipleri gömülü).

```
css/tokens.css   tokenlar + gömülü yazı tipleri + renk şemaları (OTOMATİK: tools/build-tokens.js ← tools/schemes.js)
css/core.css     kabuk, üst çubuk, düğmeler, girişler, kartlar, modal, bildirim, settings-grid, update-float, RTL
fonts/           Inter + Noto Sans Arabic 400–700 woff2 (latin, latin-ext, arabic) ~470 KB, OFL lisansları yanında
js/*.js          her modül tek dosya, global FC.<ad>; js/fc.mjs ES modülü girişi; dist/fc-core.js hepsi tek dosyada
electron/        fc-electron-main.js (ana süreç), fc-preload.js (window.fcHost), fcd1.js (yama uygulayıcı)
demo/index.html  tarayıcıda tam kabuk: ?lang=ar&theme=light&scheme=zumrut&host=browser
test/            node:test (bağımlılıksız): npm test
```

## (a) Düz web / Electron uygulaması

```html
<link rel="stylesheet" href="core/web/css/tokens.css"><link rel="stylesheet" href="core/web/css/core.css">
<script src="core/web/dist/fc-core.js"></script>
<script>
  FC.init({ app: 'kitaplik', repo: 'kitaplik', version: '2.5.0', announcements: true, onboarding: { onFirebase: c => app.baglan(c) } });
  const tb = FC.topbar.mount(document.querySelector('.topbar'), { before: [FC.announcements.button()],
    sync: { onClick: () => app.esitle() }, lan: { onClick: () => app.lanAc() } });
  app.onSyncState((durum, bekleyen) => tb.setSync(durum, bekleyen));          // idle|syncing|error|off|offline
  FC.settings.build(document.getElementById('ayarlar'), { cards: [app.kartlarim()], usage: { project: () => app.projeId } });
</script>
```
Electron ana süreç (`main.js`):
```js
const fc = require('./core/web/electron/fc-electron-main');
const win = new BrowserWindow(fc.windowOptions({ webPreferences: { preload: path.join(__dirname, 'core/web/electron/fc-preload.js') } }));
fc.install(win, { channel: 'win-app' });   // tam ekran açılış, pencere düğmeleri, app.asar güncelleme, ana süreç hataları
```
Kendi preload'unuz varsa içinde `require('./core/web/electron/fc-preload.js')` deyin.

## (b) React (Falcon Ofis)

```js
// main.jsx
import 'ortak-cekirdek/web/css/tokens.css';            // Falcon'un kendi CSS'i kalabilir; tokenlar aynı adlarda
import { FC } from 'ortak-cekirdek/web/js/fc.mjs';
FC.init({ app: 'falcon-ofis', repo: 'falcon-ofis', version: __APP_VERSION__ });
// TopBar.jsx — bileşen bir kez DOM'a bağlar
const ref = useRef(); useEffect(() => { const tb = FC.topbar.mount(ref.current, { sync: { onClick: syncNow }, lan: { onClick: openLan } });
  return syncStore.subscribe(s => tb.setSync(s.state, s.pending)); }, []);   <div ref={ref} />
// Settings.jsx — React kartlarından sonra çekirdek kartları; iletişim kartı en sonda kalır
useEffect(() => { FC.settings.build(gridRef.current, { look: true }); }, []);
```
Dil: `FC.i18n.set(lang)` ve `FC.i18n.onChange(l => i18next.changeLanguage(l))` ile iki yönlü bağlayın.

## (c) Android WebView

```java
webView.addJavascriptInterface(new FcBridge(this), "AndroidBridge");   // moveTaskToBack, openExternal, appVersion, updateBegin/Chunk/Finish
```
```html
<script src="file:///android_asset/core/fc-core.js"></script>
<script>FC.init({ app: 'kitaplik', repo: 'kitaplik', channel: 'android' }); FC.topbar.mount(topbar, {...});</script>
```
`FC.host` Android'i kendisi tanır: Küçült/Orta gizlenir, Kapat → `moveTaskToBack()`.
Güncelleme sözleşmesi (yerelde yazılacak): `updateBegin(kind 'patch'|'full', metaJson)`, `updateChunk(base64)` (768 KB parçalar),
`updateFinish()` → `'{"ok":true}'` ya da `'{"ok":false,"error":"…"}'`. Yerel taraf yamayı `applicationInfo.sourceDir`'e uygular
(FCD1, Java uygulaması `delta/java`), `meta.targetSha256` ile doğrular, PackageInstaller'ı açar.

## Renk şemaları

Varsayılan `falcon` (Falcon Ofis değerleri birebir). Yerleşik: `zumrut`, `gunbatimi`, `mor`, `okyanus`, `grafit`, `yuksek-kontrast`
(hepsi koyu+açık, WCAG AA testli). Mod (koyu/açık/otomatik) şemadan ayrıdır. Uygulamanın eski görünümü:
```js
FC.look.registerScheme('klasik', { dark: { '--bg': '#1d2433', '--panel-solid': '#263042', '--text': '#f3f4f6', '--accent': '#60a5fa' /* … */ },
  light: { /* yoksa dark kullanılır */ }, label: { tr: 'Klasik (eski görünüm)', en: 'Classic (previous look)', ar: 'الكلاسيكي (المظهر السابق)' } });
```
Kaydedilmeyen `klasik` seçicide görünmez. Token listesi `tools/schemes.js` → `TOKENS`; değişiklikten sonra `npm run build`.

## Asistan Agent

`FC.init` başlatır; üst çubuğa ✦ (okunmamış sayısıyla) ve Ayarlar'a "Asistan Agent" kartı kendiliğinden gelir (`agent:false` ile kapatılır).
Ek kod gerekmez; isterseniz: `FC.agent.track('fatura.kaydet')`, `FC.agent.task(id,'start'|'done', etiket)`,
LAN eşitlemesinde `paket.agent = FC.agent.exportShare()` → karşıda `FC.agent.importShare(paket.agent)`.
Android: `AndroidBridge.notify(title, body)` eklenirse öneriler sistem bildirimi olur. Ayrıntı: `../SPEC.md` → Asistan Agent.

## Entegre edenin bilmesi gerekenler

- **Kayıtlar/kimlik:** iletişim ve çökme raporları SPEC'teki gelen kutusuna gider (`tur`, `uygulama`, `surum`, `platform`, `dil`, `mesaj`,
  `iletisim`, `zaman`, `cihaz`). FormSubmit yedeği yalnız kullanıcı mesajında kullanılır (çökme raporu e-posta göndermez). Adres gizlidir.
- **Çökme:** sürüm başına aynı imza bir kez, günde en çok 5; e-posta, kullanıcı klasörü, URL sorgusu, uzun sayı ve tırnak içi veri maskelenir.
  Ayarlar'daki kartla kapatılabilir.
- **Güncelleme:** `latest.json` 404 ise "güncel" sayılır. Atla yok. Tarayıcıda (`host=browser`) Güncelle → Releases sayfası.
  Electron'da indirme ana süreçte (`net.fetch`, CORS'suz, yalnız GitHub alan adları). Takas: `app.asar.next` → program kapanınca
  `app.asar.bak` + yeni dosya + yeniden açılış; kurulum klasörü yazılamıyorsa `NO_WRITE` hatası (programı kullanıcı klasörüne kurun
  ya da `setupChannel: 'win-setup'` verin). Geliştirme modunda (`!app.isPackaged`) `NOT_PACKAGED`.
- **minVersion:** kurulu sürüm altındaysa yama kullanılmaz; `setupChannel` verildiyse o kanalın tam kurulumu indirilir.
- **Orta düğmesi:** çalışma alanının %50 × %50'si, ortalanmış; tekrar basınca tam ekran. Her açılış tam ekran.
- **AI anahtarı / Firebase yapılandırması** varsayılan olarak `localStorage` (`fc.ai`, `fc.firebase.config`) içinde; güvenli depo isteyen
  kabuk `onboarding: { store: false, onAi, onFirebase }` ile kendisi saklar.
- **Kullanım sayacı:** `FC.usage.count('firebase.read', n)`; Firestore REST/AI çağrıları `fetch` ile yapılıyorsa `FC.usage.wrapFetch()`
  kendisi sayar (Firebase JS SDK'nın gRPC/WebChannel trafiğini sayamaz — SDK kullanan uygulama elle saymalı). Gün Pasifik saatiyle döner.
- **LAN:** `FC.lanMerge.merge(yerel, uzak, {idKey, updatedKey})` → `{records, conflicts, archived}`. Uzak silme yerelde silmez, `archived:true`
  yapar; çakışmada yeni kalır, eski `conflicts` → uygulama çakışma yedeğine yazar. Silme işareti: `deleted:true` (+`deletedAt`).
- **Arapça sayılar** teknik değerlerde Batı rakamlarıyla yazılır (`ar-u-nu-latn`).
- Boyut: js ~170 KB ham (dist/fc-core.js 130 KB, gzip ~41 KB; bunun ~40 KB'ı üç dildeki metinler), css 48 KB, yazı tipleri ~470 KB.
