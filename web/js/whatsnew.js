/* FC.whatsnew — güncellemeden sonraki ilk açılışta "Bu sürümde neler yeni".
     FC.whatsnew.start({version:'1.57.0'})   // açılışta bir kez
     FC.whatsnew.show()                       // Ayarlar'dan elle
   Notlar FC.updater kurulumdan ÖNCE fc.whatsnew.pending'e yazar ({version, notes:{tr,en,ar}}); burada o sürümle
   eşleşirse geçerli dilde gösterilir. İlk kurulumda pencere açılmaz. opts.notes ile (ör. gömülü CHANGELOG) verilebilir. */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var cfg = {};
  function S() { return FC.storage; }
  function T(k, v) { return FC.t(k, v); }
  function notesFor(v) {
    if (cfg.notes) { var n = typeof cfg.notes === 'function' ? cfg.notes(v) : cfg.notes; if (n) return n; }
    var p = S().get('whatsnew.pending', null);
    return p && String(p.version) === String(v) ? p.notes : null;
  }
  function show(v) {
    v = v || cfg.version;
    var ui = FC.ui, el = ui.el, notes = FC.i18n.pick(notesFor(v));
    var body = el('div');
    body.appendChild(el('p.muted', { text: T('fc.wn.ver', { v: v }) }));
    var lines = String(notes || '').split(/\r?\n/).map(function (x) { return x.replace(/^\s*[-*•]\s*/, '').trim(); }).filter(Boolean);
    if (lines.length > 1) { var ul = el('ul.fc-notes'); lines.forEach(function (l) { ul.appendChild(el('li', { text: l, dir: 'auto' })); }); body.appendChild(ul); }
    else body.appendChild(el('p', { text: lines[0] || T('fc.wn.none'), dir: 'auto' }));
    body.appendChild(el('div.notice.ok', null, [el('span', { html: ui.icon('check') }), el('span', { text: T('fc.wn.safe') })]));
    return ui.modal({ title: T('fc.wn.title'), icon: 'sparkles', cls: 'small', body: body });
  }
  /** Döner: gösterildiyse true */
  function start(c) {
    cfg = c || {};
    var v = String(cfg.version || (FC.host && FC.host.version()) || '');
    if (!v) return false;
    var seen = S().get('whatsnew.seen', null);
    S().set('whatsnew.seen', v);
    if (!seen || seen === v) return false;   // ilk kurulum ya da aynı sürüm
    if (FC.updater && FC.updater.cmp) { try { if (FC.updater.cmp(v, seen) <= 0) return false; } catch (e) {} }
    setTimeout(function () { show(v); }, cfg.delayMs == null ? 900 : cfg.delayMs);
    return true;
  }
  function button() {
    var ui = FC.ui, b = ui.el('button.btn.small', { type: 'button' });
    function draw() { b.innerHTML = ui.icon('sparkles') + ui.esc(T('fc.wn.show')); }
    b.addEventListener('click', function () { show(); }); draw(); FC.i18n.onChange(draw);
    return b;
  }
  var api = { start: start, show: show, button: button };
  FC.whatsnew = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
