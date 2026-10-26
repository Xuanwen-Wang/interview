'use strict';

// Consolidating published pages must not lose saved links or browser records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const chapters = fs.readdirSync(path.join(root, 'content')).filter(f=>f.endsWith('.json')).flatMap(f=>read('content/'+f));
const catalog = read('config/navigation.json');
const moduleEntry = catalog.modules.find(m=>m.id==='interviews');
assert.deepEqual(moduleEntry.groups.flatMap(g=>g.chapters), ['interview-jobs','interview-sessions','seed-hardware-mock']);
const jobs = chapters.find(c=>c.id==='interview-jobs');
const sessions = chapters.find(c=>c.id==='interview-sessions');
const mock = chapters.find(c=>c.id==='seed-hardware-mock');
const interviewBooks = [sessions, mock];
assert.equal(jobs.portableReading.file, 'interview-jobs.html');
assert.equal(sessions.portableReading.file, 'interview-questions.html');
assert.equal(mock.portableReading.file, 'interview-seed-hardware.html');
const inventory = read('evidence/interview-question-coverage.json');
const questionIds = book => book.sections.flatMap(s=>[...s.html.matchAll(/<details\b[^>]*\bid="([^"]+)"[^>]*\bdata-interview-question/g)].map(m=>m[1]));
const answerIds = interviewBooks.flatMap(questionIds);
assert.equal(new Set(answerIds).size, answerIds.length, 'Duplicate question anchors');
assert.deepEqual([...answerIds].sort(), inventory.questions.map(q=>q.id).sort());
for (const book of interviewBooks) assert.equal(book.interviewQuestionCount, questionIds(book).length);
assert.equal(interviewBooks.reduce((n,book)=>n+book.interviewSessionCount,0), inventory.sessions);
for (const q of inventory.questions) {
  const owner = chapters.find(c=>c.id===(q.chapter||sessions.id));
  assert(owner?.sections.some(s=>s.id===q.session && s.html.includes('id="'+q.id+'"')));
}
assert.equal(questionIds(sessions).length, 328);
assert.equal(questionIds(mock).length, 30);
assert(!sessions.sections.some(s=>s.id==='mock-byte-seed-hardware'));

// Counts audited against the supplied material, not inferred from the rendered page.
const sourceCoverage = {F01:15,F02:22,F03:12,F04:17,F05:10,F06:4,F07:6,F08:6,F09:2,F10:8,F11:2,F12:22,F20:9,F21:13,F22:3,F23:13,F24:16,F25:10,F26:20,F27:3,F28:13,F29:4,P48:48};
for (const [source,count] of Object.entries(sourceCoverage)) {
  assert.equal(inventory.questions.filter(q=>q.source===source).length,count, 'Lost source question: '+source);
}

// These are the externally published pre-merge anchors, independent of the new layout.
const historical = {
  'interview-evidence-map':['evidence','dates','roles','answer','practice','extend'],
  'interview-bytedance':['sources','fusion','warp-specialization','compiler','moe','rehearsal'],
  'interview-chipmakers':['matrix','tile','transpose','backend','automatic','cross'],
  'interview-internet':['mlir','internet','graph','nvidia','system','bridge'],
  'interview-official-takehomes':['sources','contract','schedule','allocation','performance','delivery']
};
const ctx = vm.createContext({CHAPTERS:chapters,CATALOG:catalog,location:{hash:''},document:{body:{dataset:{}}},state:{notes:{}}});
vm.runInContext(fs.readFileSync(path.join(root,'web/reading.js'),'utf8'),ctx);
const run = code => JSON.parse(JSON.stringify(vm.runInContext(code,ctx)));
const anchors = new Set([...sessions.sections.map(s=>s.id),...sessions.readingStages.map(s=>s.id),...answerIds]);
for (const [old, sections] of Object.entries(historical)) {
  assert.deepEqual(sessions.legacyChapters[old].anchors, sections);
  for (const section of sections) {
    ctx.location.hash = '#chapter/'+old+'/'+section;
    const route = run('currentRoute()');
    assert.equal(route[1], sessions.id);
    assert(anchors.has(route[2]), 'Lost old anchor '+old+'/'+section);
  }
}
// Published mock links move only their exact anchors, never the whole old book.
for (const anchor of ['mock-byte-seed-hardware', ...Array.from({length:30},(_,i)=>'qm-seed-'+String(i+1).padStart(2,'0'))]) {
  ctx.location.hash = '#chapter/interview-sessions/'+anchor;
  assert.deepEqual(run('currentRoute()'), ['chapter','seed-hardware-mock',anchor]);
  ctx.location.hash = '#chapter/seed-hardware-mock/'+anchor;
  assert.deepEqual(run('currentRoute()'), ['chapter','seed-hardware-mock',anchor]);
}
for (const anchor of [null,'notes','fs-byte-infra-r3','qa-infra3-intro','qm-seed-31','qm-seed-01-extra']) {
  ctx.location.hash = '#chapter/interview-sessions'+(anchor?'/'+anchor:'');
  assert.equal(run('currentRoute()')[1], 'interview-sessions');
}
const app = fs.readFileSync(path.join(root,'web/app.js'),'utf8');
vm.runInContext(app.slice(app.indexOf('function normalizeState('),app.indexOf('function readStorage(')),ctx);
for (const readingVersion of [1,2]) {
  const notes = Object.fromEntries(Object.keys(historical).map(id=>[id,'Saved note: '+id]));
  const legacyQuestion = sessions.questions.find(q=>q.legacyKeys?.length);
  ctx.raw = {readingVersion,notes,read:Object.keys(historical),last:'interview-bytedance',practice:{[legacyQuestion.legacyKeys[0]]:'weak'}};
  const migrated = run('normalizeState(raw)');
  assert.deepEqual(migrated.notes,notes);
  assert.deepEqual(migrated.read,[]);
  assert.deepEqual(migrated.legacyRead.sort(),Object.keys(historical).sort());
  assert.equal(migrated.last,'interview-sessions');
  assert.equal(migrated.practice[sessions.id+':'+legacyQuestion.id],'weak');
  ctx.state=migrated;
  ctx.location.hash='#chapter/interview-bytedance/notes';
  assert.equal(run('currentRoute()')[2],'note-interview-bytedance');
}
ctx.raw={readingVersion:2,notes:{'interview-sessions':'Existing whole-book note'},read:['interview-sessions'],last:'interview-sessions'};
const splitState=run('normalizeState(raw)');
assert.deepEqual(splitState.notes,ctx.raw.notes);
assert.deepEqual(splitState.read,['interview-sessions']);
assert.equal(splitState.last,'interview-sessions');
assert(!splitState.read.includes('seed-hardware-mock'));
console.log(`Interview pages: 3 portable entries, ${inventory.sessions} sessions/material groups, ${answerIds.length} question anchors; historical routes, 31 moved anchors and note/read/practice preservation passed.`);
