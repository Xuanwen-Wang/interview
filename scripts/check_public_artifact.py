#!/usr/bin/env python3
"""Reject unintended files and private document/contact content in Pages output.

This is a narrow publishing guard, not a general secret scanner. It checks all
generated HTML, including inline JSON, comments and hidden elements. Diagnostics
report categories only: they never echo a matching value or unexpected filename.
"""
import argparse
from collections import Counter
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_KEYS = {
    'modules', 'topics', 'companies', 'reports', 'diagrams', 'chapters',
    'sections', 'questions', 'characters', 'bytes', 'jobs',
}
PAYLOAD_DECLARATION = re.compile(
    r'^\s*const\s+(?:CHAPTERS|CATALOG|REPORTS|COMPANIES|JOBS|CYCLESIM_CASES)\s*=\s*', re.M)
PATTERNS = {
    'local filesystem path': re.compile(
        r'/(?:data/wangxw|home/wangxw)(?=/|[\s"\'<>]|$)', re.I),
    'internal host address': re.compile(
        r'(?<![\d.])(?:127\.(?:\d{1,3}\.){2}\d{1,3}'
        r'|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?![\d.])'),
    'private document reference': re.compile(
        r'[/\\#]resume(?=[/\\.#?\s"\'<>]|$)|\bresume[/\\]'
        r'|\b(?:resume|cv)(?:[-_][^<>"\'\s/]*)?\.(?:html?|pdf|tex|md)\b'
        r'|简历[^<>"\'\s/]*\.(?:html?|pdf|tex|md)\b'
        r'|\bcurriculum[-_ ]vitae\b'
        r'|(?:个人简历|下载简历|简历下载|简历编辑说明|简历修改说明)', re.I),
    'LaTeX document source': re.compile(
        r'\\(?:(?:documentclass|usepackage)\b|(?:begin|end)\s*\{document\})'
        r'|[\w./-]+\.(?:tex|bib|sty|cls)(?=[\s"\'<>?#]|$)', re.I),
    'private editing notes': re.compile(
        r'(?:简历|resume)[-_ /]*(?:editing|editorial|notes|draft)\b'
        r'|编辑说明|(?:简历|个人资料).{0,12}(?:修改记录|待修改|定稿说明)', re.I),
    'contact link': re.compile(r'\bmailto:|\b(?:tel|sms):\s*\+?\d', re.I),
    'email address': re.compile(r'(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+', re.I),
    'phone number': re.compile(
        r'(?<![\w])(?:\+?86[- \t\u00a0]?)?1[3-9][0-9](?:[- \t\u00a0]?[0-9]{4}){2}(?![\w])'),
    'contact field': re.compile(
        r'(?:联系电话|手机号码|微信号|联系邮箱|个人邮箱)\s*[:：]'
        r'|\b(?:phone|mobile|wechat)\s*[:：]\s*[+\w]', re.I),
    'embedded private document': re.compile(
        r'data:\s*(?:application/(?:pdf|x-latex|x-tex)|text/x-tex)', re.I),
}


def expected_files(root=ROOT):
    """Use the same portable entry declarations as the build, not a glob."""
    from build import portable_readings
    chapters = [chapter for path in sorted((root / 'content').glob('*.json'))
                for chapter in json.loads(path.read_text(encoding='utf-8'))]
    files = {'index.html', 'manifest.json', '.nojekyll', *portable_readings(chapters)}
    if (root / 'config/jobs.json').is_file():
        files.add('jobs.html')
    return files


def manifest_keys(expected):
    return MANIFEST_KEYS if 'jobs.html' in expected else MANIFEST_KEYS - {'jobs'}


def check_artifact_layout(directory, expected, *, allow_missing=False):
    """Do not follow links or delete unknown files, including stale build output."""
    if directory.is_symlink():
        return ['artifact directory is a symlink']
    if not directory.exists():
        return [] if allow_missing else ['artifact directory is missing']
    if not directory.is_dir():
        return ['artifact location is not a directory']
    errors = []
    present = set()
    for entry in directory.iterdir():
        present.add(entry.name)
        if entry.is_symlink():
            errors.append('symlink in artifact')
        elif not entry.is_file():
            errors.append('directory or special file in artifact')
        elif entry.name not in expected:
            errors.append('unexpected file in artifact')
    if not allow_missing and expected - present:
        errors.append('required generated file is missing')
    return errors


