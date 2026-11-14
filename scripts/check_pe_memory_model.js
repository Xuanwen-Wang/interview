'use strict';

const assert = require('node:assert/strict');
const model = require('../web/pe-memory-model.js');
let cases = 0;

function checkSequence(options) {
  const s = model.enumerate(options);
  const {config:c} = s;
  const seen = new Set(), uses = new Map(), rowOutputs = new Map();
  for (let i = 0; i < s.acceptedBeats; i++) {
    const e = model.eventAt(s, i), b = e.block;
    const logicalPair = `${b.kb}:${b.cb}`;
    seen.add(logicalPair);
    uses.set(logicalPair, (uses.get(logicalPair)||0)+1);
    const output = `${e.wLocal}:${b.kb}`;
    rowOutputs.set(output, (rowOutputs.get(output)||0)+128);
    // Independent inverse of activation's W-major allocation.
    assert.equal(Math.floor(e.al1Word/b.actualC), e.wLocal);
    assert.equal(e.al1Word%b.actualC, b.cb-b.cg);
    assert(e.al1Word < 64);
    assert.equal(Math.floor(e.ol1Slot/c.w), b.kb-b.kg);
    assert.equal(e.ol1Slot%c.w, e.wLocal);
    assert(e.ol1Slot < 16);
    assert.equal(e.newWeight, i%c.w === 0);
    assert.equal(e.releaseWeight, i%c.w === c.w-1);
    assert.equal(e.outputColumn%128, 37);
    assert.equal(e.ciLast-e.ciFirst+1, 16);
  }
  // The set of requested matrix coordinates must be the Cartesian product,
  // independent of the grouping loops used by the implementation.
  assert.equal(seen.size, (c.tileC/128)*(c.co/128));
  for (let kb=0; kb<c.co/128; kb++) for (let cb=0; cb<c.tileC/128; cb++) {
    assert(seen.has(`${kb}:${cb}`));
    assert.equal(uses.get(`${kb}:${cb}`), c.w);
  }
  for (const reductionLength of rowOutputs.values()) assert.equal(reductionLength, c.tileC);
  assert.equal(rowOutputs.size, c.w*c.co/128);
  assert.equal(s.macs, s.acceptedBeats*128*128);
  assert.equal(s.weightBytes, c.tileC*c.co);
  const words = new Set();
  for (const b of s.blocks) {
    assert.equal((b.byteAddress-c.base)/16384, b.kb*(c.sourceC/128)+b.cb);
    assert.equal(b.requests[1].word-b.requests[0].word, 1);
    for (const r of b.requests) {
      assert(!words.has(r.word)); words.add(r.word);
      assert.equal(r.row*128+r.column, r.word);
      assert.equal(r.bytes, 32);
    }
    // Reconstruct full-core bytes from one channel's striped address.
    assert.equal(b.requests[0].word*256*32, b.byteAddress);
  }
  assert.equal(words.size, s.blockCount*2);
  cases++;
  return s;
}

