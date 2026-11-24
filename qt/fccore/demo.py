"""fccore.demo — tam kabuk gösterimi (web demo/index.html karşılığı). İnternete çıkmaz: güncelleme sahte sunucudan gelir.
    python -m fccore.demo [--lang ar] [--theme light] [--scheme zumrut] [--klasik]
    python -m fccore.demo --shot ekran.png --size 1440x900       (QT_QPA_PLATFORM=offscreen ile ekran görüntüsü)"""
import argparse
import hashlib
import io
import json
import os
import sys
import tempfile
import time

from PySide6.QtCore import QTimer, Qt
from PySide6.QtWidgets import QApplication, QWidget, QVBoxLayout

import fccore
from fccore import i18n, style, storage, usage
from fccore.i18n import t

DEMO = {
    'tr': {'tag': 'Ortak çekirdek gösterimi', 'nav.main': 'Genel', 'nav.home': 'Ana sayfa', 'nav.items': 'Kayıtlar', 'nav.sys': 'Sistem', 'nav.settings': 'Ayarlar',
           'sub.settings': 'Görünüm, kullanım, iletişim ve program bilgileri', 'sub.home': 'Örnek sayfa', 'sub.items': 'Örnek sayfa',
           'demo.title': 'Demo kontrolleri', 'demo.desc': 'Çekirdek bileşenlerini gerçek sunucuya gitmeden deneyin.', 'demo.sync': 'Eşitleme durumu',
           'demo.update': 'Güncelleme benzetimi', 'demo.wn': 'Neler yeni', 'demo.ann': 'Duyuru', 'demo.count': 'Sayaç +500 okuma', 'demo.klasik': 'Örnek "klasik" şemayı kaydet', 'demo.ob': 'Kurulum sihirbazı'},
    'en': {'tag': 'Common core showcase', 'nav.main': 'General', 'nav.home': 'Home', 'nav.items': 'Records', 'nav.sys': 'System', 'nav.settings': 'Settings',
           'sub.settings': 'Appearance, usage, contact and program info', 'sub.home': 'Sample page', 'sub.items': 'Sample page',
           'demo.title': 'Demo controls', 'demo.desc': 'Try the core components without contacting any server.', 'demo.sync': 'Sync state',
           'demo.update': 'Simulate update', 'demo.wn': "What's new", 'demo.ann': 'Announcement', 'demo.count': 'Counter +500 reads', 'demo.klasik': 'Register sample "classic" scheme', 'demo.ob': 'Setup wizard'},
    'ar': {'tag': 'عرض النواة المشتركة', 'nav.main': 'عام', 'nav.home': 'الرئيسية', 'nav.items': 'السجلات', 'nav.sys': 'النظام', 'nav.settings': 'الإعدادات',
           'sub.settings': 'المظهر والاستخدام والتواصل ومعلومات البرنامج', 'sub.home': 'صفحة تجريبية', 'sub.items': 'صفحة تجريبية',
           'demo.title': 'أدوات العرض التجريبي', 'demo.desc': 'جرّب مكونات النواة دون الاتصال بأي خادم.', 'demo.sync': 'حالة المزامنة',
           'demo.update': 'محاكاة التحديث', 'demo.wn': 'ما الجديد', 'demo.ann': 'إعلان', 'demo.count': 'العداد +500 قراءة', 'demo.klasik': 'تسجيل نظام «كلاسيكي» تجريبي', 'demo.ob': 'معالج الإعداد'},
}
NOTES = {'tr': '- Yeni renk şemaları ve yüksek kontrast\n- Güncelleme artık yalnızca değişen kısımları indiriyor\n- Arapça yazı düzeltmeleri',
         'en': '- New colour schemes and high contrast\n- Updates now download only the changed parts\n- Arabic text fixes',
         'ar': '- أنظمة ألوان جديدة ووضع التباين العالي\n- يُنزّل التحديث الآن الأجزاء المتغيرة فقط\n- إصلاحات في النص العربي'}


class FakeResp(io.BytesIO):
    status = 200

    def __init__(self, b, slow=0.0):
        super().__init__(b)
        self.slow = slow

    def read(self, n=-1):
        if self.slow:
            time.sleep(self.slow)
        return super().read(min(n, 96 * 1024) if n and n > 0 else n)

    def geturl(self):
        return 'https://github.com/x'


