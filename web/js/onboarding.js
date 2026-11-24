/* FC.onboarding — ilk açılış sihirbazı: dil → görünüm → kendi Firebase'iniz → kendi AI anahtarınız (isteğe bağlı) → bitti.
     FC.onboarding.maybeStart({onFirebase: cfg => ..., onAi: ({provider, key}) => ...})   // yalnız ilk açılışta
     FC.onboarding.open(opts)                                                           // Ayarlar'dan yeniden aç
   opts.firebase:false / opts.ai:false ilgili adımı çıkarır. Varsayılan olarak yapılandırma ve anahtar FC.storage'da
   (fc.firebase.config, fc.ai) saklanır; opts.store:false ise yalnız geri çağrılar kullanılır (kabuğun güvenli deposu için). */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var GUIDE = 'https://github.com/departures-mil/duyurular/blob/main/firebase-kurulum.md';
  var AI = {
    gemini: { name: 'Google Gemini', key: 'https://aistudio.google.com/app/apikey' },
    openai: { name: 'OpenAI', key: 'https://platform.openai.com/api-keys' },
    anthropic: { name: 'Anthropic Claude', key: 'https://console.anthropic.com/settings/keys' },
    groq: { name: 'Groq', key: 'https://console.groq.com/keys' }
  };
  function T(k, v) { return FC.t(k, v); }
  function S() { return FC.storage; }

  /** firebaseConfig metnini (JSON ya da `const firebaseConfig = {...}` kodu) nesneye çevirir; geçersizse null. */
  function parseFirebase(text) {
    var s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    s = s.slice(a, b + 1);
    var o = null;
    try { o = JSON.parse(s); } catch (e) {
      try {
        var j = s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
          .replace(/'((?:[^'\\]|\\.)*)'/g, function (m, x) { return JSON.stringify(x.replace(/\\'/g, "'")); })
          .replace(/,\s*([}\]])/g, '$1');
        o = JSON.parse(j);
      } catch (e2) { return null; }
    }
    if (!o || typeof o !== 'object') return null;
    if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(o.apiKey || '') || !/^[a-z0-9][a-z0-9-]{3,38}[a-z0-9]$/.test(o.projectId || '')) return null;
    var out = {}; ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId', 'databaseURL'].forEach(function (k) { if (o[k]) out[k] = String(o[k]); });
    return out;
  }
  /** Gerçek deneme: var olmayan bir belgeyi okur. Döner {code:'ok'|'rules'|'nodb'|'badkey'|'net'} */
  async function testFirebase(c, f) {
    f = f || g.fetch;
    var url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(c.projectId) + '/databases/(default)/documents/_fc_baglanti/deneme?key=' + encodeURIComponent(c.apiKey);
    var r; try { r = await f(url, { cache: 'no-store' }); } catch (e) { return { code: 'net' }; }
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (FC.usage) FC.usage.count('firebase.read');
    var msg = String(j && j.error && j.error.message || '');
    if (r.ok) return { code: 'ok' };
    if (r.status === 404 && !/database|does not exist/i.test(msg)) return { code: 'ok' };
    if (r.status === 404 || /has not been used|is disabled|does not exist/i.test(msg)) return { code: 'nodb' };
    if (r.status === 400 || /API key/i.test(msg)) return { code: 'badkey' };
    if (r.status === 403) return { code: 'rules' };
    return { code: 'net' };
  }
  async function testAi(p, key, f) {
    f = f || g.fetch;
    var u, h = {};
    if (p === 'gemini') u = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=' + encodeURIComponent(key);
    else if (p === 'openai') { u = 'https://api.openai.com/v1/models'; h.Authorization = 'Bearer ' + key; }
    else if (p === 'groq') { u = 'https://api.groq.com/openai/v1/models'; h.Authorization = 'Bearer ' + key; }
    else if (p === 'anthropic') { u = 'https://api.anthropic.com/v1/models?limit=1'; h['x-api-key'] = key; h['anthropic-version'] = '2023-06-01'; h['anthropic-dangerous-direct-browser-access'] = 'true'; }
    else return 'unknown';
    try { var r = await f(u, { headers: h }); return r.ok ? 'ok' : (r.status === 401 || r.status === 403 || r.status === 400) ? 'bad' : 'unknown'; } catch (e) { return 'unknown'; }
  }

  function open(opts) {
    opts = opts || {};
    var ui = FC.ui, el = ui.el;
    var steps = ['lang', 'look'];
    if (opts.firebase !== false) steps.push('firebase');
    if (opts.ai !== false) steps.push('ai');
    steps.push('done');
    var i = 0, m = ui.modal({ title: T('fc.ob.welcome'), icon: 'sparkles', cls: 'fc-onboarding', body: el('div'), buttons: [], dismiss: true, onClose: function () { S().set('onboarding.done', true); if (opts.onClose) opts.onClose(); } });
    var fbState = { text: '', conf: S().get('firebase.config', null), result: '' };
    var aiState = S().get('ai', { provider: 'gemini', key: '' }) || { provider: 'gemini', key: '' };
    function link(text, url) { return el('a', { href: url, text: text, onclick: function (e) { e.preventDefault(); ui.openUrl(url); } }); }
    function dots() { var d = el('div.fc-steps', { 'aria-label': T('fc.ob.step', { i: i + 1, n: steps.length }) }); steps.forEach(function (s, k) { d.appendChild(el('i' + (k <= i ? '.on' : ''))); }); return d; }
    function render() {
      var s = steps[i], b = m.body; b.innerHTML = ''; b.appendChild(dots());
      var titles = { lang: 'fc.ob.welcome', look: 'fc.ob.lookTitle', firebase: 'fc.ob.fbTitle', ai: 'fc.ob.aiTitle', done: 'fc.ob.doneTitle' };
      var icons = { lang: 'globe', look: 'type', firebase: 'cloud', ai: 'key', done: 'check' };
      m.setTitle(T(titles[s]), icons[s]);
      if (s === 'lang') { b.appendChild(el('p.muted', { text: T('fc.ob.langDesc') })); b.appendChild(FC.look.langOptions()); }
      if (s === 'look') { b.appendChild(el('p.muted', { text: T('fc.ob.lookDesc') })); b.appendChild(FC.look.controls()); }
      if (s === 'firebase') {
        b.appendChild(el('p', { text: T('fc.ob.fbDesc') }));
        b.appendChild(el('p.fc-row', { style: 'margin:0 0 4px' }, [link(T('fc.ob.fbGuide'), opts.guideUrl || GUIDE), link(T('fc.ob.fbConsole'), 'https://console.firebase.google.com/')]));
        var ta = el('textarea.mono.ltr', { rows: '7', spellcheck: 'false', placeholder: '{ "apiKey": "AIza…", "authDomain": "…", "projectId": "…", "appId": "…" }' });
        ta.value = fbState.text || (fbState.conf ? JSON.stringify(fbState.conf, null, 2) : '');
        var res = el('div', { role: 'status', 'aria-live': 'polite' });
        if (fbState.result) res.appendChild(fbState.result);
        var test = el('button.btn', { type: 'button', html: ui.icon('cloud') + ui.esc(T('fc.ob.test')) });
        ta.addEventListener('input', function () { fbState.text = ta.value; ta.classList.remove('invalid'); });
        test.addEventListener('click', async function () {
          var c = parseFirebase(ta.value); res.innerHTML = '';
          if (!c) { ta.classList.add('invalid'); res.appendChild(fbState.result = el('div.notice.error', { text: T('fc.ob.fbBad') })); return; }
          test.disabled = true; test.lastChild.textContent = T('fc.ob.testing');
          var r = await testFirebase(c, opts.fetch);
          test.disabled = false; test.lastChild.textContent = T('fc.ob.test');
          var map = { ok: ['ok', 'fc.ob.fbOk'], rules: ['', 'fc.ob.fbRules'], nodb: ['error', 'fc.ob.fbNoDb'], badkey: ['error', 'fc.ob.fbBadKey'], net: ['error', 'fc.ob.fbNet'] }[r.code];
          res.appendChild(fbState.result = el('div.notice' + (map[0] ? '.' + map[0] : ''), { text: T(map[1], { p: c.projectId }) }));
          if (r.code === 'ok' || r.code === 'rules') {
            fbState.conf = c;
            if (opts.store !== false) S().set('firebase.config', c);
            if (FC.usage) FC.usage.setProject(c.projectId);
            if (opts.onFirebase) try { opts.onFirebase(c, r.code); } catch (e) {}
          }
        });
        b.appendChild(el('label.field', null, [el('span.field-label', { text: T('fc.ob.fbPaste') }), ta]));
        b.appendChild(el('div.fc-row', null, [test]));
        b.appendChild(res);
        b.appendChild(el('p.field-hint', { text: T('fc.ob.fbLater'), style: 'margin:12px 0 0' }));
      }
      if (s === 'ai') {
        b.appendChild(el('p', { text: T('fc.ob.aiDesc') }));
        var sel = el('select'); Object.keys(AI).forEach(function (k) { sel.appendChild(el('option', { value: k, text: AI[k].name })); }); sel.value = aiState.provider || 'gemini';
        var key = el('input.mono.ltr', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'sk-… / AIza… / gsk_…' }); key.value = aiState.key || '';
        var getLink = el('div.field-hint');
        var drawLink = function () { getLink.innerHTML = ''; getLink.appendChild(link(T('fc.ob.aiGet') + ' — ' + AI[sel.value].name, AI[sel.value].key)); getLink.appendChild(el('div', { text: T('fc.ai.' + sel.value + '.note') })); };
        sel.addEventListener('change', function () { aiState.provider = sel.value; drawLink(); });
        key.addEventListener('input', function () { aiState.key = key.value.trim(); });
        drawLink();
        var res2 = el('div', { role: 'status', 'aria-live': 'polite' });
        var test2 = el('button.btn', { type: 'button', html: ui.icon('key') + ui.esc(T('fc.ob.test')) });
        test2.addEventListener('click', async function () {
          if (!aiState.key) { key.classList.add('invalid'); return; }
          key.classList.remove('invalid'); test2.disabled = true; res2.innerHTML = '';
          var r = await testAi(aiState.provider, aiState.key, opts.fetch); test2.disabled = false;
          saveAi();
          res2.appendChild(el('div.notice' + (r === 'ok' ? '.ok' : r === 'bad' ? '.error' : ''), { text: T(r === 'ok' ? 'fc.ob.aiOk' : r === 'bad' ? 'fc.ob.aiBad' : 'fc.ob.aiUnk') }));
        });
        b.appendChild(el('label.field', null, [el('span.field-label', { text: T('fc.ob.aiProvider') }), sel]));
        b.appendChild(el('label.field', null, [el('span.field-label', { text: T('fc.ob.aiKey') }), key, getLink]));
        b.appendChild(el('div.fc-row', null, [test2]));
        b.appendChild(res2);
      }
      if (s === 'done') { b.appendChild(el('p', { text: T('fc.ob.doneDesc') })); }
      var last = i === steps.length - 1;
      var btns = [];
      if (!last && i > 0) btns.push({ label: T('fc.skip'), cls: 'ghost', onClick: function () { i++; render(); return false; } });
      btns.push('spacer');
      if (i > 0) btns.push({ label: T('fc.back'), onClick: function () { i--; render(); return false; } });
      btns.push({ label: last ? T('fc.ob.start') : T('fc.next'), cls: 'primary', onClick: function () { if (s === 'ai') saveAi(); if (last) return true; i++; render(); return false; } });
      m.setButtons(btns);
    }
    function saveAi() {
      if (!aiState.key) return;
      var v = { provider: aiState.provider, key: aiState.key };
      if (opts.store !== false) S().set('ai', v);
      if (opts.onAi) try { opts.onAi(v); } catch (e) {}
    }
    var off = FC.i18n.onChange(function () { if (m.el.isConnected) render(); else off(); });
    render();
    return m;
  }
  function maybeStart(opts) { if (!S().get('onboarding.done', false)) return open(opts); return null; }
  /** Ayarlar için "Kurulum sihirbazını aç" düğmesi */
  function button(opts) {
    var ui = FC.ui, b = ui.el('button.btn.small', { type: 'button' });
    function draw() { b.innerHTML = ui.icon('sparkles') + ui.esc(T('fc.ob.reopen')); }
    b.addEventListener('click', function () { open(opts); });
    draw(); FC.i18n.onChange(draw);
    return b;
  }
  var api = { open: open, maybeStart: maybeStart, button: button, parseFirebase: parseFirebase, testFirebase: testFirebase, testAi: testAi, AI: AI };
  FC.onboarding = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
