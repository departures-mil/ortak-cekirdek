import os
import shutil
import subprocess
import sys

import pytest

os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
FIX = os.path.join(ROOT, 'tests', 'fixtures')


def web_dir():
    for c in (os.environ.get('FC_WEB_DIR'), os.path.join(ROOT, '..', 'web'), '/home/claude/ortak-cekirdek/web'):
        if c and os.path.isfile(os.path.join(c, 'tools', 'schemes.js')):
            return os.path.abspath(c)
    return None


def node():
    return shutil.which('node')


@pytest.fixture(autouse=True)
def mem_storage():
    from fccore import storage, i18n
    storage.use(None)
    i18n._reset()
    i18n.set('tr')
    yield


@pytest.fixture(scope='session')
def qapp():
    from PySide6.QtWidgets import QApplication
    app = QApplication.instance() or QApplication([])
    yield app
