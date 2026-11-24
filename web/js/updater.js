/* FC.updater — GitHub Releases latest.json ile tek tuşla güncelleme (SPEC "Güncelleme manifesti" / "Yama kuralları").
     FC.updater.start({repo:'falcon-ofis', app:'falcon-ofis', version:'1.56.0'})   // açılışta + 6 saatte bir denetler
     FC.updater.run()        // "Güncelle": indir → SHA-256 doğrula → kabuğa ver (yama hata verirse kendiliğinden tam dosya)
     FC.updater.subscribe(state => ...)
   Kanal: cfg.channel || FC.host.update.channel (electron: win-app, android: android). "Atla" yoktur; yeni sürüm hep önerilir.
   Kabuk dosyayı değiştirir: FC.host.update.applyPatch(bytes, meta) / installFull(bytes, meta); meta.targetSha256 = tam dosyanın SHA'sı.
   Ya da kabuk hepsini kendisi yapar: FC.host.update.run(plan, ilerleme) (Android Java; bkz. run()). */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var OWNER = 'departures-mil';
  var cfg = {}, timer = null, subs = [], running = false;
  var state = { status: 'idle', current: '', plan: null, progress: null, mode: null, error: null, checkedAt: null };

  /* ---------- saf yardımcılar (test edilir) ---------- */
  function parse(v) {
    var m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(String(v || '').trim());
    return m ? { n: [+m[1], +m[2], +m[3]], pre: m[4] || '' } : null;
  }
  function cmp(a, b) {
    var x = parse(a), y = parse(b);
    if (!x || !y) throw new Error('BAD_VERSION');
    for (var i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] < y.n[i] ? -1 : 1;
    if (x.pre === y.pre) return 0;
    if (!x.pre) return 1; if (!y.pre) return -1;
    return x.pre < y.pre ? -1 : 1;
  }
  function assetUrl(o, version, file) { return 'https://github.com/' + (o.owner || OWNER) + '/' + o.repo + '/releases/download/v' + version + '/' + encodeURIComponent(file); }
  function manifestUrl(o) { return o.manifestUrl || 'https://github.com/' + (o.owner || OWNER) + '/' + o.repo + '/releases/latest/download/latest.json'; }
  function goodAsset(a) { return a && typeof a.file === 'string' && a.file && /^[0-9a-f]{64}$/i.test(a.sha256 || '') && +a.size > 0; }

  /** Manifestten ne indirileceğini seçer. Döner: null (güncel) ya da {version, notes, channel, mode:'patch'|'full', file, size, sha256, url, full:{...}} */
  function plan(man, o) {
    if (!man || man.schema !== 1 || !parse(man.version)) throw Object.assign(new Error('BAD_MANIFEST'), { code: 'BAD_MANIFEST' });
    if (o.app && man.app && man.app !== o.app) throw Object.assign(new Error('WRONG_APP'), { code: 'WRONG_APP' });
    if (cmp(man.version, o.version) <= 0) return null;
    var assets = man.assets || {}, ch = o.channel, belowMin = !!(man.minVersion && parse(man.minVersion) && cmp(o.version, man.minVersion) < 0);
    if (belowMin && o.setupChannel && goodAsset(assets[o.setupChannel])) ch = o.setupChannel;
    var a = assets[ch];
    if (!goodAsset(a)) throw Object.assign(new Error('NO_CHANNEL'), { code: 'NO_CHANNEL', channel: ch });
    var full = { file: a.file, size: +a.size, sha256: a.sha256.toLowerCase(), url: assetUrl(o, man.version, a.file) };
    var p = !belowMin && a.patches && a.patches[normVer(o.version)];
    var r = { version: normVer(man.version), notes: man.notes || {}, published: man.published || '', channel: ch, belowMin: belowMin, full: full, targetSha256: full.sha256, targetSize: full.size };
    if (goodAsset(p) && +p.size < full.size) {
      r.mode = 'patch'; r.file = p.file; r.size = +p.size; r.sha256 = p.sha256.toLowerCase(); r.url = assetUrl(o, man.version, p.file);
    } else { r.mode = 'full'; r.file = full.file; r.size = full.size; r.sha256 = full.sha256; r.url = full.url; }
    return r;
  }
  function normVer(v) { return String(v).replace(/^v/, ''); }
  async function sha256(bytes) {
    var c = g.crypto && g.crypto.subtle;
    if (!c) throw Object.assign(new Error('NO_CRYPTO'), { code: 'NO_CRYPTO' });
    var h = new Uint8Array(await c.digest('SHA-256', bytes));
    var s = ''; for (var i = 0; i < h.length; i++) s += (h[i] < 16 ? '0' : '') + h[i].toString(16);
    return s;
  }

  /* ---------- durum ---------- */
  function set(p) { for (var k in p) state[k] = p[k]; var s = snapshot(); subs.slice().forEach(function (f) { try { f(s); } catch (e) {} }); }
  function snapshot() { var o = {}; for (var k in state) o[k] = state[k]; return o; }
  function subscribe(f) { subs.push(f); try { f(snapshot()); } catch (e) {} return function () { subs = subs.filter(function (x) { return x !== f; }); }; }
  function host() { return FC.host || { kind: 'browser', can: {}, update: {} }; }
  function opts() {
    var h = host();
    return { repo: cfg.repo, owner: cfg.owner, app: cfg.app || cfg.repo, version: normVer(cfg.version || (h.version && h.version()) || '0.0.0'), channel: cfg.channel || (h.update && h.update.channel) || 'win-app', setupChannel: cfg.setupChannel, manifestUrl: cfg.manifestUrl };
  }
  function fetchFn() { return cfg.fetch || g.fetch; }
  function online() { return !(g.navigator && g.navigator.onLine === false); }
  async function getBytes(url, o) {
    var h = host();
    if (!cfg.fetch && h.net && h.net.download) {
      var tr = FC.progress.tracker(o.total);
      var b = await h.net.download(url, function (d) { if (o.onProgress) o.onProgress(tr.update(d.done != null ? d.done : d, d.finished)); });
      return b instanceof Uint8Array ? b : new Uint8Array(b);
    }
    return FC.progress.download(url, { total: o.total, onProgress: o.onProgress, fetch: fetchFn() });
  }
  async function loadManifest() {
    var o = opts(), url = manifestUrl(o);
    if (!cfg.fetch && host().net && host().net.download) {
      /* Kabuk indirmesinde de 404 (henüz yayın yok) "güncel" sayılır. Electron IPC hata kodunu iletide taşır
         ("Error invoking remote method 'fc:net:download': Error: HTTP_404"); kod iletiden çıkarılır. */
      var b;
      try { b = await host().net.download(url, function () {}); }
      catch (e) {
        var txt = String((e && (e.code || '')) || '') + ' ' + String((e && e.message) || e || '');
        if (/HTTP_404\b/.test(txt)) return null;
        var m = /(HTTP_\d+|URL_NOT_ALLOWED)/.exec(txt);
        if (m && !(e && e.code)) throw Object.assign(new Error(m[1]), { code: m[1] });
        throw e;
      }
      return JSON.parse(new TextDecoder().decode(b));
    }
    var r = await fetchFn()(url, { cache: 'no-store' });
    if (r.status === 404) return null;   // henüz yayın yok
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { code: 'HTTP_' + r.status });
    return r.json();
  }

  /** Denetle. {silent:true} arka plan denetimi: hata kullanıcıya gösterilmez. */
  async function check(o) {
    o = o || {};
    if (running || state.status === 'checking') return state.plan;
    if (!cfg.repo && !cfg.manifestUrl) return null;
    if (!online()) { if (!o.silent) set({ error: 'OFFLINE' }); return state.plan; }
    var prev = state.status;
    if (!o.silent) set({ status: 'checking', error: null });
    try {
      var man = await loadManifest(), op = opts();
      var p = man ? plan(man, op) : null;
      if (p && FC.storage) FC.storage.set('whatsnew.pending', { version: p.version, notes: p.notes });
      set({ status: p ? 'available' : 'none', plan: p, current: op.version, checkedAt: new Date().toISOString(), error: null });
      return p;
    } catch (e) {
      set({ status: o.silent ? (prev === 'checking' ? 'idle' : prev) : 'error', error: e.code || e.message || 'ERR' });
      return null;
    } finally { if (state.status === 'checking') set({ status: 'idle' }); }
  }

  async function fetchVerified(item, mode) {
    set({ status: 'downloading', mode: mode, progress: { done: 0, total: item.size, pct: 0, remaining: item.size, speed: 0 } });
    var bytes = await getBytes(item.url, { total: item.size, onProgress: function (p) { set({ progress: p }); } });
    set({ status: 'verifying' });
    if (bytes.length !== item.size || (await sha256(bytes)) !== item.sha256) throw Object.assign(new Error('BAD_HASH'), { code: 'BAD_HASH' });
    return bytes;
  }
  /** Tek tuş: her şeyi yapar. Yama yolunda herhangi bir hata → tam dosya. */
  async function run() {
    if (running) return;
    var p = state.plan || (await check());
    if (!p) return;
    var h = host();
    if (!h.can || !h.can.update) {
      set({ status: 'available' });
      FC.ui && FC.ui.openUrl('https://github.com/' + (cfg.owner || OWNER) + '/' + cfg.repo + '/releases/latest');
      return 'browser';
    }
    running = true; set({ error: null, fallback: false, patchError: null });
    var meta = { version: p.version, channel: p.channel, targetSha256: p.targetSha256, targetSize: p.targetSize, file: p.full.file };
    if (FC.storage) FC.storage.set('whatsnew.pending', { version: p.version, notes: p.notes });
    /* Yerel kabuk indirme + yama + kurulumu kendisi yapabiliyorsa (Android Java: WebView'de CORS yok, büyük APK JS'ye taşınmaz;
       ortak ApkPatchInstaller: kurulu APK + yama → yeni APK, hata olursa tam APK): FC.host.update.run(plan, ilerleme).
       ilerleme olayları: {patch:bool, done, total, finished} | {patchFailed:true, error} | {installing:true}.
       Döner: 'restarting' | 'done' | 'patch' | 'full' (ya da Promise). Hata → durum 'error'. */
    if (h.update && typeof h.update.run === 'function') {
      try {
        var tr = null, curMode = null;
        set({ status: 'downloading', mode: p.mode, progress: { done: 0, total: p.size, pct: 0, remaining: p.size, speed: 0 } });
        var rn = await h.update.run(p, function (ev) {
          if (!ev) return;
          if (ev.patchFailed) { set({ fallback: true, patchError: ev.error || 'PATCH' }); return; }
          if (ev.installing) { set({ status: 'installing' }); return; }
          var m = ev.patch ? 'patch' : 'full';
          if (!tr || m !== curMode) { tr = FC.progress.tracker(ev.total || (m === 'patch' ? p.size : p.full.size)); curMode = m; }
          set({ status: 'downloading', mode: m, progress: tr.update(ev.done || 0, ev.finished) });
        });
        set({ status: rn === 'restarting' ? 'restarting' : 'done' });
        return rn || 'native';
      } catch (e) {
        set({ status: 'error', error: e.code || e.message || 'ERR' });
        throw e;
      } finally { running = false; }
    }
    try {
      if (p.mode === 'patch') {
        try {
          var pb = await fetchVerified(p, 'patch');
          set({ status: 'installing' });
          var r1 = await h.update.applyPatch(pb, Object.assign({ patchSha256: p.sha256 }, meta));
          set({ status: r1 === 'restarting' ? 'restarting' : 'done' });
          return 'patch';
        } catch (e) {
          set({ fallback: true, patchError: e.code || e.message });
        }
      }
      var fb = await fetchVerified(p.full, 'full');
      set({ status: 'installing' });
      var r2 = await h.update.installFull(fb, meta);
      set({ status: r2 === 'restarting' ? 'restarting' : 'done' });
      return 'full';
    } catch (e) {
      set({ status: 'error', error: e.code || e.message || 'ERR' });
      throw e;
    } finally { running = false; }
  }

  function start(c) {
    cfg = c || {};
    if (timer) clearInterval(timer);
    var ms = Math.max(1, cfg.intervalHours || 6) * 3600000;
    set({ current: opts().version });
    if (cfg.autoCheck !== false) {
      setTimeout(function () { check({ silent: true }); }, cfg.firstDelayMs == null ? 6000 : cfg.firstDelayMs);
      timer = setInterval(function () { check({ silent: true }); }, ms);
      if (g.addEventListener) g.addEventListener('online', function () { if (state.status !== 'available') check({ silent: true }); });
    }
    return api;
  }
  function errorText(code) {
    var t = FC.t || function (k) { return k; };
    if (code === 'BAD_HASH') return t('fc.update.bad');
    if (code === 'OFFLINE') return t('fc.update.offline');
    return t('fc.update.failed', { e: code });
  }
  var api = { start: start, check: check, run: run, subscribe: subscribe, state: snapshot, errorText: errorText, plan: plan, cmp: cmp, parse: parse, sha256: sha256, manifestUrl: manifestUrl, assetUrl: assetUrl, _reset: function () { cfg = {}; subs = []; running = false; state = { status: 'idle', current: '', plan: null, progress: null, mode: null, error: null, checkedAt: null }; if (timer) clearInterval(timer); timer = null; }, _config: function (c) { cfg = c; } };
  FC.updater = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
