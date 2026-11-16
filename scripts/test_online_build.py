"""Independent output contracts for online delivery and self-contained exports."""
import hashlib
import json
import re
import unittest

from build import ROOT, read_payload
from build_search import section_entries


class OnlineBuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = read_payload()
        cls.directory = ROOT / 'dist'

    def test_homepage_has_only_three_local_boot_assets(self):
        html = (self.directory / 'index.html').read_text()
        self.assertLess(len(html.encode()), 16000)
        assets = re.findall(r'(?:src|href)="(asset-[^"?]+)\?v=([0-9a-f]+)"', html)
        self.assertEqual({name for name, _ in assets}, {'asset-core.css', 'asset-core.js', 'asset-catalog.js'})
        for name, version in assets:
            self.assertEqual(hashlib.sha256((self.directory / name).read_bytes()).hexdigest()[:16], version)
        self.assertNotIn('const CHAPTERS', html)
        self.assertNotIn('asset-search', html)
        self.assertIn('interview-offline.html', html)

    def test_each_payload_preserves_every_authored_section_and_record(self):
        for chapter in self.payload['CHAPTERS']:
            with self.subTest(chapter=chapter['id']):
                actual = json.loads((self.directory / ('asset-chapter-' + chapter['id'] + '.json')).read_text())
                for key, value in chapter.items():
                    if key == 'portableReading':
                        self.assertEqual({k: actual[key][k] for k in value}, value)
                        self.assertTrue((self.directory / actual[key]['offlineFile']).is_file())
                    else:
                        self.assertEqual(actual[key], value)

    def test_search_preserves_nested_question_anchors_and_text(self):
        chapter = {'id': 'example', 'title': 'Example'}
        section = {'id': 'section', 'title': 'Section', 'html':
                   '<p>Context</p><details id="question-a" data-interview-question>'
                   '<summary>Why <code>A &amp; B</code>?</summary>'
                   '<div class="interview-answer-body"><p>First <b>answer</b>.</p></div></details>'}
        entries = section_entries(chapter, section)
        self.assertEqual(entries, [
            {'chapter': 'example', 'title': 'Section', 'subtitle': 'Example',
             'body': 'Section', 'link': '#chapter/example/section'},
            {'chapter': 'example', 'title': 'Why A & B?', 'subtitle': 'Section',
             'body': 'First answer.', 'link': '#chapter/example/question-a'}])
        section['html'] = '<p>First <b>line</b>.</p><svg><text>x &lt; y</text></svg>'
        self.assertEqual(section_entries(chapter, section)[0]['body'], 'First line.x < y')

    def test_search_covers_all_published_questions_without_html(self):
        entries = json.loads((self.directory / 'asset-search.json').read_text())
        question_links = {entry['link'] for entry in entries}
        for chapter in self.payload['CHAPTERS']:
            for section in chapter['sections']:
                for anchor in re.findall(r'<details\b[^>]*\bid="([^"]+)"[^>]*\bdata-interview-question', section['html']):
                    self.assertIn('#chapter/' + chapter['id'] + '/' + anchor, question_links)
        self.assertEqual({entry['chapter'] for entry in entries}, {c['id'] for c in self.payload['CHAPTERS']})

    def test_every_offline_entry_has_no_external_boot_dependency(self):
        offline = (self.directory / 'interview-offline.html').read_text()
        self.assertIn('const CHAPTERS =', offline)
        self.assertIn('const SITE = {};', offline)
        self.assertNotRegex(offline, r'<script[^>]+src=|<link[^>]+rel="stylesheet"')
        for chapter in self.payload['CHAPTERS']:
            self.assertIn(chapter['id'], offline)
        for path in self.directory.glob('*-offline.html'):
            with self.subTest(path=path.name):
                text = path.read_text()
                text = re.sub(r'<body data-default-route="(?:jobs|chapter/[a-z0-9-]+)">', '<body>', text)
                self.assertEqual(text, offline)


if __name__ == '__main__':
    unittest.main()
