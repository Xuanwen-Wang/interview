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

// Independent scalar-per-feature oracle with real E288/K8/TP4 and unequal EP loads.
// Reference evaluates complete experts; implementation combines rank partials.
for(const tokens of [8,16,24,32]) {
  const expert=(t,k)=>(t*17+k*29)%288;
  const alpha=k=>[0.125,0.125,0.25,0.25,0.25,0.375,0.5,0.625][k];
  const shard=(t,e,tp)=>(t+1)*(e+1)*(tp+1)/1024;
  const shared=(t,tp)=>(t+1)*(tp+1)/8;
  const partials=Array.from({length:16},(_,rank)=>Array.from({length:tokens},(_,t)=>{
    const ep=Math.floor(rank/4),tp=rank%4;
    let result=ep===0?shared(t,tp):0;
    for(let k=0;k<8;k++)if(Math.floor(expert(t,k)/72)===ep)result+=alpha(k)*shard(t,expert(t,k),tp);
    return result;
  }));
  const golden=Array.from({length:tokens},(_,t)=>{
    let result=(t+1)*10/8;
    for(let k=0;k<8;k++)result+=alpha(k)*(t+1)*(expert(t,k)+1)*10/1024;
    return result;
  });
  const combined=model.combine(partials);
  assert.deepEqual(combined.owners.flat(),golden);
  for(let owner=0;owner<4;owner++)for(let local=0;local<tokens/4;local++)assert.equal(combined.owners[owner][local],golden[owner*tokens/4+local]);
  const wrongWorld=Array.from({length:tokens},(_,t)=>combined.boards.reduce((sum,b)=>sum+4*b[t],0));
  assert.deepEqual(wrongWorld,golden.map(v=>4*v));
  assert.notDeepEqual(combined.owners.slice().reverse().flat(),golden,'Reversing ownership must be detected');
  const duplicatedShared=partials.map((row,r)=>row.map((v,t)=>v+(r>=4?shared(t,r%4):0)));
  assert.notDeepEqual(model.combine(duplicatedShared).owners.flat(),golden,'Repeated Shared must be detected');
}
assert.deepEqual(model.trace({step:4}).boards.map(b=>b[7]),[19.375,21.875,34.375,46.875]);
assert.equal(model.trace({step:5}).owners[1][1],122.5);
for(let t=0;t<24;t++)for(let lane=0;lane<4;lane++)for(let step=0;step<7;step++){
  const trace=model.trace({token:t,lane,step});
  const copies=trace.cards.filter(c=>c.rows.includes(t));
  assert.equal(copies.length,step>=2&&step<=4?4:1);
  assert.equal(trace.owner,Math.floor(t/6));assert.equal(trace.row,t%6);
  assert.equal(trace.cards[trace.owner].rank,trace.owner*4+lane);
}
for(const input of [{token:24},{token:-1},{lane:4},{step:7},{token:1.5}])assert.throws(()=>model.trace(input),RangeError);
for(const input of [[],Array(16).fill([1,2]),Array(16).fill([1,2,3,NaN])])assert.throws(()=>model.combine(input),RangeError);
// DSA B6 fixed-capacity wire accounting (including raw-score and LSE padding).
assert.equal(6*16*512*2+6*8192*4,288*1024);
assert.equal(6*64*512*2+4096,388*1024);
assert.equal(16*6*1024*2,4*6*4096*2);
console.log('MoE communication: asymmetric Top8 ownership, TP/EP sums, one Shared, token return, duplicate-sum and wrong-order counterexamples, all trace steps passed.');

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
