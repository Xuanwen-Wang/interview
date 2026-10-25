'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../web/moe-explorer.js');

// Independent ownership reconstruction: every expert has four distinct shards,
// and each rank owns exactly 72 expert shards, covering all 288 full experts.
const rankCounts=Array(16).fill(0), shards=new Set();
for(let expert=0;expert<288;expert++)for(let tp=0;tp<4;tp++){
  const owner=Math.floor(expert/72), m=model.inspect({expert,ep:owner,tp});
  const rank=m.owner*4+tp;
  assert.equal(m.firstExpert+m.localExpert,expert);
  assert.equal(m.lastI-m.firstI+1,512);
  shards.add(`${expert}:${m.firstI}:${m.lastI}`);rankCounts[rank]++;
  assert.equal(m.rank,rank);
  assert.deepEqual(m.tpGroup,[owner*4,owner*4+1,owner*4+2,owner*4+3]);
  assert.deepEqual(m.epLane,[tp,tp+4,tp+8,tp+12]);
}
assert.equal(shards.size,288*4);
assert(rankCounts.every(n=>n===72));
for(const tokens of [8,16,24,32]){
  const ranks=Array.from({length:16},(_,rank)=>model.inspect({tokens,ep:Math.floor(rank/4),tp:rank%4}));
  assert.equal(ranks.reduce((sum,m)=>sum+m.fp8RoutedRank,0),288*3*4096*2048);
  assert.equal(ranks.reduce((sum,m)=>sum+m.bf16SharedRank,0),3*4096*2048*2);
  assert.equal(ranks[0].bf16GlobalTokens,tokens*4096*2);
  assert.equal(ranks[0].bf16LocalTokens*4,ranks[0].bf16GlobalTokens);
  assert.equal(ranks[0].bf16OtherCards+ranks[0].bf16LocalTokens,ranks[0].bf16GlobalTokens);
  assert.equal(ranks[0].balancedCardSlots*4,tokens*8);
}
const t24=model.inspect();
assert.equal(t24.bf16GlobalTokens,192*1024);
assert.equal(t24.fp8ExpertRank,6*1048576);
assert.equal(t24.fp8RoutedRank,432*1048576);
assert.equal(t24.fp8RoutedCard,1728*1048576);
assert.equal(t24.bf16SharedRank,12*1048576);
for(const input of [{tokens:7},{tokens:0},{tokens:24.5},{tokens:Infinity},{ep:4},{tp:-1},{expert:288},{expert:1.5}])assert.throws(()=>model.inspect(input),RangeError);

// Old chapters may share generic anchor names; routing must use chapter-local
// maps without injecting those names as duplicate DOM ids in the new chapter.
const chapters=[{id:'moe-new',legacyChapters:{oldA:{section:'router',anchors:['shape'],anchorMap:{shape:'router-shape'}},oldB:{section:'routed',anchors:['shape'],anchorMap:{shape:'routed-shape'}}},questions:[{id:'new-routing',q:'Repeated title',legacyKeys:['oldA:old-routing']},{id:'other-routing',q:'Repeated title',legacyKeys:['oldB:old-routing']}]}];
const context=vm.createContext({CHAPTERS:chapters,CATALOG:{modules:[{id:'moe',legacyGroups:{'moe-kernels':'moe-foundation'}}]},location:{hash:''},document:{body:{dataset:{}}},state:{notes:{oldA:'Original note'}}});
vm.runInContext(fs.readFileSync(require.resolve('../web/reading.js'),'utf8'),context);
const route=hash=>{context.location.hash=hash;return JSON.parse(JSON.stringify(vm.runInContext('currentRoute()',context)));};
assert.deepEqual(route('#chapter/oldA/shape'),['chapter','moe-new','router-shape']);
assert.deepEqual(route('#chapter/oldB/shape'),['chapter','moe-new','routed-shape']);
assert.deepEqual(route('#chapter/oldA'),['chapter','moe-new','router']);
assert.deepEqual(route('#chapter/oldA/notes'),['chapter','moe-new','note-oldA']);
assert.deepEqual(route('#module/moe/moe-kernels'),['module','moe','moe-foundation']);
const app=fs.readFileSync(require.resolve('../web/app.js'),'utf8');
vm.runInContext(app.slice(app.indexOf('function normalizeState('),app.indexOf('function readStorage(')),context);
context.raw={readingVersion:2,read:['oldA'],notes:{oldA:'Original note'},practice:{'oldA:old-routing':'weak','oldB:old-routing':'good'},last:'oldA'};
const migrated=JSON.parse(JSON.stringify(vm.runInContext('normalizeState(raw)',context)));
assert.deepEqual(migrated.read,[]);
assert.deepEqual(migrated.legacyRead,['oldA']);
assert.equal(migrated.notes.oldA,'Original note');
assert.equal(migrated.last,'moe-new');
assert.equal(migrated.practice['moe-new:new-routing'],'weak');
assert.equal(migrated.practice['moe-new:other-routing'],'good');
assert.equal(migrated.practice['moe-new:Repeated title'],undefined);
console.log('MoE model: 1152 expert shards, weight totals, T8/16/24/32 tensor budgets, legacy routes/notes/read/practice migration passed. This is tensor accounting, not performance measurement.');