def normalized_text(text):
    # Cover HTML entities, URL encoding and JSON/JavaScript string escapes used
    # by the portable page; never execute any embedded JavaScript.
    for _ in range(2):
        text = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m[1], 16)), text)
        text = re.sub(r'\\x([0-9a-fA-F]{2})', lambda m: chr(int(m[1], 16)), text)
        text = unquote(unescape(text.replace(r'\/', '/').replace(r'\n', '\n').replace(r'\t', '\t')))
    return text


class DocumentText(HTMLParser):
    """Join inline text nodes without interpreting JavaScript as HTML."""
    BLOCKS = {'address', 'article', 'aside', 'blockquote', 'br', 'div', 'footer',
              'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main',
              'nav', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr', 'ul', 'ol'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.scripts = []
        self.ignored_tag = None

    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style'}:
            self.ignored_tag = tag
            self.parts.append('\n')
        elif not self.ignored_tag and tag in self.BLOCKS:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag == self.ignored_tag:
            self.ignored_tag = None
            self.parts.append('\n')
        elif not self.ignored_tag and tag in self.BLOCKS:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.ignored_tag:
            self.parts.append(data)
        elif self.ignored_tag == 'script':
            self.scripts.append(data)


def payload_document_text(scripts):
    """Read only build.py's JSON declarations, never arbitrary JavaScript."""
    parts = []
    decoder = json.JSONDecoder()
    for script in scripts:
        for declaration in PAYLOAD_DECLARATION.finditer(script):
            payload, end = decoder.raw_decode(script, declaration.end())
            if not isinstance(payload, (dict, list)) or not script[end:].lstrip().startswith(';'):
                raise ValueError('Unexpected inline payload format')
            pending = [payload]
            while pending:
                value = pending.pop()
                if isinstance(value, dict):
                    pending.extend(value.values())
                elif isinstance(value, list):
                    pending.extend(value)
                elif isinstance(value, str) and '<' in value:
                    document = DocumentText()
                    document.feed(value)
                    document.close()
                    parts.append(''.join(document.parts))
    return '\n'.join(parts)


def check_artifact(directory, expected):
    errors = check_artifact_layout(directory, expected)
    if errors:
        return errors
    for filename in sorted(expected):
        path = directory / filename
        try:
            raw = path.read_text(encoding='utf-8')
        except (UnicodeError, OSError):
            errors.append('unreadable or non-UTF-8 generated file')
            continue
        if filename == '.nojekyll':
            if raw:
                errors.append('nonempty Pages marker')
            continue
        if filename == 'manifest.json':
            try:
                manifest = json.loads(raw)
                valid = (isinstance(manifest, dict) and set(manifest) == manifest_keys(expected)
                         and all(type(value) is int and value >= 0 for value in manifest.values()))
            except ValueError:
                valid = False
            if not valid:
                errors.append('unexpected manifest content')
            continue
        text = normalized_text(filename + '\n' + raw)
        document = DocumentText()
        document.feed(raw)
        document.close()
        document_text = normalized_text(''.join(document.parts))
        try:
            payload_text = normalized_text(payload_document_text(document.scripts))
        except ValueError:
            errors.append('invalid known inline payload')
            payload_text = ''
        if '\x00' in text:
            errors.append('binary content in generated HTML')
        for category, pattern in PATTERNS.items():
            if pattern.search(text) or pattern.search(document_text) or pattern.search(payload_text):
                errors.append(category)
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    try:
        expected = expected_files()
        errors = check_artifact(args.dist, expected)
    except (OSError, ValueError, AssertionError):
        raise SystemExit('FAIL: unable to validate public artifact configuration') from None
    if errors:
        counts = Counter(errors)
        raise SystemExit('FAIL: public artifact rejected\n' + '\n'.join(
            f'- {category} ({count})' for category, count in sorted(counts.items())))
    print(f'PASS: {len(expected)} allowed Pages files; no private document or contact patterns found.')


if __name__ == '__main__':
    main()
