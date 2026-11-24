/* FC.init — tek çağrıda çekirdeği başlatır (her modül ayrıca tek başına da kullanılabilir).
     FC.init({app:'kitaplik', repo:'kitaplik', version:'2.5.0', announcements:true});
   Yapılan: dil + görünüm uygulanır, iletişim kuyruğu ve çökme raporu kurulur, güncelleme denetimi (açılış + 6 saat),
   "neler yeni" (güncellemeden sonraki ilk açılış), isteğe bağlı duyurular ve ilk açılış sihirbazı. */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  FC.version = '1.0.0';
  FC.init = function (o) {
    o = o || {};
    var v = o.version || (FC.host && FC.host.version()) || '0.0.0';
    FC.i18n.apply(); FC.look.init();
    if (FC.contact) FC.contact.init({ app: o.app, version: v });
    if (FC.crash && o.crash !== false) FC.crash.init({ app: o.app, version: v });
    if (FC.updater && o.update !== false && (o.repo || o.manifestUrl)) FC.updater.start({ repo: o.repo, owner: o.owner, app: o.app, version: v, channel: o.channel, setupChannel: o.setupChannel, manifestUrl: o.manifestUrl });
    var wn = FC.whatsnew && o.whatsnew !== false ? FC.whatsnew.start({ version: v }) : false;
    if (FC.announcements && o.announcements) FC.announcements.start({ app: o.app, version: v, onUpdate: function () { FC.updater.run().catch(function () {}); } });
    if (FC.onboarding && o.onboarding && !wn) setTimeout(function () { FC.onboarding.maybeStart(o.onboarding); }, 600);
    return FC;
  };
  if (typeof module === 'object' && module.exports) module.exports = FC.init;
})(typeof globalThis !== 'undefined' ? globalThis : this);
