#!/usr/bin/env python3
"""Bundle the game into one self-contained HTML body (styles, font and scripts inlined).

usage: python3 tools/build-artifact.py <out.html>

The output omits <!doctype>/<html>/<head>/<body>, so it can be published as a
hosted page that supplies its own skeleton. Opening index.html directly is still
the normal way to play locally.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
read = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()

html = read('index.html')
title = re.search(r'<title>(.*?)</title>', html).group(1)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
scripts = re.findall(r'<script src="([^"]+)"></script>', body)
body = re.sub(r'\s*<script src="[^"]+"></script>', '', body).strip()

out = [f'<title>{title}</title>',
       '<meta name="theme-color" content="#ffdcc8">',
       '<style>', read('css/style.css'), '</style>',
       '<style>', read('css/font.css'), '</style>',
       body]
for s in scripts:
    out.append('<script>\n' + read(s) + '\n</script>')
dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'artifact.html')
os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
open(dest, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print(f'{dest}: {os.path.getsize(dest)} bytes, scripts={len(scripts)}')
