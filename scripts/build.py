#!/usr/bin/env python3
"""Build a portable, dependency-free field guide from reviewed JSON content."""
import json
import re
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parent.parent

class ContentCheck(HTMLParser):
    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'iframe', 'object', 'embed', 'form'}:
            raise ValueError(f'Unexpected active content: {tag}')
        for key, value in attrs:
            if key.startswith('on') or (value and re.match(r'\s*(javascript|data):', value, re.I)):
                raise ValueError(f'Unexpected attribute: {key}')

def build():
    chapters = []
    for path in sorted((ROOT / 'content').glob('*.json')):
        rows = json.loads(path.read_text())
        assert isinstance(rows, list), path
        chapters.extend(rows)
    chapters.sort(key=lambda c: c['order'])
    ids = set()
    for c in chapters:
        for key in ['id', 'title', 'part', 'order', 'subtitle', 'minutes', 'level', 'tags', 'lead', 'sections', 'questions', 'sources', 'takeaways']:
            assert key in c, (c.get('id'), key)
        assert re.fullmatch(r'[a-z0-9-]+', c['id']) and c['id'] not in ids, c['id']
        ids.add(c['id'])
        section_ids = set()
        for section in c['sections']:
            assert re.fullmatch(r'[a-z0-9-]+', section['id']), section['id']
            assert section['id'] not in section_ids, section['id']
            section_ids.add(section['id'])
            ContentCheck().feed(section['html'])
        assert len(c['questions']) >= 3, c['id']
    template = (ROOT / 'web/index.html').read_text()
    data = json.dumps(chapters, ensure_ascii=False).replace('</', '<\\/')
    result = template.replace('/* INLINE_STYLE */', (ROOT / 'web/style.css').read_text())
    result = result.replace('/* INLINE_DATA */', f'const CHAPTERS = {data};')
    result = result.replace('/* INLINE_APP */', (ROOT / 'web/app.js').read_text())
    assert not re.search(r'/\* INLINE_\w+ \*/', result)
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    (out / 'index.html').write_text(result)
    (out / '.nojekyll').touch()
    manifest = {'chapters': len(chapters), 'sections': sum(len(c['sections']) for c in chapters), 'questions': sum(len(c['questions']) for c in chapters), 'characters': sum(len(re.sub('<[^>]+>', '', s['html'])) for c in chapters for s in c['sections']), 'bytes': len(result.encode())}
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(json.dumps(manifest, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    build()
