/* FC.look — renk şeması (falcon varsayılan, klasik, zumrut, gunbatimi, mor, okyanus, grafit, yuksek-kontrast),
   mod (dark | light | auto), yazı boyutu (A− / A+, 0.85–1.4) ve Arapça yazı tipi.
   <html data-scheme="…">, html.theme-light sınıfı ve --font-scale ayarlanır; seçimler kalıcıdır. Arapçada Noto Sans Arabic
   core.css'teki html[lang=ar] kuralıyla gelir.
   Uygulamanın eski görünümü:  FC.look.registerScheme('klasik', {dark:{'--bg':'#…', …}, light:{…}, label:{tr,en,ar}})
   (tek modu olan uygulama aynı tokenları ikisine de verebilir; light verilmezse dark kullanılır). */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var MIN = 0.85, MAX = 1.4, STEP = 0.05;
  var subs = [], mq = null;
  var BUILTIN = ['falcon', 'zumrut', 'gunbatimi', 'mor', 'okyanus', 'grafit', 'yuksek-kontrast'];
  var custom = {};   // id → {label}
  if (FC.i18n) FC.i18n.add({
    tr: { 'fc.scheme': 'Renk şeması', 'fc.scheme.falcon': 'Falcon (varsayılan)', 'fc.scheme.zumrut': 'Zümrüt', 'fc.scheme.gunbatimi': 'Gün batımı', 'fc.scheme.mor': 'Mor', 'fc.scheme.okyanus': 'Okyanus', 'fc.scheme.grafit': 'Grafit', 'fc.scheme.yuksek-kontrast': 'Yüksek kontrast', 'fc.mode': 'Mod' },
    en: { 'fc.scheme': 'Colour scheme', 'fc.scheme.falcon': 'Falcon (default)', 'fc.scheme.zumrut': 'Emerald', 'fc.scheme.gunbatimi': 'Sunset', 'fc.scheme.mor': 'Violet', 'fc.scheme.okyanus': 'Ocean', 'fc.scheme.grafit': 'Graphite', 'fc.scheme.yuksek-kontrast': 'High contrast', 'fc.mode': 'Mode' },
    ar: { 'fc.scheme': 'نظام الألوان', 'fc.scheme.falcon': 'فالكون (الافتراضي)', 'fc.scheme.zumrut': 'زمردي', 'fc.scheme.gunbatimi': 'الغروب', 'fc.scheme.mor': 'بنفسجي', 'fc.scheme.okyanus': 'المحيط', 'fc.scheme.grafit': 'رمادي غرافيتي', 'fc.scheme.yuksek-kontrast': 'تباين عالٍ', 'fc.mode': 'الوضع' }
  });
  function schemes() { var l = BUILTIN.slice(); Object.keys(custom).forEach(function (k) { if (l.indexOf(k) < 0) l.splice(k === 'klasik' ? 1 : l.length, 0, k); }); return l; }
  function scheme() { var s = S() && S().get('scheme'); return schemes().indexOf(s) >= 0 ? s : 'falcon'; }
  function schemeLabel(id) { return custom[id] ? FC.i18n.pick(custom[id].label) || id : T('fc.scheme.' + id); }
  function decl(t) { var out = []; for (var k in t) { var n = k.slice(0, 2) === '--' ? k : '--' + k; if (/^--[\w-]+$/.test(n) && !/[;{}<]/.test(String(t[k]))) out.push(n + ':' + t[k]); } return out.join(';'); }
  /** Uygulamanın kendi şemasını (çoğunlukla 'klasik') ekler; seçicide görünür. */
  function registerScheme(id, def) {
    id = String(id || '').toLowerCase().replace(/[^a-z0-9-]/g, ''); if (!id || id === 'falcon' || !def) return;
    var dark = def.dark || def.light, light = def.light || def.dark;
    custom[id] = { label: def.label || id };
    var d = g.document; if (d && d.head) {
      var st = d.getElementById('fc-scheme-' + id) || d.head.appendChild(d.createElement('style'));
      st.id = 'fc-scheme-' + id;
      st.textContent = '[data-scheme="' + id + '"]{' + decl(dark) + ';color-scheme:dark}\n[data-scheme="' + id + '"].theme-light,.theme-light [data-scheme="' + id + '"]{' + decl(light) + ';color-scheme:light}';
    }
    apply();
  }
  function setScheme(id) { if (schemes().indexOf(id) < 0) return; S().set('scheme', id); apply(); }
  function S() { return FC.storage; }
  function T(k, v) { return FC.t ? FC.t(k, v) : k; }
  function theme() { var t = S() && S().get('theme'); return t === 'light' || t === 'auto' ? t : 'dark'; }
  function effective() {
    var t = theme();
    if (t !== 'auto') return t;
    try { return g.matchMedia && g.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) { return 'dark'; }
  }
  function clamp(x) { x = Math.round((+x || 1) * 100) / 100; return Math.min(MAX, Math.max(MIN, x)); }
  function scale() { return clamp(S() ? S().get('fontScale', 1) : 1); }
  function apply() {
    var d = g.document && g.document.documentElement; if (!d) return;
    var light = effective() === 'light';
    d.classList.toggle('theme-light', light);
    d.classList.toggle('theme-dark', !light);
    d.setAttribute('data-scheme', scheme());
    d.style.setProperty('--font-scale', String(scale()));
    var m = g.document.querySelector('meta[name="color-scheme"]'); if (m) m.setAttribute('content', light ? 'light' : 'dark');
    subs.slice().forEach(function (f) { try { f({ theme: theme(), effective: effective(), scale: scale(), scheme: scheme() }); } catch (e) {} });
  }
  function setTheme(t) { if (['dark', 'light', 'auto'].indexOf(t) < 0) return; S().set('theme', t); apply(); }
  function toggle() { setTheme(effective() === 'light' ? 'dark' : 'light'); }
  function setScale(x) { S().set('fontScale', clamp(x)); apply(); }
  function bump(dir) { setScale(scale() + dir * STEP); }
  function onChange(f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; }

  /** Üst çubuktaki tema düğmesi */
  function themeButton() {
    var ui = FC.ui, b = ui.el('button.icon-btn.theme-btn', { type: 'button' });
    function draw() { var l = effective() === 'light'; b.innerHTML = ui.icon(l ? 'moon' : 'sun'); b.title = T('fc.theme.toggle'); b.setAttribute('aria-label', T('fc.theme.toggle')); }
    b.addEventListener('click', toggle);
    draw(); onChange(draw); if (FC.i18n) FC.i18n.onChange(draw);
    return b;
  }
  /** Tema seçici + A− / A+ (ayarlar kartında ve kurulum sihirbazında kullanılır) */
  function controls() {
    var ui = FC.ui, wrap = ui.el('div');
    function draw() {
      wrap.innerHTML = '';
      var seg = ui.el('div.segmented', { role: 'group', 'aria-label': T('fc.theme') });
      [['dark', 'moon'], ['light', 'sun'], ['auto', 'sync']].forEach(function (x) {
        var b = ui.el('button', { type: 'button', html: ui.icon(x[1]) + ui.esc(T('fc.theme.' + x[0])), 'aria-pressed': String(theme() === x[0]) });
        if (theme() === x[0]) b.className = 'active';
        b.addEventListener('click', function () { setTheme(x[0]); });
        seg.appendChild(b);
      });
      wrap.appendChild(ui.el('div.field', null, [ui.el('span.field-label', { text: T('fc.scheme') }), picker()]));
      wrap.appendChild(ui.el('div.field', null, [ui.el('span.field-label', { text: T('fc.mode') }), seg]));
      var pct = Math.round(scale() * 100) + '%';
      var minus = ui.el('button.btn.small', { type: 'button', title: T('fc.font.smaller'), 'aria-label': T('fc.font.smaller'), dir: 'ltr', text: 'A−', onclick: function () { bump(-1); } });
      var plus = ui.el('button.btn.small', { type: 'button', title: T('fc.font.larger'), 'aria-label': T('fc.font.larger'), dir: 'ltr', html: '<span style="font-size:1.2em">A+</span>', onclick: function () { bump(1); } });
      var reset = ui.el('button.btn.small.ghost', { type: 'button', text: T('fc.font.reset'), onclick: function () { setScale(1); } });
      minus.disabled = scale() <= MIN; plus.disabled = scale() >= MAX;
      wrap.appendChild(ui.el('div.field', null, [ui.el('span.field-label', { text: T('fc.font') }),
        ui.el('div.fc-row', { style: 'margin:0' }, [minus, ui.el('b.ltr', { text: pct, style: 'min-width:48px;text-align:center' }), plus, reset])]));
    }
    draw(); onChange(draw); if (FC.i18n) FC.i18n.onChange(draw);
    return wrap;
  }
  /** Şema seçici: önizleme kutucukları (zemin / panel / ana renk) kendi data-scheme'leriyle boyanır. */
  function picker() {
    var ui = FC.ui, box = ui.el('div.fc-schemes', { role: 'radiogroup', 'aria-label': T('fc.scheme') });
    schemes().forEach(function (id) {
      var on = scheme() === id;
      var b = ui.el('button.fc-scheme' + (on ? '.active' : ''), { type: 'button', role: 'radio', 'aria-checked': String(on), 'data-id': id,
        html: '<span class="fc-swatch" data-scheme="' + ui.esc(id) + '" aria-hidden="true"><i></i><i></i><i></i><b></b></span><span class="fc-name">' + ui.esc(schemeLabel(id)) + (on ? ui.icon('check') : '') + '</span>' });
      b.addEventListener('click', function () { setScheme(id); });
      box.appendChild(b);
    });
    return box;
  }
  /** Ayarlar kartı: Görünüm (tema, yazı boyutu, dil) */
  function card() {
    var ui = FC.ui, c = ui.card({ key: 'look', title: T('fc.look'), icon: 'type', desc: T('fc.look.desc') });
    c.appendChild(controls());
    var lf = ui.el('div.field', null, [ui.el('span.field-label', { text: T('fc.lang') })]);
    lf.appendChild(langOptions());
    c.appendChild(lf);
    if (FC.i18n) FC.i18n.onChange(function () { c.querySelector('.card-title span').textContent = T('fc.look'); c.querySelector('.card-desc').textContent = T('fc.look.desc'); lf.firstChild.textContent = T('fc.lang'); });
    return c;
  }
  function langOptions() {
    var ui = FC.ui, box = ui.el('div.lang-options', { style: 'margin-top:0' });
    function draw() {
      box.innerHTML = '';
      FC.i18n.langs.forEach(function (l) {
        var on = FC.i18n.lang() === l;
        var b = ui.el('button.lang-option' + (on ? '.active' : ''), { type: 'button', lang: l, html: '<span>' + ui.esc(FC.i18n.names[l]) + '</span>' + (on ? ui.icon('check') : '') });
        b.addEventListener('click', function () { FC.i18n.set(l); });
        box.appendChild(b);
      });
    }
    draw(); FC.i18n.onChange(draw);
    return box;
  }
  function init() {
    apply();
    try { mq = g.matchMedia('(prefers-color-scheme: light)'); var f = function () { if (theme() === 'auto') apply(); }; mq.addEventListener ? mq.addEventListener('change', f) : mq.addListener(f); } catch (e) {}
  }
  var api = { init: init, apply: apply, scheme: scheme, setScheme: setScheme, schemes: schemes, schemeLabel: schemeLabel, registerScheme: registerScheme, picker: picker, BUILTIN: BUILTIN, theme: theme, effective: effective, setTheme: setTheme, toggle: toggle, scale: scale, setScale: setScale, bump: bump, onChange: onChange, themeButton: themeButton, controls: controls, card: card, langOptions: langOptions, MIN: MIN, MAX: MAX };
  FC.look = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
