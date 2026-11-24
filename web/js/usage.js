/* FC.usage — "Kullanım Limitleri" kartı. Kullanıcının KENDİ Firebase'indeki bugünkü okuma/yazma/silme sayısı
   (ücretsiz Spark planı günlük sınırı: 50k okuma / 20k yazma / 20k silme) ve sağlayıcı başına yapay zeka çağrıları.
     FC.usage.count('firebase.read', 3)   FC.usage.count('ai.gemini')   FC.usage.count('firebase.full')  (kota hatası)
     FC.usage.wrapFetch()                 // isteğe bağlı: fetch ile yapılan Firestore REST ve AI çağrılarını kendisi sayar
     ayarlar.appendChild(FC.usage.card({project: () => 'proje-id'}))
   Gün Pasifik saatiyle gece yarısı döner (Firestore ve Gemini ücretsiz katmanı böyle sıfırlanır). */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var LIMIT = { read: 50000, write: 20000, 'delete': 20000 };
  var TZ = 'America/Los_Angeles', KEY = 'usage';
  var PROVIDERS = {
    gemini: { name: 'Google Gemini', limits: 'https://ai.google.dev/gemini-api/docs/rate-limits', host: /generativelanguage\.googleapis\.com/ },
    openai: { name: 'OpenAI', limits: 'https://platform.openai.com/settings/organization/limits', host: /api\.openai\.com/ },
    anthropic: { name: 'Anthropic Claude', limits: 'https://console.anthropic.com/settings/limits', host: /api\.anthropic\.com/ },
    groq: { name: 'Groq', limits: 'https://console.groq.com/settings/limits', host: /api\.groq\.com/ }
  };
  var subs = [], cfg = { now: null };
  function S() { return FC.storage; }
  function T(k, v) { return FC.t(k, v); }
  function now() { return cfg.now ? cfg.now() : new Date(); }
  function pacific(d) {
    try {
      var o = {}; new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).forEach(function (x) { o[x.type] = x.value; });
      return o;
    } catch (e) { var u = new Date(d.getTime() - 8 * 3600000); return { year: u.getUTCFullYear(), month: ('0' + (u.getUTCMonth() + 1)).slice(-2), day: ('0' + u.getUTCDate()).slice(-2), hour: u.getUTCHours(), minute: u.getUTCMinutes(), second: u.getUTCSeconds() }; }
  }
  function today() { var p = pacific(now()); return p.year + '-' + p.month + '-' + p.day; }
  function msToReset() { var p = pacific(now()); return Math.max(0, 86400000 - (((+p.hour % 24) * 3600 + (+p.minute) * 60 + (+p.second)) * 1000)); }
  function data() {
    var v = S().get(KEY, null), d = today();
    if (!v || v.day !== d) { v = { day: d, c: {}, project: v && v.project || '' }; S().set(KEY, v); }
    return v;
  }
  function count(key, n) {
    n = n == null ? 1 : +n || 0; if (n <= 0) return;
    var v = data(); v.c[key] = (v.c[key] || 0) + n; S().set(KEY, v);
    subs.forEach(function (f) { try { f(v); } catch (e) {} });
  }
  function get(key) { return data().c[key] || 0; }
  function setProject(p) { var v = data(); if (p && v.project !== p) { v.project = p; S().set(KEY, v); } }
  function onChange(f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; }

  /* ---- isteğe bağlı otomatik sayım (fetch) ---- */
  function quota(status, txt) { return status === 429 || /RESOURCE_EXHAUSTED|quota exceeded|insufficient_quota/i.test(txt || ''); }
  function firestore(method, url, body, status) {
    var path = String(url).split('?')[0];
    if (/:(listen|write)\b|\/Listen\/|\/Write\//.test(path) || /:beginTransaction$|:rollback$/.test(path)) return;
    if (/:commit$|:batchWrite$/.test(path)) {
      var b = null; try { b = typeof body === 'string' ? JSON.parse(body) : null; } catch (e) {}
      ((b && b.writes) || []).forEach(function (w) { count(w && w['delete'] ? 'firebase.delete' : 'firebase.write'); });
      return;
    }
    if (/:runQuery$|:runAggregationQuery$|:batchGet$/.test(path)) return 'read-body';
    method = String(method || 'GET').toUpperCase();
    if (method === 'GET') return (path.split('/documents')[1] || '').split('/').filter(Boolean).length % 2 === 1 ? 'read-list' : count('firebase.read');
    if (method === 'DELETE') return count('firebase.delete');
    count('firebase.write');
  }
  function provider(url) { for (var k in PROVIDERS) if (PROVIDERS[k].host.test(url)) return k; return ''; }
  function wrapFetch() {
    var orig = g.fetch; if (!orig || orig.__fcUsage) return;
    var w = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || String(input);
      var method = (init && init.method) || (input && input.method) || 'GET';
      var isFs = /firestore\.googleapis\.com\/v1\//.test(url) && !/comm-calc-103111111\/databases\/\(default\)\/documents\/mesajlar/.test(url);
      var ai = provider(url);
      var p = orig.apply(this, arguments);
      if (!isFs && !ai) return p;
      return p.then(function (res) {
        try {
          if (ai) { count('ai.' + ai); if (res.status === 429) count('ai.' + ai + '.full'); return res; }
          var m = /\/projects\/([^/]+)\//.exec(url); if (m && res.ok) setProject(decodeURIComponent(m[1]));
          if (res.status === 429) { count('firebase.full'); return res; }
          var mode = firestore(method, url, init && init.body, res.status);
          if (mode && res.ok) res.clone().json().then(function (j) {
            var n = Array.isArray(j) ? j.filter(function (x) { return x && (x.document || x.found); }).length : ((j && j.documents) || []).length;
            count('firebase.read', Math.max(1, n));
          }).catch(function () {});
        } catch (e) {}
        return res;
      });
    };
    w.__fcUsage = true; g.fetch = w;
  }

  function fmt(n) { return FC.i18n.num(n, 0); }
  function dur(ms) { var h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000); return (h ? h + ' ' + T('fc.h') + ' ' : '') + m + ' ' + T('fc.min'); }
  function card(o) {
    o = o || {};
    var ui = FC.ui, el = ui.el, c = ui.card({ key: 'usage', title: '', icon: 'gauge' });
    function meter(label, used, max) {
      var pct = Math.min(100, used / max * 100);
      var m = el('div.fc-meter' + (pct >= 100 ? '.full' : pct >= 80 ? '.warn' : ''));
      m.appendChild(el('div.fc-meter-head', null, [el('span', { text: label }), el('b.ltr', { text: fmt(used) + ' / ' + fmt(max) })]));
      var bar = el('div.update-bar', { role: 'progressbar', 'aria-valuenow': String(Math.round(pct)), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': label }, [el('span', { style: 'width:' + pct + '%' })]);
      m.appendChild(bar);
      return m;
    }
    function draw() {
      var v = data(), proj = '';
      try { proj = (typeof o.project === 'function' ? o.project() : o.project) || v.project || ''; } catch (e) {}
      c.innerHTML = '';
      c.appendChild(el('h3.card-title', { html: ui.icon('gauge') + '<span>' + ui.esc(T('fc.usage.title')) + '</span>' }));
      c.appendChild(el('p.card-desc', { text: T('fc.usage.desc') }));
      if (o.firebase !== false) {
        c.appendChild(el('div.fc-sub', { text: T('fc.usage.firebase') }));
        c.appendChild(el('div.field-hint', { text: proj ? T('fc.usage.project', { p: proj }) : T('fc.usage.noFirebase') }));
        c.appendChild(meter(T('fc.usage.read'), v.c['firebase.read'] || 0, LIMIT.read));
        c.appendChild(meter(T('fc.usage.write'), v.c['firebase.write'] || 0, LIMIT.write));
        c.appendChild(meter(T('fc.usage.delete'), v.c['firebase.delete'] || 0, LIMIT['delete']));
        if (v.c['firebase.full']) c.appendChild(el('div.notice.error', { text: T('fc.usage.full') }));
        c.appendChild(el('p.field-hint', { text: T('fc.usage.reset', { t: dur(msToReset()) }) + ' ' + T('fc.usage.device'), style: 'margin:10px 0 0' }));
      }
      if (o.ai !== false) {
        c.appendChild(el('div.fc-sub', { text: T('fc.usage.ai') }));
        var list = el('ul.fc-list'), keys = Object.keys(PROVIDERS);
        var shown = (o.providers || keys).filter(function (k) { return PROVIDERS[k]; });
        shown.forEach(function (k) {
          var n = v.c['ai.' + k] || 0;
          var left = el('div', null, [el('div', { html: '<b>' + ui.esc(PROVIDERS[k].name) + '</b>' }), el('div.field-hint', { text: T('fc.ai.' + k + '.note') })]);
          var lnk = el('a.fc-small', { href: PROVIDERS[k].limits, text: T('fc.usage.limits'), onclick: function (e) { e.preventDefault(); ui.openUrl(PROVIDERS[k].limits); } });
          list.appendChild(el('li', null, [left, el('div', { style: 'text-align:end;white-space:nowrap' }, [el('b.ltr', { text: T('fc.usage.calls', { n: fmt(n) }) }), el('br'), lnk])]));
        });
        c.appendChild(list);
      }
    }
    draw(); onChange(draw); FC.i18n.onChange(draw);
    var tick = setInterval(function () { if (c.isConnected === false) return; draw(); }, 60000);
    c.addEventListener('fc:destroy', function () { clearInterval(tick); });
    return c;
  }
  var api = { count: count, get: get, data: data, setProject: setProject, onChange: onChange, wrapFetch: wrapFetch, card: card, msToReset: msToReset, today: today, LIMIT: LIMIT, PROVIDERS: PROVIDERS, _config: function (c) { cfg = c; } };
  FC.usage = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
