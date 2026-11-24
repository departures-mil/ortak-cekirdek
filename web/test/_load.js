/* Testler için: modülleri sırayla yükler (DOM gerekmez). */
'use strict';
const path = require('path');
module.exports = function load(...names) {
  for (const n of ['storage', 'i18n', ...names]) require(path.join(__dirname, '..', 'js', n + '.js'));
  return globalThis.FC;
};