const main = checkSequence({});
assert.equal(main.blockCount, 128);
assert.equal(main.acceptedBeats, 512);
assert.equal(main.macs, 8388608);
assert.equal(main.weightBytes, 2*1024*1024);
assert.equal(model.eventAt(main,247).completesC,false);
assert.equal(model.eventAt(main,248).completesC,true);
assert.equal(model.eventAt(main,248).outputTileComplete,false);
for(let i=248;i<255;i++) assert.equal(model.eventAt(main,i).outputTileComplete,false);
assert.equal(model.eventAt(main,255).outputTileComplete,true);
assert.equal(model.eventAt(main,255).fullOutput,true);
assert.equal(model.eventAt(main,511).outputTileComplete,true);
assert.deepEqual(main.blocks.slice(0,6).map(b=>b.index), [0,32,1,33,2,34]);
assert.deepEqual(Array.from({length:12},(_,i)=>model.eventAt(main,i).al1Word), [0,8,16,24,0,8,16,24,1,9,17,25]);
assert.deepEqual(Array.from({length:12},(_,i)=>model.eventAt(main,i).ol1Slot), [0,1,2,3,4,5,6,7,0,1,2,3]);
assert.equal(main.rowSwitches, 1);
const shifted = checkSequence({base:0x88000});
assert.equal(shifted.rowSwitches, 118);
assert.deepEqual(shifted.blocks.slice(0,4).map(b=>b.byteAddress), [0x88000,0x108000,0x8c000,0x10c000]);
assert.deepEqual(shifted.blocks.slice(0,2).flatMap(b=>b.requests.map(r=>r.word)), [68,69,132,133]);
for (const scenario of Object.keys(model.scenarios)) {
  for (const base of [0,0x88000]) {
    for (const mtk of [1,2,4]) {
      const orders=[];
      for (const mtc of [4,8,16]) {
        const sequence=checkSequence({scenario,base,mtk,mtc});
        orders.push(sequence.blocks.map(b=>b.index));
      }
      assert.deepEqual(orders[0],orders[1], 'MTC changes boundaries, not flattened order here');
      assert.deepEqual(orders[1],orders[2]);
    }
  }
}
const wide = model.enumerate({scenario:'wide'});
const narrow = model.enumerate({scenario:'narrow'});
const blocked = model.enumerate({scenario:'blocked'});
assert.equal(wide.rowSwitches,255, 'Base alignment cannot repair the 1 MiB K pitch');
assert.equal(narrow.rowSwitches,63, 'Reducing TC retains source pitch');
assert.equal(blocked.rowSwitches,0, 'Only the displayed first physical block fits one row window');
assert.equal(narrow.weightBytes,blocked.weightBytes);
assert.equal(narrow.macs,blocked.macs);
assert.equal(narrow.kStrideBytes,4*blocked.kStrideBytes);
assert.equal(narrow.fullMatrixMacs,4*narrow.macs);
for(const partial of [narrow,blocked]) {
  const last=model.eventAt(partial,partial.acceptedBeats-1);
  assert.equal(last.completesC,true);
  assert.equal(last.outputTileComplete,true);
  assert.equal(last.fullOutput,false,'A complete computational sub-tile is not the full CI8192 output');
}
assert.equal(model.enumerate({mtk:1,base:0}).rowSwitches,1);
assert.equal(model.enumerate({mtk:1,base:0x88000}).rowSwitches,2);
assert(model.enumerate({mtk:1,base:0x88000}).rowSwitches < shifted.rowSwitches);

// Non-dividing groups cover tails without inventing blocks or overflowing SRAM.
checkSequence({w:3,mtc:7,mtk:3});
checkSequence({w:1,mtc:64,mtk:16});
assert.equal(model.eventAt(model.enumerate({w:3,mtc:7,mtk:3}),383).al1Word,11);
for (const bad of [{w:0},{w:4,mtc:17},{w:4,mtk:5},{mtc:1.5},{base:1},{base:-16384},{scenario:'unknown'},{scenario:'__proto__'}]) {
  assert.throws(()=>model.enumerate(bad),RangeError);
}
assert.throws(()=>model.eventAt(main,-1),RangeError);
assert.throws(()=>model.eventAt(main,512),RangeError);
assert.throws(()=>model.mcAddress(32768),RangeError);
for(const rtt of [1,8,15,16,23,46,128]) {
  const t=model.creditWindow({rtt,cycles:rtt*10});
  for(const e of t.events) {
    assert(e.inFlight>=0 && e.inFlight<=15);
    assert.equal(e.returned,e.cycle>=rtt && t.events[e.cycle-rtt].issued);
    // Independent sliding window: only requests issued in the last R slots remain.
    const outstanding=t.events.slice(Math.max(0,e.cycle-rtt+1),e.cycle+1).filter(x=>x.issued).length;
    assert.equal(e.inFlight,outstanding);
  }
  const issued=t.events.filter(e=>e.issued).length;
  assert.equal(issued,10*Math.min(15,rtt));
  assert.equal(issued/t.events.length,t.rate);
  if(rtt<=15) assert(t.events.every(e=>e.issued), 'Extra credits cannot beat one request per cycle');
}
const credit=model.creditWindow();
assert(credit.events.slice(0,15).every(e=>e.issued));
assert(credit.events.slice(15,23).every(e=>!e.issued));
assert(credit.events[23].issued && credit.events[23].returned);
assert(Math.abs(credit.cyclesPerMiniblock-46/15)<4*Number.EPSILON);
assert.throws(()=>model.creditWindow({rtt:0}),RangeError);
assert.throws(()=>model.creditWindow({credits:1.5}),RangeError);
console.log(`PE memory model: ${cases} configurations plus 7 credit round trips passed; coverage, replay, AL1/OL1, byte mapping, row-locality counterexamples and credit invariants. No timing simulation.`);
