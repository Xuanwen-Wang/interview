#!/usr/bin/env python3
"""Validate authored chapter references and portable build invariants."""
import ast
from datetime import date
import json
from collections import Counter
import re
from pathlib import Path
from urllib.parse import urlsplit, unquote
from html.parser import HTMLParser
from build import portable_readings

ROOT = Path(__file__).resolve().parent.parent
rows = [c for p in sorted((ROOT / 'content').glob('*.json')) for c in json.loads(p.read_text(encoding='utf-8'))]
chapters = {c['id']: c for c in rows}
aliases = {old: {'chapter': c['id'], **meta} for c in rows for old, meta in c.get('legacyChapters', {}).items() if old != c['id']}
errors = []
class AnchorCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.add(attrs['id'])

anchors = {}
for c in rows:
    collector = AnchorCollector()
    for s in c['sections']:
        collector.feed(s['html'])
    anchors[c['id']] = collector.ids | {s['id'] for s in c['sections']} | {s['id'] for s in c.get('readingStages', [])} | {'questions', 'takeaways', 'references', 'notes'}
    if c.get('readingStages'):
        assert [sid for stage in c['readingStages'] for sid in stage['sections']] == [s['id'] for s in c['sections']], f'Reading stages must cover every section exactly once in order: {c["id"]}'
    for old, meta in c.get('legacyChapters', {}).items():
        assert meta['section'] in anchors[c['id']], (old, meta)
        assert set(meta['anchors']) <= anchors[c['id']], f'Lost historical anchors: {old}'
catalog = json.loads((ROOT / 'config/navigation.json').read_text())
modules = {m['id']: m for m in catalog['modules']}
reports = json.loads((ROOT / 'config/interviews.json').read_text())
companies = json.loads((ROOT / 'config/companies.json').read_text())
company_map = {c['id']: c for c in companies}
jobs = json.loads((ROOT / 'config/jobs.json').read_text(encoding='utf-8'))
job_map = {j['id']: j for j in jobs}
assert len(job_map) == len(jobs), 'Duplicate job'
assert len({j['url'] for j in jobs}) == len(jobs), 'Duplicate job URL'
assert len(modules) == len(catalog['modules']), 'Duplicate module'
assert len(company_map) == len(companies), 'Duplicate company'
report_ids = {r['id'] for r in reports}
assert len(report_ids) == len(reports), 'Duplicate report'
placements = Counter(cid for m in modules.values() for g in m['groups'] for cid in g['chapters'])
assert set(placements) == set(chapters), f'Catalog mismatch: {set(placements) ^ set(chapters)}'
assert all(n == 1 for n in placements.values()), 'A chapter must have exactly one primary location'
for m in modules.values():
    assert re.fullmatch(r'[a-z0-9-]+', m['id'])
    assert len({g['id'] for g in m['groups']}) == len(m['groups']), m['id']
    for g in m['groups']:
        assert g['chapters'] and re.fullmatch(r'[a-z0-9-]+', g['id']), g
for m in modules.values():
    for step in m.get('learningPath', []):
        assert step['chapter'] in chapters and step['title'] and step['description'], step
for c in companies:
    assert set(c['reports']) <= report_ids and set(c['chapters']) <= set(chapters), c
for r in reports:
    assert r['category'] in {'job', 'report', 'takehome', 'reading'}, r
    assert all(r.get(k) for k in ['title','url','date','experience','topics','note','checked']), r
    assert urlsplit(r['url']).scheme == 'https' and urlsplit(r['url']).netloc, r
reference_source = (ROOT / 'practice/reference.py').read_text()
reference_functions = {node.name: ast.get_source_segment(reference_source, node) for node in ast.parse(reference_source).body if isinstance(node, (ast.FunctionDef, ast.ClassDef))}


def check_link(url, where):
    if url.startswith(('https://', 'http://')):
        assert urlsplit(url).netloc, url
        return
    if url.startswith('#'):
        parts = url[1:].split('/')
        if parts[0] == 'chapter':
            target = aliases.get(parts[1], {}).get('chapter', parts[1]) if len(parts) > 1 else None
            if target not in chapters:
                errors.append(f'{where}: missing chapter {url}')
            elif len(parts) > 2 and parts[2] not in anchors[target]:
                errors.append(f'{where}: missing section {url}')
        elif parts[0] == 'module':
            if len(parts) < 2 or parts[1] not in modules or (len(parts) > 2 and parts[2] not in {g['id'] for g in modules[parts[1]]['groups']}):
                errors.append(f'{where}: missing topic {url}')
        elif parts[0] == 'company':
            if len(parts) != 2 or parts[1] not in company_map:
                errors.append(f'{where}: missing company {url}')
        elif parts[0] == 'job':
            if len(parts) not in {2, 3} or parts[1] not in job_map or (len(parts) == 3 and parts[2] not in {'requirements', 'preparation'}):
                errors.append(f'{where}: missing job {url}')
        elif parts[0] not in {'home', 'catalog', 'companies', 'jobs', 'lab', 'sources', 'practice', 'notebook', 'glossary'}:
            errors.append(f'{where}: unsupported route {url}')
        return
    path, _, anchor = url.partition('#')
    target = (ROOT / unquote(path)).resolve()
    if not target.is_relative_to(ROOT) or not target.is_file():
        errors.append(f'{where}: missing source {url}')
    elif anchor and f'id="{anchor}"' not in target.read_text(encoding='utf-8'):
        errors.append(f'{where}: missing explicit source anchor {url}')

