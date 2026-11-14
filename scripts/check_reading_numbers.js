'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const chapters = fs.readdirSync(path.join(root, 'content')).filter(f=>f.endsWith('.json'))
  .flatMap(f=>JSON.parse(fs.readFileSync(path.join(root, 'content', f), 'utf8')));
const ctx = vm.createContext({CHAPTERS:chapters});
const app = fs.readFileSync(path.join(root, 'web/app.js'), 'utf8');
vm.runInContext(app.slice(0, app.indexOf('const STORE_KEY')), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'web/reading.js'), 'utf8'), ctx);
const run = code => JSON.parse(JSON.stringify(vm.runInContext(code, ctx)));
const labels = (html, pattern) => [...html.matchAll(pattern)].map(m=>[m[1],m[2]]);
const bodyLabels = html => labels(html, /<section id="([^"]+)" data-section="[^"]+"><h[23]><span class="sec-no">([^<]+)<\/span>/g);
const tocLabels = html => labels(html, /data-toc="([^"]+)"><span class="toc-no">([^<]+)<\/span>/g);

// Renumbering an earlier part must not change the coordinates in a later part.
ctx.fixture = {
  id:'fixture',
  sections:[
    {id:'first',title:'16 KiB blocks',html:'<h3>Unnumbered explanation</h3>'},
    {id:'second',title:'1.5 TB of data',html:'<h3 id="child">1. First detail</h3><h3>2. Second detail</h3><h3>1.5 TB</h3><p>Step 1. External chapter 7.</p><svg><text>1. Copy</text></svg>'}
  ],
  readingStages:[
    {id:'part-a',title:'First & part',summary:'',sections:['first']},
    {id:'part-b',title:'Second part',summary:'',sections:['second']}
  ]
};
const renderFixture = () => run('chapterSectionsHTML(fixture)');
assert.deepEqual(bodyLabels(renderFixture()), [['first','1.1'],['second','2.1']]);
ctx.fixture.sections.splice(1,0,{id:'inserted',title:'Inserted',html:''});
ctx.fixture.readingStages[0].sections.push('inserted');
assert.deepEqual(bodyLabels(renderFixture()), [['first','1.1'],['inserted','1.2'],['second','2.1']]);
ctx.fixture.readingStages.reverse();
ctx.fixture.sections = [ctx.fixture.sections[2],ctx.fixture.sections[0],ctx.fixture.sections[1]];
assert.deepEqual(bodyLabels(renderFixture()), [['second','1.1'],['first','2.1'],['inserted','2.2']]);
const html = renderFixture();
assert(html.includes('<h4 id="child"><span class="subsec-no">1.1.1</span> First detail'));
assert(html.includes('<h4><span class="subsec-no">1.1.2</span> Second detail'));
for (const unchanged of ['<h4>Unnumbered explanation</h4>', '<h4>1.5 TB</h4>', '<span>16 KiB blocks</span>', '<span>1.5 TB of data</span>', '<p>Step 1. External chapter 7.</p>', '<svg><text>1. Copy</text></svg>']) assert(html.includes(unchanged), unchanged);
assert(html.includes('First &amp; part'));
delete ctx.fixture.readingStages;
assert.deepEqual(bodyLabels(renderFixture()), [['second','一、'],['first','二、'],['inserted','三、']]);
assert(renderFixture().includes('<h3 id="child"><span class="subsec-no">1.1</span> First detail'));
for (const [n,label] of [[1,'一'],[9,'九'],[10,'十'],[11,'十一'],[20,'二十'],[30,'三十'],[99,'九十九']]) {
  assert.equal(run(`sectionOrdinal(${n})`),label);
}

// The published PE outline is the motivating case: its fourth part starts at
// 4.1 even though fifteen sections precede it in the source file.
ctx.pe = chapters.find(c=>c.id==='hw-memory-hierarchy');
const peLabels = new Map(bodyLabels(run('chapterSectionsHTML(pe)')));
assert.deepEqual(['act-al1-storage','weight-physical','pe-weight-formatter','pe-weight-hardware-address','mt-fields'].map(id=>peLabels.get(id)), ['4.1','4.2','4.3','4.4','5.1']);

let sectionCount = 0;
for (const chapter of chapters) {
  ctx.chapter = chapter;
  const body = run('chapterSectionsHTML(chapter)');
  const toc = run('chapterTocHTML(chapter)');
  const entries = bodyLabels(body);
  assert.deepEqual(tocLabels(toc), entries, chapter.id+' TOC/body mismatch');
  assert.deepEqual(entries.map(([id])=>id),chapter.sections.map(s=>s.id),chapter.id+' lost/reordered anchors');
  assert.equal(new Set(entries.map(([,label])=>label)).size,entries.length,chapter.id+' repeated section numbers');
  for (const [id] of entries) assert(toc.includes(`href="#chapter/${chapter.id}/${id}"`));
  if (chapter.readingStages) {
    const stageBody = [...body.matchAll(/<h2><span class="sec-no">([^<]+)<\/span>/g)].map(m=>m[1]);
    const stageToc = [...toc.matchAll(/<summary><span class="toc-no">([^<]+)<\/span>/g)].map(m=>m[1]);
    assert.deepEqual(stageBody,stageToc,chapter.id+' part heading mismatch');
    assert.equal(stageBody.length,chapter.readingStages.length);
    for (const label of stageBody) assert(run('readingPathHTML(chapter)').includes(`<small>${label}</small>`));
  }
  assert(!/<h[34][^>]*>\s*\d+\.\s+/.test(body),chapter.id+' old inner heading ordinal');
  sectionCount += entries.length;
}
console.log(`Reading numbers: ${chapters.length} chapters / ${sectionCount} sections; TOC/body/path agreement, insertion/reordering, flat chapters, nested headings and stable anchors passed.`);
