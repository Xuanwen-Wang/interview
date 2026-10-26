#!/usr/bin/env python3
"""Synthetic regression cases for the Pages boundary; never read private files."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from check_public_artifact import (
    ROOT, check_artifact, check_artifact_layout, expected_files, main, manifest_keys,
)


class PublicArtifactTests(unittest.TestCase):
    def setUp(self):
        temporary_root = Path(os.environ.get('TMPDIR') or os.environ.get('RUNNER_TEMP')
                              or '/data/wangxw/tmp')
        temporary_root.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='public-artifact-', dir=temporary_root)
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.directory = self.base / 'dist'
        self.directory.mkdir()
        self.expected = expected_files()
        for filename in self.expected:
            if filename == 'manifest.json':
                text = json.dumps(dict.fromkeys(manifest_keys(self.expected), 1))
            elif filename == '.nojekyll':
                text = ''
            else:
                text = '<!doctype html><title>Attention guide</title><p>Q × K</p>'
            (self.directory / filename).write_text(text, encoding='utf-8')

    def check(self):
        return check_artifact(self.directory, self.expected)

    def test_clean_synthetic_artifact(self):
        self.assertEqual(self.check(), [])

    def test_clean_real_build(self):
        self.assertTrue((ROOT / 'dist/index.html').is_file(), 'Run scripts/build.py first')
        self.assertEqual(check_artifact(ROOT / 'dist', self.expected), [])

    def test_checkout_without_jobs_source_has_matching_artifact_contract(self):
        source = self.base / 'legacy-source'
        (source / 'content').mkdir(parents=True)
        (source / 'content/example.json').write_text('[]')
        legacy_expected = expected_files(source)
        self.assertNotIn('jobs.html', legacy_expected)
        self.assertNotIn('jobs', manifest_keys(legacy_expected))
        legacy_dist = self.base / 'legacy-dist'
        legacy_dist.mkdir()
        for name in legacy_expected:
            text = (json.dumps(dict.fromkeys(manifest_keys(legacy_expected), 1)) if name == 'manifest.json'
                    else '' if name == '.nojekyll' else '<p>Public guide</p>')
            (legacy_dist / name).write_text(text)
        self.assertEqual(check_artifact(legacy_dist, legacy_expected), [])
        (source / 'config').mkdir()
        (source / 'config/jobs.json').write_text('[]')
        current_expected = expected_files(source)
        self.assertIn('jobs.html', current_expected)
        self.assertIn('jobs', manifest_keys(current_expected))
        self.assertIn('required generated file is missing', check_artifact(legacy_dist, current_expected))
        (legacy_dist / 'jobs.html').write_text('<p>Jobs guide</p>')
        self.assertIn('unexpected manifest content', check_artifact(legacy_dist, current_expected))

    def test_unknown_root_files(self):
        for filename in ['notes.md', 'candidate.pdf', 'draft.tex', '.env', 'old-guide.html']:
            with self.subTest(filename=filename):
                path = self.directory / filename
                path.write_text('synthetic private material')
                self.assertIn('unexpected file in artifact', self.check())
                path.unlink()

    def test_nested_files_and_hidden_directories(self):
        for dirname in ['resume', 'assets', '.git']:
            with self.subTest(dirname=dirname):
                path = self.directory / dirname
                path.mkdir()
                (path / 'notes.txt').write_text('synthetic note')
                self.assertIn('directory or special file in artifact', self.check())
                (path / 'notes.txt').unlink()
                path.rmdir()

    def test_symlinked_file_directory_and_root(self):
        outside = self.base / 'outside.html'
        outside.write_text('synthetic outside content')
        entry = self.directory / 'index.html'
        entry.unlink()
        entry.symlink_to(outside)
        self.assertIn('symlink in artifact', self.check())
        self.assertIn('symlink in artifact', check_artifact_layout(
            self.directory, self.expected, allow_missing=True))
        entry.unlink()
        entry.symlink_to(self.base, target_is_directory=True)
        self.assertIn('symlink in artifact', self.check())
        root_link = self.base / 'linked-dist'
        root_link.symlink_to(self.directory, target_is_directory=True)
        self.assertEqual(check_artifact(root_link, self.expected), ['artifact directory is a symlink'])

    def test_missing_and_stale_entries(self):
        (self.directory / 'index.html').unlink()
        self.assertIn('required generated file is missing', self.check())
        self.assertEqual(check_artifact_layout(self.directory, self.expected, allow_missing=True), [])
        stale = self.directory / 'obsolete.html'
        stale.write_text('old output')
        self.assertIn('unexpected file in artifact', check_artifact_layout(
            self.directory, self.expected, allow_missing=True))
        self.assertTrue(stale.exists(), 'Validation must not silently remove files')

    def test_private_references_and_sources_in_every_html(self):
        examples = [
            '<a href="../resume/current.pdf">Read</a>',
            '<a href="https://example.invalid/private/cv.pdf">Read</a>',
            '<a href="resume-final.pdf">Read</a>',
            '<a href="cv-final.pdf">Read</a>',
            '<a href="简历.pdf">Read</a>',
            '<a href="/%72esume/current.html">Read</a>',
            '<script>const ref="\\u002fresume\\u002fcurrent.pdf"</script>',
            '<script>const ref="https:\\/\\/example.invalid\\/resume\\/"</script>',
            '<a href="sources/document.tex">Source</a>',
            r'<pre>\documentclass{article}</pre>',
            r'<pre>\begin{document}Synthetic text\end{document}</pre>',
            '<div hidden>个人简历</div>',
            '<!-- 简历编辑说明：此处待修改 -->',
            '<!-- 编辑说明：synthetic draft -->',
            '<object data="data:application/pdf;base64,c3ludGhldGlj"></object>',
        ]
        html_files = sorted(name for name in self.expected if name.endswith('.html'))
        for number, content in enumerate(examples):
            with self.subTest(example=number):
                path = self.directory / html_files[number % len(html_files)]
                old = path.read_text()
                path.write_text(content)
                self.assertTrue(self.check())
                path.write_text(old)

    def test_contact_patterns_in_comments_hidden_dom_and_inline_data(self):
        examples = [
            '<!-- synthetic.person@example.invalid -->',
            '<div hidden>synthetic.person&#64;example.invalid</div>',
            '<script>const email="synthetic.person\\u0040example.invalid"</script>',
            '<a href="mailto:synthetic.person@example.invalid">Contact</a>',
            '<a href="tel:+12025550123">Contact</a>',
            '<p>13800000000</p>',
            '<p>138-0000-0000</p>',
            '<p>+86 138 0000 0000</p>',
            '<p>synthetic.person<span>@</span>example.invalid</p>',
            '<p><span>synthetic.person</span><span>&#64;</span><b>example.invalid</b></p>',
            '<p><span>138</span>-<span>0000</span>-<span>0000</span></p>',
            '<p>微信号：synthetic-only</p>',
        ]
        for number, content in enumerate(examples):
            with self.subTest(example=number):
                (self.directory / 'index.html').write_text(content)
                self.assertTrue(self.check())

    def test_non_html_support_files_cannot_carry_private_text(self):
        (self.directory / '.nojekyll').write_text('synthetic.person@example.invalid')
        self.assertIn('nonempty Pages marker', self.check())
        (self.directory / '.nojekyll').write_text('')
        (self.directory / 'manifest.json').write_text('{"notes": "private draft"}')
        self.assertIn('unexpected manifest content', self.check())

    def test_public_papers_math_and_resume_learning_css_remain_allowed(self):
        (self.directory / 'index.html').write_text(
            '<a href="https://arxiv.org/pdf/2405.04434">Paper</a>'
            '<p>面试准备可参考简历中的项目。LaTeX 公式：x^2</p>'
            '<style>.resume-card { color: green }</style>'
            '<button>Resume reading</button><p>You can resume a paused session.</p>'
            '<script>const resumeReading = true;</script>'
            '<code>print("visible SMs:", 10)</code>'
            '<script>const code="import triton\\n@triton.jit\\ndef kernel(): pass";</script>')
        self.assertEqual(self.check(), [])

    def test_document_text_does_not_reinterpret_javascript_or_join_blocks(self):
        (self.directory / 'index.html').write_text(
            '<p>synthetic.person</p><p>@example.invalid</p>'
            '<script>const example = "synthetic.person<span>@</span>example.invalid";'
            'const comparison = left < right && right > 0;</script>'
            '<style>/* synthetic.person<span>@</span>example.invalid */</style>')
        self.assertEqual(self.check(), [])

    def test_known_build_payloads_check_rendered_html_text(self):
        examples = [
            ('CHAPTERS', [{'sections': [{'html': '<p>synthetic.person<span>@</span>example.invalid</p>'}]}],
             'email address'),
            ('CHAPTERS', [{'sections': [{'html': '<p><span>138</span>-<b>0000</b>-<i>0000</i></p>'}]}],
             'phone number'),
            ('JOBS', [{'summary': '<p>synthetic.person<span>@</span>example.invalid</p>'}], 'email address'),
            ('REPORTS', [{'note': '<p>synthetic.person<span>@</span>example.invalid</p>'}], 'email address'),
            ('COMPANIES', [{'description': '<p>synthetic.person<span>@</span>example.invalid</p>'}], 'email address'),
            ('CATALOG', {'modules': [{'description': '<p>synthetic.person<span>@</span>example.invalid</p>'}]},
             'email address'),
        ]
        for name, value, category in examples:
            with self.subTest(payload=name, category=category):
                payloads = dict.fromkeys(['CHAPTERS', 'CATALOG', 'REPORTS', 'COMPANIES', 'JOBS'], [])
                payloads[name] = value
                # Match build.py's JSON serialization and separate app script.
                data = '\n'.join('const ' + key + ' = ' + json.dumps(item, ensure_ascii=False).replace('</', '<\\/')
                                 + ';' for key, item in payloads.items())
                (self.directory / 'index.html').write_text(
                    '<!doctype html><body><main></main><script>' + data + '</script>'
                    '<script>const comparison = left < right && right > 0;</script></body>')
                self.assertEqual(self.check(), [category])

    def test_unknown_javascript_payload_is_not_parsed_as_html(self):
        data = json.dumps([{'html': '<p>synthetic.person<span>@</span>example.invalid</p>'}])
        (self.directory / 'index.html').write_text('<script>const EXAMPLE = ' + data + ';</script>')
        self.assertEqual(self.check(), [])

    def test_known_payload_must_be_json_not_a_javascript_expression(self):
        for declaration in ['const CHAPTERS = getChapters();', 'const CHAPTERS = [].concat(extra);']:
            with self.subTest(declaration=declaration):
                (self.directory / 'index.html').write_text('<script>' + declaration + '</script>')
                self.assertEqual(self.check(), ['invalid known inline payload'])

    def test_failure_diagnostics_do_not_echo_sensitive_value(self):
        secret = 'synthetic.person@example.invalid'
        (self.directory / 'index.html').write_text(secret)
        with patch.object(sys, 'argv', ['check_public_artifact.py', '--dist', str(self.directory)]):
            with self.assertRaises(SystemExit) as result:
                main()
        self.assertNotIn(secret, str(result.exception))
        self.assertIn('email address', str(result.exception))
        (self.directory / (secret + '.pdf')).write_text('synthetic')
        with patch.object(sys, 'argv', ['check_public_artifact.py', '--dist', str(self.directory)]):
            with self.assertRaises(SystemExit) as result:
                main()
        self.assertNotIn(secret, str(result.exception))


if __name__ == '__main__':
    unittest.main()
