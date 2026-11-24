"""Güncelleme: plan, sürüm karşılaştırma, sahte HTTP ile yama → doğrulama → kurulum, otomatik tam dosyaya geçiş, takas betiği."""
import hashlib
import io
import json
import os
import subprocess
import sys
import time

import pytest

from fccore import updater as U, fcpack, storage, _fcdelta
from fccore.updater import Updater, UpdateError, plan, cmp

H = lambda b: hashlib.sha256(b).hexdigest()  # noqa: E731
O = {'repo': 'organizer', 'app': 'organizer', 'version': '1.2.0', 'channel': 'win-app', 'setupChannel': 'win-setup'}


def man(**kw):
    m = {'schema': 1, 'app': 'organizer', 'version': '1.3.0', 'minVersion': '1.0.0', 'notes': {'tr': 'n'},
         'assets': {'win-app': {'file': 'O-1.3.0-win-app.zip', 'size': 1000, 'sha256': 'a' * 64,
                                'patches': {'1.2.0': {'file': 'O-win-app.patch-from-1.2.0.bin', 'size': 100, 'sha256': 'b' * 64}}},
                    'win-setup': {'file': 'O-Setup-1.3.0.exe', 'size': 5000, 'sha256': 'c' * 64}}}
    m.update(kw)
    return m


def test_semver():
    assert cmp('1.10.0', '1.9.9') == 1 and cmp('v2.0.0', '2.0.0') == 0 and cmp('1.0.0-beta', '1.0.0') == -1
    with pytest.raises(UpdateError):
        cmp('1.2', '1.2.0')


def test_plan_patch_full_setup():
    p = plan(man(), O)
    assert p['mode'] == 'patch' and p['size'] == 100 and p['full']['size'] == 1000 and p['targetSha256'] == 'a' * 64
    assert p['url'] == 'https://github.com/departures-mil/organizer/releases/download/v1.3.0/O-win-app.patch-from-1.2.0.bin'
    assert p['setup']['channel'] == 'win-setup'
    assert plan(man(), dict(O, version='1.1.0'))['mode'] == 'full'               # bu sürüme yama yok
    assert plan(man(version='1.2.0'), O) is None                                  # güncel
    below = plan(man(minVersion='1.2.5'), O)
    assert below['channel'] == 'win-setup' and below['mode'] == 'full' and below['belowMin']
    m = man()
    m['assets']['win-app']['patches']['1.2.0']['size'] = 2000                    # yama tam dosyadan büyük → tam
    assert plan(m, O)['mode'] == 'full'
    for bad, code in ((man(schema=2), 'BAD_MANIFEST'), (man(app='baska'), 'WRONG_APP')):
        with pytest.raises(UpdateError) as e:
            plan(bad, O)
        assert e.value.code == code
    with pytest.raises(UpdateError) as e:
        plan(man(), dict(O, channel='android'))
    assert e.value.code == 'NO_CHANNEL'
    assert U.manifest_url(O) == 'https://github.com/departures-mil/organizer/releases/latest/download/latest.json'


class Resp(io.BytesIO):
    status = 200

    def geturl(self):
        return 'https://github.com/'


def server(files, hits=None):
    def op(url):
        name = url.rsplit('/', 1)[-1]
        if hits is not None:
            hits.append(name)
        if name not in files:
            raise UpdateError('HTTP_404')
        return Resp(files[name])
    return op


@pytest.fixture
def appdirs(tmp_path):
    """Kurulu 1.2.0 klasörü + 1.3.0 klasörü, CI'daki gibi fcpack zip'leri ve FCD1 yaması."""
    old = tmp_path / 'inst' / 'Organizer'
    new = tmp_path / 'build' / 'Organizer'
    for d, ver in ((old, '1.2.0'), (new, '1.3.0')):
        (d / '_internal').mkdir(parents=True)
        (d / 'Organizer.exe').write_bytes(b'MZ' + ver.encode() * 50)
        (d / '_internal' / 'lib.bin').write_bytes(bytes(range(256)) * 400)
        (d / '_internal' / 'ver.txt').write_text(ver)
    oz, nz = tmp_path / 'old.zip', tmp_path / 'new.zip'
    fcpack.pack(str(old), str(oz))
    fcpack.pack(str(new), str(nz))
    patch = _fcdelta.make(oz.read_bytes(), nz.read_bytes())
    full = nz.read_bytes()
    m = man()
    m['assets'] = {'win-app': {'file': 'O-1.3.0-win-app.zip', 'size': len(full), 'sha256': H(full),
                               'patches': {'1.2.0': {'file': 'O-win-app.patch-from-1.2.0.bin', 'size': len(patch), 'sha256': H(patch)}}}}
    files = {'latest.json': json.dumps(m).encode(), 'O-1.3.0-win-app.zip': full, 'O-win-app.patch-from-1.2.0.bin': patch}
    return {'old': old, 'new': new, 'files': files, 'full': full, 'patch': patch, 'tmp': tmp_path}


