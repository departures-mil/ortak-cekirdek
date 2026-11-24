/* FC.contact — "Admin ile iletişim" kartı ve yöneticinin gelen kutusu (SPEC "Admin gelen kutusu").
     FC.contact.init({app:'falcon-ofis', version:'1.56.0'})
     FC.contact.mount(ayarlarKapsayicisi)     // kart kapsayıcının SON kartı olur ve öyle kalır
     FC.contact.send({tur:'oneri'|'hata', mesaj, iletisim})  → 'sent' | 'queued'
   Firestore REST (proje comm-calc-103111111, koleksiyon mesajlar, yalnız ekleme). Gönderilemeyen yerel kuyruğa alınır,
   internet gelince yeniden denenir. Kullanıcı mesajında gelen kutusu ulaşılamazsa yedek FormSubmit kullanılır
   (adres programda açık yazılmaz). Çökme raporları yalnız gelen kutusuna gider. */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var INBOX = 'https://firestore.googleapis.com/v1/projects/comm-calc-103111111/databases/(default)/documents/mesajlar?key=AIzaSyB12RFS6ENPpmnnPsETfjedNH-3hmNWQvA';
  var QKEY = 'contact.queue', MAXQ = 30;
  var cfg = { app: '', version: '' }, flushing = false, subs = [];
  function T(k, v) { return FC.t(k, v); }
  function S() { return FC.storage; }
  function to() { return g.atob('').split('').reverse().join(''); }
  function deviceId() {
    var id = S().get('device');
    if (!id) {
      var b = new Uint8Array(9); try { g.crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < 9; i++) b[i] = Math.random() * 256 | 0; }
      id = Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
      S().set('device', id);
    }
    return id;
  }
  function platform() {
    var h = FC.host || {}, nav = g.navigator || {};
    var os = /Android/i.test(nav.userAgent || '') ? 'android' : /Win/i.test(nav.platform || nav.userAgent || '') ? 'windows' : /Mac/i.test(nav.platform || '') ? 'mac' : /Linux/i.test(nav.platform || '') ? 'linux' : 'web';
    return (h.kind || 'browser') + '/' + (h.platform && h.platform !== 'web' ? h.platform : os);
  }
  function version() { try { return String(typeof cfg.version === 'function' ? cfg.version() : cfg.version || (FC.host && FC.host.version()) || ''); } catch (e) { return ''; } }
  /** SPEC alanları; hepsi stringValue */
  function fields(o) {
    var f = {
      tur: o.tur || 'oneri', uygulama: cfg.app || '', surum: version(), platform: platform(),
      dil: FC.i18n ? FC.i18n.lang() : 'tr', mesaj: String(o.mesaj || '').slice(0, 5000), zaman: new Date().toISOString(), cihaz: deviceId()
    };
    if (o.iletisim) f.iletisim = String(o.iletisim).slice(0, 160);
    return f;
  }
  function fetchFn() { return cfg.fetch || g.fetch; }
  function inbox(f) {
    var body = { fields: {} };
    Object.keys(f).forEach(function (k) { body.fields[k] = { stringValue: String(f[k]) }; });
    return fetchFn()(INBOX, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.ok; }, function () { return false; });
  }
  function mail(f) {
    var body = { _subject: (f.uygulama || 'Uygulama') + ': ' + f.tur, _template: 'table', _captcha: 'false', Tur: f.tur, Mesaj: f.mesaj, Uygulama: f.uygulama, Surum: f.surum, Platform: f.platform, Dil: f.dil, Cihaz: f.cihaz };
    if (f.iletisim) { body.Iletisim = f.iletisim; if (/@/.test(f.iletisim)) body._replyto = f.iletisim; }
    return fetchFn()('https://formsubmit.co/ajax/' + to(), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) { return String(j.success) === 'true'; }, function () { return false; });
  }
  function deliver(item) {
    return inbox(item.f).then(function (ok) {
      if (ok) return true;
      return item.mail ? mail(item.f) : false;
    });
  }
  function queue() { var q = S().get(QKEY, []); return Array.isArray(q) ? q : []; }
  function setQueue(q) { S().set(QKEY, q.slice(-MAXQ)); subs.forEach(function (f) { try { f(q.length); } catch (e) {} }); }
  function enqueue(item) { var q = queue(); q.push(item); setQueue(q); }
  function online() { return !(g.navigator && g.navigator.onLine === false); }
  /** Ham gönderim (çökme raporu da bunu kullanır). mail: yedek e-posta kullanılsın mı */
  function post(o, opt) {
    var item = { f: fields(o), mail: !!(opt && opt.mail) };
    if (!online()) { enqueue(item); return Promise.resolve('queued'); }
    return deliver(item).then(function (ok) { if (ok) { flush(); return 'sent'; } enqueue(item); return 'queued'; });
  }
  function send(o) { return post({ tur: o.tur === 'hata' ? 'hata' : 'oneri', mesaj: o.mesaj, iletisim: o.iletisim }, { mail: true }); }
  function flush() {
    if (flushing || !online()) return Promise.resolve();
    var q = queue(); if (!q.length) return Promise.resolve();
    flushing = true;
    return deliver(q[0]).then(function (ok) {
      flushing = false;
      if (!ok) return;
      var rest = queue(); rest.shift(); setQueue(rest);
      return flush();
    }, function () { flushing = false; });
  }

  /** Kartı kur; kapsayıcıya sonradan kart eklense de bu kart en sonda kalır. */
  function mount(container) {
    if (!container) return null;
    var ui = FC.ui, el = ui.el, old = container.querySelector('[data-fc-card="contact"]');
    if (old) old.remove();
    var c = ui.card({ key: 'contact', id: 'fc-contact', title: '', icon: 'mail' });
    function draw() {
      var keep = c.querySelector('textarea') ? { m: c.querySelector('textarea').value, r: c.querySelector('input').value, t: c.querySelector('select').value } : null;
      c.innerHTML = '';
      c.appendChild(el('h3.card-title', { html: ui.icon('mail') + '<span>' + ui.esc(T('fc.contact.title')) + '</span>' }));
      c.appendChild(el('p.card-desc', { text: T('fc.contact.desc') }));
      var type = el('select', null, [el('option', { value: 'oneri', text: T('fc.contact.oneri') }), el('option', { value: 'hata', text: T('fc.contact.hata') })]);
      var reach = el('input', { type: 'text', dir: 'auto', maxlength: '160', autocomplete: 'email', placeholder: T('fc.contact.reach') });
      var msg = el('textarea', { rows: '5', dir: 'auto', maxlength: '5000', placeholder: T('fc.contact.msg') });
      if (keep) { msg.value = keep.m; reach.value = keep.r; type.value = keep.t; }
      var st = el('div.field-hint', { role: 'status', 'aria-live': 'polite' });
      var btn = el('button.btn.primary', { type: 'button', html: ui.icon('mail') + ui.esc(T('fc.contact.send')) });
      c.appendChild(el('label.field', null, [el('span.field-label', { text: T('fc.contact.type') }), type]));
      c.appendChild(el('label.field', null, [el('span.field-label', { text: T('fc.contact.msg') }), msg]));
      c.appendChild(el('label.field', null, [el('span.field-label', { text: T('fc.contact.reach') }), reach]));
      c.appendChild(el('div.fc-row', null, [btn, st]));
      c.appendChild(el('p.field-hint', { text: T('fc.contact.privacy'), style: 'margin:12px 0 0' }));
      var n = queue().length; if (n) st.textContent = T('fc.contact.waiting', { n: n });
      btn.addEventListener('click', function () {
        var m = msg.value.trim();
        if (!m) { st.textContent = T('fc.contact.empty'); msg.classList.add('invalid'); msg.focus(); return; }
        msg.classList.remove('invalid');
        btn.disabled = true; st.textContent = T('fc.contact.sending');
        send({ tur: type.value, mesaj: m, iletisim: reach.value.trim() }).then(function (r) {
          msg.value = '';
          st.textContent = T(r === 'sent' ? 'fc.contact.ok' : 'fc.contact.queued');
          if (FC.ui.toast) FC.ui.toast(st.textContent, r === 'sent' ? '' : 'info');
        }).then(function () { btn.disabled = false; });
      });
    }
    draw(); FC.i18n.onChange(draw);
    container.appendChild(c);
    // son kart kalsın
    if (g.MutationObserver) new g.MutationObserver(function () { if (container.lastElementChild !== c && c.isConnected !== false && c.parentNode === container) container.appendChild(c); }).observe(container, { childList: true });
    return c;
  }
  function init(c) {
    for (var k in c) cfg[k] = c[k];
    if (g.addEventListener && !init.done) { init.done = true; g.addEventListener('online', function () { setTimeout(flush, 1500); }); setTimeout(flush, 5000); }
    return api;
  }
  var api = { init: init, mount: mount, send: send, post: post, flush: flush, queue: queue, onQueue: function (f) { subs.push(f); }, _fields: fields, _deviceId: deviceId };
  FC.contact = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
