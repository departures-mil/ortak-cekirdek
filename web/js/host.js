/* FC.host — kabuk köprüsü. Arayüz kodu yalnızca FC.host'u çağırır; altındaki kabuk değişebilir.
     electron : fc-preload.js'in açtığı window.fcHost
     shell    : kendi masaüstü kabuğu (Go + WebView2 / Edge --app vb.) — window.fcHost'u kendisi kurar ve kind:'shell' verir
                (ayrıca shell:'go' gibi bir ad). Sözleşme electron ile AYNI: window{minimize,half,toggleFullscreen,close,getState,onState},
                update{channel, applyPatch(bytes,meta), installFull(bytes,meta), run?(plan,ilerleme)}, net{download(url,ilerleme)}
                (hata kodu e.code ya da iletide 'HTTP_404' → güncel), version, platform, openExternal?, onMainError?.
                Farkı: <html> fc-host-shell alır (Electron'a özgü -webkit-app-region sürükleme kuralları uygulanmaz),
                tanılama/iletişim kayıtlarında 'shell/<platform>' görünür. Eski kabuklar kind:'electron' demeye devam edebilir.
     android  : window.AndroidBridge (yalnızca var olan yöntemler kullanılır; Küçült / Orta gizlenir, Kapat → moveTaskToBack)
     browser  : düz tarayıcı — Tam ekran Fullscreen API ile, diğer pencere düğmeleri gizli, güncelleme = indirme sayfası.
   <html> öğesine fc-host-<tür> sınıfı eklenir.
   Android köprüsünün güncelleme sözleşmesi (yerel tarafta uygulanır):
     updateBegin(kind 'patch'|'full', metaJson) → true · updateChunk(base64) → true · updateFinish() → '{"ok":true}' ya da '{"ok":false,"error":"..."}'
     Yerel taraf yamayı kurulu APK'ya (applicationInfo.sourceDir) uygular, meta.targetSha256 ile doğrular ve kurulumu başlatır.
   Android ağ köprüsü (önerilen; WebView https://appassets.androidplatform.net ya da file:// kaynağından GitHub'a fetch YAPAMAZ —
   github.com yönlendirmesi CORS başlığı vermez → "Failed to fetch"):
     httpGet(id, url)      → yerel indirme (≤ 2 MB metin, ör. latest.json); sonuç window.__fcHttp(id, {status, body} | {error})
     apkUpdate(planJson)   → indirme + yama + SHA-256 + kurulum tamamen yerelde; olaylar window.__fcApk({type:'progress', patch, done,
                             total, finished} | {type:'patchFailed', error} | {type:'installing'} | {type:'done', result} | {type:'error', error})
     Varsa çekirdek bunları kendiliğinden kullanır: FC.host.net.download (manifest) ve FC.host.update.run (Güncelle). */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  function noop() { return Promise.resolve(); }
  function unsupported() { return Promise.reject(Object.assign(new Error('UNSUPPORTED'), { code: 'UNSUPPORTED' })); }

  function electron(h) {
    var w = h.window || {};
    var hu = h.update || {};
    var r = {
      kind: h.kind === 'shell' ? 'shell' : 'electron', shell: h.kind === 'shell' ? String(h.shell || 'custom') : '', platform: h.platform || 'win32',
      can: { minimize: !!w.minimize, half: !!w.half, fullscreen: !!w.toggleFullscreen, close: !!w.close, update: !!(hu.applyPatch || hu.run) },
      window: {
        minimize: function () { return w.minimize ? w.minimize() : noop(); },
        half: function () { return w.half ? w.half() : noop(); },
        toggleFullscreen: function () { return w.toggleFullscreen ? w.toggleFullscreen() : noop(); },
        close: function () { return w.close ? w.close() : noop(); },
        state: function () { return w.getState ? w.getState() : Promise.resolve({}); },
        onState: function (cb) { return w.onState ? w.onState(cb) : function () {}; }
      },
      update: {
        channel: hu.channel || 'win-app',
        applyPatch: function (bytes, meta) { return hu.applyPatch ? hu.applyPatch(bytes, meta) : unsupported(); },
        installFull: function (bytes, meta) { return hu.installFull ? hu.installFull(bytes, meta) : unsupported(); }
      },
      net: h.net && h.net.download ? { download: function (u, p) { return h.net.download(u, p); } } : null,
      onMainError: function (cb) { return h.onMainError ? h.onMainError(cb) : function () {}; },
      openExternal: h.openExternal ? function (u) { return h.openExternal(u); } : null,
      version: function () { return typeof h.version === 'function' ? String(h.version() || '') : (h.version || ''); }
    };
    if (hu.deferred && typeof hu.applyStaged === 'function') {   // "hazırla, kapanınca kur" (fc-preload ≥ otomatik güncelleme)
      r.update.deferred = true;
      r.update.applyStaged = function () { return hu.applyStaged(); };
    }
    if (typeof hu.run === 'function') r.update.run = function (plan, onProgress) { return hu.run(plan, onProgress); };   // kabuk her şeyi kendisi yapar
    return r;
  }

  function b64(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return g.btoa(s);
  }
  var HTTP_MAX = 2 * 1024 * 1024, httpSeq = 0, httpWait = {};
  /* Yerel httpGet: WebView CORS'una takılmadan küçük dosya (latest.json) indirir. */
  function androidNet(a) {
    g.__fcHttp = function (id, r) { var f = httpWait[id]; if (f) { delete httpWait[id]; f(r || {}); } };
    function get(url) {
      return new Promise(function (resolve, reject) {
        var id = 'h' + (++httpSeq) + '_' + Date.now();
        var to = setTimeout(function () { delete httpWait[id]; reject(Object.assign(new Error('TIMEOUT'), { code: 'TIMEOUT' })); }, 45000);
        httpWait[id] = function (r) {
          clearTimeout(to);
          if (r.error) reject(Object.assign(new Error(String(r.error)), { code: 'NETWORK' }));
          else if (r.status !== 200) reject(Object.assign(new Error('HTTP_' + r.status), { code: 'HTTP_' + r.status }));
          else resolve(String(r.body || ''));
        };
        try { a.httpGet(id, url); } catch (e) { clearTimeout(to); delete httpWait[id]; reject(e); }
      });
    }
    return {
      maxBytes: HTTP_MAX,
      download: function (url, onProgress) {
        return get(url).then(function (t) {
          var b = new TextEncoder().encode(t);
          if (onProgress) try { onProgress({ done: b.length, finished: true }); } catch (e) { /* yok */ }
          return b;
        });
      }
    };
  }
  /* Yerel apkUpdate: indirme + yama + doğrulama + kurulum Java'da (büyük APK JS'ye taşınmaz, CORS yok). */
  function androidRun(a) {
    return function (plan, onEv) {
      onEv = onEv || function () {};
      return new Promise(function (resolve, reject) {
        g.__fcApk = function (ev) {
          if (!ev) return;
          if (ev.type === 'progress') onEv({ patch: !!ev.patch, done: ev.done, total: ev.total, finished: !!ev.finished });
          else if (ev.type === 'patchFailed') onEv({ patchFailed: true, error: ev.error });
          else if (ev.type === 'installing') onEv({ installing: true });
          else if (ev.type === 'done') resolve(ev.result || 'done');
          else if (ev.type === 'error') reject(Object.assign(new Error(ev.error || 'FAILED'), { code: ev.error || 'FAILED' }));
        };
        try {
          a.apkUpdate(JSON.stringify({ version: plan.version, full: plan.full,
            patch: plan.mode === 'patch' ? { url: plan.url, sha256: plan.sha256, size: plan.size } : null }));
        } catch (e) { reject(e); }
      });
    };
  }
  function android(a) {
    function has(n) { return typeof a[n] === 'function'; }
    function send(kind, bytes, meta) {
      if (!has('updateBegin')) return unsupported();
      return new Promise(function (res, rej) {
        try {
          if (a.updateBegin(kind, JSON.stringify(meta || {})) === false) throw new Error('BEGIN_FAILED');
          var CH = 768 * 1024, i = 0;
          (function next() {
            try {
              if (i >= bytes.length) {
                var r = {}; try { r = JSON.parse(a.updateFinish() || '{}'); } catch (e) { r = { ok: false, error: 'BAD_REPLY' }; }
                return r.ok ? res(r) : rej(Object.assign(new Error(r.error || 'FAILED'), { code: r.error || 'FAILED' }));
              }
              a.updateChunk(b64(bytes.subarray(i, i + CH))); i += CH;
              setTimeout(next, 0);
            } catch (e) { rej(e); }
          })();
        } catch (e) { rej(e); }
      });
    }
    return {
      kind: 'android', platform: 'android',
      can: { minimize: false, half: false, fullscreen: has('toggleFullscreen'), close: has('moveTaskToBack'), update: has('updateBegin') || has('apkUpdate') },
      window: {
        minimize: noop, half: noop,
        toggleFullscreen: function () { if (has('toggleFullscreen')) a.toggleFullscreen(); return noop(); },
        close: function () { if (has('moveTaskToBack')) a.moveTaskToBack(); return noop(); },
        state: function () { return Promise.resolve({}); }, onState: function () { return function () {}; }
      },
      update: {
        channel: 'android',
        applyPatch: function (bytes, meta) { return send('patch', bytes, meta); },
        installFull: function (bytes, meta) { return send('full', bytes, meta); },
        run: has('apkUpdate') ? androidRun(a) : undefined
      },
      net: has('httpGet') ? androidNet(a) : null,
      onMainError: function () { return function () {}; },
      openExternal: has('openExternal') ? function (u) { a.openExternal(u); } : null,
      version: function () { try { return has('appVersion') ? String(a.appVersion()) : ''; } catch (e) { return ''; } }
    };
  }

  function browser() {
    var d = g.document;
    var fsOk = !!(d && d.documentElement && d.documentElement.requestFullscreen);
    return {
      kind: 'browser', platform: 'web',
      can: { minimize: false, half: false, fullscreen: fsOk, close: false, update: false },
      window: {
        minimize: noop, half: noop, close: noop,
        toggleFullscreen: function () {
          if (!fsOk) return noop();
          return d.fullscreenElement ? d.exitFullscreen() : d.documentElement.requestFullscreen();
        },
        state: function () { return Promise.resolve({ fullscreen: !!(d && d.fullscreenElement) }); },
        onState: function (cb) { if (!d) return function () {}; var f = function () { cb({ fullscreen: !!d.fullscreenElement }); }; d.addEventListener('fullscreenchange', f); return function () { d.removeEventListener('fullscreenchange', f); }; }
      },
      update: { channel: 'web', applyPatch: unsupported, installFull: unsupported },
      net: null,
      onMainError: function () { return function () {}; },
      openExternal: null,
      version: function () { return ''; }
    };
  }

  function detect() {
    if (g.fcHost && g.fcHost.kind !== 'browser') return electron(g.fcHost);
    if (g.AndroidBridge) return android(g.AndroidBridge);
    return browser();
  }
  var host = detect();
  host.redetect = function () { var n = detect(); for (var k in n) host[k] = n[k]; mark(); return host; };
  function mark() {
    var de = g.document && g.document.documentElement; if (!de) return;
    de.classList.remove('fc-host-electron', 'fc-host-shell', 'fc-host-android', 'fc-host-browser');
    de.classList.add('fc-host-' + host.kind);
    if (host.kind === 'android') de.classList.add('is-android');
  }
  mark();
  FC.host = host;
  if (typeof module === 'object' && module.exports) module.exports = host;
})(typeof globalThis !== 'undefined' ? globalThis : this);
