"""web/fonts/*.woff2 → fccore/fonts/*.ttf (Qt woff2 okuyamaz). latin + latin-ext alt kümeleri tek dosyada birleştirilir.
Kullanım: python3 tools/build_fonts.py [web/fonts klasörü]   (fonttools + brotli gerekir)"""
import os, sys, tempfile
from fontTools.ttLib import TTFont
from fontTools.merge import Merger

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'fccore', 'fonts')


def web_fonts_dir():
    if len(sys.argv) > 1:
        return sys.argv[1]
    for c in (os.path.join(HERE, '..', '..', 'web', 'fonts'), '/home/claude/ortak-cekirdek/web/fonts'):
        if os.path.isdir(c):
            return c
    raise SystemExit('web/fonts bulunamadı')


def to_ttf(src, dst):
    f = TTFont(src)
    f.flavor = None
    f.save(dst)


def main():
    src = web_fonts_dir()
    os.makedirs(OUT, exist_ok=True)
    tmp = tempfile.mkdtemp()
    for w in (400, 500, 600, 700):
        parts = []
        for s in ('latin', 'latin-ext'):
            p = os.path.join(tmp, f'inter-{s}-{w}.ttf')
            to_ttf(os.path.join(src, f'inter-{s}-{w}-normal.woff2'), p)
            parts.append(p)
        m = Merger().merge(parts)
        m.save(os.path.join(OUT, f'Inter-{w}.ttf'))
        to_ttf(os.path.join(src, f'noto-sans-arabic-arabic-{w}-normal.woff2'), os.path.join(OUT, f'NotoSansArabic-{w}.ttf'))
    for lic in ('LICENSE-Inter.txt', 'LICENSE-NotoSansArabic.txt'):
        with open(os.path.join(src, lic), 'rb') as a, open(os.path.join(OUT, lic), 'wb') as b:
            b.write(a.read())
    print('yazıldı', sorted(os.listdir(OUT)))


if __name__ == '__main__':
    main()
