/* FC.host — kabuk köprüsü. Arayüz kodu yalnızca FC.host'u çağırır; altındaki kabuk değişebilir.
     electron : fc-preload.js'in açtığı window.fcHost
     android  : window.AndroidBridge (yalnızca var olan yöntemler kullanılır; Küçült / Orta gizlenir, Kapat → moveTaskToBack)
     browser  : düz tarayıcı — Tam ekran Fullscreen API ile, diğer pencere düğmeleri gizli, güncelleme = indirme sayfası.
   <html> öğesine fc-host-<tür> sınıfı eklenir.
   Android köprüsünün güncelleme sözleşmesi (yerel tarafta uygulanır):
     updateBegin(kind 'patch'|'full', metaJson) → true · updateChunk(base64) → true · updateFinish() → '{"ok":true}' ya da '{"ok":false,"error":"..."}'
     Yerel taraf yamayı kurulu APK'ya (applicationInfo.sourceDir) uygular, meta.targetSha256 ile doğrular ve kurulumu başlatır. */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  function noop() { return Promise.resolve(); }
  function unsupported() { return Promise.reject(Object.assign(new Error('UNSUPPORTED'), { code: 'UNSUPPORTED' })); }

  function electron(h) {
    var w = h.window || {};
    return {
      kind: 'electron', platform: h.platform || 'win32',
      can: { minimize: !!w.minimize, half: !!w.half, fullscreen: !!w.toggleFullscreen, close: !!w.close, update: !!(h.update && h.update.applyPatch) },
      window: {
        minimize: function () { return w.minimize ? w.minimize() : noop(); },
        half: function () { return w.half ? w.half() : noop(); },
        toggleFullscreen: function () { return w.toggleFullscreen ? w.toggleFullscreen() : noop(); },
        close: function () { return w.close ? w.close() : noop(); },
        state: function () { return w.getState ? w.getState() : Promise.resolve({}); },
        onState: function (cb) { return w.onState ? w.onState(cb) : function () {}; }
      },
      update: {
        channel: (h.update && h.update.channel) || 'win-app',
        applyPatch: function (bytes, meta) { return h.update.applyPatch(bytes, meta); },
        installFull: function (bytes, meta) { return h.update.installFull(bytes, meta); }
      },
      net: h.net && h.net.download ? { download: function (u, p) { return h.net.download(u, p); } } : null,
      onMainError: function (cb) { return h.onMainError ? h.onMainError(cb) : function () {}; },
      openExternal: h.openExternal ? function (u) { return h.openExternal(u); } : null,
      version: function () { return h.version || ''; }
    };
  }

  function b64(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return g.btoa(s);
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
      can: { minimize: false, half: false, fullscreen: has('toggleFullscreen'), close: has('moveTaskToBack'), update: has('updateBegin') },
      window: {
        minimize: noop, half: noop,
        toggleFullscreen: function () { if (has('toggleFullscreen')) a.toggleFullscreen(); return noop(); },
        close: function () { if (has('moveTaskToBack')) a.moveTaskToBack(); return noop(); },
        state: function () { return Promise.resolve({}); }, onState: function () { return function () {}; }
      },
      update: {
        channel: 'android',
        applyPatch: function (bytes, meta) { return send('patch', bytes, meta); },
        installFull: function (bytes, meta) { return send('full', bytes, meta); }
      },
      net: null,
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
    de.classList.remove('fc-host-electron', 'fc-host-android', 'fc-host-browser');
    de.classList.add('fc-host-' + host.kind);
    if (host.kind === 'android') de.classList.add('is-android');
  }
  mark();
  FC.host = host;
  if (typeof module === 'object' && module.exports) module.exports = host;
})(typeof globalThis !== 'undefined' ? globalThis : this);
