'use strict';
const assert = require('node:assert/strict');
const model = require('../web/cuda-guide.js');
let cases = 0;

// Enumerate feasible resident CTAs independently of the model's floor/min formula.
for (const threads of [128,256,512]) for (const registers of [32,64,96,128])
  for (const sharedKiB of [0,32,64,96,128,192,227]) {
    let feasible = 0;
    for(let n=0;n<=32;n++) if(n*threads<=2048 && n*threads*registers<=65536 && n*sharedKiB<=228) feasible=n;
    const result=model.occupancy(threads,registers,sharedKiB);
    assert.equal(result.blocks,feasible);
    assert.equal(result.percent,result.warps/64*100);
    assert.ok(result.percent>=0 && result.percent<=100);
    cases++;
  }
assert.equal(model.occupancy(256,64,64).blocks,3);
assert.equal(model.occupancy(256,64,96).blocks,2);
assert.throws(()=>model.occupancy(33,64,64),RangeError);
assert.throws(()=>model.occupancy(256,64,228),RangeError);

// Each intermediate cell must contain exactly the original contributions it claims.
// The final oracle is a direct column sum, independent of the ring schedule.
for(let p=2;p<=8;p++) for(let sample=0;sample<7;sample++) {
  const input=Array.from({length:p},(_,r)=>Array.from({length:p},(_,c)=>((r*29+c*11+sample*7)%47)-23));
  const original=JSON.stringify(input),states=model.ring(input);
  const sum=Array.from({length:p},(_,c)=>input.reduce((total,row)=>total+row[c],0));
  assert.equal(JSON.stringify(input),original);
  assert.equal(states.length,2*(p-1)+1);
  for(const state of states) {
    state.cells.forEach(row=>row.forEach((cell,c)=>{
      assert.equal(new Set(cell.owners).size,cell.owners.length,'No contributor may be added twice');
      assert.equal(cell.value,cell.owners.reduce((total,r)=>total+input[r][c],0));
    }));
    assert.ok(!state.transfers.length || state.transfers.length===p);
  }
  states[p-1].cells.forEach((row,r)=>{
    assert.equal(row[r].value,sum[r]);
    assert.equal(row[r].owners.length,p);
  });
  states.at(-1).cells.forEach(row=>assert.deepEqual(row.map(c=>c.value),sum));
  // Each rank sends one scalar chunk per round, matching the payload cost model.
  for(let r=0;r<p;r++) assert.equal(states.reduce((n,s)=>n+s.transfers.filter(t=>t.from===r).length,0),2*(p-1));
  cases++;
}
const demo=model.ring(Array.from({length:4},(_,r)=>Array.from({length:4},(_,c)=>10*r+c+1)));
assert.deepEqual(demo.at(-1).cells[0].map(c=>c.value),[64,68,72,76]);

const cost=model.communication(4,65536,2,50);
assert.equal(cost.sent,98304);
assert.equal(cost.latencyUs,12);
assert.ok(Math.abs(cost.transferUs-1.96608)<1e-10);
assert.ok(Math.abs(cost.totalUs-13.96608)<1e-10);
for(const p of [2,4,8,16]) for(const bytes of [65536,1048576,67108864]) {
  const c=model.communication(p,bytes,2,50),double=model.communication(p,2*bytes,2,50);
  assert.equal(double.transferUs,2*c.transferUs);
  assert.equal(double.latencyUs,c.latencyUs);
  assert.ok(Math.abs(c.busbw/c.algbw-2*(p-1)/p)<1e-12);
  assert.ok(c.busbw<50);
  cases++;
}
assert.throws(()=>model.communication(1,1024,2,50),RangeError);
assert.throws(()=>model.communication(4,1024,2,0),RangeError);

// Stable full-vector softmax is an independent oracle for the chunked recurrence.
for(const n of [1,2,7,31,129]) for(const tile of [1,2,5,16,64]) for(const shift of [-1000,0,1000]) {
  const scores=Array.from({length:n},(_,i)=>Math.sin(i*7)*13+shift);
  const values=Array.from({length:n},(_,i)=>Math.cos(i*3)*4);
  const max=Math.max(...scores),weights=scores.map(s=>Math.exp(s-max));
  const oracle=weights.reduce((sum,w,i)=>sum+w*values[i],0)/weights.reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(model.onlineAttention(scores,values,tile).value-oracle)<1e-11);
  cases++;
}
assert.ok(Math.abs(model.onlineAttention([0,Math.log(2)],[2,4],1).value-10/3)<1e-12);
assert.equal(model.onlineAttention([-Infinity,-Infinity],[2,4],1).value,0);
assert.notEqual((2+4)/2,10/3,'Per-partition normalized outputs cannot be averaged');
assert.notEqual(Math.max(0,-2)+Math.max(0,1),Math.max(0,-2+1),'ReLU does not commute with SUM');

// Byte-address enumeration for the two static memory figures.
const sectors=(stride,base=0)=>new Set(Array.from({length:32},(_,lane)=>
  Array.from({length:4},(_,b)=>Math.floor((base+lane*stride+b)/32))).flat()).size;
assert.equal(sectors(4),4); assert.equal(sectors(4,4),5); assert.equal(sectors(128),32);
assert.equal(new Set(Array.from({length:32},(_,r)=>(r*32)%32)).size,1);
assert.equal(new Set(Array.from({length:32},(_,r)=>(r*33)%32)).size,32);
console.log(`CUDA teaching models passed: ${cases} parameter cases, ring contribution conservation, softmax oracle, memory examples and counterexamples.`);

// Independent address checks: modular arithmetic, broadcast exception and layout roundtrip.
const gcd=(a,b)=>b?gcd(b,a%b):a;
for(let stride=1;stride<=32;stride++) {
  const r=model.bankPattern('stride',stride);
  assert.equal(r.passes,gcd(stride,32));
  assert.equal(r.used,32/gcd(stride,32));
  assert.equal(r.distinct,32);
}
for(let column=0;column<32;column++) {
  assert.equal(model.bankPattern('plain',1,column).passes,32);
  assert.equal(model.bankPattern('padded',1,column).passes,1);
  assert.equal(model.bankPattern('xor',1,column).passes,1);
  assert.equal(model.bankPattern('broadcast',1,column).passes,1);
  assert.equal(model.bankPattern('broadcast',1,column).distinct,1);
}
for(const layout of ['plain','padded','xor']) {
  const memory=new Map();
  for(let r=0;r<32;r++)for(let c=0;c<32;c++){
    const address=model.sharedWord(r,c,layout);
    assert.ok(!memory.has(address),'Each logical element has a unique physical word');
    memory.set(address,r*101+c*7-19);
  }
  assert.equal(memory.size,1024);
  for(let r=0;r<32;r++)for(let c=0;c<32;c++)
    assert.equal(memory.get(model.sharedWord(r,c,layout)),r*101+c*7-19);
}
// A producer using XOR and a consumer using plain layout is wrong for distinct input values.
assert.notEqual(model.sharedWord(1,0,'plain'),model.sharedWord(1,0,'xor'));
assert.throws(()=>model.bankPattern('bad'),RangeError);
assert.throws(()=>model.bankPattern('stride',0),RangeError);
assert.throws(()=>model.sharedWord(32,0,'plain'),RangeError);
console.log('Shared bank model passed: all 32 strides and columns, broadcast, 3 layout bijections and mismatch counterexample.');
