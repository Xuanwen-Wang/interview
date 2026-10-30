'use strict';
const assert=require('node:assert/strict');
const m=require('../web/math-foundations.js');
let checks=0;
function close(a,b,tol=1e-10){assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);checks++;}
function vector(a,b,tol){assert.equal(a.length,b.length);a.forEach((x,i)=>close(x,b[i],tol));}

// Exact ratios, invariance, and a hostile numerical range.
vector(m.softmax([0,Math.log(2),Math.log(3)]),[1/6,1/3,1/2]);
vector(m.softmax([1000,1001,1002]),m.softmax([0,1,2]));
vector(m.softmax([-1000,-999,-998]),m.softmax([0,1,2]));
vector(m.softmax([7,7,7,7]),[.25,.25,.25,.25]);
vector(m.softmax([0,-Infinity]),[1,0]);
assert.throws(()=>m.softmax([-Infinity,-Infinity]),RangeError);
assert.throws(()=>m.softmax([0,1],0),RangeError);
const entropy=p=>-m.sum(p.filter(x=>x>0).map(x=>x*Math.log(x)));
assert.ok(entropy(m.softmax([0,1,2],.5))<entropy(m.softmax([0,1,2],2)));
close(m.sigmoid(-1000),0);close(m.sigmoid(1000),1);
close(m.softplus(1000),1000);close(m.softplus(-1000),0);
close(m.silu(0),0);assert.ok(m.silu(-1)<0);

// Statistical invariants, not a second copy of the norm implementation.
const x=[1,2,3,4],ln=m.norm(x,'layer',0),rn=m.norm(x,'rms',0);
close(m.sum(ln.values),0);close(m.dot(ln.values,ln.values)/4,1);
close(m.dot(rn.values,rn.values)/4,1);close(Math.sqrt(m.dot(rn.values,rn.values)),2);
vector(m.norm(x.map(v=>v+19),'layer').values,m.norm(x,'layer').values);
vector(m.norm(x.map(v=>v*3),'rms',0).values,rn.values);
assert.ok(Math.abs(m.norm(x.map(v=>v+19),'rms').values[0]-rn.values[0])>.2);
vector(m.norm([2,2],'layer').values,[0,0]);vector(m.norm([0,0],'rms').values,[0,0]);

// Choice bias and combine weights are distinct. Also verify a tie policy explicitly.
const r=m.route([.1,.4,.8,.6],2,[.8,0,0,0]);
assert.deepEqual(r.indices,[0,2]);vector(r.weights,[1/9,0,8/9,0]);
vector(m.route([.1,.4,.8,.6],2,[.9,0,0,0]).weights,r.weights);
close(m.sum(m.route([.1,.4,.8,.6],3,[0,0,0,0],1.5).weights),1.5);
assert.deepEqual(m.route([1,1,1],2).indices,[0,1]);
assert.throws(()=>m.route([0,0],1),RangeError);
assert.deepEqual(m.nucleus([.5,.3,.15,.05],.9).indices,[0,1,2]);
assert.deepEqual(m.nucleus([.5,.3,.15,.05],.8).indices,[0,1]);
close(m.sum(m.nucleus([.5,.3,.15,.05],.9).weights),1);

// Attention: constant-value preservation, convex bounds, masks, and permutations.
const keys=[[1,0],[0,1],[1,1]], values=[[2,0],[0,4],[2,4]];
for(const q of [[1,1],[-2,1],[3,-1]]){
  vector(m.attention(q,keys,[[3,7],[3,7],[3,7]]).output,[3,7]);
  const a=m.attention(q,keys,values);
  assert.ok(a.output[0]>=0&&a.output[0]<=2&&a.output[1]>=0&&a.output[1]<=4);
  vector(m.attention(q,[keys[2],keys[0],keys[1]],[values[2],values[0],values[1]]).output,a.output);
  close(m.attention(q,keys,values,[2]).probabilities[2],0);
}
vector(m.attention([1,1],keys,values).output,[1.5034898434841477,3.0069796869682954]);

// Closed-form block example and comparison to a direct, unshifted oracle.
vector(m.online([0,Math.log(3)],[[2],[8]],1),[6.5]);
const scores=[-Infinity,-2,1,.5,3], vs=[[8,9],[1,0],[2,4],[-1,8],[4,-2]];
const e=scores.map(Math.exp),den=m.sum(e),oracle=[0,1].map(j=>m.sum(vs.map((v,i)=>v[j]*e[i]))/den);
for(const block of [1,2,3,5])vector(m.online(scores,vs,block),oracle);
assert.throws(()=>m.online([-Infinity],[[1]],1),RangeError);

// Orthogonal rotation and the relative-position identity.
for(const theta of [-3,-.3,0,.7,2]){
 const a=[1,2],b=[3,-1],ra=m.rotate(a,theta),rb=m.rotate(b,theta);
 close(m.dot(ra,ra),m.dot(a,a));close(m.dot(ra,rb),m.dot(a,b));
 close(m.dot(m.rotate(a,2*theta),m.rotate(b,5*theta)),m.dot(a,m.rotate(b,3*theta)));
}
vector(m.rotate([1,0],Math.PI/2),[0,1]);

// One iteration need not satisfy both marginals; convergence is checked separately.
const one=m.sinkhorn([[1,2],[3,4]],1);
close(one[0][0],7/16);close(one[0][1],7/13);
assert.ok(Math.abs(m.sum(one[0])-1)>.01);
const sk=m.sinkhorn([[1,2],[3,4]],20);
sk.forEach(row=>close(m.sum(row),1));
[0,1].forEach(j=>close(m.sum(sk.map(row=>row[j])),1));

// End-to-end worked example uses fixed independently calculated reference values.
const q=m.norm([1,2]).values;
const a=m.attention(q,[[1,0],[0,1]],[[2,0],[0,2]]).output;
const u=[1+a[0],2+a[1]],n=m.norm(u).values;
const f=n.map(v=>m.silu(v)*v),y=u.map((v,i)=>v+f[i]),h=m.norm(y).values;
vector(y,[2.0912133589144553,4.407382580089504]);
vector(m.softmax([h[0],h[1],h[1]-h[0]]),[.24848062999667062,.4862942996396594,.26522507036366993]);
console.log(`PASS: math foundations (${checks} numerical checks plus masks, routing, permutation, and counterexamples).`);
