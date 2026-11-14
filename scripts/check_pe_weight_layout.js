'use strict';
const assert=require('node:assert/strict');
const layout=require('../web/pe-weight-layout.js');

const selected=layout.locate(165,1097);
assert.deepEqual([selected.q,selected.t,selected.block,selected.localCO,selected.localCI],[1,8,40,37,73]);
assert.equal(selected.innerOffset,0x12c9);
assert.equal(selected.packedOffset,0xa12c9);
assert.equal(selected.rowMajorOffset,0xa5449);
assert.deepEqual([selected.group,selected.pe,selected.alu,selected.lane],[2,4,5,9]);
assert.deepEqual([selected.hub,selected.mc,selected.round,selected.mcByte,selected.word,selected.row,selected.column],[1,6,0,9,80,0,80]);

// A source-row neighbor crossing a block boundary is no longer byte-adjacent.
const end=layout.locate(165,1151), next=layout.locate(165,1152);
assert.equal(next.rowMajorOffset-end.rowMajorOffset,1);
assert.equal(next.packedOffset-end.packedOffset,16384-127);
assert.equal(next.block,end.block+1);
assert.equal(layout.locate(165,1098).packedOffset-selected.packedOffset,1);
assert.equal(layout.locate(166,1097).packedOffset-selected.packedOffset,128);

// Construct each destination independently from hardware selection fields.
// One miniblock must populate every group/hub/MC/round/byte exactly once.
const destinations=new Set();
for(let g=0;g<8;g++) for(let p=0;p<8;p++) for(let a=0;a<16;a++) for(let lane=0;lane<16;lane++) {
  const co=128+g*16+a, ci=1024+p*16+lane;
  const v=layout.locate(co,ci);
  const reconstructed=v.blockBase+v.group*2048+v.round*1024+v.hub*512+v.mc*32+v.mcByte;
  assert.equal(reconstructed,v.packedOffset);
  assert.deepEqual(layout.unpack(v.packedOffset),{co,ci});
  assert(v.mcByte>=0&&v.mcByte<32);
  destinations.add([v.group,v.hub,v.mc,v.round,v.mcByte].join('/'));
}
assert.equal(destinations.size,16384);
assert.equal(layout.locate(511,4095).packedOffset,2097151);
assert.deepEqual(layout.unpack(2097151),{co:511,ci:4095});
assert.deepEqual(layout.unpack(0),{co:0,ci:0});
for(const [co,ci] of [[-1,0],[512,0],[0,4096],[0,-1],[1.5,0],[0,NaN]]) assert.throws(()=>layout.locate(co,ci),RangeError);
for(const address of [-1,2097152,0.5]) assert.throws(()=>layout.unpack(address),RangeError);
console.log('PE weight layout: selected byte, boundary counterexample, full 16 KiB ownership bijection, inverse mapping and input limits passed. Static address model only.');
