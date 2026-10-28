/* Check mathematical invariants and counterexamples used by the DeepSeek guides. */
const assert=require('node:assert/strict');
const model=require('../web/deepseek-architecture.js');
const close=(a,b,eps=1e-10)=>assert.ok(Math.abs(a-b)<eps,`${a} differs from ${b}`);
const base=model.mla({batch:1,tokens:32768});
assert.equal(base.compressedElements,576);
assert.equal(base.compressedBytes,37748736);
assert.equal(base.allLayerBytes/2**30,2.14453125);
assert.equal(base.expandedBytes,2684354560);
assert.equal(model.mla({batch:8,tokens:32768}).allLayerBytes,8*base.allLayerBytes);
assert.throws(()=>model.mla({batch:0,tokens:32768}),RangeError);
assert.deepEqual([model.cache({tokens:1048576}).csaEntries,model.cache({tokens:1048576}).csaRead,model.cache({tokens:1048576}).hcaRead],[262144,512,8192]);
assert.equal(model.cache({variant:'pro',tokens:1048576}).csaRead,1024);
assert.equal(model.cache({tokens:1024}).csaRead,256);
assert.throws(()=>model.cache({tokens:1025}),RangeError);
for(const alpha of [0,.25,.5,1])for(const depth of [1,8,32]){
  const r=model.mhc({alpha,depth});
  for(const row of r.matrix)close(row.reduce((a,b)=>a+b),1);
  for(let j=0;j<4;j++)close(r.matrix.reduce((s,row)=>s+row[j],0),1);
  close(r.output.reduce((a,b)=>a+b),10);
  assert.ok(r.output.every(x=>x>=1&&x<=4));
}
assert.deepEqual(model.mhc({alpha:0}).output,[1,2,3,4]);
assert.deepEqual(model.mhc({alpha:1}).output,[2,3,4,1]);
assert.deepEqual(model.mhc({alpha:1,depth:4}).output,[1,2,3,4]);
assert.ok(model.mhc({depth:32}).gain>300);
// Independent tiny-matrix oracle for the MLA identity (real model dimensions are larger).
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const mm=(a,b)=>a.map(row=>b[0].map((_,j)=>row.reduce((s,x,k)=>s+x*b[k][j],0)));
const tr=a=>a[0].map((_,j)=>a.map(row=>row[j]));
const softmax=a=>{const m=Math.max(...a),e=a.map(x=>Math.exp(x-m)),z=e.reduce((a,b)=>a+b);return e.map(x=>x/z)};
const C=[[.2,.5,-.1],[1,-.5,.7],[-.6,.3,.8],[.1,-.2,.4]],UK=[[.4,-.3],[.7,.5],[-.2,.8]],UV=[[.6,.1],[-.4,.9],[.3,-.5]],q=[.7,-.2],qr=[.3],kr=[[.2],[-.1],[.8],[.5]];
const expandedK=mm(C,UK),expandedV=mm(C,UV),qhat=mm([q],tr(UK))[0];
const directScores=expandedK.map((k,i)=>dot(q,k)+dot(qr,kr[i]));
const absorbedScores=C.map((c,i)=>dot(qhat,c)+dot(qr,kr[i]));
directScores.forEach((x,i)=>close(x,absorbedScores[i]));
const p=softmax(directScores),direct=mm([p],expandedV)[0],absorbed=mm(mm([p],C),UV)[0];direct.forEach((x,i)=>close(x,absorbed[i]));
// Two independently normalized attentions generally differ from a joint score softmax.
const wrong=mm([softmax(expandedK.map(k=>dot(q,k)))],expandedV)[0];
assert.ok(direct.some((x,i)=>Math.abs(x-wrong[i])>.001));
console.log('PASS: DeepSeek cache units, aligned-entry counts, mHC row/column/convexity invariants, MLA absorption and softmax counterexample.');
