/* FC.ui — küçük DOM yardımcıları: el(), icon(), modal(), toast(). Çerçevesizdir; React içinde de güvenle çağrılır. */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var P = {
    sync: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    cloudOff: '<path d="m2 2 20 20"/><path d="M5.8 5.8A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.3-.2"/><path d="M21.5 15.5A4.5 4.5 0 0 0 17.5 10h-1.8A7 7 0 0 0 10 5.1"/>',
    wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/>',
    wifiOff: '<path d="m2 2 20 20"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M5 12.55a11 11 0 0 1 5.17-2.39"/><path d="M1.42 9a16 16 0 0 1 4.7-2.88"/><path d="M12 20h.01"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    minus: '<path d="M5 12h14"/>',
    half: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
    full: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    bug: '<path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6M12 20v-9M6 13H2M22 13h-4"/>',
    sparkles: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2Z"/><path d="M19 17v4M17 19h4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
  };
  function icon(name, cls) {
    return '<svg class="fc-i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[name] || '') + '</svg>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /** el('button.btn.primary', {type:'button', onclick: f}, ['metin', childEl]) — html: için attrs.html */
  function el(spec, attrs, kids) {
    var m = String(spec).split('.'), e = g.document.createElement(m[0] || 'div');
    if (m.length > 1) e.className = m.slice(1).join(' ');
    attrs = attrs || {};
    for (var k in attrs) {
      var v = attrs[k]; if (v === undefined || v === null || v === false) continue;
      if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className += (e.className ? ' ' : '') + v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(kids) ? kids : kids != null ? [kids] : []).forEach(function (c) {
      if (c == null || c === false) return;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? g.document.createTextNode(String(c)) : c);
    });
    return e;
  }
  /** Modal ve bildirimlerin bağlandığı kök (bağımsız eklentide Shadow DOM; normalde body). */
  function root() { return (FC.ui && FC.ui.root) || g.document.body; }
  var stack = [];
  /** modal({title, icon, body: Node|string(html), buttons:[{label, cls, onClick(close) → false ile açık kalır}], cls, onClose, dismiss:true}) */
  function modal(o) {
    o = o || {};
    var back = el('div.modal-backdrop'), box = el('div.modal' + (o.cls ? '.' + o.cls : ''), { role: 'dialog', 'aria-modal': 'true' });
    var head = el('div.modal-header'), h = el('h2', { html: (o.icon ? icon(o.icon) + ' ' : '') + esc(o.title || '') });
    var x = el('button.icon-btn', { type: 'button', 'aria-label': FC.t ? FC.t('fc.close') : 'Close', html: icon('x') });
    head.appendChild(h); if (o.dismiss !== false) head.appendChild(x);
    var body = el('div.modal-body');
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    var foot = el('div.modal-footer');
    box.appendChild(head); box.appendChild(body);
    var closed = false;
    function close() {
      if (closed) return; closed = true;
      if (back.parentNode) back.parentNode.removeChild(back);
      stack = stack.filter(function (s) { return s !== api; });
      g.document.removeEventListener('keydown', onKey);
      if (o.onClose) try { o.onClose(); } catch (e) {}
    }
    function setButtons(list) {
      foot.innerHTML = '';
      (list || []).forEach(function (b) {
        if (b === 'spacer') { foot.appendChild(el('span.fc-spacer')); return; }
        var btn = el('button.btn' + (b.cls ? '.' + b.cls.split(' ').join('.') : ''), { type: 'button', html: (b.icon ? icon(b.icon) : '') + esc(b.label) });
        if (b.disabled) btn.disabled = true;
        btn.addEventListener('click', function () { var r = b.onClick ? b.onClick(close, btn) : undefined; if (r !== false) close(); });
        foot.appendChild(btn);
      });
      if (list && list.length) { if (!foot.parentNode) box.appendChild(foot); } else if (foot.parentNode) box.removeChild(foot);
    }
    function onKey(e) { if (e.key === 'Escape' && o.dismiss !== false && stack[stack.length - 1] === api) close(); }
    x.addEventListener('click', close);
    if (o.dismiss !== false) back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    g.document.addEventListener('keydown', onKey);
    setButtons(o.buttons || [{ label: FC.t ? FC.t('fc.ok') : 'OK', cls: 'primary' }]);
    back.appendChild(box); root().appendChild(back);
    var api = { el: box, body: body, title: h, close: close, setButtons: setButtons, setTitle: function (s, ic) { h.innerHTML = (ic ? icon(ic) + ' ' : '') + esc(s); } };
    stack.push(api);
    return api;
  }
  function toast(msg, kind, ms) {
    var r = root(), host = r.querySelector('.toasts');
    if (!host) { host = el('div.toasts', { 'aria-live': 'polite' }); r.appendChild(host); }
    var t = el('div.toast' + (kind ? '.' + kind : ''), { role: 'status', text: msg });
    host.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 4200);
    return t;
  }
  /** Ayarlar kartı iskeleti: {id, title, icon, desc} → <section class="card"> */
  function card(o) {
    var c = el('section.card', { id: o.id, 'data-fc-card': o.key || o.id });
    c.appendChild(el('h3.card-title', { html: (o.icon ? icon(o.icon) : '') + '<span>' + esc(o.title) + '</span>' }));
    if (o.desc) c.appendChild(el('p.card-desc', { text: o.desc }));
    return c;
  }
  function openUrl(u) {
    try { if (FC.host && FC.host.openExternal) return FC.host.openExternal(u); } catch (e) {}
    g.open(u, '_blank', 'noopener');
  }
  var api = { el: el, icon: icon, esc: esc, modal: modal, toast: toast, card: card, openUrl: openUrl, icons: P };
  FC.ui = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
