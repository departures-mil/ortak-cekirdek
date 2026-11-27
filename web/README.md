# Ortak Çekirdek — web

Çerçevesiz (framework-free) ortak arayüz çekirdeği: Falcon Ofis görünümü, sağ üst düğme sırası, tek tuşla güncelleme
(yama + tam dosyaya otomatik geçiş), Admin ile iletişim, çökme raporu, Kullanım Limitleri, ilk açılış sihirbazı,
"neler yeni", duyurular, renk şemaları, Wi-Fi/LAN birleştirme kuralı. Sözleşme: `../SPEC.md`.
Çalışırken internet/CDN gerekmez (yazı tipleri gömülü).

```
css/tokens.css   tokenlar + gömülü yazı tipleri + renk şemaları (OTOMATİK: tools/build-tokens.js ← tools/schemes.js)
css/core.css     kabuk, üst çubuk, düğmeler, girişler, kartlar, modal, bildirim, settings-grid, update-float, RTL
css/core-scoped.css  aynı kurallar .fc-scope altında, genel html/body kuralı yok (OTOMATİK: tools/scope-css.js) — kendi CSS'i olan uygulamalar
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
Daha iyisi — indirmeyi de Java yapsın (WebView'de CORS yok, büyük APK JS'ye taşınmaz): `FC.host.update.run = (plan, ilerleme) => Promise`
tanımlayın (ör. `ApkPatchInstaller.obtainApk(plan.full.url, …, plan.mode === 'patch' ? plan.url : null, …)` + `install`). Varsa çekirdek
indirmeyi atlar; ilerleme olayları `{patch, done, total, finished}`, `{patchFailed:true, error}`, `{installing:true}`; dönüş `'done'`
(kurulum ekranı açıldı) ya da `'restarting'`. androidx'siz kabuk: `delta/java/noandroidx`.
**Zorunlu (CORS):** WebView (`appassets.androidplatform.net` / `file://`) GitHub'a `fetch` yapamaz ("Failed to fetch"). Köprüye şu iki yöntemi
ekleyin; çekirdek bunları kendiliğinden kullanır: `httpGet(id, url)` → `window.__fcHttp(id, {status, body} | {error})` (latest.json, ≤ 2 MB) ve
`apkUpdate(planJson)` → `window.__fcApk({type:'progress'|'patchFailed'|'installing'|'done'|'error', …})` (indirme + yama + kurulum yerelde).
Örnek Java: Bereket Defter `FcGuncelle.java` (`httpGet`, `apkUpdate`).

## Kendi CSS'i olan uygulamalar: `core-scoped.css`

Uygulamanın kendi görünümü (React/Falcon Ofis, eski arayüzler) değişmesin isteniyorsa `core.css` yerine **`css/core-scoped.css`** yükleyin.
Her kural `.fc-scope` altındadır; `html`/`body`/`*` kuralı yoktur (rem → `14px × --font-scale`). Çekirdeğin çizdiği parçaları
`fc-scope` sınıflı bir kapsayıcıya koyun; modal/bildirim katmanı için:
```js
const layer = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'fc-scope fc-layer' }));
FC.ui.root = layer;                                   // FC.ui.modal / toast buraya bağlanır
FC.settings.build(ayarlarKutusu /* class="fc-scope …" */, {...});
```
Üretim: `node tools/scope-css.js` (`npm run build` yapar; `--check` testte). Başka kapsam: `--scope '#kok'`.

## Kendi masaüstü kabuğu (Go + WebView2 / Edge --app): `fcHost.kind = 'shell'`

Kabuk sayfaya `window.fcHost`'u kendisi koyar ve `kind: 'shell'` (+ `shell: 'go'`) verir. Sözleşme Electron'unkiyle aynı:
`window.{minimize, half, toggleFullscreen, close, getState, onState}`, `update.{channel, applyPatch(bytes, meta), installFull(bytes, meta)}`
(ya da hepsini kendisi yapan `update.run(plan, ilerleme)`), `net.download(url, ilerleme)` (CORS'suz; hata `e.code`/iletide `HTTP_404` →
"güncel"), `version`, `platform`, `openExternal`. Fark: `FC.host.kind === 'shell'`, `<html class="fc-host-shell">` (Electron'a özgü
`-webkit-app-region` kuralları uygulanmaz), iletişim/çökme kayıtlarında `shell/win32`. `kind:'electron'` ya da başka bir değer
veren mevcut kabuklar eskisi gibi Electron sayılır. FCD1 yaması için Go uygulayıcısı: `../delta/go`.

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

- **Electron `install(win, seçenekler)`:** `show:false` (tepside başlayan uygulama; pencereyi uygulama gösterir), `beforeUpdate(meta, kind)`
  (takas ya da kurulum açılmadan önce beklenir, ör. tam yedek; hata → güncelleme yapılmaz), `setupArgs` (win-setup exe argümanları:
  dizi ya da `true` = NSIS `/S`; verilmezse kurulum görünür açılır). `runSetup(buf, meta, {args})` dışa açık. Electron < 25'te `net.fetch`
  yoksa indirme `https` ile yapılır (aynı alan adı süzgeci).
- **`contextIsolation:false` pencereler:** `fc-preload.js` bunu kendisi anlar ve `window.fcHost`'u doğrudan koyar (contextBridge orada çalışmaz).
- **"Neler yeni" notları:** `FC.init({ whatsnew: { notes: v => NOTLAR[v] /* ya da {tr,en,ar} */, delayMs } })`. Eski sürümlerin semver olmayan
  "görüldü" değerleri (`"3.3"`) yeni sürüm sayılır, pencere açılır. `whatsnew:false` kapatır.

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

## Entegrasyon notları (pilot: Merkezi Servis)
- `windowOptions()` artık `sandbox:false` ile gelir (preload `require` kullanır); `contextIsolation:true`, `nodeIntegration:false` korunur.
- Çerçevesiz pencerede üst çubuk sürükleme alanıdır (`html.fc-host-electron .topbar`).
- Bulut ve yapay zeka kullanmayan uygulamalar: `FC.usage.card({firebase:false, ai:false})` — kart "sınırlı hizmet yok" yazar.
- Klasik şema kaydederken `--active-1` yarı saydam bir vurgu rengi olmalı (`.lang-btn.active` zemini); aksi halde etkin dil metni görünmez.
- Uygulama `init`'i DOMContentLoaded'da çalışmalı; `productName`/`name` asla değiştirilmemeli (veri klasörü ve localStorage bunlara bağlı).
