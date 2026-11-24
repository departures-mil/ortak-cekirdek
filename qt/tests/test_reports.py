"""Çökme raporu (maskeleme, imza, tekrar engeli, günlük sınır) ve iletişim yükü/kuyruğu."""
import json
import sys
import threading

from fccore import crash, contact, storage, usage


def test_sanitize_masks_personal_data():
    s = crash.sanitize('Hata ali.veli@example.com C:\\Users\\Mehmet\\veri.json /home/ayse/x https://a.b/c?token=1 1234567 "gizli metin"')
    assert '<email>' in s and 'Mehmet' not in s and 'ayse' not in s and 'token' not in s and '<n>' in s and 'gizli' not in s
    assert crash.sanitize("KeyError: 'baslik'") == "KeyError: 'baslik'"      # kısa tanımlayıcı korunur


def test_signature_stable_and_djb2_matches_js():
    assert crash.djb2('abc') == 'b885c8b' and crash.djb2('ç😀') == 'ba74769'   # JS hash() ile aynı
    assert crash.signature('X: 1', ['a.py:f']) == crash.signature('X: 1', ['a.py:f'])


def _boom():
    return {}['yok']


def test_dedupe_and_daily_limit():
    sent = []
    crash.cfg.update(app='t', version='1.0.0', send=sent.append, now=None)
    try:
        _boom()
    except KeyError:
        e = sys.exc_info()
    assert crash.report(*e) and not crash.report(*e)          # aynı imza bir kez
    for i in range(10):
        try:
            raise ValueError('farklı %d' % i)
        except ValueError:
            crash.report(*sys.exc_info())
    assert len(sent) == crash.MAX_DAY == crash.sent_today()
    assert sent[0].startswith('[ui] KeyError') and '#'in sent[0]
    storage.set('crash.enabled', False)
    try:
        raise RuntimeError('kapalı')
    except RuntimeError:
        assert not crash.report(*sys.exc_info())
    crash.cfg['send'] = None


def test_thread_exceptions_are_reported():
    sent = []
    crash.cfg.update(app='t', version='9.9.9', send=sent.append)
    crash.install(fault_dir=None)

    def w():
        raise ZeroDivisionError('iş parçacığı')
    import threading as th
    old = th.excepthook
    t = th.Thread(target=w)
    t.start()
    t.join()
    assert any('ZeroDivisionError' in s and '[thread]' in s for s in sent)
    crash.cfg['send'] = None


def test_contact_payload_fields():
    contact.init(app='organizer', version='2.2.0', flush_delay=None)
    f = contact.fields({'tur': 'hata', 'mesaj': 'x' * 6000, 'iletisim': 'a@b.c'})
    assert set(f) == {'tur', 'uygulama', 'surum', 'platform', 'dil', 'mesaj', 'zaman', 'cihaz', 'iletisim'}
    assert f['uygulama'] == 'organizer' and f['surum'] == '2.2.0' and f['platform'].startswith('qt/') and f['dil'] == 'tr'
    assert len(f['mesaj']) == 5000 and len(f['cihaz']) == 18 and f['zaman'].endswith('Z')
    p = contact.payload(f)
    assert all(list(v) == ['stringValue'] and isinstance(v['stringValue'], str) for v in p['fields'].values())


def test_contact_queue_and_flush_and_mail_fallback():
    calls = []
    state = {'inbox': False, 'mail': False}

    def post(url, body, headers):
        calls.append((url, json.loads(body)))
        if 'firestore' in url:
            assert 'comm-calc-103111111' in url and '/mesajlar' in url
            return (200 if state['inbox'] else 503), b''
        return 200, json.dumps({'success': 'true' if state['mail'] else 'false'}).encode()
    contact.init(app='o', version='1', post_fn=post, flush_delay=None)
    assert contact.send('oneri', 'merhaba') == 'queued' and len(contact.queue()) == 1
    assert any('formsubmit.co' in u for u, _ in calls)                  # kullanıcı mesajında yedek denendi
    calls.clear()
    assert contact.post({'tur': 'cokme', 'mesaj': 'x'}) == 'queued'
    assert not any('formsubmit' in u for u, _ in calls)                 # çökme raporu e-posta göndermez
    state['inbox'] = True
    contact.flush()
    assert contact.queue() == []
    state['inbox'] = False
    state['mail'] = True
    assert contact.send('hata', 'yedekle') == 'sent'


def test_usage_counts_and_http_classifier():
    usage.count('firebase.read', 3)
    usage.count_http('GET', 'https://firestore.googleapis.com/v1/projects/p1/databases/(default)/documents/kayitlar/abc?key=k', status=200)
    usage.count_http('GET', 'https://firestore.googleapis.com/v1/projects/p1/databases/(default)/documents/kayitlar', status=200, resp_json={'documents': [1, 2, 3, 4]})
    usage.count_http('POST', 'https://firestore.googleapis.com/v1/projects/p1/databases/(default)/documents:commit', body=json.dumps({'writes': [{'update': {}}, {'delete': 'x'}]}), status=200)
    usage.count_http('POST', 'https://firestore.googleapis.com/v1/projects/comm-calc-103111111/databases/(default)/documents/mesajlar?key=x', status=200)
    usage.count_http('POST', 'https://generativelanguage.googleapis.com/v1beta/models/x:generateContent', status=429)
    d = usage.data()
    assert d['c']['firebase.read'] == 8 and d['c']['firebase.write'] == 1 and d['c']['firebase.delete'] == 1
    assert d['c']['ai.gemini'] == 1 and d['c']['ai.gemini.full'] == 1 and d['project'] == 'p1'
    assert 0 < usage.ms_to_reset() <= 86400000
