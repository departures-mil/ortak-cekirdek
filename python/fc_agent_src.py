# -*- coding: utf-8 -*-
"""Asistan Agent — Python / PySide6 sürümü (ortak-cekirdek/python/fc_agent.py; ÜRETİLİR: web/tools/build-agent-py.js).

Web sürümüyle (web/js/agent.js) aynı kurallar, aynı 3 dilli metinler ve aynı veri biçimi: aynı bilgisayardaki
bütün programlar sayaçlarını %APPDATA%/FalconCekirdek/agent/<uygulama>@<cihaz>.json içinde paylaşır, böylece
agent TÜM uygulamalardaki çalışmayı birlikte yorumlar. Yalnızca SAYILAR tutulur (etkin dakika, oturum, düğme
adları, saatler, hata sayısı); yazılan metin ve kayıt içeriği asla okunmaz.

Kullanım:
    import fc_agent
    ajan = fc_agent.Agent('bereket-defter', APP_VERSION, lang=lambda: LANG,
                          ai=lambda: {'provider': 'gemini', 'key': anahtar} if anahtar else None)
    ajan.start(app, pencere)                      # olay süzgeci + zamanlayıcılar + sağ altta ✦ düğmesi
    layout.addWidget(ajan.card(parent))           # Ayarlar'da "Admin ile iletişim"in önüne
    ajan.track('Fatura kaydet'); ajan.task('f42', 'start', 'Fatura')   # isteğe bağlı
"""
import json
import os
import random
import re
import threading
import time
import urllib.request
from datetime import datetime, timedelta

try:
    from PySide6.QtCore import QEvent, QObject, Qt, QTimer, Signal
    from PySide6.QtGui import QIcon
    from PySide6.QtWidgets import (QAbstractButton, QApplication, QCheckBox, QComboBox, QDialog, QFrame, QHBoxLayout,
                                   QLabel, QMessageBox, QProgressBar, QPushButton, QScrollArea, QSystemTrayIcon,
                                   QToolButton, QVBoxLayout, QWidget)
    QT = True
except Exception:  # testler ve Qt'siz kullanım
    QT = False
    QObject = object

DIL = __DIL__

KEEP_DAYS, MAX_NOTES, IDLE_S = 60, 60, 120
FREQ = ['instant', 'daily', 'weekly', 'manual']
DEF = {'on': True, 'notify': True, 'panel': True, 'freq': 'daily', 'ai': True, 'apps': None}


def _now():
    return datetime.now()


def day_key(d=None):
    return (d or _now()).strftime('%Y-%m-%d')


def days_ago(n):
    return day_key(_now() - timedelta(days=n))


def clean(name):
    s = re.sub(r'\s+', ' ', str(name or '')).strip()
    s = re.sub(r'[\w.+-]+@[\w-]+\.[\w.]+', '@', s)
    s = re.sub(r'\d+([.,:/-]\d+)*', '#', s)
    s = s.replace('&', '')
    return s[:40]


def shared_dir():
    base = os.environ.get('APPDATA') or os.path.join(os.path.expanduser('~'), '.config')
    return os.path.join(base, 'FalconCekirdek', 'agent')


