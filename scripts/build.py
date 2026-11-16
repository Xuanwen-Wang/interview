#!/usr/bin/env python3
"""Build a portable, dependency-free field guide from reviewed JSON content."""
import base64
import binascii
import hashlib
import json
import re
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parent.parent

STYLE_FILES = ['style.css', 'catalog.css', 'pe-explorer.css', 'pe-memory-explorer.css', 'pe-weight-layout.css', 'moe-explorer.css', 'performance-explorer.css', 'decode-explorer.css', 'attention-lab.css', 'lowering-explorer.css', 'sync-explorer.css', 'cyclesim-explorer.css', 'deepseek-architecture.css', 'cuda-guide.css', 'cuda-execution.css', 'reading.css', 'vp-architecture.css', 'vp-capacity.css', 'vp-operator-lab.css', 'jobs.css', 'communication-lab.css', 'math-foundations.css', 'pe-architecture.css']
SCRIPT_FILES = ['runtime.js', 'catalog.js', 'reading.js', 'pe-model.js', 'pe-explorer.js', 'pe-memory-model.js', 'pe-memory-explorer.js', 'pe-weight-layout.js', 'pe-architecture.js', 'moe-explorer.js', 'performance-explorer.js', 'decode-explorer.js', 'attention-lab.js', 'lowering-explorer.js', 'sync-explorer.js', 'cyclesim-model.js', 'cyclesim-diagrams.js', 'cyclesim-explorer.js', 'deepseek-architecture.js', 'cuda-guide.js', 'cuda-execution.js', 'communication-lab.js', 'math-foundations.js', 'jobs.js', 'vp-architecture.js', 'vp-capacity.js', 'vp-operator-lab.js', 'app.js']
CORE_STYLES = {'style.css', 'catalog.css', 'reading.css', 'jobs.css'}
CORE_SCRIPTS = {'runtime.js', 'catalog.js', 'reading.js', 'jobs.js', 'app.js'}


