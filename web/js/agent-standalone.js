/* FCAgent — Asistan Agent'ın BAĞIMSIZ eklentisi: ortak çekirdeğe henüz geçmemiş uygulamalar için tek dosya (dist/fc-agent.js).
   Arayüz Shadow DOM içinde çizilir; uygulamanın kendi CSS'iyle çakışmaz, uygulamanın <html lang/dir>'ine dokunmaz.
     <script src="fc-agent.js"></script>
     FCAgent.mount({
       app: 'kitaplik', version: '2.13.0',
       lang: () => localStorage.getItem('kitaplik.dil') || 'tr',      // ya da 'tr'; değişince kendisi izler
       theme: 'auto',                                                  // 'dark' | 'light' | 'auto' | () => …
       settings: document.getElementById('ayarlarSonu'),               // kartın ekleneceği yer (Admin ile iletişim'den ÖNCE)
       button: 'float',                                                // ya da üst çubuktaki bir kapsayıcı öğe
       ai: () => ({provider: 'gemini', key: localStorage.getItem('kitaplik.geminiKey')}),   // kullanıcının KENDİ anahtarı
       firebase: () => ({projectId, apiKey})                           // kullanıcının KENDİ projesi (isteğe bağlı)
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
    FC.agent.start({ app: o.app, version: o.version, ai: o.ai, firebase: o.firebase, sync: o.sync, models: o.models, aiPerDay: o.aiPerDay });
    if (o.button !== false) {
      var b = FC.agent.button();
      if (o.button && o.button.nodeType) { shadowHost(o.button, false).appendChild(b); b.classList.add('fc-agent-inline'); }
      else { b.classList.add('fc-agent-fab'); main.appendChild(b); }
    }
    if (o.settings) settings(o.settings);
    sync();
    st.timer = setInterval(sync, 1500);
    return api;
  }
  /** Ayarlar kartını verilen kapsayıcıya ekler (Admin ile iletişim kartından önce koyun). */
  function settings(parent) { var r = shadowHost(parent, false); r.appendChild(FC.agent.card()); sync(); return r; }
  var api = { mount: mount, settings: settings, refresh: sync, agent: function () { return FC.agent; }, track: function (n, k) { FC.agent.track(n, k); }, task: function (a, b, c) { FC.agent.task(a, b, c); }, show: function () { return FC.agent.show(); },
    exportShare: function () { return FC.agent.exportShare(); }, importShare: function (x) { return FC.agent.importShare(x); } };
  g.FCAgent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
