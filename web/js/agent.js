/* FC.agent — Asistan Agent: kullanıcının TÜM uygulamalardaki çalışmasını izler, durumu geliştirmek için yorum yapar.
     FC.agent.start({app:'kitaplik', version:'2.5.0'})      // FC.init bunu kendisi çağırır (o.agent:false → kapalı)
     FC.agent.track('kitap.ekle')                          // isteğe bağlı: uygulamaya özgü eylem
     FC.agent.task('fatura-42', 'start'|'done', 'Fatura')  // isteğe bağlı: yarım kalan iş takibi
     topbar: FC.agent.button()  (FC.topbar kendisi ekler)  ·  ayarlar: FC.agent.card()  (FC.settings kendisi ekler)
   Gizlilik: yalnızca SAYILAR tutulur (etkin dakika, oturum, düğme adları, saat dağılımı, hata sayısı). Yazılan metin,
   kayıt içeriği, dosya adı TUTULMAZ. Veriler cihazda kalır; paylaşım yalnız kullanıcının kendi kanallarıyla olur:
     1) aynı bilgisayardaki diğer uygulamalar: Electron ana süreci %APPDATA%/FalconCekirdek/agent/*.json (fcHost.agent)
     2) kullanıcının KENDİ Firebase'i (fc.firebase.config varsa): fc_agent koleksiyonu, REST, sayaçlı
     3) Wi-Fi/LAN eşitlemesi: FC.agent.exportShare() / FC.agent.importShare(obj)
   Kendi anahtar deposu olan uygulama: start({ai: () => ({provider:'gemini', key}), firebase: () => ({projectId, apiKey})}).
   Yorumlar: önce çevrim dışı kurallar; açıksa ve kullanıcının KENDİ AI anahtarı varsa (fc.ai) çevrim içi yapay zeka
   (günde en çok cfg.aiPerDay çağrı, FC.usage ile sayılır). Teslim: bildirim + uygulama içi panel; ikisi de ayarlardan kapanır. */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var KEEP_DAYS = 60, MAX_NOTES = 60, TICK_MS = 60000, IDLE_MS = 120000, CHECK_MS = 30 * 60000, SHARE_MS = 30 * 60000;
  var FREQ = ['instant', 'daily', 'weekly', 'manual'];
  var DEF = { on: true, notify: true, panel: true, freq: 'daily', ai: true, apps: null };
  var run = { app: '', version: '', started: false, lastInput: 0, streak: 0, timers: [], subs: [], btns: [], now: null, fetch: null, aiPerDay: 4, busy: null };

  function S() { return FC.storage; }
  function T(k, v) { return FC.t ? FC.t(k, v) : k; }
  function now() { return run.now ? run.now() : new Date(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { d = d || now(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daysAgo(n) { var d = now(); return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, 12)); }
  function cfg() { var c = S().get('agent.cfg', null) || {}; var o = {}; for (var k in DEF) o[k] = c[k] === undefined ? DEF[k] : c[k]; if (FREQ.indexOf(o.freq) < 0) o.freq = 'daily'; return o; }
  function setCfg(p) { var c = cfg(); for (var k in p) c[k] = p[k]; S().set('agent.cfg', c); emit(); return c; }
  function device() {
    var id = S().get('device');
    if (!id) { id = ''; for (var i = 0; i < 18; i++) id += Math.floor(Math.random() * 16).toString(16); S().set('device', id); }
    return id;
  }
  function safe(f) { try { return typeof f === 'function' ? f() : f; } catch (e) { return null; } }
  function srcKey() { return (run.app || 'app') + '@' + device(); }

  /* ---------- kayıt ---------- */
  function emptyDay() { return { act: 0, ses: 0, mx: 0, a: {}, h: [], err: 0 }; }
  function mine() {
    var m = S().get('agent.mine', null);
    if (!m || m.app !== run.app) m = { app: run.app, dev: device(), v: run.version, u: 0, days: {}, tasks: {} };
    return m;
  }
  function prune(days) { var lim = daysAgo(KEEP_DAYS); for (var k in days) if (k < lim) delete days[k]; return days; }
  function save(m) { m.u = now().getTime(); m.v = run.version; prune(m.days); S().set('agent.mine', m); }
  function today(m) { var k = dayKey(); return m.days[k] || (m.days[k] = emptyDay()); }
  /** Eylem adını temizler: e-posta, sayı, uzun metin maskelenir (kayıt içeriği sızmasın). */
  function clean(name) {
    var s = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '@').replace(/\d+([.,:/-]\d+)*/g, '#');
    if (s.length > 40) s = s.slice(0, 40);
    return s;
  }
  function track(name, n) {
    if (!cfg().on || !run.app) return;
    var k = clean(name); if (!k) return;
    var m = mine(), d = today(m); n = n == null ? 1 : +n || 0;
    d.a[k] = (d.a[k] || 0) + n;
    var keys = Object.keys(d.a); if (keys.length > 120) { keys.sort(function (x, y) { return d.a[x] - d.a[y]; }); delete d.a[keys[0]]; }
    save(m); if (cfg().freq === 'instant') schedule();
  }
  function task(id, state, label) {
    if (!cfg().on || !run.app) return;
    var m = mine(), k = String(id == null ? '' : id).slice(0, 60) || 'task';
    if (state === 'done') { if (m.tasks[k]) { delete m.tasks[k]; today(m).done = (today(m).done || 0) + 1; } }
    else if (!m.tasks[k]) m.tasks[k] = { since: now().getTime(), label: clean(label || id) };
    save(m);
  }
  function tick() {
    if (!cfg().on || !run.app) return;
    var d = g.document, visible = !d || d.visibilityState !== 'hidden';
    var active = visible && (now().getTime() - run.lastInput) < IDLE_MS;
    if (!active) { run.streak = 0; return; }
    var m = mine(), day = today(m), h = now().getHours();
    day.act += 1; day.h[h] = (day.h[h] || 0) + 1;
    run.streak += 1; if (run.streak > day.mx) day.mx = run.streak;
    save(m);
  }
  function input() { run.lastInput = now().getTime(); }
  function onClick(e) {
    input();
    var t = e && e.target; if (!t || !t.closest) return;
    var b = t.closest('[data-fc-track],button,[role=button],a[href],.nav-item,.tab');
    if (!b || b.closest('[data-fc-agent]')) return;
    var name = b.getAttribute('data-fc-track') || b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent;
    if (!name) return;
    if (/^\W{0,3}\s*(e[sş]itle|sync|مزامن)/i.test(String(name).trim())) name = /wi.?fi|lan|qr/i.test(name) ? 'fc.sync.lan' : 'fc.sync';
    track(name);
  }

  /* ---------- paylaşım (diğer uygulamalar / cihazlar) ---------- */
  function peers() { var p = S().get('agent.peers', null); return p && typeof p === 'object' ? p : {}; }
  /** Kaynak başına yeni olan kalır (u). Kendi kaydımız asla dışarıdan ezilmez. */
  function importShare(obj) {
    if (!obj) return 0;
    var list = Array.isArray(obj) ? obj : obj.sources ? obj.sources : [obj], p = peers(), me = srcKey(), n = 0;
    list.forEach(function (s) {
      if (!s || !s.app || !s.dev || !s.days) return;
      var k = s.app + '@' + s.dev; if (k === me) return;
      if (!p[k] || (+s.u || 0) > (+p[k].u || 0)) { p[k] = { app: String(s.app), dev: String(s.dev), v: s.v || '', u: +s.u || 0, days: prune(s.days), tasks: s.tasks || {} }; n++; }
    });
    if (n) { S().set('agent.peers', p); emit(); }
    return n;
  }
  function exportShare() { var p = peers(), out = [mine()]; for (var k in p) out.push(p[k]); return { schema: 1, sources: out }; }
  function hostAgent() { var h = g.fcHost, a = (h && h.agent) || g.fcAgentHost; return a && typeof a.read === 'function' ? a : null; }
  function fbCfg() { var c = run.firebase ? safe(run.firebase) : S().get('firebase.config', null); return c && c.projectId && c.apiKey ? c : null; }
  function fsBase(c) { return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(c.projectId) + '/databases/(default)/documents/fc_agent'; }
  function share(force) {
    var t = now().getTime(), last = S().get('agent.shareAt', 0) || 0;
    if (!force && t - last < SHARE_MS) return Promise.resolve();
    S().set('agent.shareAt', t);
    var jobs = [], m = mine(), ha = hostAgent();
    if (ha) jobs.push(Promise.resolve().then(function () { return ha.write(srcKey(), JSON.stringify(m)); })
      .then(function () { return ha.read(); }).then(function (all) { var arr = []; for (var k in (all || {})) { try { arr.push(JSON.parse(all[k])); } catch (e) {} } importShare(arr); }).catch(function () {}));
    var c = fbCfg(), f = run.fetch || g.fetch;
    if (c && f) {
      var id = encodeURIComponent((run.app + '_' + m.dev).replace(/[^\w-]/g, '_'));
      jobs.push(f(fsBase(c) + '/' + id + '?key=' + encodeURIComponent(c.apiKey), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { veri: { stringValue: JSON.stringify(m) }, zaman: { stringValue: new Date(t).toISOString() } } }) })
        .then(function (r) { if (FC.usage) FC.usage.count('firebase.write'); if (!r.ok) throw new Error('HTTP_' + r.status); return f(fsBase(c) + '?pageSize=50&key=' + encodeURIComponent(c.apiKey)); })
        .then(function (r) { if (!r.ok) throw new Error('HTTP_' + r.status); return r.json(); })
        .then(function (j) {
          var docs = (j && j.documents) || [], arr = [];
          if (FC.usage) FC.usage.count('firebase.read', Math.max(1, docs.length));
          docs.forEach(function (d) { try { arr.push(JSON.parse(d.fields.veri.stringValue)); } catch (e) {} });
          importShare(arr);
        }).catch(function () {}));
    }
    return Promise.all(jobs).then(function () {});
  }

  /* ---------- analiz ---------- */
  function sources() {
    var c = cfg(), all = [mine()], p = peers();
    for (var k in p) all.push(p[k]);
    return all.filter(function (s) { return !c.apps || c.apps.indexOf(s.app) >= 0 || s.app === run.app && c.apps.indexOf(run.app) >= 0; });
  }
  function knownApps() { var a = [run.app], p = peers(); for (var k in p) if (a.indexOf(p[k].app) < 0) a.push(p[k].app); return a.filter(Boolean); }
  function appName(id) { return T('fc.agent.app.' + id) !== 'fc.agent.app.' + id ? T('fc.agent.app.' + id) : String(id || '').replace(/[-_]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  /** Haftalık özet: son 7 gün (w) ve önceki 7 gün (pw), uygulama başına. */
  function summary() {
    var w0 = daysAgo(6), p0 = daysAgo(13), apps = {}, tot = { w: 0, pw: 0, days: {}, h: [], ses: 0, err: 0, mx: 0, a: {}, tasks: [] };
    sources().forEach(function (s) {
      var A = apps[s.app] || (apps[s.app] = { w: 0, pw: 0, ses: 0, err: 0, a: {}, sync: 0, early: 0 });
      for (var k in s.days) {
        var d = s.days[k];
        if (k >= w0) {
          A.w += d.act || 0; A.ses += d.ses || 0; A.err += d.err || 0; tot.w += d.act || 0; tot.ses += d.ses || 0; tot.err += d.err || 0;
          if ((d.act || 0) > 0) tot.days[k] = 1;
          if ((d.mx || 0) > tot.mx) tot.mx = d.mx;
          (d.h || []).forEach(function (v, i) { if (v) tot.h[i] = (tot.h[i] || 0) + v; });
          for (var a in d.a) { A.a[a] = (A.a[a] || 0) + d.a[a]; if (/^fc\.sync/.test(a)) A.sync += d.a[a]; }
        } else if (k >= p0) { A.pw += d.act || 0; tot.pw += d.act || 0; }
        else A.early += d.act || 0;
      }
      for (var t in (s.tasks || {})) tot.tasks.push({ app: s.app, id: t, label: s.tasks[t].label, since: s.tasks[t].since });
    });
    return { apps: apps, tot: tot };
  }
  function hm(min) { min = Math.round(min); var h = Math.floor(min / 60), m = min % 60; return h ? T('fc.agent.hm', { h: h, m: m }) : T('fc.agent.m', { m: m }); }
  /** Çevrim dışı kurallar → [{id, key, text, prio}] (metin anahtar + değişkenlerle; dil değişince yeniden çizilir). */
  function rules(sm) {
    sm = sm || summary();
    var out = [], tot = sm.tot, apps = sm.apps, names = Object.keys(apps);
    function add(id, prio, key, vars) { out.push({ id: id, prio: prio, key: key, vars: vars || {} }); }
    if (tot.w < 5 && tot.pw < 5) { add('start', 1, 'fc.agent.r.start'); return out; }
    if (tot.pw >= 30) {
      var ch = Math.round((tot.w - tot.pw) / tot.pw * 100);
      if (ch >= 25) add('up', 2, 'fc.agent.r.up', { p: ch, t: hm(tot.w) });
      else if (ch <= -25) add('down', 3, 'fc.agent.r.down', { p: -ch, t: hm(tot.w) });
    }
    var used = names.filter(function (n) { return apps[n].w > 0; }).sort(function (a, b) { return apps[b].w - apps[a].w; });
    if (used.length > 1 && tot.w > 0) add('top', 2, 'fc.agent.r.top', { a: appName(used[0]), p: Math.round(apps[used[0]].w / tot.w * 100), n: used.length });
    var night = 0; [23, 0, 1, 2, 3, 4].forEach(function (i) { night += tot.h[i] || 0; });
    if (tot.w >= 60 && night / tot.w >= 0.2) add('night', 4, 'fc.agent.r.night', { p: Math.round(night / tot.w * 100) });
    if (tot.mx >= 90) add('break', 4, 'fc.agent.r.break', { t: hm(tot.mx) });
    var peak = -1, pv = 0; tot.h.forEach(function (v, i) { if (v > pv) { pv = v; peak = i; } });
    if (peak >= 0 && tot.w >= 120) add('peak', 1, 'fc.agent.r.peak', { h: pad(peak) + ':00', h2: pad((peak + 1) % 24) + ':00' });
    var rep = null;
    names.forEach(function (n) {
      var A = apps[n], best = null, bv = 0;
      for (var a in A.a) if (!/^fc\./.test(a) && A.a[a] > bv) { bv = A.a[a]; best = a; }
      if (best && bv >= 30 && (!rep || bv > rep.n)) rep = { a: n, x: best, n: bv };
      if (A.w >= 60 && A.sync === 0 && n === run.app && run.syncSeen) add('sync:' + n, 4, 'fc.agent.r.sync', { a: appName(n) });
      if (A.err >= 3) add('err:' + n, 5, 'fc.agent.r.err', { a: appName(n), n: A.err });
      if (A.w === 0 && A.pw + A.early >= 60) add('idle:' + n, 1, 'fc.agent.r.idle', { a: appName(n) });
      if (A.ses >= 40 && A.w / A.ses < 3) add('frag:' + n, 2, 'fc.agent.r.frag', { a: appName(n), n: A.ses });
    });
    if (rep) add('rep:' + rep.a, 3, 'fc.agent.r.repeat', { a: appName(rep.a), x: rep.x, n: rep.n });
    var old = tot.tasks.filter(function (t) { return now().getTime() - t.since > 3 * 86400000; });
    if (old.length) add('tasks', 5, 'fc.agent.r.tasks', { n: old.length, x: old.slice(0, 3).map(function (t) { return t.label + ' (' + appName(t.app) + ')'; }).join(', ') });
    var dn = Object.keys(tot.days).length;
    if (dn >= 5) add('streak', 1, 'fc.agent.r.streak', { n: dn });
    try { if (FC.updater && FC.updater.state().plan) add('update', 3, 'fc.agent.r.update'); } catch (e) {}
    return out.sort(function (a, b) { return b.prio - a.prio; });
  }
  function notes() { var n = S().get('agent.notes', []); return Array.isArray(n) ? n : []; }
  function noteText(n) { return n.text != null ? (typeof n.text === 'string' ? n.text : FC.i18n.pick(n.text)) : T(n.key, n.vars); }
  function unread() { return notes().filter(function (n) { return !n.read; }).length; }
  /** Aynı kural 3 gün içinde aynı değerle tekrar yazılmaz. */
  function addNotes(list, src) {
    var all = notes(), t = now().getTime(), fresh = [];
    list.forEach(function (r) {
      var sig = (r.id || '') + '|' + JSON.stringify(r.vars || r.text || '');
      var dup = all.some(function (n) { return n.sig === sig && t - n.t < 3 * 86400000; });
      if (dup) return;
      var n = { id: t.toString(36) + Math.random().toString(36).slice(2, 6), t: t, sig: sig, src: src, rid: r.id, key: r.key, vars: r.vars, text: r.text, prio: r.prio || 2, read: false };
      all.unshift(n); fresh.push(n);
    });
    S().set('agent.notes', all.slice(0, MAX_NOTES));
    return fresh;
  }
  function aiCfg() { var a = run.ai ? safe(run.ai) : S().get('ai', null); return a && a.key && a.provider ? a : null; }
  function aiCallsToday() { var d = S().get('agent.ai', null); return d && d.d === dayKey() ? d.n : 0; }
  function digest(sm) {
    var apps = {};
    for (var n in sm.apps) { var A = sm.apps[n], top = Object.keys(A.a).sort(function (x, y) { return A.a[y] - A.a[x]; }).slice(0, 8); apps[appName(n)] = { weekMin: A.w, prevWeekMin: A.pw, sessions: A.ses, errors: A.err, topActions: top.map(function (k) { return k + ' ×' + A.a[k]; }) }; }
    return { weekMin: sm.tot.w, prevWeekMin: sm.tot.pw, activeDays: Object.keys(sm.tot.days).length, longestStretchMin: sm.tot.mx, minutesByHour: sm.tot.h, openTasks: sm.tot.tasks.length, apps: apps };
  }
  function prompt(sm) {
    var L = { tr: 'Türkçe', en: 'English', ar: 'العربية' }[FC.i18n.lang()] || 'Türkçe';
    return 'You are a friendly productivity coach inside a set of free desktop/mobile apps. Below are anonymous usage COUNTS (no content) of one person across their apps over the last 7 days compared to the 7 days before. ' +
      'Write 3 to 5 short, concrete, encouraging suggestions to improve how they work (focus, breaks, routines, using features better, finishing open tasks, syncing/backups). ' +
      'Each suggestion max 2 sentences, in ' + L + '. Answer ONLY with a JSON array of strings.\n\n' + JSON.stringify(digest(sm));
  }
  function askAi(sm) {
    var a = aiCfg(), f = run.fetch || g.fetch, k = a && a.key, u, h = { 'Content-Type': 'application/json' }, body, pick;
    if (!a || !f) return Promise.reject(new Error('NO_AI'));
    var p = prompt(sm), M = run.models || {};
    if (a.provider === 'gemini') { u = 'https://generativelanguage.googleapis.com/v1beta/models/' + (M.gemini || 'gemini-2.5-flash') + ':generateContent?key=' + encodeURIComponent(k); body = { contents: [{ parts: [{ text: p }] }] }; pick = function (j) { return j.candidates[0].content.parts[0].text; }; }
    else if (a.provider === 'anthropic') { u = 'https://api.anthropic.com/v1/messages'; h['x-api-key'] = k; h['anthropic-version'] = '2023-06-01'; h['anthropic-dangerous-direct-browser-access'] = 'true'; body = { model: M.anthropic || 'claude-haiku-5-5', max_tokens: 700, messages: [{ role: 'user', content: p }] }; pick = function (j) { return j.content[0].text; }; }
    else { u = a.provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'; h.Authorization = 'Bearer ' + k; body = { model: a.provider === 'groq' ? (M.groq || 'llama-3.3-70b-versatile') : (M.openai || 'gpt-4o-mini'), messages: [{ role: 'user', content: p }] }; pick = function (j) { return j.choices[0].message.content; }; }
    S().set('agent.ai', { d: dayKey(), n: aiCallsToday() + 1 });
    if (FC.usage) FC.usage.count('ai.' + a.provider);
    return f(u, { method: 'POST', headers: h, body: JSON.stringify(body) }).then(function (r) {
      if (!r.ok) { if (r.status === 429 && FC.usage) FC.usage.count('ai.' + a.provider + '.full'); throw new Error('HTTP_' + r.status); }
      return r.json();
    }).then(function (j) {
      var s = String(pick(j) || ''), m = s.match(/\[[\s\S]*\]/), arr = [];
      try { arr = JSON.parse(m ? m[0] : s); } catch (e) { arr = s.split(/\n+/).map(function (x) { return x.replace(/^[\s\-*\d.)]+/, ''); }); }
      arr = (Array.isArray(arr) ? arr : []).map(function (x) { return String(x).trim(); }).filter(Boolean).slice(0, 5);
      if (!arr.length) throw new Error('EMPTY');
      var l = FC.i18n.lang();
      return arr.map(function (x, i) { var t = {}; t[l] = x.slice(0, 400); return { id: 'ai' + i, prio: 3, text: t }; });
    });
  }
  function due(c) {
    var last = S().get('agent.lastRun', 0) || 0, t = now().getTime();
    if (c.freq === 'manual') return false;
    if (c.freq === 'instant') return t - last >= CHECK_MS;
    if (c.freq === 'weekly') return t - last >= 7 * 86400000;
    return dayKey(new Date(last)) !== dayKey() && t - last >= 12 * 3600000;
  }
  /** Analiz: çevrim dışı kurallar her zaman; çevrim içi AI uygunsa eklenir. → yeni notlar */
  function analyze(manual) {
    var c = cfg();
    if (!c.on) return Promise.resolve([]);
    if (run.busy) return run.busy;
    S().set('agent.lastRun', now().getTime());
    var sm, online = (g.navigator && g.navigator.onLine === false) ? false : true;
    run.busy = share(true).then(function () {
      sm = summary();
      var fresh = addNotes(rules(sm).slice(0, manual ? 6 : 4), 'offline');
      var useAi = c.ai && online && aiCfg() && aiCallsToday() < run.aiPerDay && (manual || c.freq !== 'instant' || aiCallsToday() === 0);
      if (!useAi) return fresh;
      return askAi(sm).then(function (list) { return fresh.concat(addNotes(list, 'ai')); }, function () { return fresh; });
    }).then(function (fresh) { run.busy = null; deliver(fresh); emit(); return fresh; }, function () { run.busy = null; return []; });
    return run.busy;
  }
  function schedule() { var c = cfg(); if (c.on && due(c)) analyze(false); }

  /* ---------- teslim: bildirim + panel ---------- */
  function deliver(fresh) {
    var c = cfg(); if (!fresh || !fresh.length) return;
    var top = fresh.slice().sort(function (a, b) { return b.prio - a.prio; })[0];
    var title = T('fc.agent.title') + (fresh.length > 1 ? ' (' + fresh.length + ')' : ''), body = noteText(top);
    if (c.notify) notify(title, body);
    else if (c.panel && FC.ui && g.document && g.document.body) FC.ui.toast(T('fc.agent.newNotes', { n: fresh.length }), 'info');
  }
  function notify(title, body) {
    try {
      if (run.notifyFn) { try { if (run.notifyFn(String(title), String(body)) !== false) return true; } catch (e) {} }
      var A = g.AndroidBridge;
      if (A && typeof A.notify === 'function') { A.notify(String(title), String(body)); return true; }
      var N = g.Notification;
      if (N && N.permission === 'granted') { var n = new N(title, { body: body, tag: 'fc-agent' }); n.onclick = function () { try { g.focus(); } catch (e) {} if (cfg().panel) show(); }; return true; }
      if (N && N.permission === 'default' && N.requestPermission) N.requestPermission().then(function (p) { if (p === 'granted') notify(title, body); });
      else if (FC.ui && g.document && g.document.body) FC.ui.toast(title + ': ' + body, 'info', 7000);
    } catch (e) {}
    return false;
  }
  function draw() {
    var c = cfg(), n = unread();
    run.btns.forEach(function (b) {
      b.style.display = c.on && c.panel ? '' : 'none';
      b.innerHTML = FC.ui.icon('sparkles') + (n ? '<span class="sync-badge">' + (n > 99 ? '99+' : n) + '</span>' : '');
      b.title = T('fc.agent.title'); b.setAttribute('aria-label', T('fc.agent.title') + (n ? ' (' + n + ')' : ''));
    });
  }
  function emit() { if (g.document) draw(); run.subs.slice().forEach(function (f) { try { f(); } catch (e) {} }); }
  function button() { var b = FC.ui.el('button.icon-btn.agent-btn', { type: 'button', 'data-fc-agent': '' }); b.addEventListener('click', function () { show(); }); run.btns.push(b); draw(); FC.i18n.onChange(draw); return b; }
  function fmtTime(t) { try { return new Date(t).toLocaleString(FC.i18n.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function statsBox(sm) {
    var ui = FC.ui, el = ui.el, box = el('div.fc-agent-stats');
    box.appendChild(el('div.fc-row', { style: 'margin:0 0 8px' }, [
      el('span.fc-agent-chip', { text: T('fc.agent.week', { t: hm(sm.tot.w) }) }),
      el('span.fc-agent-chip', { text: T('fc.agent.days', { n: Object.keys(sm.tot.days).length }) }),
      el('span.fc-agent-chip', { text: T('fc.agent.open', { n: sm.tot.tasks.length }) })]));
    var names = Object.keys(sm.apps).filter(function (n) { return sm.apps[n].w > 0; }).sort(function (a, b) { return sm.apps[b].w - sm.apps[a].w; });
    var max = names.length ? sm.apps[names[0]].w : 1;
    names.slice(0, 8).forEach(function (n) {
      var w = sm.apps[n].w;
      box.appendChild(el('div.fc-agent-bar', null, [el('span.fc-agent-bar-l', { text: appName(n) }), el('span.fc-agent-bar-t', null, [el('span.fc-agent-bar-f', { style: 'width:' + Math.max(4, Math.round(w / max * 100)) + '%' })]), el('span.fc-agent-bar-v', { text: hm(w) })]));
    });
    return box;
  }
  function show() {
    var ui = FC.ui, el = ui.el, body = el('div', { 'data-fc-agent': '' }), m;
    function render() {
      body.innerHTML = '';
      var sm = summary();
      body.appendChild(statsBox(sm));
      body.appendChild(el('div.fc-sub', { text: T('fc.agent.notes') }));
      var list = notes();
      if (!list.length) body.appendChild(el('p.muted', { text: T('fc.agent.none') }));
      list.slice(0, 30).forEach(function (n) {
        body.appendChild(el('div.fc-ann.fc-agent-note' + (n.read ? '' : '.unread'), null, [
          el('div.fc-date', null, [el('span.fc-agent-chip' + (n.src === 'ai' ? '.ai' : ''), { text: T(n.src === 'ai' ? 'fc.agent.srcAi' : 'fc.agent.srcOff') }), ' ' + fmtTime(n.t)]),
          el('div.fc-text', { text: noteText(n), dir: 'auto' })]));
      });
    }
    render();
    m = ui.modal({ title: T('fc.agent.title'), icon: 'sparkles', body: body, onClose: markRead, buttons: [
      { label: T('fc.agent.analyze'), icon: 'zap', onClick: function (close, btn) { btn.disabled = true; analyze(true).then(function () { btn.disabled = false; render(); }); return false; } },
      'spacer', { label: T('fc.close'), cls: 'primary' }] });
    return m;
  }
  function markRead() { var all = notes(); all.forEach(function (n) { n.read = true; }); S().set('agent.notes', all); emit(); }

  /* ---------- ayarlar kartı ---------- */
  function card() {
    var ui = FC.ui, el = ui.el, c = ui.card({ key: 'agent', title: '', icon: 'sparkles' });
    c.setAttribute('data-fc-agent', '');
    function chk(key, label, hint) {
      var cb = el('input', { type: 'checkbox' }); cb.checked = !!cfg()[key];
      cb.addEventListener('change', function () { var p = {}; p[key] = cb.checked; setCfg(p); if (key === 'notify' && cb.checked) { try { if (g.Notification && g.Notification.permission === 'default') g.Notification.requestPermission(); } catch (e) {} } draw2(); });
      return el('label.check', { title: hint || '' }, [cb, el('span', { text: label })]);
    }
    function draw2() {
      var o = cfg(); c.innerHTML = '';
      c.appendChild(el('h3.card-title', { html: ui.icon('sparkles') + '<span>' + ui.esc(T('fc.agent.title')) + '</span>' }));
      c.appendChild(el('p.card-desc', { text: T('fc.agent.desc') }));
      c.appendChild(chk('on', T('fc.agent.on')));
      if (o.on) {
        c.appendChild(chk('notify', T('fc.agent.notify')));
        c.appendChild(chk('panel', T('fc.agent.panel')));
        c.appendChild(chk('ai', T('fc.agent.ai')));
        if (o.ai && !aiCfg()) c.appendChild(el('p.field-hint', { text: T('fc.agent.noKey'), style: 'margin:4px 0 0' }));
        var sel = el('select', { 'aria-label': T('fc.agent.freq') });
        FREQ.forEach(function (f) { sel.appendChild(el('option', { value: f, text: T('fc.agent.freq.' + f) })); });
        sel.value = o.freq; sel.addEventListener('change', function () { setCfg({ freq: sel.value }); });
        c.appendChild(el('label.field', null, [el('span.field-label', { text: T('fc.agent.freq') }), sel]));
        var apps = knownApps();
        c.appendChild(el('div.fc-sub', { text: T('fc.agent.apps') }));
        apps.forEach(function (a) {
          var cb = el('input', { type: 'checkbox' }); cb.checked = !o.apps || o.apps.indexOf(a) >= 0;
          cb.addEventListener('change', function () { var cur = cfg().apps || apps.slice(); cur = cur.filter(function (x) { return x !== a; }); if (cb.checked) cur.push(a); setCfg({ apps: cur.length >= knownApps().length ? null : cur }); });
          c.appendChild(el('label.check', null, [cb, el('span', { text: appName(a) })]));
        });
        c.appendChild(el('p.field-hint', { text: T('fc.agent.appsHint'), style: 'margin:6px 0 0' }));
        var sm = summary();
        c.appendChild(el('p.field-hint', { text: T('fc.agent.status', { t: hm(sm.tot.w), n: notes().length, a: aiCallsToday(), m: run.aiPerDay }), style: 'margin:10px 0 0' }));
        c.appendChild(el('div.fc-row', null, [
          el('button.btn.small.primary', { type: 'button', html: ui.icon('zap') + ui.esc(T('fc.agent.analyze')), onclick: function (e) { var b = e.currentTarget; b.disabled = true; analyze(true).then(function (f) { b.disabled = false; FC.ui.toast(f.length ? T('fc.agent.newNotes', { n: f.length }) : T('fc.agent.nothing'), 'info'); draw2(); }); } }),
          el('button.btn.small', { type: 'button', html: ui.icon('sparkles') + ui.esc(T('fc.agent.showNotes')), onclick: function () { show(); } }),
          el('button.btn.small', { type: 'button', text: T('fc.agent.clear'), onclick: function () { FC.ui.modal({ title: T('fc.agent.clear'), cls: 'small', body: ui.el('p', { text: T('fc.agent.clearQ') }), buttons: [{ label: T('fc.cancel') }, { label: T('fc.agent.clear'), cls: 'primary', onClick: function () { clearAll(); draw2(); } }] }); } })]));
      }
      c.appendChild(el('p.field-hint', { text: T('fc.agent.privacy'), style: 'margin:10px 0 0' }));
    }
    draw2(); FC.i18n.onChange(draw2); run.subs.push(function () { if (c.isConnected && !c.contains(g.document.activeElement)) draw2(); });
    return c;
  }
  function clearAll() { ['agent.mine', 'agent.peers', 'agent.notes', 'agent.lastRun', 'agent.shareAt'].forEach(function (k) { S().remove(k); }); var ha = hostAgent(); if (ha && ha.remove) try { ha.remove(srcKey()); } catch (e) {} emit(); }

  /* ---------- başlat ---------- */
  function start(o) {
    o = o || {};
    if (o.now) run.now = o.now; if (o.fetch) run.fetch = o.fetch; if (o.aiPerDay != null) run.aiPerDay = +o.aiPerDay; if (o.models) run.models = o.models; if (o.ai) run.ai = o.ai; if (o.notify) run.notifyFn = o.notify; if (o.firebase) run.firebase = o.firebase;
    run.app = String(o.app || run.app || 'app'); run.version = String(o.version || ''); if (o.sync) run.syncSeen = true;
    if (run.started) return api; run.started = true;
    if (!cfg().on) return api;
    var m = mine(); today(m).ses += 1; save(m); input();
    if (FC.crash && FC.crash.report && !FC.crash.report._agent) {
      var orig = FC.crash.report;
      FC.crash.report = function () { try { var mm = mine(); today(mm).err += 1; save(mm); } catch (e) {} return orig.apply(this, arguments); };
      FC.crash.report._agent = true;
    }
    var d = g.document;
    if (d && d.addEventListener) {
      d.addEventListener('click', onClick, true);
      ['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach(function (ev) { d.addEventListener(ev, input, { capture: true, passive: true }); });
      if (g.addEventListener) g.addEventListener('hashchange', function () { track('sayfa ' + String(g.location.hash || '').split(/[?&]/)[0].slice(0, 30)); });
    }
    if (o.timers !== false) {
      run.timers.push(setInterval(tick, TICK_MS));
      run.timers.push(setInterval(function () { share(false); schedule(); }, CHECK_MS));
      run.timers.push(setTimeout(function () { share(true).then(schedule); }, o.firstDelayMs == null ? 20000 : o.firstDelayMs));
    }
    return api;
  }
  function stop() { run.timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); run.timers = []; }

  if (FC.i18n) FC.i18n.add({
    tr: {
      'fc.agent.app.kitaplik': 'Kitaplık', 'fc.agent.app.falcon-ofis': 'Falcon Ofis', 'fc.agent.app.mahzen': 'Mahzen', 'fc.agent.app.bereket-defter': 'Bereket Defter', 'fc.agent.app.organizer': 'Düzenli Evim', 'fc.agent.app.aile-ajandasi': 'Aile Ajandası', 'fc.agent.app.ajandam': 'Ajandam', 'fc.agent.app.cv-maker': 'CV Maker', 'fc.agent.app.sinav-hazirlama': 'Sınav Hazırlama', 'fc.agent.app.baski-hesabi': 'Baskı Hesabı', 'fc.agent.app.comm-calc': 'Comm Calc', 'fc.agent.app.merkezi-servis': 'Merkezi Servis', 'fc.agent.app.ofis-gunlugu': 'Ofis Günlüğü', 'fc.agent.app.pixhawk-log-analiz': 'Pixhawk Log Analiz', 'fc.agent.app.kalori-hesaplayici': 'Kalori Hesaplayıcı', 'fc.agent.app.ing-mufredat': 'İngilizce Müfredat', 'fc.agent.app.iha-mufredat': 'İHA Müfredat', 'fc.agent.app.tv-bakim': 'TV Bakım', 'fc.agent.app.desktop-duzen': 'Masaüstü Düzen',
      'fc.agent.title': 'Asistan Agent', 'fc.agent.desc': 'Tüm uygulamalarınızdaki çalışmanızı izler ve daha verimli çalışmanız için yorum yapar.',
      'fc.agent.on': 'Agent açık', 'fc.agent.notify': 'Önerileri bildirim olarak göster', 'fc.agent.panel': 'Uygulama içi panel (✦ düğmesi)',
      'fc.agent.ai': 'Çevrim içi yapay zeka yorumları (kendi anahtarınızla; internet yoksa çevrim dışı kurallar)', 'fc.agent.noKey': 'Yapay zeka anahtarı bağlı değil; şimdilik yalnız çevrim dışı yorumlar yapılır. Anahtarı programın yapay zeka / kurulum ayarından ekleyebilirsiniz.',
      'fc.agent.freq': 'Yorum sıklığı', 'fc.agent.freq.instant': 'Anlık (yarım saatte bir)', 'fc.agent.freq.daily': 'Günlük', 'fc.agent.freq.weekly': 'Haftalık', 'fc.agent.freq.manual': 'Yalnızca istediğimde',
      'fc.agent.apps': 'İzlenen uygulamalar', 'fc.agent.appsHint': 'Diğer uygulamalar; aynı bilgisayarda, kendi Firebase hesabınızla ya da Wi-Fi eşitlemesiyle göründükçe listeye eklenir.',
      'fc.agent.status': 'Bu hafta: {t} · {n} yorum · bugün yapay zeka: {a}/{m}', 'fc.agent.analyze': 'Şimdi analiz et', 'fc.agent.showNotes': 'Yorumları göster', 'fc.agent.clear': 'Kayıtları sil',
      'fc.agent.clearQ': 'Agent\'ın bu cihazdaki tüm sayaçları ve yorumları silinsin mi? Uygulama verileriniz etkilenmez.',
      'fc.agent.privacy': 'Gizlilik: yalnızca sayılar tutulur (süre, düğme adları, saatler). Yazdıklarınız ve kayıt içerikleri asla okunmaz; veriler cihazınızda ve kendi hesaplarınızda kalır.',
      'fc.agent.notes': 'Yorumlar', 'fc.agent.none': 'Henüz yorum yok. Biraz çalıştıktan sonra ya da “Şimdi analiz et” ile yorumlar burada görünür.',
      'fc.agent.srcAi': 'Yapay zeka', 'fc.agent.srcOff': 'Çevrim dışı', 'fc.agent.newNotes': 'Asistan Agent {n} yeni yorum yaptı', 'fc.agent.nothing': 'Yeni bir yorum yok; her şey yolunda görünüyor.',
      'fc.agent.week': 'Bu hafta {t}', 'fc.agent.days': '{n}/7 gün etkin', 'fc.agent.open': '{n} açık iş', 'fc.agent.hm': '{h} sa {m} dk', 'fc.agent.m': '{m} dk',
      'fc.agent.r.start': 'Merhaba! Çalışmanızı izlemeye başladım. Birkaç gün sonra size özel öneriler yapacağım.',
      'fc.agent.r.up': 'Bu hafta geçen haftaya göre %{p} daha fazla çalıştınız ({t}). Harika bir tempo; düzenli molaları unutmayın.',
      'fc.agent.r.down': 'Bu hafta çalışma süreniz geçen haftaya göre %{p} azaldı ({t}). Günün belli bir saatini düzenli işlere ayırmak ritmi geri getirir.',
      'fc.agent.r.top': 'Bu hafta zamanınızın %{p}\'ini {a} uygulamasında geçirdiniz ({n} uygulama kullanıldı). Diğer işlerin geride kalmadığından emin olun.',
      'fc.agent.r.night': 'Çalışmanızın %{p}\'i gece 23:00–05:00 arasında. Önemli işleri gündüze almak hem hatayı hem yorgunluğu azaltır.',
      'fc.agent.r.break': 'Bir oturumda {t} ara vermeden çalıştınız. Her 50–60 dakikada 5 dakikalık mola odağı korur.',
      'fc.agent.r.peak': 'En verimli saatiniz {h}–{h2}. Zor ve önemli işleri bu saate planlayın.',
      'fc.agent.r.repeat': '{a} içinde “{x}” işlemini bu hafta {n} kez yaptınız. Bunun için bir şablon, kısayol ya da toplu işlem kullanmak zaman kazandırır.',
      'fc.agent.r.sync': '{a} içinde bu hafta hiç eşitleme yapılmadı. Verilerinizin yedeği için Eşitle düğmesini kullanın.',
      'fc.agent.r.err': '{a} bu hafta {n} kez hata verdi. Güncellemeyi kontrol edin; sürerse Ayarlar → Admin ile iletişim\'den bildirin.',
      'fc.agent.r.idle': '{a} bu hafta hiç açılmadı. Bekleyen işiniz varsa kısa bir göz atmak iyi olabilir.',
      'fc.agent.r.frag': '{a} bu hafta {n} kez kısa süreli açıldı. İşleri gruplayıp tek seferde yapmak bölünmeyi azaltır.',
      'fc.agent.r.tasks': '3 günden uzun süredir açık {n} işiniz var: {x}. Bugün birini bitirmeyi deneyin.',
      'fc.agent.r.streak': 'Bu hafta {n} gün düzenli çalıştınız. Süreklilik en büyük güç; böyle devam!',
      'fc.agent.r.update': 'Yeni bir güncelleme hazır. Tek tıkla güncelleyerek son iyileştirmelerden yararlanın.'
    },
    en: {
      'fc.agent.app.kitaplik': 'Library', 'fc.agent.app.mahzen': 'Cellar', 'fc.agent.app.bereket-defter': 'Bereket Ledger', 'fc.agent.app.organizer': 'Tidy Home', 'fc.agent.app.aile-ajandasi': 'Family Planner', 'fc.agent.app.ajandam': 'My Planner', 'fc.agent.app.sinav-hazirlama': 'Exam Builder', 'fc.agent.app.baski-hesabi': 'Print Cost', 'fc.agent.app.merkezi-servis': 'Central Shuttle', 'fc.agent.app.ofis-gunlugu': 'Office Log', 'fc.agent.app.kalori-hesaplayici': 'Calorie Calculator', 'fc.agent.app.ing-mufredat': 'English Curriculum', 'fc.agent.app.iha-mufredat': 'UAV Curriculum', 'fc.agent.app.tv-bakim': 'TV Care',
      'fc.agent.title': 'Assistant Agent', 'fc.agent.desc': 'Follows your work across all your apps and comments on how to work more effectively.',
      'fc.agent.on': 'Agent on', 'fc.agent.notify': 'Show suggestions as notifications', 'fc.agent.panel': 'In-app panel (✦ button)',
      'fc.agent.ai': 'Online AI comments (with your own key; offline rules when there is no internet)', 'fc.agent.noKey': 'No AI key connected; only offline comments for now. You can add a key in the program's AI / setup settings.',
      'fc.agent.freq': 'Comment frequency', 'fc.agent.freq.instant': 'Instant (every half hour)', 'fc.agent.freq.daily': 'Daily', 'fc.agent.freq.weekly': 'Weekly', 'fc.agent.freq.manual': 'Only when I ask',
      'fc.agent.apps': 'Watched apps', 'fc.agent.appsHint': 'Other apps are added as they appear on the same computer, on your own Firebase account or via Wi-Fi sync.',
      'fc.agent.status': 'This week: {t} · {n} comments · AI today: {a}/{m}', 'fc.agent.analyze': 'Analyse now', 'fc.agent.showNotes': 'Show comments', 'fc.agent.clear': 'Clear records',
      'fc.agent.clearQ': 'Delete all of the agent\'s counters and comments on this device? Your app data is not affected.',
      'fc.agent.privacy': 'Privacy: only numbers are kept (time, button names, hours). What you type and your records are never read; data stays on your device and your own accounts.',
      'fc.agent.notes': 'Comments', 'fc.agent.none': 'No comments yet. They will appear here after some work or with “Analyse now”.',
      'fc.agent.srcAi': 'AI', 'fc.agent.srcOff': 'Offline', 'fc.agent.newNotes': 'Assistant Agent made {n} new comments', 'fc.agent.nothing': 'No new comments; everything looks fine.',
      'fc.agent.week': 'This week {t}', 'fc.agent.days': '{n}/7 days active', 'fc.agent.open': '{n} open tasks', 'fc.agent.hm': '{h} h {m} min', 'fc.agent.m': '{m} min',
      'fc.agent.r.start': 'Hello! I have started following your work. In a few days I will make suggestions just for you.',
      'fc.agent.r.up': 'You worked {p}% more this week than last week ({t}). Great pace — don\'t forget regular breaks.',
      'fc.agent.r.down': 'Your working time dropped {p}% compared with last week ({t}). Setting a fixed hour for routine work brings the rhythm back.',
      'fc.agent.r.top': 'You spent {p}% of your time this week in {a} ({n} apps used). Make sure other work isn\'t falling behind.',
      'fc.agent.r.night': '{p}% of your work is between 23:00 and 05:00. Moving important tasks to daytime reduces mistakes and fatigue.',
      'fc.agent.r.break': 'You worked {t} without a break in one session. A 5-minute break every 50–60 minutes keeps you focused.',
      'fc.agent.r.peak': 'Your most productive hour is {h}–{h2}. Plan hard and important work for that time.',
      'fc.agent.r.repeat': 'You did “{x}” {n} times this week in {a}. A template, shortcut or bulk action would save time.',
      'fc.agent.r.sync': 'No sync was done in {a} this week. Use the Sync button to keep a backup of your data.',
      'fc.agent.r.err': '{a} had {n} errors this week. Check for updates; if it continues, report it via Settings → Contact admin.',
      'fc.agent.r.idle': '{a} was not opened this week. If something is pending there, a quick look may help.',
      'fc.agent.r.frag': '{a} was opened {n} times for short periods this week. Grouping tasks and doing them at once reduces interruptions.',
      'fc.agent.r.tasks': 'You have {n} tasks open for more than 3 days: {x}. Try to finish one today.',
      'fc.agent.r.streak': 'You worked steadily on {n} days this week. Consistency is the biggest strength — keep going!',
      'fc.agent.r.update': 'A new update is ready. Update with one click to get the latest improvements.'
    },
    ar: {
      'fc.agent.app.kitaplik': 'المكتبة', 'fc.agent.app.mahzen': 'المخزن', 'fc.agent.app.bereket-defter': 'دفتر البركة', 'fc.agent.app.organizer': 'بيتي المنظّم', 'fc.agent.app.aile-ajandasi': 'أجندة العائلة', 'fc.agent.app.ajandam': 'أجندتي', 'fc.agent.app.sinav-hazirlama': 'إعداد الاختبارات', 'fc.agent.app.baski-hesabi': 'حساب الطباعة', 'fc.agent.app.merkezi-servis': 'الخدمة المركزية', 'fc.agent.app.ofis-gunlugu': 'يوميات المكتب', 'fc.agent.app.kalori-hesaplayici': 'حاسبة السعرات', 'fc.agent.app.ing-mufredat': 'منهج الإنجليزية', 'fc.agent.app.iha-mufredat': 'منهج الطائرات المسيّرة', 'fc.agent.app.tv-bakim': 'صيانة التلفاز',
      'fc.agent.title': 'الوكيل المساعد', 'fc.agent.desc': 'يتابع عملك في جميع تطبيقاتك ويقدّم ملاحظات لتعمل بكفاءة أكبر.',
      'fc.agent.on': 'تشغيل الوكيل', 'fc.agent.notify': 'عرض الاقتراحات كإشعارات', 'fc.agent.panel': 'لوحة داخل التطبيق (زر ✦)',
      'fc.agent.ai': 'ملاحظات الذكاء الاصطناعي عبر الإنترنت (بمفتاحك الخاص؛ قواعد دون اتصال عند انقطاع الإنترنت)', 'fc.agent.noKey': 'لا يوجد مفتاح ذكاء اصطناعي مرتبط؛ الملاحظات الآن دون اتصال فقط. يمكنك إضافة المفتاح من إعدادات الذكاء الاصطناعي / الإعداد في البرنامج.',
      'fc.agent.freq': 'تكرار الملاحظات', 'fc.agent.freq.instant': 'فوري (كل نصف ساعة)', 'fc.agent.freq.daily': 'يومي', 'fc.agent.freq.weekly': 'أسبوعي', 'fc.agent.freq.manual': 'فقط عندما أطلب',
      'fc.agent.apps': 'التطبيقات المتابَعة', 'fc.agent.appsHint': 'تُضاف التطبيقات الأخرى عند ظهورها على الحاسوب نفسه أو في حساب Firebase الخاص بك أو عبر مزامنة Wi-Fi.',
      'fc.agent.status': 'هذا الأسبوع: {t} · {n} ملاحظة · الذكاء الاصطناعي اليوم: {a}/{m}', 'fc.agent.analyze': 'حلّل الآن', 'fc.agent.showNotes': 'عرض الملاحظات', 'fc.agent.clear': 'حذف السجلات',
      'fc.agent.clearQ': 'هل تريد حذف جميع عدّادات الوكيل وملاحظاته على هذا الجهاز؟ لا تتأثر بيانات تطبيقاتك.',
      'fc.agent.privacy': 'الخصوصية: تُحفظ الأرقام فقط (المدة، أسماء الأزرار، الساعات). لا تُقرأ كتاباتك ولا محتوى سجلاتك أبداً؛ تبقى البيانات على جهازك وفي حساباتك الخاصة.',
      'fc.agent.notes': 'الملاحظات', 'fc.agent.none': 'لا توجد ملاحظات بعد. ستظهر هنا بعد قليل من العمل أو عند الضغط على «حلّل الآن».',
      'fc.agent.srcAi': 'ذكاء اصطناعي', 'fc.agent.srcOff': 'دون اتصال', 'fc.agent.newNotes': 'قدّم الوكيل المساعد {n} ملاحظة جديدة', 'fc.agent.nothing': 'لا توجد ملاحظات جديدة؛ كل شيء يبدو جيداً.',
      'fc.agent.week': 'هذا الأسبوع {t}', 'fc.agent.days': '{n}/7 أيام نشطة', 'fc.agent.open': '{n} مهام مفتوحة', 'fc.agent.hm': '{h} س {m} د', 'fc.agent.m': '{m} د',
      'fc.agent.r.start': 'مرحباً! بدأت متابعة عملك. بعد بضعة أيام سأقدّم لك اقتراحات خاصة بك.',
      'fc.agent.r.up': 'عملت هذا الأسبوع أكثر بنسبة {p}% من الأسبوع الماضي ({t}). وتيرة رائعة؛ لا تنسَ الاستراحات المنتظمة.',
      'fc.agent.r.down': 'انخفض وقت عملك بنسبة {p}% مقارنة بالأسبوع الماضي ({t}). تخصيص ساعة ثابتة للأعمال المعتادة يعيد الإيقاع.',
      'fc.agent.r.top': 'قضيت {p}% من وقتك هذا الأسبوع في {a} (استُخدم {n} تطبيقات). تأكد من ألّا تتأخر الأعمال الأخرى.',
      'fc.agent.r.night': '{p}% من عملك بين 23:00 و05:00. نقل المهام المهمة إلى النهار يقلّل الأخطاء والتعب.',
      'fc.agent.r.break': 'عملت {t} دون استراحة في جلسة واحدة. استراحة 5 دقائق كل 50–60 دقيقة تحافظ على التركيز.',
      'fc.agent.r.peak': 'أكثر ساعاتك إنتاجية {h}–{h2}. خطّط للأعمال الصعبة والمهمة في هذا الوقت.',
      'fc.agent.r.repeat': 'نفّذت «{x}» {n} مرة هذا الأسبوع في {a}. استخدام قالب أو اختصار أو إجراء جماعي يوفّر الوقت.',
      'fc.agent.r.sync': 'لم تتم أي مزامنة في {a} هذا الأسبوع. استخدم زر المزامنة للاحتفاظ بنسخة احتياطية من بياناتك.',
      'fc.agent.r.err': 'ظهرت في {a} {n} أخطاء هذا الأسبوع. تحقّق من التحديثات؛ وإن استمرت فأبلغ عنها من الإعدادات ← التواصل مع المسؤول.',
      'fc.agent.r.idle': 'لم يُفتح {a} هذا الأسبوع. إن كان لديك عمل معلّق فيه فنظرة سريعة قد تفيد.',
      'fc.agent.r.frag': 'فُتح {a} {n} مرة لفترات قصيرة هذا الأسبوع. تجميع المهام وإنجازها دفعة واحدة يقلّل الانقطاع.',
      'fc.agent.r.tasks': 'لديك {n} مهام مفتوحة منذ أكثر من 3 أيام: {x}. حاول إنهاء واحدة اليوم.',
      'fc.agent.r.streak': 'عملت بانتظام {n} أيام هذا الأسبوع. الاستمرارية أكبر قوة؛ واصل!',
      'fc.agent.r.update': 'تحديث جديد جاهز. حدّث بنقرة واحدة للاستفادة من آخر التحسينات.'
    }
  });

  var api = { start: start, stop: stop, track: track, task: task, analyze: analyze, rules: rules, summary: summary, notes: notes, noteText: noteText, unread: unread,
    button: button, show: show, card: card, config: cfg, configure: setCfg, exportShare: exportShare, importShare: importShare, share: share, clear: clearAll,
    knownApps: knownApps, hasSync: function () { run.syncSeen = true; }, onChange: function (f) { run.subs.push(f); }, _tick: tick, _input: input, _clean: clean, _due: due,
    _reset: function () { stop(); run.started = false; run.subs = []; run.btns = []; run.busy = null; run.streak = 0; } };
  FC.agent = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