def mk(a, files=None, hits=None, **kw):
    spawned = []
    u = Updater(repo='organizer', app='organizer', version='1.2.0', opener=server(a['files'] if files is None else files, hits), app_dir=str(a['old']),
                exe=str(a['old'] / 'Organizer.exe'), staging=str(a['tmp'] / 'staging'), can_update=True,
                spawn=lambda args: spawned.append(args), **kw)
    u.spawned = spawned
    return u


def test_fcpack_deterministic(appdirs, tmp_path):
    a = tmp_path / 'a.zip'
    b = tmp_path / 'b.zip'
    fcpack.pack(str(appdirs['old']), str(a))
    os.utime(appdirs['old'] / 'Organizer.exe', (1, 1))     # tarih değişse de aynı zip
    fcpack.pack(str(appdirs['old']), str(b))
    assert a.read_bytes() == b.read_bytes()


def test_run_patch_path_rebuilds_base_and_installs(appdirs):
    states = []
    hits = []
    u = mk(appdirs, hits=hits)
    u.subscribe(lambda s: states.append(s))
    assert u.check()['mode'] == 'patch'
    assert u.run() == 'patch'
    assert 'O-1.3.0-win-app.zip' not in hits                              # tam dosya indirilmedi
    new = str(appdirs['old']) + '.new'
    assert (open(os.path.join(new, '_internal', 'ver.txt')).read()) == '1.3.0'
    assert u.state['status'] == 'restarting'
    assert any(s['status'] == 'downloading' and s['mode'] == 'patch' for s in states)
    assert any(s['status'] == 'verifying' for s in states)
    assert u.spawned and u.spawned[0][-1].endswith('.sh' if os.name != 'nt' else '.cmd')
    base = storage.get('update.base')
    assert base['version'] == '1.3.0' and H(open(base['path'], 'rb').read()) == H(appdirs['full'])   # sonraki yamanın tabanı
    assert storage.get('whatsnew.pending')['version'] == '1.3.0'


def test_patch_failure_falls_back_to_full(appdirs):
    files = dict(appdirs['files'])
    files['O-win-app.patch-from-1.2.0.bin'] = b'x' * len(appdirs['patch'])   # bozuk yama → SHA tutmaz
    hits = []
    u = mk(appdirs, files, hits)
    assert u.run() == 'full'
    assert u.state['fallback'] is True and u.state['patchError'] == 'BAD_HASH'
    assert hits.count('O-1.3.0-win-app.zip') == 1


def test_patch_with_unknown_base_falls_back(appdirs):
    (appdirs['old'] / '_internal' / 'ver.txt').write_text('elle değişti')   # kurulu klasör yamanın kaynağı değil
    u = mk(appdirs)
    assert u.run() == 'full' and u.state['patchError'] == 'NO_BASE'


def test_bad_full_hash_is_error(appdirs):
    files = dict(appdirs['files'])
    m = json.loads(files['latest.json'])
    m['assets']['win-app'].pop('patches')
    files['latest.json'] = json.dumps(m).encode()
    files['O-1.3.0-win-app.zip'] = b'y' * len(appdirs['full'])
    u = mk(appdirs, files)
    with pytest.raises(UpdateError):
        u.run()
    assert u.state['status'] == 'error' and u.state['error'] == 'BAD_HASH'
    assert U.error_text('BAD_HASH', 'en').startswith('The downloaded file could not be verified')


def test_manifest_404_means_up_to_date(appdirs):
    u = mk(appdirs, files={})
    assert u.check() is None and u.state['status'] == 'none'


