/* FC.settings — Falcon .settings-grid kurucusu. Sıra: [Görünüm] · uygulamanın kartları · [Asistan Agent] · [Kullanım Limitleri] ·
   [Otomatik hata raporu] · [Hakkında] · Admin ile iletişim (HER ZAMAN SON).
     FC.settings.build(document.getElementById('ayarlar'), {
       cards: [benimKartim1, benimKartim2],   // DOM düğümleri
       usage: {project: () => cfg.projectId}, // false → yok
       look: true, crash: true, about: {version:'1.57.0'}, onboarding: {...sihirbaz seçenekleri}
     });
   Sonradan kart eklemek için grid.add(kart) — iletişim kartı yine sonda kalır. */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  function T(k, v) { return FC.t(k, v); }
  function about(o) {
    var ui = FC.ui, c = ui.card({ key: 'about', title: '', icon: 'info' });
    function draw() {
      c.innerHTML = '';
      c.appendChild(ui.el('h3.card-title', { html: ui.icon('info') + '<span>' + ui.esc(T('fc.settings.about')) + '</span>' }));
      var v = o.version || (FC.host && FC.host.version()) || '';
      c.appendChild(ui.el('p.card-desc', null, [T('fc.settings.version') + ' ', ui.el('span.version-badge', { text: 'v' + v, style: 'margin:0' })]));
      var row = ui.el('div.fc-row');
      if (FC.updater) row.appendChild(ui.el('button.btn.small', { type: 'button', html: ui.icon('download') + ui.esc(T('fc.update.check')), onclick: function () { FC.updater.check().then(function (p) { FC.ui.toast(p ? T('fc.update.avail', { v: p.version }) : FC.updater.state().error ? FC.updater.errorText(FC.updater.state().error) : T('fc.update.none', { v: v }), p ? 'info' : ''); }); } }));
      if (FC.whatsnew) row.appendChild(FC.whatsnew.button());
      if (FC.onboarding && o.onboarding !== false) row.appendChild(FC.onboarding.button(o.onboarding || {}));
      c.appendChild(row);
    }
    draw(); FC.i18n.onChange(draw);
    return c;
  }
  function build(container, o) {
    o = o || {};
    var grid = container.classList && container.classList.contains('settings-grid') ? container : FC.ui.el('div.settings-grid');
    if (grid !== container) container.appendChild(grid);
    if (o.look !== false && FC.look) grid.appendChild(FC.look.card());
    (o.cards || []).forEach(function (c) { if (c) grid.appendChild(c); });
    if (o.agent !== false && FC.agent) grid.appendChild(FC.agent.card());
    if (o.usage !== false && FC.usage) grid.appendChild(FC.usage.card(o.usage || {}));
    if (o.crash !== false && FC.crash) grid.appendChild(FC.crash.card());
    if (o.about !== false) grid.appendChild(about(o.about || {}));
    if (o.contact !== false && FC.contact) FC.contact.mount(grid);
    return {
      el: grid,
      add: function (card) { var last = grid.querySelector('[data-fc-card="contact"]'); grid.insertBefore(card, last && last.parentNode === grid ? last : null); return card; }
    };
  }
  var api = { build: build, about: about };
  FC.settings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
