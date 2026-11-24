import os, sys, tempfile, time, json
os.environ['APPDATA'] = tempfile.mkdtemp()
sys.path.insert(0, os.path.dirname(__file__))
import fc_agent as F

a = F.Agent('bereket-defter', '1.19', lang=lambda: 'tr')
a.start()
for _ in range(100): a.tick(active=True)
for _ in range(35): a.track('Kayıt ekle')
a.track('ali@x.com 12.500 TL'); a.track('☁ Eşitle')
s = a.summary(); A = s['apps']['bereket-defter']
assert s['tot']['w'] == 100 and A['a']['Kayıt ekle'] == 35 and A['sync'] == 1, s
assert 'ali@x.com' not in json.dumps(s)
ids = [r['id'] for r in a.rules()]
assert 'break' in ids and 'rep:bereket-defter' in ids, ids
# paylaşım: ikinci uygulama aynı klasörden görülür
b = F.Agent('organizer', '1', lang=lambda: 'ar'); b.d['device'] = a.d['device']; b.d['mine']['dev'] = a.d['device']
for _ in range(50): b.tick(active=True)
b.share(); a.share()
assert 'organizer' in a.known_apps(), a.known_apps()
assert any(r['id'] == 'top' for r in a.rules())
f = a.analyze(True, wait=True); assert f and all(n['src'] == 'offline' for n in f)
f2 = a.analyze(True, wait=True); assert not any(n['sig'] in [m['sig'] for m in f] for n in f2)
assert any('؀' <= ch <= 'ۿ' for ch in b.T('r.night', p=20))
a.configure(on=False); w = a.summary()['tot']['w']; a.tick(active=True); assert a.summary()['tot']['w'] == w
print('python fc_agent: tüm testler geçti')