def test_offline_silent_check_keeps_state(appdirs):
    def off(url):
        raise UpdateError('OFFLINE')
    u = Updater(repo='organizer', app='organizer', version='1.2.0', opener=off, staging=str(appdirs['tmp'] / 's'))
    u.check(silent=True)
    assert u.state['status'] == 'idle'
    u.check()
    assert u.state['status'] == 'error' and u.state['error'] == 'OFFLINE'


def test_not_packaged_opens_release_page(appdirs):
    opened = []
    u = Updater(repo='organizer', app='organizer', version='1.2.0', opener=server(appdirs['files']), can_update=False, open_url=opened.append,
                staging=str(appdirs['tmp'] / 's'))
    assert u.run() == 'browser'
    assert opened == ['https://github.com/departures-mil/organizer/releases/latest']


def test_setup_channel_below_min_runs_installer(appdirs):
    exe = b'MZsetup' * 100
    m = man(minVersion='1.2.5')
    m['assets']['win-setup'] = {'file': 'O-Setup-1.3.0.exe', 'size': len(exe), 'sha256': H(exe)}
    quit_ = []
    u = mk(appdirs, {'latest.json': json.dumps(m).encode(), 'O-Setup-1.3.0.exe': exe}, on_quit=lambda: quit_.append(1))
    assert u.run() == 'setup'
    assert u.spawned[0][0].endswith('O-Setup-1.3.0.exe') and quit_ == [1]


def test_no_write_falls_back_to_setup(appdirs, monkeypatch):
    exe = b'MZsetup' * 100
    files = dict(appdirs['files'])
    m = json.loads(files['latest.json'])
    m['assets']['win-setup'] = {'file': 'O-Setup-1.3.0.exe', 'size': len(exe), 'sha256': H(exe)}
    files['latest.json'] = json.dumps(m).encode()
    files['O-Setup-1.3.0.exe'] = exe
    u = mk(appdirs, files)
    monkeypatch.setattr(u, '_writable', lambda d: False)
    assert u.run() == 'setup'


@pytest.mark.skipif(sys.platform.startswith('win'), reason='sh betiği')
@pytest.mark.parametrize('ok', [True, False])
def test_swap_script_swaps_and_rolls_back(tmp_path, ok):
    app = tmp_path / 'App'
    app.mkdir()
    (app / 'v.txt').write_text('eski')
    new = tmp_path / 'App.new'
    new.mkdir()
    (new / 'v.txt').write_text('yeni')
    marker = tmp_path / 'st' / 'acildi-2.0.0.ok'
    exe = app / 'run.sh'
    for d in (app, new):
        (d / 'run.sh').write_text('#!/bin/sh\n' + ('touch %s\n' % marker if ok else 'exit 0\n'))
        os.chmod(d / 'run.sh', 0o755)
    p = subprocess.Popen(['sleep', '0.5'])
    import threading
    threading.Thread(target=p.wait, daemon=True).start()     # zombi kalmasın (kill -0 beklemesi)
    script = U.write_swap_script(str(tmp_path / 'st'), p.pid, 'dir', str(app), str(new), str(exe), str(marker), '2.0.0', wait_s=2)
    r = subprocess.run(['/bin/sh', script], timeout=30)
    assert (app / 'v.txt').read_text() == ('yeni' if ok else 'eski')
    assert not (tmp_path / 'App.bak').exists()
    log = (tmp_path / 'st' / 'takas.log').read_text()
    assert log.startswith('ok' if ok else 'geri-alindi')


def test_confirm_started_writes_marker(tmp_path):
    storage.set('update.pending', {'version': '2.0.0'})
    assert U.confirm_started(str(tmp_path), '2.0.0')
    assert (tmp_path / 'acildi-2.0.0.ok').exists() and storage.get('update.pending') is None


def test_windows_cmd_script_text(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, 'platform', 'win32')
    p = U.write_swap_script(str(tmp_path), 1234, 'dir', r'C:\Users\Ç\AppData\Local\Programs\Organizer', r'C:\x\Organizer.new',
                            r'C:\Users\Ç\AppData\Local\Programs\Organizer\Organizer.exe', r'C:\st\acildi-2.0.0.ok', '2.0.0')
    body = open(p, 'rb').read().decode('utf-8')
    assert body.startswith('@echo off\r\nchcp 65001') and 'PID eq 1234' in body and ':geri' in body and '--fc-updated=2.0.0' in body
    assert 'rmdir /S /Q "C:\\Users\\Ç\\AppData\\Local\\Programs\\Organizer.bak"' in body


