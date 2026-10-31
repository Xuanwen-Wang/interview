'use strict';
const assert = require('node:assert/strict');
const {pipeline, fragment} = require('../web/cuda-execution.js');
let configurations=0;
for (const warps of [1,2,3,4,5,6,7,8]) for (const chains of [1,2,4])
  for (const width of [8,32]) for (const depth of [1,4,8,12]) {
    const m=pipeline(warps,chains,width,depth);
    assert.equal(m.instructions.length,16*warps);
    assert(m.utilization>0 && m.utilization<=1);
    for (let i=1;i<m.instructions.length;i++)
      assert(m.instructions[i].issue-m.instructions[i-1].issue>=32/width);
    for (let w=0;w<warps;w++) {
      const owned=m.instructions.filter(i=>i.warp===w);
      assert.deepEqual(owned.map(i=>i.index),Array.from({length:16},(_,i)=>i));
      for (let chain=0;chain<chains;chain++) {
        const seq=owned.filter(i=>i.chain===chain);
        for(let i=1;i<seq.length;i++) assert(seq[i].issue>=seq[i-1].ready);
      }
    }
    assert.equal(m.cycles.at(-1).reason,'complete');
    assert.equal(m.cycles.at(-1).pending.length,0);
    assert.equal(m.cycles.at(-1).cycle,m.completion);
    assert.equal(m.completion,Math.max(...m.instructions.map(i=>i.ready)));
    // An idle, available entrance may not ignore a ready head instruction.
    for(const c of m.cycles) if(c.reason==='dependency') assert.equal(c.candidates.length,0);
    if(warps===1 && chains===1) assert.equal(m.completion,16*(depth+32/width-1));
    configurations++;
  }
assert.equal(pipeline(1,4,32,4).utilization,1);
assert.equal(pipeline(4,1,32,4).utilization,1);
assert.equal(pipeline(1,1,32,4).completion,64);
assert.equal(pipeline(1,4,32,4).completion,19);
assert.equal(pipeline(1,1,8,4).latency,7);
assert.equal(pipeline(1,1,8,4).batches,4);
for(const bad of [[0,1,32,4],[1,3,32,4],[1,1,16,4],[1,1,32,0]])
  assert.throws(()=>pipeline(...bad),RangeError);
// Tiny event counterexamples: program order alone does not order completion.
// Values are small integers; these are contract examples, not GPU execution.
function hazard(kind, wait) {
 let r2=1, observed;
 for(let t=0;t<=9;t++) {
  if(kind!=='WAR' && t===8) r2=10; // Earlier load returns.
  if(kind==='WAR' && t===3) observed=r2; // Earlier store captures its source.
  if(kind==='RAW' && t===(wait?8:2)) observed=2*r2+1;
  if(kind==='WAR' && t===(wait?3:1)) r2=7;
  if(kind==='WAW' && t===(wait?8:1)) r2=7;
 }
 return kind==='WAW'?r2:observed;
}
assert.deepEqual(['RAW','WAR','WAW'].map(k=>hazard(k,true)),[21,1,7]);
assert.deepEqual(['RAW','WAR','WAW'].map(k=>hazard(k,false)),[3,7,10]);

// Independent inverse maps: iterate logical coordinates, not lane fragments.
const inverse={
 A:(r,c)=>[(r%8)*4+Math.floor((c%8)/2),Math.floor(r/8)*2+Math.floor(c/8)*4+c%2],
 B:(r,c)=>[c*4+Math.floor((r%8)/2),Math.floor(r/8)*2+r%2],
 D:(r,c)=>[(r%8)*4+Math.floor(c/2),Math.floor(r/8)*2+c%2],
};
for(const op of ['A','B','D']) {
 const columns=op==='A'?16:8, seen=new Set();
 for(let lane=0;lane<32;lane++) fragment(lane,op).forEach(([r,c],i)=>{
  assert(r>=0 && r<16 && c>=0 && c<columns);
  assert(!seen.has(`${r},${c}`)); seen.add(`${r},${c}`);
  assert.deepEqual(inverse[op](r,c),[lane,i]);
 });
 assert.equal(seen.size,16*columns);
}
assert.deepEqual(fragment(7,'D'),[[1,6],[1,7],[9,6],[9,7]]);
const A=Array.from({length:16},(_,r)=>Array.from({length:16},(_,k)=>(7*r+3*k)%11-5));
const B=Array.from({length:16},(_,k)=>Array.from({length:8},(_,c)=>(5*k+2*c)%7-3));
const packed={A:[],B:[]};
for(let lane=0;lane<32;lane++) {
 packed.A.push(fragment(lane,'A').map(([r,c])=>A[r][c]));
 packed.B.push(fragment(lane,'B').map(([r,c])=>B[r][c]));
}
const fetch=(op,r,c)=>{const [lane,i]=inverse[op](r,c);return packed[op][lane][i];};
let outputs=0, wrongLaneCounterexample=false;
for(let lane=0;lane<32;lane++) for(const [r,c] of fragment(lane,'D')) {
 let direct=0,reconstructed=0,wrong=0;
 for(let k=0;k<16;k++) {
  direct+=A[r][k]*B[k][c];
  reconstructed+=fetch('A',r,k)*fetch('B',k,c);
  wrong+=fetch('A',r,k)*fetch('B',k,Math.floor(lane/4));
 }
 assert.equal(reconstructed,direct); outputs++;
 if(wrong!==direct) wrongLaneCounterexample=true;
}
assert(wrongLaneCounterexample);
assert.throws(()=>fragment(32,'A'),RangeError);
console.log(`CUDA execution: ${configurations} pipeline configurations; 512 fragment coordinates; ${outputs} integer GEMM outputs; hazard and wrong-column counterexamples passed. No GPU execution.`);
