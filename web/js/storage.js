/* FC.storage — güvenli localStorage sarmalayıcı. localStorage yoksa ya da hata verirse (gizli kip, kota dolu,
   WebView ayarı) bellekte tutar; program asla bu yüzden çökmez. Değerler JSON olarak saklanır, anahtarlar "fc." önekli. */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var mem = {};
  var PFX = 'fc.';
  function ls() { try { var s = g.localStorage; if (!s) return null; var k = '__fc_t'; s.setItem(k, '1'); s.removeItem(k); return s; } catch (e) { return null; } }
  var store = ls();
  function raw(k) {
    if (store) { try { var v = store.getItem(PFX + k); if (v !== null) return v; } catch (e) {} }
    return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
  }
  var api = {
    get: function (k, def) {
      var v = raw(k); if (v === null || v === undefined) return def;
      try { return JSON.parse(v); } catch (e) { return def; }
    },
    set: function (k, v) {
      var s; try { s = JSON.stringify(v); } catch (e) { return false; }
      mem[k] = s;
      if (store) { try { store.setItem(PFX + k, s); return true; } catch (e) { return false; } }
      return false;
    },
    remove: function (k) { delete mem[k]; if (store) { try { store.removeItem(PFX + k); } catch (e) {} } },
    /** Bellek kipinde mi? (kalıcı saklama yok) */
    volatile: function () { return !store; },
    /** Testler için: belleği ve depoyu değiştir. */
    _use: function (s) { store = s; mem = {}; }
  };
  FC.storage = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
