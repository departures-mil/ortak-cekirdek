"""Arayüz duman testi (offscreen): üst çubuk sırası, RTL aynalama, ayarlar sırası, Orta düğmesi, sihirbaz ayrıştırıcısı."""
import pytest
from PySide6.QtCore import Qt

from fccore import i18n, style, settings, onboarding
from fccore.window import FcWindow, Shell
from fccore.widgets import Card


@pytest.fixture
def shell(qapp):
    style.apply(qapp)
    from fccore.update_ui import UpdateController
    from fccore.updater import Updater
    win = FcWindow('T')
    sh = Shell(win, name='T', version='1.0.0')
    ctl = UpdateController(Updater(repo='x', app='x', version='1.0.0', opener=lambda u: (_ for _ in ()).throw(Exception('no'))))
    sh.topbar.mount(sync={}, lan={}, update=ctl)
    sh.page('settings', 'fc.settings.about', 'settings', settings.build(cards=[Card('benim', 'Benim kartım')], usage={'firebase': False, 'ai': False}))
    win.resize(1440, 900)
    win.show()
    qapp.processEvents()
    yield win, sh
    win.close()


def order(sh):
    btns = [w for w in sh.topbar.actions.findChildren(object) if hasattr(w, 'isVisible') and hasattr(w, 'property') and w.isVisible()
            and (w.property('fc') or '').split()[:1] in (['btn'], ['icon-btn'], ['lang-switch'], ['topbar-sep'])]
    btns.sort(key=lambda w: w.mapTo(sh.topbar, w.rect().topLeft()).x())
    names = []
    for w in btns:
        f = (w.property('fc') or '')
        names.append(w.property('fcWin') or ('sync' if 'sync-act' in f else 'lan' if 'lan-act' in f else 'update' if 'update-act' in f
                                              else 'theme' if 'theme-btn' in f else 'lang' if 'lang-switch' in f else 'sep' if 'topbar-sep' in f else f))
    return names


def test_topbar_order_ltr_and_rtl(shell, qapp):
    win, sh = shell
    exp = ['sync', 'lan', 'update', 'theme', 'lang', 'sep', 'minimize', 'half', 'fullscreen', 'close']
    assert order(sh) == exp
    i18n.set('ar')
    qapp.processEvents()
    assert order(sh) == list(reversed(exp))
    i18n.set('tr')


def test_sync_states_and_badge(shell, qapp):
    win, sh = shell
    tb = sh.topbar
    tb.set_sync('idle', 3)
    qapp.processEvents()
    assert tb.sync_b.isVisible() and tb.sync_b.text() == '3'
    tb.set_sync('syncing', 150)
    assert not tb.sync_btn.isEnabled() and tb.sync_b.text() == '99+'
    tb.set_sync('error')
    assert 'error' in tb.sync_btn.property('fc') and not tb.sync_b.isVisible()
    assert tb.sync_btn.toolTip() == i18n.t('fc.sync.error')


def test_settings_contact_card_last(shell):
    win, sh = shell
    grid = sh.pages['settings']['w'].widget().findChild(settings.SettingsGrid)
    keys = [c.property('fcCard') for c in grid.items]
    assert keys == ['look', 'benim', 'usage', 'crash', 'about', 'contact']
    grid.add(Card('sonradan', 'X'))
    assert [c.property('fcCard') for c in grid.items][-1] == 'contact'


def test_half_is_half_work_area_centered_and_back(shell, qapp):
    win, sh = shell
    win.start()
    win.toggle_half()
    qapp.processEvents()
    wa = win.work_area()
    assert win.half and abs(win.width() - wa.width() // 2) <= 2 and abs(win.height() - wa.height() // 2) <= 2
    win.toggle_half()
    assert not win.half


def test_language_switch_retranslates(shell, qapp):
    win, sh = shell
    i18n.set('en')
    assert sh.topbar.sync_btn.text().strip() == 'Sync' and sh.topbar.upd_btn.text().strip() == 'Update'
    i18n.set('tr')
    assert sh.topbar.sync_btn.text().strip() == 'Eşitle'


def test_parse_firebase_variants():
    js = "const firebaseConfig = {\n apiKey: 'AIzaSyB12RFS6ENPpmnnPsETfjedNH-3hmNWQvA', // yorum\n authDomain: \"x.firebaseapp.com\",\n projectId: 'benim-proje', appId: '1:2:web:3',\n};"
    c = onboarding.parse_firebase(js)
    assert c == {'apiKey': 'AIzaSyB12RFS6ENPpmnnPsETfjedNH-3hmNWQvA', 'authDomain': 'x.firebaseapp.com', 'projectId': 'benim-proje', 'appId': '1:2:web:3'}
    assert onboarding.parse_firebase('{"apiKey":"kisa","projectId":"p"}') is None
    assert onboarding.test_firebase(c, get=lambda u: (403, b'{}')) == 'rules'
    assert onboarding.test_firebase(c, get=lambda u: (404, b'{"error":{"message":"The database (default) does not exist"}}')) == 'nodb'
    assert onboarding.test_ai('openai', 'sk', get=lambda u, h: (401, b'')) == 'bad'


def test_announcement_rules():
    from fccore.announcements import fits, cmp_loose
    assert fits({'id': 'a'}, 'org', '1.0.0')
    assert not fits({'id': 'a', 'hedef': ['baska']}, 'org', '1.0.0')
    assert not fits({'id': 'a', 'altSurum': '2.0'}, 'org', '1.9.9') and fits({'id': 'a', 'ustSurum': '2.0'}, 'org', '1.9.9')
    assert not fits({'id': 'a', 'bitis': '2000-01-01T00:00:00Z'}, 'org', '1')
    assert cmp_loose('v1.2', '1.2.0') == 0
