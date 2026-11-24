/* FCAgent — Asistan Agent'ın BAĞIMSIZ eklentisi: ortak çekirdeğe henüz geçmemiş uygulamalar için tek dosya (dist/fc-agent.js).
   Arayüz Shadow DOM içinde çizilir; uygulamanın kendi CSS'iyle çakışmaz, uygulamanın <html lang/dir>'ine dokunmaz.
     <script src="fc-agent.js"></script>
     FCAgent.mount({
       app: 'kitaplik', version: '2.13.0',
       lang: () => localStorage.getItem('kitaplik.dil') || 'tr',      // ya da 'tr'; değişince kendisi izler
       theme: 'auto',                                                  // 'dark' | 'light' | 'auto' | () => …
       settings: document.getElementById('ayarlarSonu'),               // kartın ekleneceği yer (Admin ile iletişim'den ÖNCE)
       settingsBefore: ['✉️ Yönetici ile İletişim', 'Contact the administrator', 'التواصل مع المسؤول'],   // ya da: bu kartın önüne
       button: 'float',                                                // ya da üst çubuktaki bir kapsayıcı öğe
       ai: () => ({provider: 'gemini', key: localStorage.getItem('kitaplik.geminiKey')}),   // kullanıcının KENDİ anahtarı
       firebase: () => ({projectId, apiKey}),                          // kullanıcının KENDİ projesi (isteğe bağlı)
       notify: (baslik, metin) => { AndroidKopru.notifyNow(baslik, metin); },   // isteğe bağlı: yerel bildirim
       sync: true                                                      // uygulamada Eşitle düğmesi var
     });
   Tam çekirdeği (FC.init) kullanan uygulamada bu dosya GEREKMEZ. */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var CSS = FC._agentCss || '';
  var EXTRA = '.fc-root{all:initial;display:contents;font-family:Inter,"Noto Sans Arabic","Segoe UI",system-ui,sans-serif;font-size:14px;line-height:1.5;color:var(--text)}' +
    '.fc-root *{font-family:inherit}' +
    '.fc-agent-fab{position:fixed;bottom:18px;inset-inline-end:18px;width:46px;height:46px;border-radius:50%;z-index:5;box-shadow:0 6px 20px rgba(0,0,0,.35);background:var(--panel-solid,#111827);border:1px solid var(--border);color:var(--accent);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}' +
    '.fc-agent-fab .sync-badge{position:absolute;top:-4px;inset-inline-end:-4px}' +
    '.fc-agent-inline{display:inline-flex}';
  var st = { o: null, roots: [], lang: null, theme: null, timer: null };
  function val(x) { try { return typeof x === 'function' ? x() : x; } catch (e) { return null; } }
  function isLight() {
    var t = val(st.o.theme) || 'auto';
    if (t === 'light') return true; if (t === 'dark') return false;
    try { var c = g.getComputedStyle(g.document.body).backgroundColor.match(/\d+/g); if (c && c.length >= 3 && !(c.length === 4 && +c[3] === 0)) return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 150; } catch (e) {}
    return !!(g.matchMedia && g.matchMedia('(prefers-color-scheme: light)').matches);
  }
  function shadowHost(parent, fixed) {
    var host = g.document.createElement('div');
    host.setAttribute('data-fc-agent', '');
    if (fixed) host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000';
    parent.appendChild(host);
    var sr = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var style = g.document.createElement('style'); style.textContent = CSS + EXTRA; sr.appendChild(style);
    var root = g.document.createElement('div'); root.className = 'fc-root'; root.setAttribute('data-scheme', 'falcon');
    sr.appendChild(root); st.roots.push(root);
    return root;
  }
  function sync() {
    var l = String(val(st.o.lang) || 'tr').slice(0, 2).toLowerCase(), light = isLight();
    if (l !== st.lang) { st.lang = l; FC.i18n.set(l); }
    st.roots.forEach(function (r) { r.setAttribute('lang', l); r.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr'); r.classList.toggle('theme-light', light); });
  }
  function mount(o) {
    if (st.o) return api;
    st.o = o = o || {};
    if (!g.document || !g.document.body) { g.addEventListener('DOMContentLoaded', function () { st.o = null; mount(o); }); return api; }
    FC.i18n.noDoc = true;
    var main = shadowHost(g.document.body, true);
    FC.ui.root = main;
    sync();
    FC.agent.start({ app: o.app, version: o.version, notify: o.notify, ai: o.ai, firebase: o.firebase, sync: o.sync, models: o.models, aiPerDay: o.aiPerDay });
    if (o.button !== false) {
      var b = FC.agent.button();
      if (o.button && o.button.nodeType) { shadowHost(o.button, false).appendChild(b); b.classList.add('fc-agent-inline'); }
      else {
        b.classList.add('fc-agent-fab'); main.appendChild(b);
        var f = o.fab || {};   // {bottom: 90, side: 'start'|'end'} — uygulamanın kendi yüzen düğmesiyle çakışmasın
        if (f.bottom != null) b.style.bottom = (+f.bottom) + 'px';
        if (f.side === 'start') { b.style.insetInlineEnd = 'auto'; b.style.insetInlineStart = '18px'; }
      }
    }
    if (o.settings) settings(o.settings);
    if (o.settingsBefore) watchSettings(o.settingsBefore, o.cardSelector);
    if (o.menuBefore) watchMenu(o.menuBefore);
    sync();
    st.timer = setInterval(sync, 1500);
    return api;
  }
  /** Ayarlar kartını verilen kapsayıcıya ekler (Admin ile iletişim kartından önce koyun). */
  function settings(parent) { var r = shadowHost(parent, false); r.appendChild(FC.agent.card()); sync(); return r; }
  /** Ayarlar sayfası dinamikse: metni verilen kartın (ör. "Yönetici ile İletişim") hemen ÖNÜNE kartı koyar; sayfa yeniden
      çizildikçe tekrar yerleştirir. texts: ['✉️ Yönetici ile İletişim', 'Contact the administrator', 'التواصل مع المسؤول'] */
  function watchSettings(texts, sel) {
    sel = sel || '.card,details,section,fieldset,.settings-card,.panel';
    var list = (Array.isArray(texts) ? texts : [texts]).map(function (t) { return String(t).trim(); }).filter(Boolean), host = null, pend = 0;
    function find() {
      var w = g.document.createTreeWalker(g.document.body, 4, null), n;
      while ((n = w.nextNode())) {
        var t = (n.nodeValue || '').trim(); if (!t || t.length > 80) continue;
        for (var i = 0; i < list.length; i++) { var at = t.indexOf(list[i]); if (at < 0 || at > 4 || t.length > list[i].length + 6) continue;
          var e = n.parentNode; if (!e || !e.closest || e.closest('[data-fc-agent]')) break;
          var c = e.closest(sel);   // kart yalnızca başlık kartın EN ÜSTÜNDEYSE seçilir (yoksa başlığın önüne konur)
          if (c && (c === g.document.body || c.textContent.trim().indexOf(list[i]) > 6)) c = null;
          return c || e;
        }
      }
      return null;
    }
    function place() {
      pend = 0;
      var target = find(); if (!target || !target.parentNode) return;
      if (host && host.isConnected) { var sib = target, k = 0; while ((sib = sib.previousElementSibling) && k++ < 3) if (sib === host) return; }   // diğer eklentilerle yer kavgası yapma
      if (!host || !host.isConnected) { var wrap = g.document.createElement('div'); wrap.setAttribute('data-fc-agent', ''); wrap.className = (target.className || '').split(' ').filter(function (c) { return /^(col|grid|span)/.test(c); }).join(' '); try { var cs = g.getComputedStyle(target); ['maxWidth', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'width'].forEach(function (k) { if (k !== 'width' || /%$/.test(target.style.width || '')) wrap.style[k] = cs[k]; }); } catch (e) {}
        target.parentNode.insertBefore(wrap, target); settings(wrap); host = wrap; }
      else target.parentNode.insertBefore(host, target);
    }
    var mo = new g.MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) { var t = recs[i].target; if (t && t.closest && t.closest('[data-fc-agent]')) continue; if (!pend) pend = setTimeout(place, 250); return; }
    });
    mo.observe(g.document.body, { childList: true, subtree: true });
    place();
  }
  /** Ayarlar bir menü listesiyse (kart yok): metni verilen düğmenin önüne aynı görünümde "✦ Asistan Agent" düğmesi koyar;
      tıklanınca ayarlar kartı pencerede açılır. */
  function openCard() { var body = FC.ui.el('div'); body.appendChild(FC.agent.card()); return FC.ui.modal({ title: FC.t('fc.agent.title'), icon: 'sparkles', body: body, buttons: [{ label: FC.t('fc.close'), cls: 'primary' }] }); }
  function watchMenu(texts) {
    var list = (Array.isArray(texts) ? texts : [texts]).map(function (t) { return String(t).trim(); }).filter(Boolean), pend = 0;
    function place() {
      pend = 0;
      var w = g.document.createTreeWalker(g.document.body, 4, null), n, target = null;
      while (!target && (n = w.nextNode())) {
        var t = (n.nodeValue || '').trim(); if (!t || t.length > 80) continue;
        for (var i = 0; i < list.length; i++) { var at = t.indexOf(list[i]); if (at >= 0 && at <= 4 && t.length <= list[i].length + 6) { var e = n.parentNode; target = e && e.closest ? (e.closest('button,a,li,[role=button],[role=menuitem]') || e) : null; break; } }
      }
      if (!target || !target.parentNode) return;
      var prev = target.previousElementSibling;
      if (prev && prev.hasAttribute && prev.hasAttribute('data-fc-agent-menu')) { prev.textContent = '✦ ' + FC.t('fc.agent.title'); return; }
      var b = g.document.createElement(target.tagName === 'A' ? 'button' : target.tagName);
      b.className = target.className; b.setAttribute('data-fc-agent-menu', ''); b.setAttribute('data-fc-agent', ''); if (b.tagName === 'BUTTON') b.type = 'button';
      b.textContent = '✦ ' + FC.t('fc.agent.title');
      b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); openCard(); });
      target.parentNode.insertBefore(b, target);
    }
    var mo = new g.MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) { var t = recs[i].target; if (t && t.closest && t.closest('[data-fc-agent]')) continue; if (!pend) pend = setTimeout(place, 250); return; }
    });
    mo.observe(g.document.body, { childList: true, subtree: true, characterData: true });
    place(); FC.i18n.onChange(function () { setTimeout(place, 50); });
  }
  var api = { mount: mount, watchSettings: watchSettings, watchMenu: watchMenu, openSettings: openCard, settings: settings, refresh: sync, agent: function () { return FC.agent; }, track: function (n, k) { FC.agent.track(n, k); }, task: function (a, b, c) { FC.agent.task(a, b, c); }, show: function () { return FC.agent.show(); },
    exportShare: function () { return FC.agent.exportShare(); }, importShare: function (x) { return FC.agent.importShare(x); } };
  g.FCAgent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