class Agent(QObject):
    if QT:
        changed = Signal()
        _fresh = Signal(list)

    def __init__(self, app_id, version='', lang=None, ai=None, data_dir=None, sync=True, ai_per_day=4):
        if QT:
            super().__init__()
        self.app = str(app_id)
        self.version = str(version)
        self._lang = lang or (lambda: 'tr')
        self._ai = ai
        self.sync_seen = bool(sync)
        self.ai_per_day = ai_per_day
        self.dir = data_dir or os.path.join(shared_dir(), '..', 'yerel', self.app)
        os.makedirs(self.dir, exist_ok=True)
        self.file = os.path.join(self.dir, 'fc-agent.json')
        self.last_input = time.time()
        self.streak = 0
        self.busy = False
        self.tray = None
        self.btns = []
        self.cards = []
        self.d = self._load()
        if QT:
            self._fresh.connect(self._deliver)

    # ------------------------------------------------------------ depolama
    def _load(self):
        try:
            with open(self.file, encoding='utf-8') as f:
                d = json.load(f)
        except Exception:
            d = {}
        d.setdefault('cfg', {})
        d.setdefault('peers', {})
        d.setdefault('notes', [])
        if not d.get('device'):
            d['device'] = ''.join(random.choice('0123456789abcdef') for _ in range(18))
        m = d.get('mine')
        if not m or m.get('app') != self.app:
            d['mine'] = {'app': self.app, 'dev': d['device'], 'v': self.version, 'u': 0, 'days': {}, 'tasks': {}}
        return d

    def _save(self):
        tmp = self.file + '.tmp'
        try:
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(self.d, f, ensure_ascii=False)
            os.replace(tmp, self.file)
        except Exception:
            pass

    def lang(self):
        try:
            l = str(self._lang() or 'tr')[:2].lower()
        except Exception:
            l = 'tr'
        return l if l in DIL else 'tr'

    def T(self, k, **v):
        s = DIL[self.lang()].get(k) or DIL['tr'].get(k) or k
        for a, b in v.items():
            s = s.replace('{' + a + '}', str(b))
        return s

    def config(self):
        c = dict(DEF)
        c.update({k: v for k, v in self.d['cfg'].items() if k in DEF})
        if c['freq'] not in FREQ:
            c['freq'] = 'daily'
        return c

    def configure(self, **p):
        self.d['cfg'].update(p)
        self._save()
        self._emit()

    def src_key(self):
        return self.app + '@' + self.d['device']

    # ------------------------------------------------------------ kayıt
    def _today(self):
        m = self.d['mine']
        return m['days'].setdefault(day_key(), {'act': 0, 'ses': 0, 'mx': 0, 'a': {}, 'h': [], 'err': 0})

    def _store_mine(self):
        m = self.d['mine']
        m['u'] = int(time.time() * 1000)
        m['v'] = self.version
        lim = days_ago(KEEP_DAYS)
        for k in [k for k in m['days'] if k < lim]:
            del m['days'][k]
        self._save()

    def track(self, name, n=1):
        if not self.config()['on']:
            return
        k = clean(name)
        if not k:
            return
        if re.match(r'^\W{0,3}\s*(e[sş]itle|sync|مزامن)', k, re.I):
            k = 'fc.sync.lan' if re.search(r'wi.?fi|lan|qr', k, re.I) else 'fc.sync'
        a = self._today()['a']
        a[k] = a.get(k, 0) + n
        if len(a) > 120:
            del a[min(a, key=a.get)]
        self._store_mine()

    def task(self, tid, state, label=''):
        if not self.config()['on']:
            return
        k = str(tid)[:60] or 'task'
        tasks = self.d['mine'].setdefault('tasks', {})
        if state == 'done':
            if k in tasks:
                del tasks[k]
                t = self._today()
                t['done'] = t.get('done', 0) + 1
        elif k not in tasks:
            tasks[k] = {'since': int(time.time() * 1000), 'label': clean(label or tid)}
        self._store_mine()

    def error(self):
        self._today()['err'] += 1
        self._store_mine()

    def tick(self, active=None):
        if not self.config()['on']:
            return
        if active is None:
            active = time.time() - self.last_input < IDLE_S
        if not active:
            self.streak = 0
            return
        day = self._today()
        h = _now().hour
        while len(day['h']) <= h:
            day['h'].append(0)
        day['act'] += 1
        day['h'][h] = (day['h'][h] or 0) + 1
        self.streak += 1
        day['mx'] = max(day.get('mx', 0), self.streak)
        self._store_mine()

    def input(self):
        self.last_input = time.time()

    # ------------------------------------------------------------ paylaşım
    def import_share(self, lst):
        if isinstance(lst, dict):
            lst = lst.get('sources', [lst])
        me, n = self.src_key(), 0
        p = self.d['peers']
        for s in lst or []:
            if not isinstance(s, dict) or not s.get('app') or not s.get('dev') or not isinstance(s.get('days'), dict):
                continue
            k = s['app'] + '@' + s['dev']
            if k == me:
                continue
            if k not in p or int(s.get('u') or 0) > int(p[k].get('u') or 0):
                p[k] = {'app': str(s['app']), 'dev': str(s['dev']), 'v': s.get('v', ''), 'u': int(s.get('u') or 0),
                        'days': s['days'], 'tasks': s.get('tasks') or {}}
                n += 1
        if n:
            self._save()
            self._emit()
        return n

    def export_share(self):
        return {'schema': 1, 'sources': [self.d['mine']] + list(self.d['peers'].values())}

    def share(self):
        try:
            d = shared_dir()
            os.makedirs(d, exist_ok=True)
            f = os.path.join(d, re.sub(r'[^\w@.-]', '_', self.src_key())[:120] + '.json')
            with open(f + '.tmp', 'w', encoding='utf-8') as fh:
                json.dump(self.d['mine'], fh, ensure_ascii=False)
            os.replace(f + '.tmp', f)
            arr = []
            for name in os.listdir(d)[:200]:
                if name.endswith('.json'):
                    try:
                        with open(os.path.join(d, name), encoding='utf-8') as fh:
                            arr.append(json.load(fh))
                    except Exception:
                        pass
            self.import_share(arr)
        except Exception:
            pass

    # ------------------------------------------------------------ analiz
    def sources(self):
        c = self.config()
        allx = [self.d['mine']] + list(self.d['peers'].values())
        return [s for s in allx if not c['apps'] or s['app'] in c['apps']]

    def known_apps(self):
        a = [self.app]
        for s in self.d['peers'].values():
            if s['app'] not in a:
                a.append(s['app'])
        return a

    def app_name(self, i):
        k = 'app.' + str(i)
        s = DIL[self.lang()].get(k) or DIL['tr'].get(k)
        return s or re.sub(r'\b\w', lambda m: m.group(0).upper(), str(i).replace('-', ' ').replace('_', ' '))

    def summary(self):
        w0, p0 = days_ago(6), days_ago(13)
        apps, tot = {}, {'w': 0, 'pw': 0, 'days': {}, 'h': [0] * 24, 'ses': 0, 'err': 0, 'mx': 0, 'tasks': []}
        for s in self.sources():
            A = apps.setdefault(s['app'], {'w': 0, 'pw': 0, 'ses': 0, 'err': 0, 'a': {}, 'sync': 0, 'early': 0})
            for k, d in s['days'].items():
                act = d.get('act') or 0
                if k >= w0:
                    A['w'] += act; A['ses'] += d.get('ses') or 0; A['err'] += d.get('err') or 0
                    tot['w'] += act; tot['ses'] += d.get('ses') or 0; tot['err'] += d.get('err') or 0
                    if act > 0:
                        tot['days'][k] = 1
                    tot['mx'] = max(tot['mx'], d.get('mx') or 0)
                    for i, v in enumerate(d.get('h') or []):
                        if v and i < 24:
                            tot['h'][i] += v
                    for a, v in (d.get('a') or {}).items():
                        A['a'][a] = A['a'].get(a, 0) + v
                        if a.startswith('fc.sync'):
                            A['sync'] += v
                elif k >= p0:
                    A['pw'] += act; tot['pw'] += act
                else:
                    A['early'] += act
            for t, x in (s.get('tasks') or {}).items():
                tot['tasks'].append({'app': s['app'], 'id': t, 'label': x.get('label', t), 'since': x.get('since', 0)})
        return {'apps': apps, 'tot': tot}

    def hm(self, mins):
        mins = int(round(mins))
        h, m = divmod(mins, 60)
        return self.T('hm', h=h, m=m) if h else self.T('m', m=m)

    def rules(self, sm=None):
        sm = sm or self.summary()
        out, tot, apps = [], sm['tot'], sm['apps']

        def add(i, prio, key, **v):
            out.append({'id': i, 'prio': prio, 'key': key, 'vars': v})
        if tot['w'] < 5 and tot['pw'] < 5:
            add('start', 1, 'r.start')
            return out
        if tot['pw'] >= 30:
            ch = round((tot['w'] - tot['pw']) / tot['pw'] * 100)
            if ch >= 25:
                add('up', 2, 'r.up', p=ch, t=self.hm(tot['w']))
            elif ch <= -25:
                add('down', 3, 'r.down', p=-ch, t=self.hm(tot['w']))
        used = sorted([n for n in apps if apps[n]['w'] > 0], key=lambda n: -apps[n]['w'])
        if len(used) > 1 and tot['w'] > 0:
            add('top', 2, 'r.top', a=self.app_name(used[0]), p=round(apps[used[0]]['w'] / tot['w'] * 100), n=len(used))
        night = sum(tot['h'][i] for i in (23, 0, 1, 2, 3, 4))
        if tot['w'] >= 60 and night / tot['w'] >= 0.2:
            add('night', 4, 'r.night', p=round(night / tot['w'] * 100))
        if tot['mx'] >= 90:
            add('break', 4, 'r.break', t=self.hm(tot['mx']))
        pv = max(tot['h'])
        if pv > 0 and tot['w'] >= 120:
            pk = tot['h'].index(pv)
            add('peak', 1, 'r.peak', h='%02d:00' % pk, h2='%02d:00' % ((pk + 1) % 24))
        rep = None
        for n, A in apps.items():
            best = max([a for a in A['a'] if not a.startswith('fc.')], key=lambda a: A['a'][a], default=None)
            if best and A['a'][best] >= 30 and (not rep or A['a'][best] > rep[2]):
                rep = (n, best, A['a'][best])
            if A['w'] >= 60 and A['sync'] == 0 and n == self.app and self.sync_seen:
                add('sync:' + n, 4, 'r.sync', a=self.app_name(n))
            if A['err'] >= 3:
                add('err:' + n, 5, 'r.err', a=self.app_name(n), n=A['err'])
            if A['w'] == 0 and A['pw'] + A['early'] >= 60:
                add('idle:' + n, 1, 'r.idle', a=self.app_name(n))
            if A['ses'] >= 40 and A['w'] / A['ses'] < 3:
                add('frag:' + n, 2, 'r.frag', a=self.app_name(n), n=A['ses'])
        if rep:
            add('rep:' + rep[0], 3, 'r.repeat', a=self.app_name(rep[0]), x=rep[1], n=rep[2])
        nowms = time.time() * 1000
        old = [t for t in tot['tasks'] if nowms - t['since'] > 3 * 86400000]
        if old:
            add('tasks', 5, 'r.tasks', n=len(old), x=', '.join('%s (%s)' % (t['label'], self.app_name(t['app'])) for t in old[:3]))
        if len(tot['days']) >= 5:
            add('streak', 1, 'r.streak', n=len(tot['days']))
        return sorted(out, key=lambda r: -r['prio'])

    def notes(self):
        return self.d['notes']

    def note_text(self, n):
        t = n.get('text')
        if t is not None:
            return t if isinstance(t, str) else (t.get(self.lang()) or next(iter(t.values()), ''))
        return self.T(n['key'], **(n.get('vars') or {}))

    def unread(self):
        return sum(1 for n in self.d['notes'] if not n.get('read'))

    def add_notes(self, lst, src):
        allx, t, fresh = self.d['notes'], int(time.time() * 1000), []
        for r in lst:
            sig = str(r.get('id', '')) + '|' + json.dumps(r.get('vars') or r.get('text') or '', ensure_ascii=False, sort_keys=True)
            if any(n.get('sig') == sig and t - n.get('t', 0) < 3 * 86400000 for n in allx):
                continue
            n = {'id': '%x%04x' % (t, random.randint(0, 65535)), 't': t, 'sig': sig, 'src': src, 'rid': r.get('id'),
                 'key': r.get('key'), 'vars': r.get('vars'), 'text': r.get('text'), 'prio': r.get('prio', 2), 'read': False}
            allx.insert(0, n)
            fresh.append(n)
        self.d['notes'] = allx[:MAX_NOTES]
        self._save()
        return fresh

    def _ai_cfg(self):
        try:
            a = self._ai() if callable(self._ai) else self._ai
        except Exception:
            a = None
        return a if a and a.get('key') and a.get('provider') in ('gemini', 'openai', 'anthropic', 'groq') else None

    def ai_calls_today(self):
        a = self.d.get('ai') or {}
        return a.get('n', 0) if a.get('d') == day_key() else 0

    def _digest(self, sm):
        apps = {}
        for n, A in sm['apps'].items():
            top = sorted(A['a'], key=lambda k: -A['a'][k])[:8]
            apps[self.app_name(n)] = {'weekMin': A['w'], 'prevWeekMin': A['pw'], 'sessions': A['ses'], 'errors': A['err'],
                                      'topActions': ['%s ×%d' % (k, A['a'][k]) for k in top]}
        t = sm['tot']
        return {'weekMin': t['w'], 'prevWeekMin': t['pw'], 'activeDays': len(t['days']), 'longestStretchMin': t['mx'],
                'minutesByHour': t['h'], 'openTasks': len(t['tasks']), 'apps': apps}

    def _ask_ai(self, sm):
        a = self._ai_cfg()
        L = {'tr': 'Türkçe', 'en': 'English', 'ar': 'العربية'}[self.lang()]
        p = ('You are a friendly productivity coach inside a set of free desktop/mobile apps. Below are anonymous usage COUNTS '
             '(no content) of one person across their apps over the last 7 days compared to the 7 days before. Write 3 to 5 '
             'short, concrete, encouraging suggestions to improve how they work (focus, breaks, routines, using features better, '
             'finishing open tasks, syncing/backups). Each suggestion max 2 sentences, in ' + L +
             '. Answer ONLY with a JSON array of strings.\n\n' + json.dumps(self._digest(sm), ensure_ascii=False))
        h = {'Content-Type': 'application/json'}
        pr, k, model = a['provider'], a['key'], a.get('model')
        if pr == 'gemini':
            u = 'https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s' % (model or 'gemini-flash-latest', k)
            body = {'contents': [{'parts': [{'text': p}]}]}
            pick = lambda j: j['candidates'][0]['content']['parts'][0]['text']
        elif pr == 'anthropic':
            u = 'https://api.anthropic.com/v1/messages'
            h.update({'x-api-key': k, 'anthropic-version': '2023-06-01'})
            body = {'model': model or 'claude-haiku-5-5', 'max_tokens': 700, 'messages': [{'role': 'user', 'content': p}]}
            pick = lambda j: j['content'][0]['text']
        else:
            u = 'https://api.groq.com/openai/v1/chat/completions' if pr == 'groq' else 'https://api.openai.com/v1/chat/completions'
            h['Authorization'] = 'Bearer ' + k
            body = {'model': model or ('llama-3.3-70b-versatile' if pr == 'groq' else 'gpt-4o-mini'), 'messages': [{'role': 'user', 'content': p}]}
            pick = lambda j: j['choices'][0]['message']['content']
        self.d['ai'] = {'d': day_key(), 'n': self.ai_calls_today() + 1}
        self._save()
        req = urllib.request.Request(u, data=json.dumps(body).encode('utf-8'), headers=h, method='POST')
        with urllib.request.urlopen(req, timeout=40) as r:
            j = json.loads(r.read().decode('utf-8'))
        s = str(pick(j) or '')
        m = re.search(r'\[[\s\S]*\]', s)
        try:
            arr = json.loads(m.group(0) if m else s)
        except Exception:
            arr = [re.sub(r'^[\s\-*\d.)]+', '', x) for x in s.split('\n')]
        arr = [str(x).strip() for x in (arr if isinstance(arr, list) else []) if str(x).strip()][:5]
        if not arr:
            raise ValueError('EMPTY')
        l = self.lang()
        return [{'id': 'ai%d' % i, 'prio': 3, 'text': {l: x[:400]}} for i, x in enumerate(arr)]

    def due(self, c=None):
        c = c or self.config()
        last = self.d.get('lastRun', 0) / 1000.0
        t = time.time()
        if c['freq'] == 'manual':
            return False
        if c['freq'] == 'instant':
            return t - last >= 1800
        if c['freq'] == 'weekly':
            return t - last >= 7 * 86400
        return day_key(datetime.fromtimestamp(last)) != day_key() and t - last >= 12 * 3600

    def analyze(self, manual=False, wait=False):
        """Çevrim dışı kurallar her zaman; uygunsa kullanıcının kendi anahtarıyla AI. Arka planda çalışır."""
        c = self.config()
        if not c['on'] or self.busy:
            return []
        self.busy = True
        self.d['lastRun'] = int(time.time() * 1000)
        self._save()

        def run():
            fresh = []
            try:
                self.share()
                sm = self.summary()
                fresh = self.add_notes(self.rules(sm)[:6 if manual else 4], 'offline')
                if c['ai'] and self._ai_cfg() and self.ai_calls_today() < self.ai_per_day and (manual or c['freq'] != 'instant' or self.ai_calls_today() == 0):
                    try:
                        fresh += self.add_notes(self._ask_ai(sm), 'ai')
                    except Exception:
                        pass
            finally:
                self.busy = False
            if QT and QApplication.instance() is not None:
                self._fresh.emit(fresh)
            return fresh
        if wait or not QT:
            return run()
        threading.Thread(target=run, daemon=True).start()
        return []

    def schedule(self):
        if self.config()['on'] and self.due():
            self.analyze(False)

    # ------------------------------------------------------------ Qt arayüzü
    def _emit(self):
        if not QT or QApplication.instance() is None:
            return
        self._draw()
        try:
            self.changed.emit()
        except Exception:
            pass

    def _deliver(self, fresh):
        self._emit()
        if not fresh:
            return
        c = self.config()
        top = sorted(fresh, key=lambda n: -n.get('prio', 2))[0]
        title = self.T('title') + (' (%d)' % len(fresh) if len(fresh) > 1 else '')
        if c['notify']:
            self._notify(title, self.note_text(top))

    def _notify(self, title, body):
        try:
            if not QSystemTrayIcon.isSystemTrayAvailable():
                return False
            if self.tray is None:
                ic = QApplication.windowIcon()
                self.tray = QSystemTrayIcon(ic if not ic.isNull() else QIcon(), QApplication.instance())
                self.tray.setToolTip(self.T('title'))
                self.tray.messageClicked.connect(lambda: self.config()['panel'] and self.show())
            self.tray.show()
            self.tray.showMessage(title, body, QSystemTrayIcon.Information, 9000)
            return True
        except Exception:
            return False

    def eventFilter(self, obj, ev):
        try:
            t = ev.type()
            if t in (QEvent.KeyPress, QEvent.MouseButtonPress, QEvent.Wheel, QEvent.TouchBegin):
                self.last_input = time.time()
            elif t == QEvent.MouseButtonRelease and isinstance(obj, QAbstractButton) and not obj.property('fcAgent'):
                name = obj.text() or obj.toolTip() or obj.objectName()
                if name:
                    self.track(name)
        except Exception:
            pass
        return False

    def start(self, qapp=None, window=None, first_delay_ms=20000, button=True, fab_bottom=18):
        if not self.config()['on']:
            pass
        self._today()['ses'] += 1
        self._store_mine()
        if not QT:
            return self
        qapp = qapp or QApplication.instance()
        if qapp is None:
            return self
        qapp.installEventFilter(self)
        self._t1 = QTimer(self); self._t1.timeout.connect(lambda: self.tick()); self._t1.start(60000)
        self._t2 = QTimer(self); self._t2.timeout.connect(lambda: (self.share(), self.schedule())); self._t2.start(1800000)
        QTimer.singleShot(first_delay_ms, lambda: (self.share(), self.schedule()))
        if window is not None and button:
            self.attach_button(window, fab_bottom)
        return self

    def attach_button(self, window, bottom=18):
        b = QToolButton(window)
        b.setProperty('fcAgent', True)
        b.setCursor(Qt.PointingHandCursor)
        b.setFixedSize(46, 46)
        b.setStyleSheet('QToolButton{border-radius:23px;background:#111827;color:#38bdf8;font-size:20px;border:1px solid #334155}'
                        'QToolButton:hover{background:#1f2937}')
        b.clicked.connect(self.show)
        self.btns.append(b)
        win = window

        class _Pos(QObject):
            def eventFilter(s, o, e):
                if e.type() in (QEvent.Resize, QEvent.Show):
                    rtl = self.lang() == 'ar'
                    x = 18 if rtl else win.width() - b.width() - 18
                    b.move(x, win.height() - b.height() - bottom)
                    b.raise_()
                return False
        self._pos = _Pos(window)
        window.installEventFilter(self._pos)
        self._draw()
        b.show()
        return b

    def _draw(self):
        c, n = self.config(), self.unread()
        for b in list(self.btns):
            try:
                b.setVisible(bool(c['on'] and c['panel']))
                b.setText('✦' + (' %d' % n if n else ''))
                b.setToolTip(self.T('title') + (' (%d)' % n if n else ''))
                b.raise_()
            except RuntimeError:
                self.btns.remove(b)
        for f in list(self.cards):
            try:
                f()
            except RuntimeError:
                self.cards.remove(f)

    def show(self, parent=None):
        dlg = QDialog(parent or QApplication.activeWindow())
        dlg.setWindowTitle('✦ ' + self.T('title'))
        dlg.setMinimumSize(520, 560)
        dlg.setLayoutDirection(Qt.RightToLeft if self.lang() == 'ar' else Qt.LeftToRight)
        v = QVBoxLayout(dlg)
        body = QWidget(); bl = QVBoxLayout(body)
        sc = QScrollArea(); sc.setWidgetResizable(True); sc.setWidget(body)
        v.addWidget(sc, 1)

        def render():
            while bl.count():
                it = bl.takeAt(0)
                if it.widget():
                    it.widget().deleteLater()
            sm = self.summary()
            bl.addWidget(QLabel('<b>%s</b> · %s · %s' % (self.T('week', t=self.hm(sm['tot']['w'])), self.T('days', n=len(sm['tot']['days'])),
                                                         self.T('open', n=len(sm['tot']['tasks'])))))
            names = sorted([n for n in sm['apps'] if sm['apps'][n]['w'] > 0], key=lambda n: -sm['apps'][n]['w'])[:8]
            mx = sm['apps'][names[0]]['w'] if names else 1
            for n in names:
                row = QHBoxLayout(); w = sm['apps'][n]['w']
                lab = QLabel(self.app_name(n)); lab.setMinimumWidth(140); row.addWidget(lab)
                pb = QProgressBar(); pb.setMaximum(100); pb.setValue(max(4, round(w / mx * 100))); pb.setTextVisible(False); pb.setFixedHeight(8)
                row.addWidget(pb, 1); row.addWidget(QLabel(self.hm(w)))
                wr = QWidget(); wr.setLayout(row); bl.addWidget(wr)
            bl.addWidget(QLabel('<b>%s</b>' % self.T('notes')))
            if not self.d['notes']:
                q = QLabel(self.T('none')); q.setWordWrap(True); bl.addWidget(q)
            for n in self.d['notes'][:30]:
                fr = QFrame(); fr.setFrameShape(QFrame.StyledPanel); fl = QVBoxLayout(fr)
                tag = self.T('srcAi' if n.get('src') == 'ai' else 'srcOff')
                fl.addWidget(QLabel('<small>%s · %s</small>' % (tag, datetime.fromtimestamp(n['t'] / 1000).strftime('%d.%m %H:%M'))))
                tx = QLabel(('<b>%s</b>' if not n.get('read') else '%s') % self.note_text(n).replace('<', '&lt;'))
                tx.setWordWrap(True); fl.addWidget(tx)
                bl.addWidget(fr)
            bl.addStretch(1)
        render()
        h = QHBoxLayout()
        an = QPushButton('⚡ ' + self.T('analyze'))
        an.setProperty('fcAgent', True)

        def go():
            an.setEnabled(False)
            self.analyze(True, wait=True)
            self._emit(); render(); an.setEnabled(True)
        an.clicked.connect(go)
        cl = QPushButton('✕'); cl.setProperty('fcAgent', True); cl.clicked.connect(dlg.accept)
        h.addWidget(an); h.addStretch(1); h.addWidget(cl); v.addLayout(h)
        dlg.finished.connect(lambda *_: self._mark_read())
        dlg.show()
        self._dlg = dlg
        return dlg

    def _mark_read(self):
        for n in self.d['notes']:
            n['read'] = True
        self._save()
        self._emit()

    def clear(self):
        for k in ('peers', 'notes'):
            self.d[k] = {} if k == 'peers' else []
        self.d['mine'] = {'app': self.app, 'dev': self.d['device'], 'v': self.version, 'u': 0, 'days': {}, 'tasks': {}}
        self.d.pop('lastRun', None)
        self._save()
        try:
            os.remove(os.path.join(shared_dir(), re.sub(r'[^\w@.-]', '_', self.src_key())[:120] + '.json'))
        except Exception:
            pass
        self._emit()

    def card(self, parent=None):
        """Ayarlar kartı (QFrame). Dil değişince program kartı yeniden kurarsa yeni metinlerle çizilir."""
        box = QFrame(parent)
        box.setObjectName('fcAgentCard')
        box.setFrameShape(QFrame.StyledPanel)
        v = QVBoxLayout(box)

        def build():
            while v.count():
                it = v.takeAt(0)
                w = it.widget()
                if w:
                    w.deleteLater()
                elif it.layout():
                    QWidget().setLayout(it.layout())
            o = self.config()
            box.setLayoutDirection(Qt.RightToLeft if self.lang() == 'ar' else Qt.LeftToRight)
            h = QLabel('✦ ' + self.T('title')); h.setObjectName('h2'); h.setStyleSheet('font-weight:600;font-size:15px'); v.addWidget(h)
            d = QLabel(self.T('desc')); d.setWordWrap(True); v.addWidget(d)

            def chk(key, label):
                cb = QCheckBox(label); cb.setChecked(bool(o[key])); cb.setProperty('fcAgent', True)

                def ch(state, key=key):
                    self.configure(**{key: bool(state)})
                    QTimer.singleShot(0, build)
                cb.stateChanged.connect(ch)
                v.addWidget(cb)
            chk('on', self.T('on'))
            if o['on']:
                chk('notify', self.T('notify')); chk('panel', self.T('panel')); chk('ai', self.T('ai'))
                if o['ai'] and not self._ai_cfg():
                    q = QLabel('<small>%s</small>' % self.T('noKey')); q.setWordWrap(True); v.addWidget(q)
                row = QHBoxLayout(); row.addWidget(QLabel(self.T('freq')))
                cmb = QComboBox(); cmb.setProperty('fcAgent', True)
                for f in FREQ:
                    cmb.addItem(self.T('freq.' + f), f)
                cmb.setCurrentIndex(FREQ.index(o['freq']))
                cmb.currentIndexChanged.connect(lambda i: self.configure(freq=FREQ[i]))
                row.addWidget(cmb, 1); wr = QWidget(); wr.setLayout(row); v.addWidget(wr)
                v.addWidget(QLabel('<b>%s</b>' % self.T('apps')))
                apps = self.known_apps()
                for a in apps:
                    cb = QCheckBox(self.app_name(a)); cb.setChecked(not o['apps'] or a in o['apps']); cb.setProperty('fcAgent', True)

                    def ach(state, a=a):
                        cur = [x for x in (self.config()['apps'] or list(apps)) if x != a]
                        if state:
                            cur.append(a)
                        self.configure(apps=None if len(cur) >= len(self.known_apps()) else cur)
                    cb.stateChanged.connect(ach); v.addWidget(cb)
                q = QLabel('<small>%s</small>' % self.T('appsHint')); q.setWordWrap(True); v.addWidget(q)
                sm = self.summary()
                v.addWidget(QLabel('<small>%s</small>' % self.T('status', t=self.hm(sm['tot']['w']), n=len(self.d['notes']),
                                                                a=self.ai_calls_today(), m=self.ai_per_day)))
                row = QHBoxLayout()
                b1 = QPushButton('⚡ ' + self.T('analyze')); b1.setProperty('fcAgent', True)

                def an():
                    b1.setEnabled(False)
                    f = self.analyze(True, wait=True)
                    QMessageBox.information(box, self.T('title'), self.T('newNotes', n=len(f)) if f else self.T('nothing'))
                    build()
                b1.clicked.connect(an)
                b2 = QPushButton('✦ ' + self.T('showNotes')); b2.setProperty('fcAgent', True); b2.clicked.connect(lambda: self.show(box.window()))
                b3 = QPushButton(self.T('clear')); b3.setProperty('fcAgent', True)

                def cl():
                    if QMessageBox.question(box, self.T('clear'), self.T('clearQ')) == QMessageBox.Yes:
                        self.clear(); build()
                b3.clicked.connect(cl)
                row.addWidget(b1); row.addWidget(b2); row.addWidget(b3); row.addStretch(1)
                wr = QWidget(); wr.setLayout(row); v.addWidget(wr)
            q = QLabel('<small>%s</small>' % self.T('privacy')); q.setWordWrap(True); v.addWidget(q)
        build()
        return box
