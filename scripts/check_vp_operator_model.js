'use strict';
const assert=require('node:assert/strict');
const model=require('../web/vp-operator-lab.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-11*Math.max(1,Math.abs(b)),`${a} != ${b}`);
// Direct full-row oracle is independent of the animation's chunk loop.
for(const input of [[1,-2,3,-4,5,-6,7,-8],[0,0,0],[2,-5,7,3,1],[19]]){
  const weight=input.map((_,i)=>.5+i/3);
  for(const chunk of [1,2,4,9]){
    const result=model.rmsnorm(input,weight,chunk);
    const inv=1/Math.sqrt(input.reduce((s,x)=>s+x*x,0)/input.length+1e-6);
    result.output.forEach((x,i)=>near(x,input[i]*inv*weight[i]));
    const coefficient=result.frames.findIndex(f=>f.title.includes('形成行系数'));
    assert.ok(result.frames.slice(0,coefficient+1).every(f=>f.output.every(x=>x===null)));
  }
}
const rowA=model.rmsnorm([2,2,2,2],[1,1,1,1]);
const rowB=model.rmsnorm([5,5,5,5],[1,1,1,1]);
assert.notEqual(rowA.rrms,rowB.rrms);near(rowB.output[0],5/Math.sqrt(25+1e-6));
// Sort oracle checks equal values, negative inputs, and retained original indices.
for(const input of [[.2,.8,-.4,1.3,.9,.5,1.1,-.2],[5,5,5,4],[-3,-1,-2],[9]]){
  for(let k=1;k<=input.length;k++){
    const result=model.topk(input,k);
    const expected=input.map((value,index)=>({value,index})).sort((a,b)=>b.value-a.value||a.index-b.index).slice(0,k);
    assert.deepEqual(result.output,expected);assert.equal(new Set(result.output.map(x=>x.index)).size,k);
    assert.ok(result.mask.every(x=>x===false));
    assert.deepEqual(model.topk(input,k).output,expected);
    for(const frame of result.frames.slice(0,-1))assert.equal(frame.mask.filter(Boolean).length,frame.selected.length);
  }
}
const g=[-8,-1,0,1,8],u=[1,2,3,4,5],s=model.swiglu(g,u);
s.output.forEach((x,i)=>near(x,g[i]*u[i]/(1+Math.exp(-g[i]))));
assert.deepEqual(g,[-8,-1,0,1,8]);assert.deepEqual(u,[1,2,3,4,5]);
for(const x of [-5,0,1,5])near(model.accurate(x).output[0],model.sigmoid(x)*(1-.03*.03));
assert.throws(()=>model.topk([1,2],3));assert.throws(()=>model.topk([NaN],1));
assert.throws(()=>model.rmsnorm([1],[1],0));assert.throws(()=>model.swiglu([1],[1,2]));
console.log('PASS: operator traces match direct RMSNorm, sorting and sigmoid oracles; tails, row isolation, ties, mask reset and original-value lifetimes covered.');
