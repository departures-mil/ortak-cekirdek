/* FC.crash — beklenmeyen hataları yöneticiye bildirir (tur:"cokme").
     FC.crash.init({app:'falcon-ofis', version:'1.56.0'})
   window.onerror + unhandledrejection + kabuğun ana süreç hataları (FC.host.onMainError).
   Aynı hata imzası (sürüm başına) bir kez; günde en çok 5 rapor. Yalnızca hata metni, yığın, uygulama, sürüm, platform gider;
   metin içindeki e-posta, yol içindeki kullanıcı adı, URL sorguları, uzun sayılar ve tırnak içi veriler maskelenir. */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var MAX_DAY = 5;
  var IGNORE = /ResizeObserver loop|^Script error\.?$|Failed to fetch|NetworkError|Load failed|network error|AbortError|The user aborted|permission-denied|QuotaExceeded|ERR_INTERNET_DISCONNECTED/i;
  var cfg = { app: '', version: '', now: null }, installed = false;
  function S() { return FC.storage; }
  function T(k, v) { return FC.t(k, v); }
  function now() { return cfg.now ? cfg.now() : new Date(); }
  function day() { return now().toISOString().slice(0, 10); }

  function sanitize(s, max) {
    s = String(s == null ? '' : s);
    s = s.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
      .replace(/(https?:\/\/[^\s?#'")]+)[?#][^\s'")]*/g, '$1')
      .replace(/([A-Za-z]:[\\/]Users[\\/])[^\\/\s]+/gi, '$1<user>')
      .replace(/(\/(?:home|Users)\/)[^/\s]+/g, '$1<user>')
      .replace(/(\/storage\/emulated\/\d+\/)[^\s]*/g, '$1<path>')
      .replace(/\d{6,}/g, '<n>')
      .replace(/(["'`])((?:(?!\1).){0,400})\1/g, function (m, q, inner) { return /^[\w$.\-[\]]{0,40}$/.test(inner) ? m : q + '…' + q; });
    return s.slice(0, max || 600);
  }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); }
  /** İmza: maskelenmiş ileti + yığının ilk iki çerçevesi (satır/sütun hariç, derleme farkı imzayı bozmasın) */
  function signature(msg, stack) {
    var frames = String(stack || '').split('\n').slice(1, 3).map(function (l) { return l.trim().replace(/:\d+:\d+\)?$/, ''); }).join('|');
    return hash(sanitize(msg, 300) + '|' + frames);
  }
  /** Göndermeli mi? Gönderecekse sayaçları günceller. */
  function decide(sig) {
    if (S().get('crash.enabled', true) === false) return false;
    var key = String(cfg.version || '') + ':' + sig;
    var seen = S().get('crash.seen', []); if (!Array.isArray(seen)) seen = [];
    if (seen.indexOf(key) >= 0) return false;
    var d = S().get('crash.day', null), today = day();
    if (!d || d.d !== today) d = { d: today, n: 0 };
    if (d.n >= MAX_DAY) return false;
    d.n++; S().set('crash.day', d);
    seen.push(key); S().set('crash.seen', seen.slice(-200));
    return true;
  }
  function report(err, o) {
    o = o || {};
    var msg = err && (err.message || err.reason) || String(err || '');
    var stack = err && err.stack || '';
    if (!msg || IGNORE.test(msg)) return false;
    var sig = signature(msg, stack);
    if (!decide(sig)) return false;
    var text = '[' + (o.source || 'ui') + '] ' + sanitize(msg, 600) + (stack ? '\n\n' + sanitize(stack, 1800) : '') + '\n\n#' + sig;
    if (FC.contact) FC.contact.post({ tur: 'cokme', mesaj: text }, { mail: false });
    return true;
  }
  function install() {
    if (installed || !g.addEventListener) return; installed = true;
    g.addEventListener('error', function (e) {
      if (!e || (!e.error && !e.message)) return;   // kaynak yükleme hatası (img/script) → çökme değil
      report(e.error || { message: e.message, stack: (e.filename || '') + ':' + (e.lineno || '') }, { source: 'ui' });
    });
    g.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason; if (!r) return;
      if (r.code && /^(permission-denied|unavailable|resource-exhausted|auth\/|HTTP_|OFFLINE)/.test(String(r.code))) return;
      report(typeof r === 'object' ? r : { message: String(r) }, { source: 'promise' });
    });
    try { if (FC.host && FC.host.onMainError) FC.host.onMainError(function (e) { report(e, { source: 'main' }); }); } catch (e) {}
  }
  function init(c) { for (var k in c) cfg[k] = c[k]; install(); return api; }
  function sentToday() { var d = S().get('crash.day', null); return d && d.d === day() ? d.n : 0; }
  /** Ayarlar kartı: aç/kapat */
  function card() {
    var ui = FC.ui, c = ui.card({ key: 'crash', title: '', icon: 'bug' });
    function draw() {
      c.innerHTML = '';
      c.appendChild(ui.el('h3.card-title', { html: ui.icon('bug') + '<span>' + ui.esc(T('fc.crash.title')) + '</span>' }));
      c.appendChild(ui.el('p.card-desc', { text: T('fc.crash.desc') }));
      var cb = ui.el('input', { type: 'checkbox' }); cb.checked = S().get('crash.enabled', true) !== false;
      cb.addEventListener('change', function () { S().set('crash.enabled', cb.checked); });
      c.appendChild(ui.el('label.check', null, [cb, ui.el('span', { text: T('fc.crash.on') })]));
      c.appendChild(ui.el('p.field-hint', { text: T('fc.crash.sent', { n: sentToday() }), style: 'margin:10px 0 0' }));
    }
    draw(); FC.i18n.onChange(draw);
    return c;
  }
  var api = { init: init, report: report, card: card, sentToday: sentToday, _sanitize: sanitize, _signature: signature, _decide: decide, _config: function (c) { cfg = c; } , MAX_DAY: MAX_DAY };
  FC.crash = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