def json_text(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')


def declarations(payload):
    return '\n'.join(('let' if name == 'CYCLESIM_CASES' else 'const') + ' ' + name + ' = ' + json_text(value) + ';'
                     for name, value in payload.items())


def read_payload(root=ROOT):
    chapters = [chapter for path in sorted((root / 'content').glob('*.json'))
                for chapter in json.loads(path.read_text(encoding='utf-8'))]
    chapters.sort(key=lambda c: c['order'])
    payload = {'CHAPTERS': chapters}
    for name, filename in [('CATALOG', 'navigation'), ('REPORTS', 'interviews'), ('COMPANIES', 'companies'),
                           ('JOBS', 'jobs'), ('CYCLESIM_CASES', 'cyclesim-cases')]:
        payload[name] = json.loads((root / 'config' / (filename + '.json')).read_text(encoding='utf-8'))
    return payload


def offline_entries(chapters):
    entries = {'interview-offline.html': None, 'jobs-offline.html': 'jobs'}
    entries.update({filename.removesuffix('.html') + '-offline.html': 'chapter/' + chapter
                    for filename, chapter in portable_readings(chapters).items()})
    assert not set(entries) & (set(portable_readings(chapters)) | set(interactive_readings(chapters)))
    return entries


def online_filenames(chapters):
    return {'asset-core.css', 'asset-core.js', 'asset-reading.css', 'asset-reading.js',
            'asset-catalog.js', 'asset-search.json', 'asset-cases.json',
            'asset-questions.json', 'asset-sources.json',
            *('asset-chapter-' + chapter['id'] + '.json' for chapter in chapters)}


def online_bundle(root, payload):
    """Declare versioned public assets; never copy arbitrary files."""
    from build_search import chapter_search
    files = {}

    def asset(label, suffix, text):
        filename = 'asset-' + label + '.' + suffix
        files[filename] = text
        return filename + '?v=' + hashlib.sha256(text.encode()).hexdigest()[:16]

    def bundle(names):
        return '\n'.join((root / 'web' / name).read_text(encoding='utf-8') for name in names)

    style = asset('core', 'css', bundle(n for n in STYLE_FILES if n in CORE_STYLES))
    script = asset('core', 'js', bundle(n for n in SCRIPT_FILES if n in CORE_SCRIPTS))
    site = {'online': True,
            'chapterStyle': asset('reading', 'css', bundle(n for n in STYLE_FILES if n not in CORE_STYLES)),
            'chapterScript': asset('reading', 'js', bundle(n for n in SCRIPT_FILES if n not in CORE_SCRIPTS)),
            'chapters': {},
            'search': asset('search', 'json', json_text(chapter_search(payload['CHAPTERS']))),
            'cases': asset('cases', 'json', json_text(payload['CYCLESIM_CASES']))}
    chapters = []
    for original in payload['CHAPTERS']:
        chapter = dict(original)
        if 'portableReading' in chapter:
            portable = chapter['portableReading']
            chapter['portableReading'] = {**portable, 'offlineFile': portable['file'].removesuffix('.html') + '-offline.html'}
        site['chapters'][chapter['id']] = asset('chapter-' + chapter['id'], 'json', json_text(chapter))
        chapters.append({**chapter, 'sources': [], 'takeaways': [],
                         'questions': [{k: v for k, v in q.items() if k in {'id', 'q', 'legacyKeys'}} for q in chapter['questions']],
                         'sections': [{k: v for k, v in s.items() if k != 'html'} for s in chapter['sections']]})
    questions = [{**q, 'chapter': c['id'], 'title': c['title'], 'part': c['part'], 'key': c['id'] + ':' + q.get('id', q['q'])}
                 for c in payload['CHAPTERS'] for q in c['questions']]
    sources = [{**s, 'chapter': c['id'], 'chapterTitle': c['title']} for c in payload['CHAPTERS'] for s in c['sources']]
    site['questions'] = asset('questions', 'json', json_text(questions))
    site['sources'] = asset('sources', 'json', json_text(sources))
    data = asset('catalog', 'js', declarations({**payload, 'CHAPTERS': chapters, 'CYCLESIM_CASES': {}, 'SITE': site}))
    return files, style, data, script

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

def interactive_readings(chapters):
    """Declare reviewed standalone applications without globbing web assets."""
    entries = {}
    portable = portable_readings(chapters)
    reserved = {'index.html', 'jobs.html', 'interview-offline.html', 'jobs-offline.html', *portable,
                *(name.removesuffix('.html') + '-offline.html' for name in portable)}
    for chapter in chapters:
        interactive = chapter.get('interactiveReading')
        if interactive is None:
            continue
        assert all(isinstance(interactive.get(key), str) and interactive[key]
                   for key in ['file', 'download', 'label']), chapter['id']
        filename = interactive['file']
        assert re.fullmatch(r'[a-z0-9-]+\.html', filename), filename
        assert re.fullmatch(r'[a-z0-9-]+\.html', interactive['download']), chapter['id']
        assert filename not in reserved and filename not in entries, filename
        entries[filename] = chapter['id']
    return entries

class ContentCheck(HTMLParser):
    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'iframe', 'object', 'embed', 'form'}:
            raise ValueError(f'Unexpected active content: {tag}')
        for key, value in attrs:
            # Permit offline raster figures only, never active SVG/data documents.
            if tag == 'image' and key == 'href' and value and value.startswith('data:image/png;base64,'):
                try:
                    png = base64.b64decode(value.partition(',')[2], validate=True)
                except (ValueError, binascii.Error) as error:
                    raise ValueError('Invalid embedded PNG') from error
                if not png.startswith(b'\x89PNG\r\n\x1a\n'):
                    raise ValueError('Invalid embedded PNG signature')
                continue
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
    payload = read_payload()
    styles = '\n'.join((ROOT / 'web' / name).read_text(encoding='utf-8') for name in STYLE_FILES)
    scripts = '\n'.join((ROOT / 'web' / name).read_text(encoding='utf-8') for name in SCRIPT_FILES)
    result = template.replace('/* INLINE_STYLE */', styles).replace('/* INLINE_DATA */', declarations({**payload, 'SITE': {}}))
    result = result.replace('/* INLINE_APP */', scripts)
    assets, style, data, script = online_bundle(ROOT, payload)
    online = template.replace('<style>/* INLINE_STYLE */</style>', f'<link rel="stylesheet" href="{style}">')
    online = online.replace('<script>/* INLINE_DATA */</script>', f'<script defer src="{data}"></script>')
    online = online.replace('<script>/* INLINE_APP */</script>', f'<script defer src="{script}"></script>')
    assert not re.search(r'/\* INLINE_\w+ \*/', result + online)
    out = ROOT / 'dist'
    from check_public_artifact import check_artifact_layout, expected_files
    layout_errors = check_artifact_layout(out, expected_files(ROOT), allow_missing=True)
    if layout_errors:
        raise SystemExit('Refusing to overwrite dist: ' + '; '.join(sorted(set(layout_errors))))
    out.mkdir(exist_ok=True)
    (out / 'index.html').write_text(online, encoding='utf-8')
    (out / 'jobs.html').write_text(online.replace('<body>', '<body data-default-route="jobs">'), encoding='utf-8')
    for filename, chapter_id in portable_readings(chapters).items():
        (out / filename).write_text(online.replace('<body>', f'<body data-default-route="chapter/{chapter_id}">'), encoding='utf-8')
    for filename, route in offline_entries(chapters).items():
        page = result.replace('<body>', f'<body data-default-route="{route}">') if route else result
        (out / filename).write_text(page, encoding='utf-8')
    for filename, content in assets.items():
        (out / filename).write_text(content, encoding='utf-8')
    for filename in interactive_readings(chapters):
        source = ROOT / 'web' / filename
        assert source.is_file() and not source.is_symlink(), filename
        (out / filename).write_bytes(source.read_bytes())
    (out / '.nojekyll').touch()
    manifest = {'modules': len(payload['CATALOG']['modules']), 'topics': sum(len(m['groups']) for m in payload['CATALOG']['modules']), 'companies': len(payload['COMPANIES']), 'reports': len(payload['REPORTS']), 'diagrams': sum(s['html'].count('<svg') for c in chapters for s in c['sections']), 'chapters': len(chapters), 'sections': sum(len(c['sections']) for c in chapters), 'questions': sum(len(c['questions']) for c in chapters), 'characters': sum(len(re.sub('<[^>]+>', '', s['html'])) for c in chapters for s in c['sections']), 'bytes': len(result.encode())}
    manifest['bytes'] = len(online.encode())
    manifest['jobs'] = len(payload['JOBS'])
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(manifest, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    build()