class CheckHTML(HTMLParser):
    def __init__(self, label):
        super().__init__()
        self.label, self.ids = label, set()
        self.reference, self.code = None, []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'pre' and a.get('data-reference'):
            self.reference, self.code = a['data-reference'], []
        if 'id' in a:
            if a['id'] in self.ids:
                errors.append(f'{self.label}: duplicate HTML id {a["id"]}')
            self.ids.add(a['id'])
        if tag == 'a' and a.get('href'):
            check_link(a['href'], self.label)
        if tag == 'svg' and ('viewbox' not in a or not a.get('aria-label')):
            errors.append(f'{self.label}: SVG requires viewBox and accessible label')

    def handle_data(self, data):
        if self.reference:
            self.code.append(data)
    def handle_endtag(self, tag):
        if tag == 'pre' and self.reference:
            if ''.join(self.code).strip() != reference_functions.get(self.reference, '').strip():
                errors.append(f'{self.label}: stale code example {self.reference}')
            self.reference = None

for job in jobs:
    assert re.fullmatch(r'[a-z0-9-]+', job['id']), job['id']
    assert job['status'] in {'listed', 'closed', 'unverified'}, job['id']
    assert job['origin'] in {'user', 'research'}, job['id']
    assert job['direction'] in {'硬件性能与软硬协同', '编译器与DSL', '算子与性能优化'}, job['id']
    for key in ['title', 'company', 'employment', 'experience', 'sourceId', 'checked', 'url', 'verification', 'summary']:
        assert isinstance(job.get(key), str) and job[key].strip(), (job['id'], key)
    assert urlsplit(job['url']).scheme == 'https' and urlsplit(job['url']).netloc, job['id']
    date.fromisoformat(job['checked'])
    if job.get('published'):
        date.fromisoformat(job['published'])
    for key in ['locations', 'responsibilities', 'requirements', 'preferred', 'keywords', 'chapters']:
        assert isinstance(job[key], list) and all(isinstance(v, str) and v.strip() for v in job[key]), (job['id'], key)
    assert job['requirements'] and job['responsibilities'] and job['chapters'], job['id']
    assert set(job['chapters']) <= set(chapters), job['id']
    assert job['relevance']['summary'] and job['relevance']['evidence'] and job['relevance']['prepare'], job['id']
    source = next((r for r in reports if r['id'] == job['sourceId']), None)
    if source:
        assert source['category'] == 'job' and source['url'] == job['url'], job['id']
assert {r['id'] for r in reports if r['category'] == 'job'} <= {j['sourceId'] for j in jobs}, 'Missing previously researched job'

for c in rows:
    assert len(c['sections']) >= 5, c['id']
    assert len(c['questions']) >= 3, c['id']
    assert not ({s['id'] for s in c['sections']} & {'questions', 'takeaways', 'references', 'notes'}), c['id']
    assert len({q.get('id', q['q']) for q in c['questions']}) == len(c['questions']), c['id']
    parser = CheckHTML(c['id'])
    parser.ids = {s['id'] for s in c['sections']} | {stage['id'] for stage in c.get('readingStages', [])} | {'questions', 'takeaways', 'references', 'notes'}
    for s in c['sections']:
        parser.feed(s['html'])
    for s in c['sources']:
        check_link(s['url'], c['id'])
    for q in c['questions']:
        assert q['q'] and q['a'] and q['followup'], (c['id'], q)

html = (ROOT / 'dist/index.html').read_text(encoding='utf-8')
assert 'const CHAPTERS =' in html
assert 'const JOBS =' in html
assert 'INLINE_' not in html
assert not re.search(r'<script[^>]+src=', html), 'Standalone HTML must not need script downloads'
assert not re.search(r'https?://[^\s"\']+\.(?:woff|ttf|css)', html), 'External asset dependency'
assert not re.search(r'(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_]{15,}', html)
assert not re.search(r'/data/wangxw/home|/home/wangxw|172\.16\.\d+\.\d+', html)
for filename, chapter_id in portable_readings(rows).items():
    portable = (ROOT / 'dist' / filename).read_text(encoding='utf-8')
    body = f'<body data-default-route="chapter/{chapter_id}">'
    assert portable.count(body) == 1, f'Portable entry must open its own chapter: {filename}'
    assert portable.replace(body, '<body>') == html, f'Portable entry must contain the same reviewed application: {filename}'
job_html = (ROOT / 'dist/jobs.html').read_text(encoding='utf-8')
assert job_html.count('<body data-default-route="jobs">') == 1
assert job_html.replace('<body data-default-route="jobs">', '<body>') == html, 'Jobs entry must contain the same application'

if errors:
    raise SystemExit('\n'.join(errors))
print(f'PASS: {len(modules)} modules, {len(rows)} chapters, {len(companies)} company groups, {len(reports)} reports; catalog ownership, code example parity, internal routes, source files/anchors, SVG labels, portable HTML and credential patterns checked.')
