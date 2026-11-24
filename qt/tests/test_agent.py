"""Asistan Agent (fccore.agent): fccore.init ile başlar, ayarlara kart, üst çubuğa düğme, dil değişimi, paylaşım."""
import os

import pytest


@pytest.fixture()
def ag(tmp_path, monkeypatch, qapp):
    monkeypatch.setenv('APPDATA', str(tmp_path))
    from fccore import storage, agent, i18n
    storage.use(str(tmp_path / 'veri'), app='deneme')
    agent._reset()
    i18n.set('tr')
    a = agent.start(qapp, 'deneme', '1.0.0', first_delay_ms=10 ** 9)
    yield a
    agent._reset()


def test_sayar_ve_yorumlar(ag):
    for _ in range(100):
        ag.tick(active=True)
    for _ in range(35):
        ag.track('Kayıt ekle')
    ids = [r['id'] for r in ag.rules()]
    assert 'break' in ids and 'rep:deneme' in ids
    fresh = ag.analyze(True, wait=True)
    assert fresh and ag.unread() == len(fresh)


def test_kart_ayarlarda_ve_dil(ag, qapp):
    from PySide6.QtWidgets import QWidget
    from fccore import settings, i18n
    g = settings.build(usage={'firebase': False, 'ai': False})
    cards = [w for w in g.findChildren(QWidget) if w.property('fcCard') == 'agent']
    assert len(cards) == 1
    assert cards[0].title.text() == 'Asistan Agent'
    i18n.set('ar')
    qapp.processEvents()
    assert cards[0].title.text() == 'الوكيل المساعد'
    i18n.set('tr')


def test_ust_cubuk_dugmesi_ve_panel_kapali(ag):
    b = ag.button()
    ag.configure(panel=False)
    assert not b.isVisibleTo(b.parentWidget() or b) or not b.isVisible()
    ag.configure(panel=True)


def test_diger_programlarla_paylasim(ag, tmp_path):
    import json
    d = tmp_path / 'FalconCekirdek' / 'agent'
    d.mkdir(parents=True, exist_ok=True)
    from fccore import _agent_engine as E
    (d / 'kitaplik@x.json').write_text(json.dumps({'app': 'kitaplik', 'dev': 'x', 'u': 5, 'days': {E.day_key(): {'act': 300, 'ses': 2}}}))
    for _ in range(20):
        ag.tick(active=True)
    ag.share()
    assert 'kitaplik' in ag.known_apps()
    assert any(r['id'] == 'top' for r in ag.rules())


def test_init_agent_acik(tmp_path, monkeypatch, qapp):
    monkeypatch.setenv('APPDATA', str(tmp_path))
    import fccore
    from fccore import agent
    agent._reset()
    core = fccore.init(qapp, app_id='deneme2', version='1.0.0', update=False, crash=False, whatsnew=False, data_dir=str(tmp_path / 'v'))
    assert core.agent is not None and agent.instance() is core.agent
    agent._reset()
