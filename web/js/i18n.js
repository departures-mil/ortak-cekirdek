/* FC.i18n — tr / en / ar sözlük birleştirme, dil seçimi ve dil düğmesi.
   FC.i18n.add({tr:{...}, en:{...}, ar:{...}})  ·  FC.i18n.t('anahtar', {n: 3})  ·  FC.i18n.set('ar')
   Seçim kalıcıdır; <html lang/dir> ayarlanır (ar → rtl). Eksik anahtarda en → tr → anahtarın kendisi döner. */
(function (g) {
  'use strict';
  var FC = g.FC = g.FC || {};
  var LANGS = ['tr', 'en', 'ar'];
  var NAMES = { tr: 'Türkçe', en: 'English', ar: 'العربية' };
  var SHORT = { tr: 'TR', en: 'EN', ar: 'ع' };
  var D = { tr: {}, en: {}, ar: {} };
  var cur = null, subs = [];

  function st() { return FC.storage; }
  function norm(l) { l = String(l || '').slice(0, 2).toLowerCase(); return LANGS.indexOf(l) >= 0 ? l : null; }
  function detect() {
    var s = st() && st().get('lang');
    if (norm(s)) return norm(s);
    var nav = g.navigator && (g.navigator.language || (g.navigator.languages || [])[0]);
    return norm(nav) || 'tr';
  }
  function add(dict) {
    if (!dict) return api;
    LANGS.forEach(function (l) { var src = dict[l]; if (src) for (var k in src) D[l][k] = src[k]; });
    return api;
  }
  function t(key, vars, lang) {
    var l = norm(lang) || lang_();
    var s = D[l][key];
    if (s === undefined) s = D.en[key];
    if (s === undefined) s = D.tr[key];
    if (s === undefined) return key;
    if (vars) s = String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; });
    return s;
  }
  function lang_() { if (!cur) cur = detect(); return cur; }
  function apply() {
    if (api.noDoc) return;   // bağımsız eklenti: uygulamanın <html lang/dir> ayarına dokunma
    var d = g.document && g.document.documentElement; if (!d) return;
    d.setAttribute('lang', lang_());
    d.setAttribute('dir', lang_() === 'ar' ? 'rtl' : 'ltr');
  }
  function set(l) {
    l = norm(l); if (!l) return;
    var changed = l !== cur;
    cur = l;
    if (st()) st().set('lang', l);
    apply();
    if (changed) subs.slice().forEach(function (f) { try { f(l); } catch (e) { if (g.console) console.error(e); } });
  }
  /** Sayı biçimi. Arapçada teknik sayılar Batı rakamlarıyla (latn) yazılır: MB, yüzde, kota okunaklı kalsın. */
  function locale(l) { l = norm(l) || lang_(); return l === 'ar' ? 'ar-u-nu-latn' : l === 'en' ? 'en-US' : 'tr-TR'; }
  function num(n, digits, l) {
    digits = digits || 0;
    try { return Number(n).toLocaleString(locale(l), { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
    catch (e) { return Number(n).toFixed(digits); }
  }
  /** Dil düğmesi (Falcon .lang-switch). Dil değişince kendini günceller. */
  function switcher() {
    var doc = g.document, box = doc.createElement('div');
    box.className = 'lang-switch'; box.setAttribute('role', 'group');
    LANGS.forEach(function (l) {
      var b = doc.createElement('button');
      b.type = 'button'; b.className = 'lang-btn'; b.textContent = SHORT[l]; b.title = NAMES[l];
      b.setAttribute('lang', l); b.dataset.lang = l;
      b.addEventListener('click', function () { set(l); });
      box.appendChild(b);
    });
    function sync() { box.setAttribute('aria-label', t('fc.lang')); Array.prototype.forEach.call(box.children, function (b) { var on = b.dataset.lang === lang_(); b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); }); }
    sync(); onChange(sync);
    return box;
  }
  function onChange(f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; }
  function pick(obj, l) { if (!obj) return ''; if (typeof obj === 'string') return obj; l = norm(l) || lang_(); return obj[l] || obj.en || obj.tr || obj.ar || ''; }

  var api = { add: add, t: t, set: set, lang: lang_, langs: LANGS.slice(), names: NAMES, apply: apply, num: num, locale: locale, onChange: onChange, switcher: switcher, pick: pick, isRtl: function () { return lang_() === 'ar'; }, _reset: function () { cur = null; subs = []; } };

  /* ---- çekirdek modüllerinin metinleri ---- */
  add({
    tr: {
      'fc.ok': 'Tamam', 'fc.cancel': 'Vazgeç', 'fc.close': 'Kapat', 'fc.save': 'Kaydet', 'fc.next': 'İleri', 'fc.back': 'Geri', 'fc.skip': 'Atla', 'fc.done': 'Bitti', 'fc.retry': 'Yeniden dene', 'fc.error': 'Hata', 'fc.open': 'Aç', 'fc.lang': 'Dil',
      'fc.h': 'sa', 'fc.min': 'dk',
      'fc.sync': 'Eşitle', 'fc.sync.idle': 'Eşitlendi', 'fc.sync.syncing': 'Eşitleniyor…', 'fc.sync.error': 'Eşitleme hatası — yeniden denemek için basın', 'fc.sync.off': 'Bulut eşitleme kapalı', 'fc.sync.offline': 'İnternet yok — değişiklikler bu cihazda saklanıyor', 'fc.sync.pending': '{n} değişiklik gönderilmeyi bekliyor',
      'fc.lan': 'Wi-Fi', 'fc.lan.on': 'Wi-Fi eşitleme açık (aynı ağdaki cihazlar)', 'fc.lan.off': 'Wi-Fi eşitleme kapalı', 'fc.lan.busy': 'Wi-Fi ile eşitleniyor…',
      'fc.update': 'Güncelle', 'fc.update.check': 'Güncellemeleri denetle', 'fc.update.checking': 'Denetleniyor…', 'fc.update.none': 'Program güncel (v{v})', 'fc.update.avail': 'Yeni sürüm hazır: v{v}', 'fc.update.press': 'Tek tuşla güncellemek için basın. Kayıtlarınız korunur.',
      'fc.update.downloading': 'İndiriliyor…', 'fc.update.verifying': 'Doğrulanıyor…', 'fc.update.installing': 'Kuruluyor…', 'fc.update.restarting': 'Program yeniden başlatılıyor…', 'fc.update.done': 'Güncelleme kuruldu', 'fc.update.failed': 'Güncelleme yapılamadı: {e}', 'fc.update.fallback': 'Yama uygulanamadı, tam sürüm indiriliyor…', 'fc.update.browser': 'Yeni sürüm yayınlandı; indirme sayfası açılıyor.', 'fc.update.patchMode': 'yalnızca değişen kısımlar', 'fc.update.fullMode': 'tam paket', 'fc.update.offline': 'İnternet yok; bağlantı gelince yeniden denenecek.', 'fc.update.bad': 'İndirilen dosya doğrulanamadı (SHA-256 uyuşmuyor).',
      'fc.p.left': 'kalan {x}', 'fc.p.speed': 'MB/sn', 'fc.p.calc': 'hız hesaplanıyor…', 'fc.p.done': 'İndirildi',
      'fc.theme': 'Tema', 'fc.theme.dark': 'Koyu', 'fc.theme.light': 'Açık', 'fc.theme.auto': 'Otomatik', 'fc.theme.toggle': 'Koyu / açık tema', 'fc.font': 'Yazı boyutu', 'fc.font.smaller': 'Yazıyı küçült', 'fc.font.larger': 'Yazıyı büyüt', 'fc.font.reset': 'Varsayılan', 'fc.look': 'Görünüm', 'fc.look.desc': 'Tema, yazı boyutu ve dil bu cihazda saklanır.',
      'fc.win.minimize': 'Küçült', 'fc.win.half': 'Orta boyut', 'fc.win.restore': 'Tam ekrana dön', 'fc.win.fullscreen': 'Tam ekran', 'fc.win.close': 'Kapat',
      'fc.contact.title': 'Admin ile iletişim', 'fc.contact.desc': 'Öneri, istek ve hata bildirimlerinizi yazın; mesajınız doğrudan yöneticiye ulaşır.', 'fc.contact.type': 'Konu', 'fc.contact.oneri': 'Öneri / istek', 'fc.contact.hata': 'Hata bildirimi', 'fc.contact.reach': 'E-posta ya da telefon (yanıt için, isteğe bağlı)', 'fc.contact.msg': 'Mesajınız', 'fc.contact.send': 'Gönder', 'fc.contact.empty': 'Lütfen mesajınızı yazın.', 'fc.contact.sending': 'Gönderiliyor…', 'fc.contact.ok': 'Mesajınız yöneticiye iletildi. Teşekkürler!', 'fc.contact.queued': 'İnternet yok; mesajınız saklandı, bağlantı gelince kendiliğinden gönderilecek.', 'fc.contact.waiting': 'Gönderilmeyi bekleyen mesaj: {n}', 'fc.contact.privacy': 'Mesajınızla birlikte yalnızca program adı, sürüm, platform ve dil gönderilir. Kayıtlarınız gönderilmez.',
      'fc.crash.title': 'Otomatik hata raporu', 'fc.crash.desc': 'Program beklenmedik bir hata verirse yalnızca hata metni, sürüm ve platform yöneticiye gönderilir. Kayıtlarınızın içeriği hiçbir zaman gönderilmez. Günde en çok 5 rapor.', 'fc.crash.on': 'Hata olunca yöneticiye kendiliğinden bildir', 'fc.crash.sent': 'Bu cihazdan bugün gönderilen rapor: {n}',
      'fc.usage.title': 'Kullanım Limitleri', 'fc.usage.desc': 'Bu sayaçlar sizin KENDİ Firebase ve yapay zeka hesabınızdaki kullanımı gösterir. Yöneticinin kotası kullanılmaz; ücret ya da sınır sizin hesabınıza aittir.', 'fc.usage.firebase': 'Firebase — bugün / günlük ücretsiz sınır', 'fc.usage.read': 'Okuma', 'fc.usage.write': 'Yazma', 'fc.usage.delete': 'Silme', 'fc.usage.full': 'Bugünkü ücretsiz sınır doldu; eşitleme sıfırlamadan sonra kendiliğinden sürer.', 'fc.usage.reset': 'Sınırlar {t} sonra sıfırlanır (Pasifik saatiyle gece yarısı).', 'fc.usage.device': 'Yalnızca bu cihazın bugünkü sayımıdır; aynı hesaba bağlı diğer cihazlar aynı sınırı paylaşır.', 'fc.usage.ai': 'Yapay zeka çağrıları — bugün', 'fc.usage.calls': '{n} çağrı', 'fc.usage.noAi': 'Bugün yapay zeka çağrısı yapılmadı.', 'fc.usage.limits': 'Hesabımdaki sınırlar', 'fc.usage.project': 'Proje: {p}', 'fc.usage.noFirebase': 'Bağlı Firebase hesabı yok.', 'fc.usage.none': 'Bu program bulut eşitleme ya da yapay zeka kullanmaz; sınırlı bir hizmet yoktur. Verileriniz yalnızca bu cihazda tutulur.',
      'fc.ai.gemini.note': 'Ücretsiz katmanı var; günlük istek sınırı modele göre değişir.', 'fc.ai.openai.note': 'Ücretsiz katmanı yok; kullanım hesabınızdaki krediden düşer.', 'fc.ai.anthropic.note': 'Ücretsiz katmanı yok; kullanım hesabınızdaki krediden düşer.', 'fc.ai.groq.note': 'Ücretsiz katmanı var; dakikalık ve günlük sınırlar modele göre değişir.',
      'fc.ob.title': 'Kurulum', 'fc.ob.step': 'Adım {i} / {n}', 'fc.ob.welcome': 'Hoş geldiniz', 'fc.ob.langDesc': 'Programın dilini seçin. İstediğiniz zaman üst çubuktan değiştirebilirsiniz.', 'fc.ob.lookTitle': 'Görünüm', 'fc.ob.lookDesc': 'Tema ve yazı boyutunu gözünüze göre ayarlayın.',
      'fc.ob.fbTitle': 'Kendi Firebase hesabınız', 'fc.ob.fbDesc': 'Bulut eşitleme için ücretsiz kendi Firebase projenizi bağlayın. Firebase konsolunda Proje ayarları → Web uygulaması → yapılandırmayı kopyalayıp buraya yapıştırın.', 'fc.ob.fbPaste': 'firebaseConfig (JSON ya da kod)', 'fc.ob.fbGuide': 'Adım adım rehber', 'fc.ob.fbConsole': 'Firebase konsolu', 'fc.ob.test': 'Bağlantıyı dene', 'fc.ob.testing': 'Deneniyor…', 'fc.ob.fbOk': 'Bağlantı başarılı: {p}', 'fc.ob.fbRules': 'Proje bulundu ({p}); güvenlik kuralları erişimi kısıtlıyor. Rehberdeki kuralları ekleyin.', 'fc.ob.fbNoDb': 'Projede Firestore veritabanı yok. Konsolda Firestore Database → Oluştur deyin.', 'fc.ob.fbBadKey': 'API anahtarı geçersiz ya da bu proje için kapalı.', 'fc.ob.fbBad': 'Yapılandırma okunamadı. apiKey ve projectId alanları gerekli.', 'fc.ob.fbNet': 'Sunucuya ulaşılamadı; internet bağlantınızı denetleyin.', 'fc.ob.fbLater': 'İsterseniz bu adımı atlayıp sonra Ayarlar\'dan bağlayabilirsiniz; program bu cihazda tam çalışır.',
      'fc.ob.aiTitle': 'Yapay zeka anahtarı (isteğe bağlı)', 'fc.ob.aiDesc': 'Yapay zeka özellikleri için kendi anahtarınızı ekleyin. Anahtar yalnızca bu cihazda saklanır ve yalnızca seçtiğiniz sağlayıcıya gönderilir.', 'fc.ob.aiProvider': 'Sağlayıcı', 'fc.ob.aiKey': 'API anahtarı', 'fc.ob.aiGet': 'Anahtarı buradan alın', 'fc.ob.aiOk': 'Anahtar çalışıyor.', 'fc.ob.aiBad': 'Anahtar reddedildi; doğru kopyaladığınızdan emin olun.', 'fc.ob.aiUnk': 'Anahtar denetlenemedi; yine de kaydedildi.',
      'fc.ob.doneTitle': 'Hazırsınız', 'fc.ob.doneDesc': 'Ayarlar\'dan bu sihirbazı istediğiniz zaman yeniden açabilirsiniz.', 'fc.ob.start': 'Başla', 'fc.ob.reopen': 'Kurulum sihirbazını aç', 'fc.ob.saved': 'Kaydedildi',
      'fc.wn.title': 'Bu sürümde neler yeni', 'fc.wn.ver': 'Sürüm {v}', 'fc.wn.none': 'Bu sürüm iyileştirmeler ve hata düzeltmeleri içeriyor.', 'fc.wn.safe': 'Kayıtlarınız olduğu gibi korundu.', 'fc.wn.show': 'Sürüm notlarını göster',
      'fc.ann.title': 'Duyurular', 'fc.ann.none': 'Henüz duyuru yok.', 'fc.ann.link': 'Bağlantıyı aç', 'fc.ann.important': 'Önemli', 'fc.ann.update': 'Şimdi güncelle',
      'fc.settings.about': 'Hakkında', 'fc.settings.version': 'Sürüm'
    },
    en: {
      'fc.ok': 'OK', 'fc.cancel': 'Cancel', 'fc.close': 'Close', 'fc.save': 'Save', 'fc.next': 'Next', 'fc.back': 'Back', 'fc.skip': 'Skip', 'fc.done': 'Done', 'fc.retry': 'Try again', 'fc.error': 'Error', 'fc.open': 'Open', 'fc.lang': 'Language',
      'fc.h': 'h', 'fc.min': 'min',
      'fc.sync': 'Sync', 'fc.sync.idle': 'Synced', 'fc.sync.syncing': 'Syncing…', 'fc.sync.error': 'Sync error — press to try again', 'fc.sync.off': 'Cloud sync is off', 'fc.sync.offline': 'No internet — changes are kept on this device', 'fc.sync.pending': '{n} changes waiting to be sent',
      'fc.lan': 'Wi-Fi', 'fc.lan.on': 'Wi-Fi sync is on (devices on the same network)', 'fc.lan.off': 'Wi-Fi sync is off', 'fc.lan.busy': 'Syncing over Wi-Fi…',
      'fc.update': 'Update', 'fc.update.check': 'Check for updates', 'fc.update.checking': 'Checking…', 'fc.update.none': 'Up to date (v{v})', 'fc.update.avail': 'New version ready: v{v}', 'fc.update.press': 'Press once to update. Your records are kept.',
      'fc.update.downloading': 'Downloading…', 'fc.update.verifying': 'Verifying…', 'fc.update.installing': 'Installing…', 'fc.update.restarting': 'Restarting the program…', 'fc.update.done': 'Update installed', 'fc.update.failed': 'Update failed: {e}', 'fc.update.fallback': 'The patch could not be applied; downloading the full version…', 'fc.update.browser': 'A new version is out; opening the download page.', 'fc.update.patchMode': 'changed parts only', 'fc.update.fullMode': 'full package', 'fc.update.offline': 'No internet; will try again when online.', 'fc.update.bad': 'The downloaded file could not be verified (SHA-256 mismatch).',
      'fc.p.left': '{x} left', 'fc.p.speed': 'MB/s', 'fc.p.calc': 'measuring speed…', 'fc.p.done': 'Downloaded',
      'fc.theme': 'Theme', 'fc.theme.dark': 'Dark', 'fc.theme.light': 'Light', 'fc.theme.auto': 'Auto', 'fc.theme.toggle': 'Dark / light theme', 'fc.font': 'Text size', 'fc.font.smaller': 'Smaller text', 'fc.font.larger': 'Larger text', 'fc.font.reset': 'Default', 'fc.look': 'Appearance', 'fc.look.desc': 'Theme, text size and language are stored on this device.',
      'fc.win.minimize': 'Minimize', 'fc.win.half': 'Half size', 'fc.win.restore': 'Back to full screen', 'fc.win.fullscreen': 'Full screen', 'fc.win.close': 'Close',
      'fc.contact.title': 'Contact the admin', 'fc.contact.desc': 'Send suggestions, requests and bug reports; your message goes straight to the administrator.', 'fc.contact.type': 'Topic', 'fc.contact.oneri': 'Suggestion / request', 'fc.contact.hata': 'Bug report', 'fc.contact.reach': 'Email or phone (for a reply, optional)', 'fc.contact.msg': 'Your message', 'fc.contact.send': 'Send', 'fc.contact.empty': 'Please write your message.', 'fc.contact.sending': 'Sending…', 'fc.contact.ok': 'Your message was delivered to the administrator. Thank you!', 'fc.contact.queued': 'No internet; your message was saved and will be sent automatically once you are online.', 'fc.contact.waiting': 'Messages waiting to be sent: {n}', 'fc.contact.privacy': 'Only the program name, version, platform and language are sent with your message. Your records are never sent.',
      'fc.crash.title': 'Automatic error reports', 'fc.crash.desc': 'If the program hits an unexpected error, only the error text, version and platform are sent to the administrator. The contents of your records are never sent. At most 5 reports a day.', 'fc.crash.on': 'Notify the administrator automatically when an error happens', 'fc.crash.sent': 'Reports sent from this device today: {n}',
      'fc.usage.title': 'Usage limits', 'fc.usage.desc': 'These counters show usage on YOUR OWN Firebase and AI accounts. The administrator\'s quota is not used; any cost or limit belongs to your account.', 'fc.usage.firebase': 'Firebase — today / daily free limit', 'fc.usage.read': 'Reads', 'fc.usage.write': 'Writes', 'fc.usage.delete': 'Deletes', 'fc.usage.full': 'Today\'s free limit is used up; sync resumes automatically after the reset.', 'fc.usage.reset': 'Limits reset in {t} (midnight Pacific time).', 'fc.usage.device': 'This is this device\'s count for today only; other devices on the same account share the same limit.', 'fc.usage.ai': 'AI calls — today', 'fc.usage.calls': '{n} calls', 'fc.usage.noAi': 'No AI calls today.', 'fc.usage.limits': 'Limits on my account', 'fc.usage.project': 'Project: {p}', 'fc.usage.noFirebase': 'No Firebase account connected.', 'fc.usage.none': 'This program uses no cloud sync or AI, so there are no limited services. Your data stays on this device only.',
      'fc.ai.gemini.note': 'Has a free tier; the daily request limit depends on the model.', 'fc.ai.openai.note': 'No free tier; usage is charged to the credit on your account.', 'fc.ai.anthropic.note': 'No free tier; usage is charged to the credit on your account.', 'fc.ai.groq.note': 'Has a free tier; per-minute and daily limits depend on the model.',
      'fc.ob.title': 'Setup', 'fc.ob.step': 'Step {i} of {n}', 'fc.ob.welcome': 'Welcome', 'fc.ob.langDesc': 'Choose the program language. You can change it any time from the top bar.', 'fc.ob.lookTitle': 'Appearance', 'fc.ob.lookDesc': 'Adjust the theme and text size to suit your eyes.',
      'fc.ob.fbTitle': 'Your own Firebase account', 'fc.ob.fbDesc': 'Connect your own free Firebase project for cloud sync. In the Firebase console open Project settings → Web app, copy the configuration and paste it here.', 'fc.ob.fbPaste': 'firebaseConfig (JSON or code)', 'fc.ob.fbGuide': 'Step-by-step guide', 'fc.ob.fbConsole': 'Firebase console', 'fc.ob.test': 'Test connection', 'fc.ob.testing': 'Testing…', 'fc.ob.fbOk': 'Connected: {p}', 'fc.ob.fbRules': 'Project found ({p}); security rules are restricting access. Add the rules from the guide.', 'fc.ob.fbNoDb': 'The project has no Firestore database. In the console choose Firestore Database → Create.', 'fc.ob.fbBadKey': 'The API key is invalid or disabled for this project.', 'fc.ob.fbBad': 'Could not read the configuration. apiKey and projectId are required.', 'fc.ob.fbNet': 'Could not reach the server; check your internet connection.', 'fc.ob.fbLater': 'You can skip this step and connect later in Settings; the program works fully on this device.',
      'fc.ob.aiTitle': 'AI key (optional)', 'fc.ob.aiDesc': 'Add your own key for the AI features. The key is stored only on this device and sent only to the provider you choose.', 'fc.ob.aiProvider': 'Provider', 'fc.ob.aiKey': 'API key', 'fc.ob.aiGet': 'Get a key here', 'fc.ob.aiOk': 'The key works.', 'fc.ob.aiBad': 'The key was rejected; make sure you copied it correctly.', 'fc.ob.aiUnk': 'The key could not be checked; it was saved anyway.',
      'fc.ob.doneTitle': 'You are all set', 'fc.ob.doneDesc': 'You can reopen this wizard from Settings at any time.', 'fc.ob.start': 'Start', 'fc.ob.reopen': 'Open the setup wizard', 'fc.ob.saved': 'Saved',
      'fc.wn.title': 'What\'s new in this version', 'fc.wn.ver': 'Version {v}', 'fc.wn.none': 'This version brings improvements and bug fixes.', 'fc.wn.safe': 'Your records were kept as they are.', 'fc.wn.show': 'Show release notes',
      'fc.ann.title': 'Announcements', 'fc.ann.none': 'No announcements yet.', 'fc.ann.link': 'Open link', 'fc.ann.important': 'Important', 'fc.ann.update': 'Update now',
      'fc.settings.about': 'About', 'fc.settings.version': 'Version'
    },
    ar: {
      'fc.ok': 'حسناً', 'fc.cancel': 'إلغاء', 'fc.close': 'إغلاق', 'fc.save': 'حفظ', 'fc.next': 'التالي', 'fc.back': 'السابق', 'fc.skip': 'تخطٍّ', 'fc.done': 'تم', 'fc.retry': 'أعد المحاولة', 'fc.error': 'خطأ', 'fc.open': 'فتح', 'fc.lang': 'اللغة',
      'fc.h': 'س', 'fc.min': 'د',
      'fc.sync': 'مزامنة', 'fc.sync.idle': 'تمت المزامنة', 'fc.sync.syncing': 'جارٍ المزامنة…', 'fc.sync.error': 'خطأ في المزامنة — اضغط لإعادة المحاولة', 'fc.sync.off': 'المزامنة السحابية متوقفة', 'fc.sync.offline': 'لا يوجد اتصال بالإنترنت — التغييرات محفوظة على هذا الجهاز', 'fc.sync.pending': '{n} تغييرات بانتظار الإرسال',
      'fc.lan': 'Wi-Fi', 'fc.lan.on': 'مزامنة Wi-Fi مفعّلة (الأجهزة على الشبكة نفسها)', 'fc.lan.off': 'مزامنة Wi-Fi متوقفة', 'fc.lan.busy': 'جارٍ المزامنة عبر Wi-Fi…',
      'fc.update': 'تحديث', 'fc.update.check': 'التحقق من التحديثات', 'fc.update.checking': 'جارٍ التحقق…', 'fc.update.none': 'البرنامج محدَّث (v{v})', 'fc.update.avail': 'إصدار جديد جاهز: v{v}', 'fc.update.press': 'اضغط مرة واحدة للتحديث. تبقى سجلاتك محفوظة.',
      'fc.update.downloading': 'جارٍ التنزيل…', 'fc.update.verifying': 'جارٍ التحقق من الملف…', 'fc.update.installing': 'جارٍ التثبيت…', 'fc.update.restarting': 'جارٍ إعادة تشغيل البرنامج…', 'fc.update.done': 'تم تثبيت التحديث', 'fc.update.failed': 'تعذّر التحديث: {e}', 'fc.update.fallback': 'تعذّر تطبيق التصحيح؛ جارٍ تنزيل الإصدار الكامل…', 'fc.update.browser': 'صدر إصدار جديد؛ جارٍ فتح صفحة التنزيل.', 'fc.update.patchMode': 'الأجزاء المتغيرة فقط', 'fc.update.fullMode': 'الحزمة الكاملة', 'fc.update.offline': 'لا يوجد اتصال؛ ستُعاد المحاولة عند عودة الإنترنت.', 'fc.update.bad': 'تعذّر التحقق من الملف المنزَّل (بصمة SHA-256 غير مطابقة).',
      'fc.p.left': 'متبقٍّ {x}', 'fc.p.speed': 'م.ب/ث', 'fc.p.calc': 'جارٍ قياس السرعة…', 'fc.p.done': 'اكتمل التنزيل',
      'fc.theme': 'السمة', 'fc.theme.dark': 'داكنة', 'fc.theme.light': 'فاتحة', 'fc.theme.auto': 'تلقائية', 'fc.theme.toggle': 'سمة داكنة / فاتحة', 'fc.font': 'حجم الخط', 'fc.font.smaller': 'تصغير الخط', 'fc.font.larger': 'تكبير الخط', 'fc.font.reset': 'الافتراضي', 'fc.look': 'المظهر', 'fc.look.desc': 'تُحفظ السمة وحجم الخط واللغة على هذا الجهاز.',
      'fc.win.minimize': 'تصغير', 'fc.win.half': 'نصف الحجم', 'fc.win.restore': 'العودة إلى ملء الشاشة', 'fc.win.fullscreen': 'ملء الشاشة', 'fc.win.close': 'إغلاق',
      'fc.contact.title': 'التواصل مع المسؤول', 'fc.contact.desc': 'اكتب اقتراحاتك وطلباتك وبلاغات الأخطاء؛ تصل رسالتك مباشرة إلى المسؤول.', 'fc.contact.type': 'الموضوع', 'fc.contact.oneri': 'اقتراح / طلب', 'fc.contact.hata': 'الإبلاغ عن خطأ', 'fc.contact.reach': 'البريد الإلكتروني أو الهاتف (للرد، اختياري)', 'fc.contact.msg': 'رسالتك', 'fc.contact.send': 'إرسال', 'fc.contact.empty': 'يرجى كتابة رسالتك.', 'fc.contact.sending': 'جارٍ الإرسال…', 'fc.contact.ok': 'وصلت رسالتك إلى المسؤول. شكراً لك!', 'fc.contact.queued': 'لا يوجد اتصال بالإنترنت؛ حُفظت رسالتك وستُرسل تلقائياً عند عودة الاتصال.', 'fc.contact.waiting': 'رسائل بانتظار الإرسال: {n}', 'fc.contact.privacy': 'لا يُرسل مع رسالتك سوى اسم البرنامج وإصداره والمنصة واللغة. لا تُرسل سجلاتك أبداً.',
      'fc.crash.title': 'تقارير الأخطاء التلقائية', 'fc.crash.desc': 'إذا واجه البرنامج خطأً غير متوقع يُرسل إلى المسؤول نص الخطأ والإصدار والمنصة فقط. لا يُرسل محتوى سجلاتك أبداً. خمسة تقارير يومياً على الأكثر.', 'fc.crash.on': 'إبلاغ المسؤول تلقائياً عند حدوث خطأ', 'fc.crash.sent': 'التقارير المرسلة من هذا الجهاز اليوم: {n}',
      'fc.usage.title': 'حدود الاستخدام', 'fc.usage.desc': 'تعرض هذه العدادات الاستخدام على حساباتك الخاصة في Firebase والذكاء الاصطناعي. لا تُستهلك حصة المسؤول؛ أي تكلفة أو حد يخص حسابك أنت.', 'fc.usage.firebase': 'Firebase — اليوم / الحد المجاني اليومي', 'fc.usage.read': 'قراءة', 'fc.usage.write': 'كتابة', 'fc.usage.delete': 'حذف', 'fc.usage.full': 'انتهى الحد المجاني لهذا اليوم؛ تُستأنف المزامنة تلقائياً بعد إعادة التعيين.', 'fc.usage.reset': 'تُعاد الحدود بعد {t} (منتصف الليل بتوقيت المحيط الهادئ).', 'fc.usage.device': 'هذا عدّاد هذا الجهاز لليوم فقط؛ تتشارك الأجهزة الأخرى على الحساب نفسه الحدَّ ذاته.', 'fc.usage.ai': 'طلبات الذكاء الاصطناعي — اليوم', 'fc.usage.calls': '{n} طلب', 'fc.usage.noAi': 'لا توجد طلبات ذكاء اصطناعي اليوم.', 'fc.usage.limits': 'الحدود في حسابي', 'fc.usage.project': 'المشروع: {p}', 'fc.usage.noFirebase': 'لا يوجد حساب Firebase مرتبط.', 'fc.usage.none': 'لا يستخدم هذا البرنامج المزامنة السحابية ولا الذكاء الاصطناعي، فلا توجد خدمات محدودة. تبقى بياناتك على هذا الجهاز فقط.',
      'fc.ai.gemini.note': 'تتوفر طبقة مجانية؛ يختلف الحد اليومي للطلبات حسب النموذج.', 'fc.ai.openai.note': 'لا توجد طبقة مجانية؛ يُخصم الاستخدام من رصيد حسابك.', 'fc.ai.anthropic.note': 'لا توجد طبقة مجانية؛ يُخصم الاستخدام من رصيد حسابك.', 'fc.ai.groq.note': 'تتوفر طبقة مجانية؛ تختلف الحدود في الدقيقة واليوم حسب النموذج.',
      'fc.ob.title': 'الإعداد', 'fc.ob.step': 'الخطوة {i} من {n}', 'fc.ob.welcome': 'أهلاً بك', 'fc.ob.langDesc': 'اختر لغة البرنامج. يمكنك تغييرها في أي وقت من الشريط العلوي.', 'fc.ob.lookTitle': 'المظهر', 'fc.ob.lookDesc': 'اضبط السمة وحجم الخط بما يريح عينيك.',
      'fc.ob.fbTitle': 'حسابك الخاص في Firebase', 'fc.ob.fbDesc': 'اربط مشروع Firebase المجاني الخاص بك للمزامنة السحابية. في وحدة تحكم Firebase افتح إعدادات المشروع ← تطبيق الويب، وانسخ الإعدادات والصقها هنا.', 'fc.ob.fbPaste': 'firebaseConfig (بصيغة JSON أو كود)', 'fc.ob.fbGuide': 'دليل خطوة بخطوة', 'fc.ob.fbConsole': 'وحدة تحكم Firebase', 'fc.ob.test': 'اختبار الاتصال', 'fc.ob.testing': 'جارٍ الاختبار…', 'fc.ob.fbOk': 'تم الاتصال: {p}', 'fc.ob.fbRules': 'عُثر على المشروع ({p})، لكن قواعد الأمان تقيّد الوصول. أضف القواعد الواردة في الدليل.', 'fc.ob.fbNoDb': 'لا توجد قاعدة بيانات Firestore في المشروع. اختر في وحدة التحكم Firestore Database ← إنشاء.', 'fc.ob.fbBadKey': 'مفتاح API غير صالح أو معطَّل لهذا المشروع.', 'fc.ob.fbBad': 'تعذّرت قراءة الإعدادات. الحقلان apiKey وprojectId مطلوبان.', 'fc.ob.fbNet': 'تعذّر الوصول إلى الخادم؛ تحقّق من اتصالك بالإنترنت.', 'fc.ob.fbLater': 'يمكنك تخطي هذه الخطوة والربط لاحقاً من الإعدادات؛ يعمل البرنامج بالكامل على هذا الجهاز.',
      'fc.ob.aiTitle': 'مفتاح الذكاء الاصطناعي (اختياري)', 'fc.ob.aiDesc': 'أضف مفتاحك الخاص لميزات الذكاء الاصطناعي. يُحفظ المفتاح على هذا الجهاز فقط ولا يُرسل إلا إلى المزوّد الذي تختاره.', 'fc.ob.aiProvider': 'المزوّد', 'fc.ob.aiKey': 'مفتاح API', 'fc.ob.aiGet': 'احصل على مفتاح من هنا', 'fc.ob.aiOk': 'المفتاح يعمل.', 'fc.ob.aiBad': 'رُفض المفتاح؛ تأكّد من نسخه بشكل صحيح.', 'fc.ob.aiUnk': 'تعذّر التحقق من المفتاح؛ حُفظ على أي حال.',
      'fc.ob.doneTitle': 'كل شيء جاهز', 'fc.ob.doneDesc': 'يمكنك إعادة فتح هذا المعالج من الإعدادات في أي وقت.', 'fc.ob.start': 'ابدأ', 'fc.ob.reopen': 'فتح معالج الإعداد', 'fc.ob.saved': 'تم الحفظ',
      'fc.wn.title': 'ما الجديد في هذا الإصدار', 'fc.wn.ver': 'الإصدار {v}', 'fc.wn.none': 'يتضمن هذا الإصدار تحسينات وإصلاحات للأخطاء.', 'fc.wn.safe': 'بقيت سجلاتك محفوظة كما هي.', 'fc.wn.show': 'عرض ملاحظات الإصدار',
      'fc.ann.title': 'الإعلانات', 'fc.ann.none': 'لا توجد إعلانات بعد.', 'fc.ann.link': 'فتح الرابط', 'fc.ann.important': 'مهم', 'fc.ann.update': 'حدّث الآن',
      'fc.settings.about': 'حول البرنامج', 'fc.settings.version': 'الإصدار'
    }
  });

  FC.i18n = api;
  FC.t = t;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
