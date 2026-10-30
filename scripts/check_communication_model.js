'use strict';
const assert=require('node:assert/strict');
const model=require('../web/communication-lab.js');
const fs=require('node:fs');
const path=require('node:path');
let cases=0;

// Coordinate-level oracles do not reuse the model's routing or reduction functions.
for(let p=2;p<=8;p++)for(const op of ['allreduce','broadcast','allgather','reducescatter','alltoall']) {
  const {input,output}=model.collective(op,p);
  for(let r=0;r<p;r++)for(let c=0;c<output[r].length;c++) {
    const cell=output[r][c];
    assert.equal(new Set(cell.origins.map(o=>`${o.rank}:${o.index}`)).size,cell.origins.length);
    const expected=op==='allreduce'?10*p*(p-1)/2+p*(c+1):op==='reducescatter'?10*p*(p-1)/2+p*(r+1):op==='allgather'?10*c+1:op==='alltoall'?10*c+r+1:c+1;
    assert.equal(cell.value,expected);
    assert.equal(cell.value,cell.origins.reduce((sum,o)=>sum+input[o.rank][o.index].value,0));
  }
  if(op==='alltoall') {
    const sources=output.flat().flatMap(c=>c.origins).map(o=>`${o.rank}:${o.index}`);
    assert.equal(sources.length,p*p);assert.equal(new Set(sources).size,p*p);
    // Applying the exchange twice restores the original matrix.
    assert.deepEqual(output.map((_,r)=>output.map(row=>row[r].value)),input.map(row=>row.map(c=>c.value)));
  }
  if(op==='reducescatter')assert.deepEqual(output.flatMap(row=>row.map(c=>c.value)),model.collective('allreduce',p).output[0].map(c=>c.value));
  cases++;
}
assert.throws(()=>model.collective('unknown'));

// A small dense multiplication provides an independent oracle for TP partial SUM.
const x=[[2,-1,3],[0,4,1]],w=[[1,2],[3,4],[-2,5]];
const dense=x.map(row=>w[0].map((_,h)=>row.reduce((sum,v,j)=>sum+v*w[j][h],0)));
const parts=[0,1,2].map(j=>x.map(row=>w[j].map(v=>row[j]*v)));
for(let t=0;t<2;t++)for(let h=0;h<2;h++)assert.equal(parts.reduce((s,p)=>s+p[t][h],0),dense[t][h]);
for(const p of [2,4,8])for(const tokens of [8,128,2048]) {
  const r=model.tp(tokens,p);assert.equal(r.localI*p,12288);assert.equal(r.payload,tokens*4096*2);
  assert.equal(r.ringSent,2*(p-1)*(r.payload/p));cases++;
}
assert.equal(model.tp(8,4).ringSent,98304);

// Route bijection, counts and inverse packing must hold for uneven and empty messages.
for(const pattern of ['balanced','hotspot','local']) {
  const m=model.moe(pattern);assert.equal(m.routes.length,64);assert.equal(m.loads.reduce((a,b)=>a+b),64);
  assert.equal(new Set(m.routes.map(r=>`${r.source}:${r.token}:${r.slot}`)).size,64);
  const packed=Array.from({length:4},()=>Array(16));
  for(const r of m.routes){assert.equal(packed[r.source][r.packedIndex],undefined);packed[r.source][r.packedIndex]=r;assert.equal(r.destination,Math.floor(r.expert/2));}
  for(let s=0;s<4;s++) {
    assert.equal(m.counts[s].reduce((a,b)=>a+b),16);assert.ok(packed[s].every(Boolean));
    for(let d=0;d<4;d++)assert.ok(packed[s].slice(m.offsets[s][d],m.offsets[s][d]+m.counts[s][d]).every(r=>r.destination===d));
    for(let t=0;t<8;t++) {
      const routed=m.routes.filter(r=>r.source===s&&r.token===t);assert.equal(routed.length,2);assert.equal(routed[0].weight+routed[1].weight,1);
      const restored=packed[s].filter(r=>r.token===t).sort((a,b)=>a.slot-b.slot);
      assert.deepEqual(restored,routed);
      const expected=routed.reduce((sum,r)=>sum+r.weight*(t+1+r.expert),0);
      assert.equal(restored.reduce((sum,r)=>sum+r.weight*(t+1+r.expert),0),expected);
    }
  }
  assert.equal(m.remote,m.counts.reduce((total,row,s)=>total+row.reduce((sum,n,d)=>sum+(d===s?0:n),0),0));
  assert.ok(m.deduplicatedBytes<=m.expandedBytes);cases++;
}
assert.equal(model.moe('local').remote,0);
assert.deepEqual(model.moe('hotspot').loads,[0,0,0,0,0,0,32,32]);
assert.equal(model.moe('hotspot').expandedBytes,384*1024);
assert.equal(model.moe('hotspot').deduplicatedBytes,192*1024);

