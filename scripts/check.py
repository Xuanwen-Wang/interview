#!/usr/bin/env python3
"""Validate authored chapter references and portable build invariants."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit, unquote
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parent.parent
rows = [c for p in sorted((ROOT / 'content').glob('*.json')) for c in json.loads(p.read_text())]
chapters = {c['id']: c for c in rows}
errors = []

def check_link(url, where):
    if url.startswith(('https://', 'http://')):
        assert urlsplit(url).netloc, url
        return
    if url.startswith('#'):
        parts = url[1:].split('/')
        if parts[0] == 'chapter':
            if len(parts) < 2 or parts[1] not in chapters:
                errors.append(f'{where}: missing chapter {url}')
            elif len(parts) > 2 and parts[2] not in ({s['id'] for s in chapters[parts[1]]['sections']} | {'questions', 'takeaways', 'references', 'notes'}):
                errors.append(f'{where}: missing section {url}')
        elif parts[0] not in {'home', 'lab', 'sources', 'practice', 'notebook', 'glossary'}:
            errors.append(f'{where}: unsupported route {url}')
        return
    path, _, anchor = url.partition('#')
    target = (ROOT / unquote(path)).resolve()
    if not target.is_relative_to(ROOT) or not target.is_file():
        errors.append(f'{where}: missing source {url}')
    elif anchor and f'id="{anchor}"' not in target.read_text():
        errors.append(f'{where}: missing explicit source anchor {url}')

class CheckHTML(HTMLParser):
    def __init__(self, label):
        super().__init__()
        self.label, self.ids = label, set()
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            if a['id'] in self.ids:
                errors.append(f'{self.label}: duplicate HTML id {a["id"]}')
            self.ids.add(a['id'])
        if tag == 'a' and a.get('href'):
            check_link(a['href'], self.label)
        if tag == 'svg' and ('viewbox' not in a or not a.get('aria-label')):
            errors.append(f'{self.label}: SVG requires viewBox and accessible label')

for c in rows:
    assert len(c['sections']) >= 5, c['id']
    assert len(c['questions']) >= 3, c['id']
    parser = CheckHTML(c['id'])
    for s in c['sections']:
        parser.feed(s['html'])
    for s in c['sources']:
        check_link(s['url'], c['id'])
    for q in c['questions']:
        assert q['q'] and q['a'] and q['followup'], (c['id'], q)

html = (ROOT / 'dist/index.html').read_text()
assert 'const CHAPTERS =' in html
assert 'INLINE_' not in html
assert not re.search(r'<script[^>]+src=', html), 'Standalone HTML must not need script downloads'
assert not re.search(r'https?://[^\s"\']+\.(?:woff|ttf|css)', html), 'External asset dependency'
assert not re.search(r'(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_]{15,}', html)
assert not re.search(r'/data/wangxw/home|/home/wangxw|172\.16\.\d+\.\d+', html)
if errors:
    raise SystemExit('\n'.join(errors))
print(f'PASS: {len(rows)} chapters; internal routes, source files/anchors, SVG labels, portable HTML and credential patterns checked.')
