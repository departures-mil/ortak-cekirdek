/* FC.topbar — sağ üst sıra (Falcon .topbar-actions):
     [ek düğmeler] Eşitle · Wi-Fi · Güncelle · Tema · Dil | Küçült · Orta · Tam ekran · Kapat
   const tb = FC.topbar.mount(document.querySelector('.topbar'), {
     sync: {onClick: () => app.syncNow()},   // false → gizli
     lan:  {onClick: () => app.openLan()},
     before: [benimDugmem]                    // isteğe bağlı, Eşitle'nin önüne
   });
   tb.setSync('idle'|'syncing'|'error'|'off'|'offline', bekleyenSayisi);  tb.setLan('on'|'off'|'busy');
   Pencere düğmeleri FC.host.window.* çağırır; kabuğun desteklemediği düğme gösterilmez. */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  function T(k, v) { return FC.t(k, v); }

  function mount(parent, o) {
    o = o || {};
    var ui = FC.ui, el = ui.el, icon = ui.icon, h = FC.host;
    var bar = el('div.topbar-actions');
    (o.before || []).forEach(function (n) { bar.appendChild(n); });
    if (FC.agent && o.agent !== false) bar.appendChild(FC.agent.button());
    var redraws = [];

    /* Eşitle */
    var syncState = o.sync && o.sync.state || 'off', syncBadge = 0, syncBtn = null;
    if (o.sync !== false) {
      syncBtn = el('button.btn.small.top-act.sync-act', { type: 'button', 'data-fc-track': 'fc.sync' });
      if (FC.agent) FC.agent.hasSync();
      syncBtn.addEventListener('click', function () { if (o.sync && o.sync.onClick) o.sync.onClick(syncState); });
      bar.appendChild(syncBtn);
      redraws.push(function () {
        var ic = syncState === 'off' ? 'cloudOff' : syncState === 'offline' ? 'cloudOff' : 'sync';
        syncBtn.className = 'btn small top-act sync-act ' + syncState;
        syncBtn.innerHTML = icon(ic) + '<span class="top-act-label">' + ui.esc(T('fc.sync')) + '</span>' + (syncBadge > 0 ? '<span class="sync-badge">' + (syncBadge > 99 ? '99+' : syncBadge) + '</span>' : '');
        var tip = T('fc.sync.' + syncState) + (syncBadge > 0 ? ' · ' + T('fc.sync.pending', { n: syncBadge }) : '');
        syncBtn.title = tip; syncBtn.setAttribute('aria-label', tip);
        syncBtn.disabled = syncState === 'syncing';
      });
    }
    /* Wi-Fi / LAN */
    var lanState = o.lan && o.lan.state || 'off', lanBtn = null;
    if (o.lan !== false) {
      lanBtn = el('button.icon-btn.lan-act', { type: 'button', 'data-fc-track': 'fc.sync.lan' });
      lanBtn.addEventListener('click', function () { if (o.lan && o.lan.onClick) o.lan.onClick(lanState); });
      bar.appendChild(lanBtn);
      redraws.push(function () {
        lanBtn.className = 'icon-btn lan-act ' + lanState;
        lanBtn.innerHTML = icon(lanState === 'off' ? 'wifiOff' : 'wifi', lanState === 'busy' ? 'fc-pulse' : '');
        var tip = T(lanState === 'on' ? 'fc.lan.on' : lanState === 'busy' ? 'fc.lan.busy' : 'fc.lan.off');
        lanBtn.title = tip; lanBtn.setAttribute('aria-label', tip);
      });
    }
    /* Güncelle */
    if (o.update !== false && FC.updater) {
      var wrap = el('div.top-act-wrap'), ub = el('button.btn.small.top-act.update-act', { type: 'button' });
      var float = el('div.update-float', { role: 'status' }); float.hidden = true;
      var pbox = FC.progress.box(); float.appendChild(pbox.el);
      var floatBtns = el('div.fc-row'); float.appendChild(floatBtns);
      wrap.appendChild(ub); wrap.appendChild(float); bar.appendChild(wrap);
      var us = FC.updater.state(), hideT = null, showResult = false;
      function busy(s) { return ['downloading', 'verifying', 'installing', 'restarting'].indexOf(s) >= 0; }
      function drawUpdate() {
        var s = us.status, p = us.plan;
        ub.className = 'btn small top-act update-act' + (s === 'available' ? ' avail' : '') + (busy(s) || s === 'checking' ? ' busy' : '');
        ub.disabled = busy(s);
        ub.innerHTML = icon(s === 'checking' ? 'sync' : 'download', s === 'checking' ? 'fc-spin' : '') + '<span class="top-act-label">' + ui.esc(T('fc.update')) + '</span>' + (s === 'available' ? '<span class="update-dot"></span>' : '');
        var tip = s === 'available' && p ? T('fc.update.avail', { v: p.version }) : s === 'none' ? T('fc.update.none', { v: us.current }) : T('fc.update.check');
        ub.title = tip; ub.setAttribute('aria-label', tip);
        floatBtns.innerHTML = '';
        if (busy(s)) {
          float.hidden = false;
          if (s === 'downloading' && us.progress) {
            pbox.title(us.fallback ? T('fc.update.fallback') : T('fc.update.downloading') + (p ? ' v' + p.version : ''));
            pbox.set(us.progress, { patch: us.mode === 'patch' });
          } else pbox.busy(T('fc.update.' + s));
        } else if (s === 'done') {
          float.hidden = false; pbox.busy(T('fc.update.done')); pbox.el.querySelector('.update-bar').hidden = true;
          clearTimeout(hideT); hideT = setTimeout(function () { float.hidden = true; }, 6000);
        } else if (showResult) {
          float.hidden = false;
          if (s === 'checking') pbox.busy(T('fc.update.checking'));
          else if (s === 'available' && p) {
            pbox.busy(T('fc.update.avail', { v: p.version }));
            pbox.el.querySelector('.update-bar').hidden = true;
            pbox.el.querySelector('.update-detail').textContent = T('fc.update.press') + ' · ' + FC.progress.mb(p.size) + (p.mode === 'patch' ? ' · ' + T('fc.update.patchMode') : '');
            floatBtns.appendChild(el('button.btn.small.primary', { type: 'button', html: icon('download') + ui.esc(T('fc.update')), onclick: function () { FC.updater.run().catch(function () {}); } }));
          } else if (s === 'none') { pbox.busy(T('fc.update.none', { v: us.current })); pbox.el.querySelector('.update-bar').hidden = true; }
          else if (s === 'error' || us.error) { pbox.busy(FC.updater.errorText(us.error)); pbox.el.querySelector('.update-bar').hidden = true; floatBtns.appendChild(el('button.btn.small', { type: 'button', text: T('fc.retry'), onclick: function () { FC.updater.check(); } })); }
          if (s !== 'checking' && s !== 'available') { clearTimeout(hideT); hideT = setTimeout(function () { showResult = false; float.hidden = true; }, 5000); }
        } else float.hidden = true;
        var bb = pbox.el.querySelector('.update-bar'); if (bb && (busy(s) || s === 'checking')) bb.hidden = false;
      }
      ub.addEventListener('click', function () {
        if (us.status === 'available') { showResult = false; FC.updater.run().catch(function () { showResult = true; drawUpdate(); }); }
        else { showResult = true; FC.updater.check(); drawUpdate(); }
      });
      g.document.addEventListener('mousedown', function (e) { if (showResult && !wrap.contains(e.target)) { showResult = false; drawUpdate(); } });
      FC.updater.subscribe(function (s) { us = s; drawUpdate(); });
      redraws.push(drawUpdate);
    }
    /* Tema + Dil */
    if (o.theme !== false && FC.look) bar.appendChild(FC.look.themeButton());
    if (o.lang !== false) bar.appendChild(FC.i18n.switcher());
    /* Pencere */
    var can = (h && h.can) || {};
    if (o.window !== false && (can.minimize || can.half || can.fullscreen || can.close)) {
      var wc = el('div.win-controls'), half = false, full = false;
      function wbtn(name, ic, fn, cls) { var b = el('button.icon-btn' + (cls ? '.' + cls : ''), { type: 'button', 'data-win': name, html: icon(ic) }); b.addEventListener('click', fn); wc.appendChild(b); return b; }
      var bMin = can.minimize && wbtn('minimize', 'minus', function () { h.window.minimize(); });
      var bHalf = can.half && wbtn('half', 'half', function () { h.window.half(); });
      var bFull = can.fullscreen && wbtn('fullscreen', 'full', function () { h.window.toggleFullscreen(); });
      var bClose = can.close && wbtn('close', 'x', function () { h.window.close(); }, 'danger');
      bar.appendChild(el('span.topbar-sep', { 'aria-hidden': 'true' }));
      bar.appendChild(wc);
      var drawWin = function () {
        [[bMin, 'fc.win.minimize'], [bHalf, half ? 'fc.win.restore' : 'fc.win.half'], [bFull, 'fc.win.fullscreen'], [bClose, 'fc.win.close']].forEach(function (x) { if (x[0]) { x[0].title = T(x[1]); x[0].setAttribute('aria-label', T(x[1])); } });
        if (bHalf) bHalf.setAttribute('aria-pressed', String(half));
        if (bFull) bFull.setAttribute('aria-pressed', String(full));
      };
      h.window.onState(function (s) { half = !!(s && s.half); full = !!(s && s.fullscreen); drawWin(); });
      h.window.state().then(function (s) { half = !!(s && s.half); full = !!(s && s.fullscreen); drawWin(); }, function () {});
      redraws.push(drawWin);
    }
    function redraw() { redraws.forEach(function (f) { f(); }); }
    redraw(); FC.i18n.onChange(redraw);
    if (parent) parent.appendChild(bar);
    return {
      el: bar,
      setSync: function (s, badge) { syncState = s || 'off'; syncBadge = +badge || 0; redraw(); },
      setLan: function (s) { lanState = s || 'off'; redraw(); },
      redraw: redraw
    };
  }
  var api = { mount: mount };
  FC.topbar = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
