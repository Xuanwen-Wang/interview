#!/usr/bin/env python3
"""Build a portable, dependency-free field guide from reviewed JSON content."""
import json
import re
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parent.parent

def portable_readings(chapters):
    entries = {}
    for chapter in chapters:
        portable = chapter.get('portableReading')
        if portable is None:
            continue
        assert chapter.get('readingStages'), f'Portable reading requires a reading path: {chapter["id"]}'
        assert all(isinstance(portable.get(key), str) and portable[key] for key in ['file', 'download', 'label']), chapter['id']
        assert re.fullmatch(r'[a-z0-9-]+\.html', portable['file']), portable
        assert re.fullmatch(r'[a-z0-9-]+\.html', portable['download']), portable
        assert portable['file'] not in {'index.html', 'jobs.html'} and portable['file'] not in entries, portable['file']
        entries[portable['file']] = chapter['id']
    return entries

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
        rows = json.loads(path.read_text(encoding='utf-8'))
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
    template = (ROOT / 'web/index.html').read_text(encoding='utf-8')
    payload = {'CHAPTERS': chapters, 'CATALOG': json.loads((ROOT / 'config/navigation.json').read_text(encoding='utf-8')), 'REPORTS': json.loads((ROOT / 'config/interviews.json').read_text(encoding='utf-8')), 'COMPANIES': json.loads((ROOT / 'config/companies.json').read_text(encoding='utf-8'))}
    payload['JOBS'] = json.loads((ROOT / 'config/jobs.json').read_text(encoding='utf-8'))
    data = '\n'.join(f'const {name} = ' + json.dumps(value, ensure_ascii=False).replace('</', '<\\/') + ';' for name, value in payload.items())
    result = template.replace('/* INLINE_STYLE */', '\n'.join((ROOT / 'web' / name).read_text(encoding='utf-8') for name in ['style.css', 'catalog.css', 'pe-explorer.css', 'moe-explorer.css', 'reading.css', 'jobs.css']))
    result = result.replace('/* INLINE_DATA */', data)
    result = result.replace('/* INLINE_APP */', '\n'.join((ROOT / 'web' / name).read_text(encoding='utf-8') for name in ['catalog.js', 'reading.js', 'pe-model.js', 'pe-explorer.js', 'moe-explorer.js', 'jobs.js', 'app.js']))
    assert not re.search(r'/\* INLINE_\w+ \*/', result)
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    (out / 'index.html').write_text(result, encoding='utf-8')
    (out / 'jobs.html').write_text(result.replace('<body>', '<body data-default-route="jobs">'), encoding='utf-8')
    for filename, chapter_id in portable_readings(chapters).items():
        (out / filename).write_text(result.replace('<body>', f'<body data-default-route="chapter/{chapter_id}">'), encoding='utf-8')
    (out / '.nojekyll').touch()
    manifest = {'modules': len(payload['CATALOG']['modules']), 'topics': sum(len(m['groups']) for m in payload['CATALOG']['modules']), 'companies': len(payload['COMPANIES']), 'reports': len(payload['REPORTS']), 'diagrams': sum(s['html'].count('<svg') for c in chapters for s in c['sections']), 'chapters': len(chapters), 'sections': sum(len(c['sections']) for c in chapters), 'questions': sum(len(c['questions']) for c in chapters), 'characters': sum(len(re.sub('<[^>]+>', '', s['html'])) for c in chapters for s in c['sections']), 'bytes': len(result.encode())}
    manifest['jobs'] = len(payload['JOBS'])
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(manifest, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    build()
