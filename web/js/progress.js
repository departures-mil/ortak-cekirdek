/* FC.progress — ortak indirme ilerlemesi: ölçüm, biçim ve görünüm.
   Gösterilen: yüzde, "X,X MB / Y,Y MB", "kalan Z,Z MB", hız "N,N MB/sn"; yama kipinde ayrıca "yalnızca değişen kısımlar".
     const tr = FC.progress.tracker(total);  const p = tr.update(doneBytes);
     FC.progress.format(p, {patch:true}).detail
     const bytes = await FC.progress.download(url, {total, onProgress: p => box.set(p)});
     const box = FC.progress.box(); parent.appendChild(box.el); */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var MB = 1048576;
  function T(k, v, l) { return FC.t ? FC.t(k, v, l) : k; }
  function lang(l) { return l || (FC.i18n ? FC.i18n.lang() : 'tr'); }
  function num(n, d, l) { return FC.i18n ? FC.i18n.num(n, d, l) : Number(n).toFixed(d); }

  /** Hız son ~3 saniyedeki örneklerle hesaplanır (kayan pencere); now() testte verilebilir. */
  function tracker(total, now) {
    now = now || function () { return Date.now(); };
    var t0 = now(), samples = [{ t: t0, b: 0 }], done = 0;
    return {
      update: function (d, finished) {
        done = Math.max(0, +d || 0);
        var t = now();
        samples.push({ t: t, b: done });
        while (samples.length > 2 && t - samples[0].t > 3000) samples.shift();
        var a = samples[0], sec = (t - a.t) / 1000;
        var speed = sec >= 0.25 ? (done - a.b) / sec : 0;
        var tot = total && done <= total ? total : (finished ? done : 0);
        return { done: done, total: tot, pct: tot ? Math.min(100, done / tot * 100) : 0, remaining: tot ? Math.max(0, tot - done) : 0, speed: Math.max(0, speed), finished: !!finished };
      },
      setTotal: function (n) { total = +n || 0; }
    };
  }
  function mb(bytes, l) { return num(bytes / MB, 1, l) + ' MB'; }
  function pct(p, l) { var n = Math.floor(p); return lang(l) === 'tr' ? '%' + n : n + '%'; }
  /** p → {percent, pctText, sizeText, leftText, speedText, modeText, detail} */
  function format(p, o) {
    o = o || {}; var l = lang(o.lang);
    var r = { percent: p.total ? Math.floor(p.pct) : null, pctText: '', sizeText: '', leftText: '', speedText: '', modeText: o.patch ? T('fc.update.patchMode', null, l) : '' };
    if (p.finished) {
      r.percent = 100; r.pctText = pct(100, l); r.sizeText = p.total ? mb(p.total, l) : '';
      r.detail = [T('fc.p.done', null, l), r.sizeText, r.modeText].filter(Boolean).join(' · ');
      return r;
    }
    if (p.total) {
      r.pctText = pct(p.pct, l);
      r.sizeText = mb(p.done, l) + ' / ' + mb(p.total, l);
      r.leftText = T('fc.p.left', { x: mb(p.remaining, l) }, l);
    } else r.sizeText = mb(p.done, l);
    r.speedText = p.speed > 0 ? num(p.speed / MB, 1, l) + ' ' + T('fc.p.speed', null, l) : T('fc.p.calc', null, l);
    r.detail = [r.pctText, r.sizeText, r.leftText, r.speedText].filter(Boolean).join(' · ');
    return r;
  }
  function concat(parts, n) { var out = new Uint8Array(n), k = 0; for (var i = 0; i < parts.length; i++) { out.set(parts[i], k); k += parts[i].length; } return out; }
  /** Akışlı indirme. o.total biliniyorsa (manifestteki size) onu kullanır; gzip'li yanıtta Content-Length güvenilmez. */
  async function download(url, o) {
    o = o || {};
    var f = o.fetch || g.fetch;
    var res = await f(url, { cache: 'no-store', signal: o.signal, redirect: 'follow' });
    if (!res.ok) { var e = new Error('HTTP ' + res.status); e.code = 'HTTP_' + res.status; throw e; }
    var hdr = +(res.headers && res.headers.get && res.headers.get('content-length')) || 0;
    var enc = (res.headers && res.headers.get && res.headers.get('content-encoding')) || '';
    var total = o.total || (/gzip|br|deflate/i.test(enc) ? 0 : hdr);
    var tr = tracker(total, o.now), cb = o.onProgress || function () {};
    if (!res.body || !res.body.getReader) {
      var all = new Uint8Array(await res.arrayBuffer()); tr.setTotal(total || all.length);
      cb(tr.update(all.length, true)); return all;
    }
    var rd = res.body.getReader(), parts = [], n = 0, last = 0;
    cb(tr.update(0));
    for (;;) {
      var x = await rd.read(); if (x.done) break;
      parts.push(x.value); n += x.value.length;
      var t = Date.now(); if (t - last > 150) { last = t; cb(tr.update(n)); }
    }
    if (!total) tr.setTotal(n);
    cb(tr.update(n, true));
    return concat(parts, n);
  }
  /** Görünüm: başlık + çubuk + ayrıntı satırı (+ yama etiketi). Falcon .update-float içinde kullanılır. */
  function box() {
    var ui = FC.ui;
    var title = ui.el('strong'), mode = ui.el('span.update-mode'), bar = ui.el('div.update-bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, [ui.el('span')]);
    var detail = ui.el('div.update-detail', { 'aria-live': 'polite' });
    var el = ui.el('div.fc-progress', { style: 'display:grid;gap:8px' }, [title, mode, bar, detail]);
    mode.hidden = true;
    return {
      el: el,
      title: function (s) { title.textContent = s; },
      set: function (p, o) {
        var f = format(p, o);
        bar.classList.toggle('indet', f.percent === null);
        bar.firstChild.style.width = (f.percent || 0) + '%';
        if (f.percent !== null) bar.setAttribute('aria-valuenow', String(f.percent));
        detail.textContent = f.detail;
        mode.textContent = f.modeText; mode.hidden = !f.modeText;
      },
      busy: function (s) { title.textContent = s; bar.classList.add('indet'); detail.textContent = ''; mode.hidden = true; }
    };
  }
  var api = { tracker: tracker, format: format, download: download, box: box, mb: mb };
  FC.progress = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
