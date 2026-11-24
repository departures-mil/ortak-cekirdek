"""Web çekirdeğiyle eşlik: tokenlar, metinler, ilerleme biçimi, LAN birleştirme (aynı vektörler)."""
import json
import os
import subprocess

import pytest

from conftest import FIX, ROOT, node, web_dir
from fccore import i18n, lanmerge, progress, style, tokens
from fccore._strings import STRINGS


def load(n):
    with open(os.path.join(FIX, n), encoding='utf-8') as f:
        return json.load(f)


def test_tokens_same_as_web_fixture():
    w = load('web_tokens.json')
    assert tokens.TOKENS == w['TOKENS']
    assert set(tokens.SCHEMES) == set(w['SCHEMES']) == {'falcon', 'zumrut', 'gunbatimi', 'mor', 'okyanus', 'grafit', 'yuksek-kontrast'}
    for sid, s in w['SCHEMES'].items():
        for m in ('dark', 'light'):
            for k in w['TOKENS']:
                assert tokens.SCHEMES[sid][m][k] == s[m][k], (sid, m, k)


@pytest.mark.skipif(not (node() and web_dir()), reason='node ya da web çekirdeği yok')
def test_generated_files_up_to_date_with_web():
    r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'gen_from_web.js'), web_dir(), '--check'], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr + r.stdout


def test_strings_same_as_web():
    w = load('web_strings.json')
    assert STRINGS == w
    assert set(STRINGS['tr']) == set(STRINGS['en']) == set(STRINGS['ar'])
    assert len(STRINGS['tr']) > 140


def test_i18n_lookup_fallback_vars_and_rtl(qapp):
    assert i18n.t('fc.update.avail', {'v': '1.2.0'}) == 'Yeni sürüm hazır: v1.2.0'
    assert i18n.t('fc.update.patchMode', None, 'ar') == 'الأجزاء المتغيرة فقط'
    assert i18n.t('fc.update.patchMode', None, 'en') == 'changed parts only'
    i18n.add({'tr': {'x.a': 'A {n}'}, 'en': {'x.b': 'B'}})
    i18n.set('ar')
    assert i18n.t('x.b') == 'B' and i18n.t('x.a', {'n': 3}) == 'A 3' and i18n.t('yok.anahtar') == 'yok.anahtar'
    from PySide6.QtCore import Qt
    assert qapp.layoutDirection() == Qt.RightToLeft
    i18n.set('tr')
    assert qapp.layoutDirection() == Qt.LeftToRight
    from fccore import storage
    assert storage.get('lang') == 'tr'


def test_scheme_labels_and_register_klasik():
    assert style.scheme_label('zumrut', 'en') == 'Emerald'
    style.register_scheme('klasik', dark={'--bg': '#1d2433', '--accent': '#60a5fa'}, label={'tr': 'Klasik', 'en': 'Classic'})
    assert style.schemes()[1] == 'klasik'
    style.set_scheme('klasik')
    assert style.tok('bg') == '#1d2433' and style.tok('accent') == '#60a5fa'
    assert style.tok('text') == tokens.SCHEMES['falcon']['dark']['text']    # eksikler falcon'dan
    style.set_theme('light')
    assert style.tok('bg') == '#1d2433'                                       # light verilmedi → dark
    style._reset()
    style.set_scheme('falcon')
    style.set_theme('dark')


def test_qss_colours_converted_and_all_schemes_build():
    assert style.q('#22d3ee29') == 'rgba(34,211,238,41)' and style.q('#0000') == 'rgba(0,0,0,0)' and style.q('#070b14') == '#070b14'
    for sid in tokens.SCHEMES:
        for m in ('dark', 'light'):
            css = style.qss(sid, m)
            assert '#22d3ee29' not in css and '{' in css
    assert 'border-right: 3px' in style.qss('falcon', 'dark', rtl=True) and 'border-left: 3px' in style.qss('falcon', 'dark', rtl=False)