// A valid schedule cannot start before readiness or overlap its single communication queue.
for(const cap of [1,2,4])for(const alpha of [1,2,6]) {
  const s=model.buckets(cap,alpha);let previous=0;
  for(const e of s.events){assert.ok(e.start>=4*(e.last+1));assert.ok(e.start>=previous);assert.ok(e.end>e.start);previous=e.end;}
  assert.ok(s.end>=s.computeEnd);assert.ok(s.end<=s.serial);assert.equal(s.events.reduce((n,e)=>n+e.bytes,0),4*65536);cases++;
}
// Neither extreme bucket size wins for every fixed-overhead regime.
assert.ok(model.buckets(1,1).end<model.buckets(4,1).end);
assert.ok(model.buckets(1,6).end>model.buckets(2,6).end);

assert.equal(model.handshake('correct').at(-1).safe,true);
assert.ok(model.handshake('stale').every(s=>!s.safe));
const stale=model.handshake('stale')[1];assert.equal(stale.flag,stale.expected);assert.equal(stale.payload,42);assert.equal(stale.safe,false);
const generation=model.handshake('generation');assert.notEqual(generation[0].flag,generation[0].expected);assert.equal(generation.at(-1).payload,99);

// A nonlinear consumer cannot be moved before the rank reduction.
const rms=v=>{const scale=Math.sqrt(v.reduce((s,x)=>s+x*x,0)/v.length);return v.map(x=>x/scale);};
const after=rms([1,1]),before=rms([1,0]).map((x,i)=>x+rms([0,1])[i]);
assert.deepEqual(after,[1,1]);assert.ok(Math.abs(before[0]-Math.sqrt(2))<1e-12);assert.notDeepEqual(before,after);

// Embedded, offline examples and checked-in runnable files must remain identical.
const chapter=JSON.parse(fs.readFileSync(path.join(__dirname,'../content/25-cuda-communication.json'),'utf8'))[0];
const html=chapter.sections.map(s=>s.html).join('\n');
const examples=[...html.matchAll(/<pre data-comm-example="([^"]+)"><code>([\s\S]*?)<\/code><\/pre>/g)];
assert.equal(examples.length,2);
for(const [,name,encoded] of examples) {
  const decoded=encoded.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&amp;/g,'&');
  assert.equal(decoded,fs.readFileSync(path.join(__dirname,'../practice/communication',name),'utf8'));
}
const anchors=new Set([...chapter.sections.map(s=>s.id),...chapter.readingStages.map(s=>s.id),...[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1])]);
for(const old of ['communication-map','ranks-groups','p2p-contract','collective-shapes','ring-allreduce','algorithms-protocols','transport-bandwidth','rdma-lifecycle','nccl-lifecycle','stream-overlap','tp-dataflow','ep-dataflow','parallel-families','library-boundaries','modern-device-api','communication-cost','deployment-topology','distributed-compiler','debugging','communication-exercises','comm-stage-contract','comm-stage-path','comm-stage-runtime','comm-stage-model','comm-stage-libraries','comm-stage-deploy'])assert.ok(anchors.has(old),'Lost old deep link: '+old);
console.log(`Communication models passed: ${cases} configurations; coordinate, route, byte, schedule and nonlinear counterexample checks.`);
