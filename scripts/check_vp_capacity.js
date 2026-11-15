'use strict';
const assert=require('node:assert/strict');
const {estimate}=require('../web/vp-capacity.js');
// Count independent read/write service slots for 4096 results, including partial strobes.
for(const mode of ['wide','pipe'])for(const input of ['bf16','fp32'])for(const output of ['bf16','fp32'])for(const streams of [1,2]){
  const s=estimate({mode,input,output,streams});
  const groups=[];for(let start=0;start<4096;start+=(mode==='pipe'||input==='fp32'?32:64))groups.push(start);
  let reads=0,writes=0;const bytes=output==='bf16'?2:4;
  groups.forEach((start,i)=>{const size=(groups[i+1]??4096)-start;reads+=streams;for(let offset=0;offset<size*bytes;offset+=128)writes++;});
  assert.equal(s.rate,4096/Math.max(groups.length,reads,writes));
  assert.ok(s.rate<=32||mode==='wide'&&input==='bf16'&&output==='bf16'&&streams===1);
}
assert.equal(estimate().tops,.0256);
assert.equal(estimate({units:4}).tops,.1024);
assert.equal(estimate({mode:'pipe',streams:2}).rate,16);
assert.equal(estimate({mode:'pipe'}).outputValid,64);
assert.equal(estimate({output:'fp32'}).writes,2);
assert.equal(estimate({ops:2}).tops,2*estimate().tops);
assert.equal(estimate({mhz:800}).tops,2*estimate().tops);
assert.throws(()=>estimate({input:'int8'}),RangeError);
assert.throws(()=>estimate({mhz:0}),RangeError);
console.log('VP capacity: independent packet-service accounting and unit conversion PASS');
