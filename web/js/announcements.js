/* FC.announcements — yönetici duyuruları (duyurular/istemci/duyuru.js'in çekirdek tasarımlı sürümü).
     FC.announcements.start({app:'kitaplik', version:'2.5.0', onUpdate: () => FC.updater.run()})
     topbar before: [FC.announcements.button()]     // 🔔 + okunmamış sayısı
   Kaynak: raw.githubusercontent.com/departures-mil/duyurular/main/duyurular.json (30 dk'da bir; çevrimdışıyken önbellek).
   Yeni duyuru bir kez kendiliğinden açılır, sonra zil listesinden okunur. Alanlar: id, tarih, baslik{tr,en,ar}, metin{…},
   hedef['*'|uygulama], aktif, baslangic, bitis, altSurum, ustSurum, link, onem:'onemli', guncellemeDugmesi. */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var SRC = 'https://raw.githubusercontent.com/departures-mil/duyurular/main/duyurular.json';
  var cfg = { app: '', version: '0.0.0', intervalMin: 30 }, list = [], queue = [], open = false, btns = [];
  function S() { return FC.storage; }
  function T(k, v) { return FC.t(k, v); }
  function seen() { var a = S().get('ann.seen', []); return Array.isArray(a) ? a : []; }
  function markSeen(id) { var a = seen(); if (a.indexOf(id) < 0) { a.push(id); S().set('ann.seen', a.slice(-300)); } }
  function cmpLoose(a, b) {
    var x = String(a).replace(/^v\.?/i, '').split('.'), y = String(b).replace(/^v\.?/i, '').split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var p = +x[i] || 0, q = +y[i] || 0; if (p !== q) return p < q ? -1 : 1; }
    return 0;
  }
  function fits(d) {
    if (!d || !d.id || d.aktif === false) return false;
    var h = d.hedef || ['*'];
    if (h.indexOf('*') < 0 && h.indexOf(cfg.app) < 0) return false;
    var now = Date.now();
    if (d.baslangic && Date.parse(d.baslangic) > now) return false;
    if (d.bitis && Date.parse(d.bitis) < now) return false;
    if (d.altSurum && cmpLoose(cfg.version, d.altSurum) < 0) return false;
    if (d.ustSurum && cmpLoose(cfg.version, d.ustSurum) > 0) return false;
    return true;
  }
  function date(d) { try { return new Date(d.tarih).toLocaleDateString(FC.i18n.locale()); } catch (e) { return ''; } }
  function item(d) {
    var ui = FC.ui, el = ui.el, pick = FC.i18n.pick;
    var h = el('h3', null, [d.onem === 'onemli' ? el('span.fc-tag', { text: T('fc.ann.important') }) : null, el('span', { text: pick(d.baslik), dir: 'auto' })]);
    var box = el('div.fc-ann', null, [h, el('div.fc-date', { text: date(d) }), el('div.fc-text', { text: pick(d.metin), dir: 'auto' })]);
    if (d.link) box.appendChild(el('div.fc-row', { style: 'margin-top:8px' }, [el('a', { href: d.link, html: ui.icon('ext') + ' ' + ui.esc(T('fc.ann.link')), onclick: function (e) { e.preventDefault(); ui.openUrl(d.link); } })]));
    return box;
  }
  function next() {
    if (open || !queue.length || !g.document.body) return;
    var d = queue.shift(); open = true;
    var b = [];
    if (d.guncellemeDugmesi && cfg.onUpdate) b.push({ label: T('fc.ann.update'), icon: 'download', onClick: function () { try { cfg.onUpdate(); } catch (e) {} } });
    b.push({ label: T('fc.ok'), cls: 'primary' });
    FC.ui.modal({ title: T('fc.ann.title'), icon: 'bell', cls: 'small', body: item(d), buttons: b, onClose: function () { markSeen(d.id); open = false; draw(); setTimeout(next, 300); } });
  }
  function showList() {
    var body = FC.ui.el('div');
    if (list.length) list.forEach(function (d) { body.appendChild(item(d)); }); else body.appendChild(FC.ui.el('p.muted', { text: T('fc.ann.none') }));
    list.forEach(function (d) { markSeen(d.id); });
    draw();
    return FC.ui.modal({ title: T('fc.ann.title'), icon: 'bell', body: body, buttons: [{ label: T('fc.close'), cls: 'primary' }] });
  }
  function unread() { var s = seen(); return list.filter(function (d) { return s.indexOf(d.id) < 0; }).length; }
  function draw() {
    btns.forEach(function (b) {
      var n = unread();
      b.innerHTML = FC.ui.icon('bell') + (n ? '<span class="sync-badge">' + n + '</span>' : '');
      b.title = T('fc.ann.title'); b.setAttribute('aria-label', T('fc.ann.title') + (n ? ' (' + n + ')' : ''));
    });
  }
  function button() { var b = FC.ui.el('button.icon-btn.ann-btn', { type: 'button' }); b.addEventListener('click', showList); btns.push(b); draw(); FC.i18n.onChange(draw); return b; }
  function ingest(all) {
    list = (all || []).filter(fits).sort(function (a, b) { return String(b.tarih).localeCompare(String(a.tarih)); });
    var s = seen();
    list.slice().reverse().forEach(function (d) { if (s.indexOf(d.id) < 0 && !queue.some(function (q) { return q.id === d.id; })) queue.push(d); });
    draw(); if (cfg.autoOpen !== false) next();
  }
  function refresh() {
    var f = cfg.fetch || g.fetch;
    return f((cfg.source || SRC) + '?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { var a = (j && j.duyurular) || []; S().set('ann.cache', a); ingest(a); })
      .catch(function () { ingest(S().get('ann.cache', [])); });
  }
  function start(c) {
    for (var k in c) cfg[k] = c[k];
    setTimeout(refresh, cfg.firstDelayMs == null ? 4000 : cfg.firstDelayMs);
    setInterval(refresh, Math.max(5, cfg.intervalMin) * 60000);
    return api;
  }
  var api = { start: start, refresh: refresh, button: button, show: showList, unread: unread, _ingest: ingest, _fits: fits };
  FC.announcements = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