def fake_server():
    full, patch = os.urandom(6 * 1048576), os.urandom(int(1.4 * 1048576))
    h = lambda b: hashlib.sha256(b).hexdigest()  # noqa: E731
    man = {'schema': 1, 'app': 'demo', 'version': '1.57.0', 'published': '2026-11-24T10:00:00Z', 'minVersion': '1.0.0', 'notes': NOTES,
           'assets': {'win-app': {'file': 'Demo-1.57.0-win-app.zip', 'size': len(full), 'sha256': h(full),
                                  'patches': {'1.56.0': {'file': 'Demo-win-app.patch-from-1.56.0.bin', 'size': len(patch), 'sha256': h(patch)}}}}}
    files = {'latest.json': json.dumps(man).encode(), man['assets']['win-app']['file']: full, 'Demo-win-app.patch-from-1.56.0.bin': patch}

    def opener(url):
        from fccore.updater import UpdateError
        name = url.split('?')[0].rsplit('/', 1)[-1]
        if name not in files:
            raise UpdateError('HTTP_404')
        return FakeResp(files[name], 0.04 if name != 'latest.json' else 0)
    return opener


def demo_card(tb, ctl):
    from fccore.widgets import Card, button, hbox, label
    from fccore import whatsnew, announcements
    c = Card('demo', t('demo.title'), 'zap', t('demo.desc'))
    c.add(label(t('demo.sync'), 'field-label'), 12)
    row = QWidget()
    from PySide6.QtWidgets import QGridLayout
    g = QGridLayout(row)
    g.setContentsMargins(0, 6, 0, 0)
    g.setSpacing(8)
    for i, s in enumerate(['idle', 'syncing', 'error', 'off', 'offline']):
        g.addWidget(button(s, 'btn small', slot=lambda s=s: tb.set_sync(s, 0 if s == 'idle' else 3)), i // 3, i % 3)
    c.add(row)

    def ann():
        inst = announcements.instance()
        if inst:
            inst.ingest([{'id': 'demo-%d' % time.time(), 'tarih': time.strftime('%Y-%m-%dT%H:%M:%SZ'), 'onem': 'onemli',
                          'baslik': {'tr': 'Örnek duyuru', 'en': 'Sample announcement', 'ar': 'إعلان تجريبي'},
                          'metin': {'tr': 'Yeni sürüm yayınlandı. Güncellemek için sağ üstteki düğmeye basın.', 'en': 'A new version is out. Press the button at the top right to update.', 'ar': 'صدر إصدار جديد. اضغط الزر في أعلى الشاشة للتحديث.'},
                          'guncellemeDugmesi': True}])

    def wn():
        storage.set('whatsnew.pending', {'version': '1.57.0', 'notes': NOTES})
        whatsnew.show('1.57.0')

    def count():
        usage.count('firebase.read', 500)
        usage.count('firebase.write', 120)
        usage.count('ai.gemini', 3)
    from fccore import onboarding
    btns = [button(t('demo.update'), 'btn small primary', icon='download', slot=lambda: (ctl.u.state.update(plan=None), ctl.run())),
            button(t('demo.wn'), 'btn small', icon='sparkles', slot=wn),
            button(t('demo.ann'), 'btn small', icon='bell', slot=ann),
            button(t('demo.count'), 'btn small', icon='gauge', slot=count),
            button(t('demo.klasik'), 'btn small', icon='type', slot=register_klasik),
            button(t('demo.ob'), 'btn small', icon='sparkles', slot=lambda: onboarding.open())]
    row2 = QWidget()
    v = QVBoxLayout(row2)
    v.setContentsMargins(0, 12, 0, 0)
    v.setSpacing(8)
    for b in btns:
        v.addWidget(hbox(b, None))
    c.add(row2)
    return c


def register_klasik():
    style.register_scheme('klasik', label={'tr': 'Klasik (eski görünüm)', 'en': 'Classic (previous look)', 'ar': 'الكلاسيكي (المظهر السابق)'},
                          dark={'--bg': '#1d2433', '--panel': '#263042', '--panel-solid': '#263042', '--panel-hover': '#2e3a50', '--text': '#f3f4f6',
                                '--muted': '#b8c0cc', '--accent': '#60a5fa', '--accent-2': '#2563eb', '--primary-1': '#2563eb', '--primary-2': '#1d4ed8',
                                '--active-1': '#60a5fa33', '--sidebar-bg': '#1a2130', '--topbar-bg': '#1d2433', '--modal-bg': '#263042',
                                '--glow-1': '#0000', '--glow-2': '#0000', '--bg-grid': '#0000'})


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--lang')
    ap.add_argument('--theme')
    ap.add_argument('--scheme')
    ap.add_argument('--klasik', action='store_true')
    ap.add_argument('--shot')
    ap.add_argument('--size', default='1440x900')
    ap.add_argument('--page', default='settings')
    ap.add_argument('--float', action='store_true', help='güncelleme penceresini açık göster')
    ap.add_argument('--onboarding', type=int, default=-1, help='sihirbazı şu adımda aç (ekran görüntüsü)')
    ap.add_argument('--agent', action='store_true', help='Asistan Agent panelini örnek verilerle aç (ekran görüntüsü)')
    a = ap.parse_args(argv)
    app = QApplication.instance() or QApplication(sys.argv[:1])
    data = tempfile.mkdtemp(prefix='fcdemo-') if a.shot else None
    if a.shot:
        storage.use(data)
        storage.set('onboarding.done', True)
    from fccore.updater import Updater
    for k, v in (('lang', a.lang), ('theme', a.theme), ('scheme', a.scheme)):
        if v:
            storage.set(k, v)
    if a.lang:
        i18n._cur = None
    i18n.add(DEMO)
    core = fccore.init(app, app_id='demo', repo='demo', version='1.56.0', data_dir=data, announcements=True,
                       updater_kwargs={'opener': fake_server(), 'can_update': True, 'manifest_url': 'https://github.com/demo/latest.json',
                                       'spawn': lambda args: None, 'staging': tempfile.mkdtemp(prefix='fcdemo-up-')}, onboarding={})
    core.updates.u.on_quit = lambda: None
    core.updates.u._install = lambda p, path, ch: (core.updates.u._set(status='installing'), time.sleep(0.9), core.updates.u._set(status='done'))
    if a.klasik:
        register_klasik()
    if not a.shot:
        u = usage.data()
    usage.count('firebase.read', 12840)
    usage.count('firebase.write', 1730)
    usage.count('firebase.delete', 42)
    usage.count('ai.gemini', 27)
    usage.count('ai.groq', 4)
    usage.set_project('benim-firebase-projem')

    from fccore.window import FcWindow, Shell
    from fccore import settings
    from fccore.widgets import Card
    win = FcWindow('Demo')
    shell = Shell(win, name='Demo', tag='tag', version='1.56.0', logo='zap')
    tb = shell.topbar
    shell.nav_group('nav.main')
    for k, ic in (('home', 'home'), ('items', 'box')):
        c = Card(k, t('nav.' + k), 'box', t('sub.' + k))
        shell.page(k, 'nav.' + k, ic, c, sub='sub.' + k)
    shell.nav_group('nav.sys')
    grid_holder = QWidget()
    gv = QVBoxLayout(grid_holder)
    gv.setContentsMargins(0, 0, 0, 0)
    tb.mount(sync={'on_click': lambda s: (tb.set_sync('syncing'), QTimer.singleShot(1500, lambda: tb.set_sync('idle')))},
             lan={'on_click': lambda s: tb.set_lan('off' if s == 'on' else 'on')}, update=core.updates, before=[b for b in (core.agent and core.agent.button(), core.ann.button()) if b])
    tb.set_sync('idle', 3)
    tb.set_lan('on')

    def build_grid():
        while gv.count():
            w = gv.takeAt(0).widget()
            if w:
                w.deleteLater()
        g = settings.build(cards=[demo_card(tb, core.updates)], usage={'project': lambda: 'benim-firebase-projem'},
                           about={'version': '1.56.0', 'on_check': lambda: core.updates.check()}, onboarding={})
        gv.addWidget(g)
    build_grid()
    i18n.on_change(lambda l: QTimer.singleShot(0, build_grid))   # demo kartı dil değişince yeniden kurulur
    shell.page('settings', 'nav.settings', 'settings', grid_holder, sub='sub.settings')
    shell.show_page(a.page)
    shell.retranslate()
    if a.shot:
        w, h = (int(x) for x in a.size.split('x'))
        win.resize(w, h)
        win.show()
        if a.float:
            QTimer.singleShot(200, lambda: core.updates.u._set(status='downloading', mode='patch', plan={'version': '1.57.0', 'mode': 'patch', 'size': 1468006},
                              progress={'done': 0.6 * 1048576, 'total': 1.4 * 1048576, 'pct': 42.8, 'remaining': 0.8 * 1048576, 'speed': 1.9 * 1048576, 'finished': False}))
        if a.onboarding >= 0:
            from fccore import onboarding
            QTimer.singleShot(50, lambda: onboarding.open(start_step=a.onboarding))

        if a.agent and core.agent:
            def agent_demo():
                from fccore import _agent_engine as AE
                ag = core.agent
                for _ in range(95):
                    ag.tick(active=True)
                for _ in range(32):
                    ag.track('Kayıt ekle')
                ag.import_share([{'app': 'falcon-ofis', 'dev': 'demo', 'u': 1, 'days': {AE.day_key(): {'act': 240, 'ses': 3, 'h': [0] * 23 + [70]}}},
                                 {'app': 'kitaplik', 'dev': 'demo', 'u': 1, 'days': {AE.day_key(): {'act': 80, 'ses': 2}}}])
                ag.analyze(True, wait=True)
                ag.show(win)
            QTimer.singleShot(50, agent_demo)

        def shoot():
            app.processEvents()
            win.grab().save(a.shot)
            print('yazıldı', a.shot)
            app.quit()
        QTimer.singleShot(700, shoot)
        return app.exec()
    win.start()
    core.after_show()
    return app.exec()


if __name__ == '__main__':
    sys.exit(main())
