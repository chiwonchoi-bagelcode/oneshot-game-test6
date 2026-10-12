#!/usr/bin/env python3
"""Build css/font.css: a Jua (SIL OFL 1.1) subset containing only the glyphs the game uses.

Collects every character from the game sources, asks the Google Fonts css2 API for a
text-subset of Jua, and embeds the resulting woff2 as a data URI so the game works
offline and from file://.
"""
import base64, glob, os, re, sys, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = glob.glob(os.path.join(ROOT, 'js', '*.js')) + [os.path.join(ROOT, 'index.html')]
chars = set(chr(c) for c in range(32, 127))
for f in files:
    with open(f, encoding='utf-8') as fh:
        chars.update(fh.read())
chars = ''.join(sorted(c for c in chars if c.isprintable() and ord(c) >= 32))
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
url = 'https://fonts.googleapis.com/css2?family=Jua&display=block&text=' + urllib.parse.quote(chars)
css = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA})).read().decode()
m = re.search(r'url\((https://[^)]+)\)', css)
if not m:
    sys.exit('no font url in response:\n' + css)
data = urllib.request.urlopen(urllib.request.Request(m.group(1), headers={'User-Agent': UA})).read()
b64 = base64.b64encode(data).decode()
out = os.path.join(ROOT, 'css', 'font.css')
with open(out, 'w', encoding='utf-8') as fh:
    fh.write('/* Jua by Woowa Brothers (BM JUA), SIL Open Font License 1.1 — subset for this game. See fonts/OFL.txt */\n')
    fh.write("@font-face { font-family: 'Jua'; font-style: normal; font-weight: 400; font-display: block;\n")
    fh.write("  src: url(data:font/woff2;base64," + b64 + ") format('woff2'); }\n")
print(f'{len(chars)} chars, {len(data)} bytes woff2 -> {out}')