def test_scale_clamped():
    style.set_scale(9)
    assert style.scale() == style.MAX
    style.set_scale(0.1)
    assert style.scale() == style.MIN
    style.set_scale(1)
    style.bump(1)
    assert style.scale() == 1.05


@pytest.mark.parametrize('case', load('web_progress.json'), ids=lambda c: '%s-%s-%s' % (c['lang'], c['patch'], c['p']['done']))
def test_progress_format_same_as_web(case):
    out = progress.format(case['p'], patch=case['patch'], lang=case['lang'])
    for k, v in case['out'].items():
        assert out[k] == v, k


def test_progress_tracker_sliding_window():
    MB = 1048576
    now = [0]
    tr = progress.tracker(10 * MB, lambda: now[0])
    now[0] = 1000
    p = tr.update(2 * MB)
    assert p['pct'] == 20 and p['remaining'] == 8 * MB and p['speed'] == 2 * MB
    now[0] = 5000
    p = tr.update(6 * MB)
    assert round(p['speed']) == MB
    now[0] = 5100
    p = tr.update(10 * MB, True)
    assert p['finished'] and p['pct'] == 100


def test_num_matches_tolocalestring():
    assert i18n.num(12840, 0, 'tr') == '12.840' and i18n.num(12840, 0, 'ar') == '12,840'
    assert i18n.num(1234.56, 1, 'tr') == '1.234,6' and i18n.num(0.25, 1, 'en') == '0.3' and i18n.num(2.5, 0, 'en') == '3'


VEC = load('merge_vectors.json')
EXP = {e['name']: e['out'] for e in load('merge_expected.json')}


@pytest.mark.parametrize('v', VEC, ids=lambda v: v['name'])
def test_lanmerge_same_as_web(v):
    out = lanmerge.merge(v['local'], v['remote'], v.get('opt'))
    assert json.loads(json.dumps(out)) == EXP[v['name']]


def test_lanmerge_never_mutates_or_deletes():
    L = [{'id': 1, 'ad': 'Ali', 'updatedAt': 100}]
    R = [{'id': 1, 'deleted': True, 'deletedAt': 200}]
    r = lanmerge.merge(L, R)
    assert r['records'][0]['archived'] is True and r['records'][0]['ad'] == 'Ali'
    assert 'archived' not in L[0]
    assert lanmerge.merge(R, L)['records'] == r['records']


@pytest.mark.skipif(not (node() and web_dir()), reason='node ya da web çekirdeği yok')
def test_lanmerge_live_against_node_random():
    """Rastgele vektörler web modülünde canlı çalıştırılır."""
    import random
    rnd = random.Random(7)
    vecs = []
    for i in range(60):
        def rec(k):
            r = {'id': k, 'v': rnd.choice(['a', 'b', 'ç', 1, 2.5, None, [1, {'x': 1}]]), 'updatedAt': rnd.choice([1, 2, 3, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00.5Z'])}
            if rnd.random() < 0.3:
                r['deleted'] = True
                if rnd.random() < 0.5:
                    r['deletedAt'] = rnd.choice([2, 4, '2026-01-03T00:00:00Z'])
            return r
        vecs.append({'local': [rec(rnd.randint(1, 4)) for _ in range(rnd.randint(0, 4))], 'remote': [rec(rnd.randint(1, 4)) for _ in range(rnd.randint(0, 4))]})
    js = ("const FC=require(%r);process.stdout.write(JSON.stringify(%s.map(v=>FC.merge(v.local,v.remote))))"
          % (os.path.join(web_dir(), 'js', 'lan-sync-merge.js'), json.dumps(vecs)))
    r = subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True)
    exp = json.loads(r.stdout)
    for v, e in zip(vecs, exp):
        assert json.loads(json.dumps(lanmerge.merge(v['local'], v['remote']))) == e, v


def test_icons_include_book():
    from fccore import icons
    from fccore._icons import PATHS
    assert 'book' in PATHS and PATHS['book'].startswith('<path')
    assert PATHS['book'] in icons.svg('book', '#ffffff', 1.9)