# ---------------------------------------------------------------- takas/kurulum betikleri (çekirdeğe alınan düzeltmeler)
def test_swap_script_hata_relaunches_old_exe(tmp_path):
    p = U.write_swap_script(str(tmp_path), 123, 'dir', 'C:\\P\\App', 'C:\\P\\App.new', 'C:\\P\\App\\App.exe', 'C:\\m.ok', '1.3.0', windows=True)
    body = open(p, encoding='utf-8').read()
    hata = body.split(':hata', 1)[1].split(':son', 1)[0]
    assert 'start "" "C:\\P\\App\\App.exe" --fc-update-failed=1.3.0' in hata
    assert 'if exist "C:\\P\\App\\App.exe"' in hata
    sh = open(U.write_swap_script(str(tmp_path), 123, 'dir', '/p/App', '/p/App.new', '/p/App/app', '/m.ok', '1.3.0', windows=False)).read()
    assert sh.count('--fc-update-failed=1.3.0') == 2          # takas başlayamadıysa da, geri alınca da


def test_swap_helper_spawns_with_staging_cwd(appdirs):
    calls = []
    u = mk(appdirs)
    u.spawn = lambda args, cwd=None: calls.append((args, cwd))
    assert u.run() == 'patch'
    assert calls and calls[0][1] == u.staging
    assert not calls[0][1].startswith(str(appdirs['old']))
    # eski imzalı spawn(args) da çalışır
    assert U._accepts_cwd(lambda args: None) is False and U._accepts_cwd(U._spawn_detached) is True


def test_setup_args_silent_script_then_relaunch(appdirs, tmp_path):
    assert U.setup_args_for(None) is None and U.setup_args_for('nsis') == ['/S'] and U.setup_args_for(True) == ['/S']
    assert U.setup_args_for('inno')[0] == '/VERYSILENT' and U.setup_args_for(['/x']) == ['/x']
    cmd = open(U.write_setup_script(str(tmp_path), 77, 'C:\\t\\S.exe', ['/VERYSILENT', '/SP-'], 'C:\\P\\App.exe', windows=True, version='2.0.0'),
               encoding='utf-8').read()
    assert 'start "" /wait "C:\\t\\S.exe" /VERYSILENT /SP-' in cmd
    assert 'start "" "C:\\P\\App.exe" --fc-updated=2.0.0' in cmd and 'PID eq 77' in cmd
    assert cmd.index(':kur') < cmd.index('/wait')
    exe = b'MZsetup' * 100
    m = man(minVersion='1.2.5')
    m['assets']['win-setup'] = {'file': 'O-Setup-1.3.0.exe', 'size': len(exe), 'sha256': H(exe)}
    u = mk(appdirs, {'latest.json': json.dumps(m).encode(), 'O-Setup-1.3.0.exe': exe}, setup_args='nsis')
    assert u.run() == 'setup'
    args = u.spawned[0]
    script = args[-1]
    assert os.path.basename(script).startswith('kurulum.')
    body = open(script, encoding='utf-8').read()
    assert 'O-Setup-1.3.0.exe' in body and '/S' in body and 'Organizer.exe' in body and '--fc-updated=1.3.0' in body


def test_fcpack_cli_survives_non_utf8_console(appdirs, tmp_path):
    import subprocess
    import sys as _s
    env = dict(os.environ, PYTHONIOENCODING='cp1252:strict', PYTHONPATH=os.path.dirname(os.path.dirname(fcpack.__file__)))
    out = tmp_path / 'ç.zip'
    r = subprocess.run([_s.executable, '-m', 'fccore.fcpack', str(appdirs['old']), str(out)], env=env, capture_output=True)
    assert r.returncode == 0, r.stderr
    assert out.exists() and r.stdout.startswith(b'written ')
    r = subprocess.run([_s.executable, '-m', 'fccore.fcpack'], env=env, capture_output=True)
    assert r.returncode == 2 and b'Traceback' not in r.stderr
