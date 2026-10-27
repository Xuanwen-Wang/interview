'use strict';

// Fixed source-derived examples and independent invariants. This script never
// executes CycleSim/RTL, and historical measurements are not model outputs.
const assert = require('node:assert/strict');
const model = require('../web/cyclesim-model.js');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

// Independent union oracle: count occupied unit cells, rather than sort/merge.
const intervals = [[0, 2], [1, 4], [3, 6], [6, 8], [2, 2], [-2, 1]];
for (let mask = 0; mask < 1 << intervals.length; mask++) {
  const selected = intervals.filter((_, i) => mask & (1 << i));
  const cells = new Set();
  for (const [start, end] of selected) for (let t = start; t < end; t++) cells.add(t);
  assert.equal(model.union(selected), cells.size);
  assert.equal(model.union([...selected].reverse()), cells.size);
  assert.equal(model.union([...selected, ...selected]), cells.size);
}
assert.equal(model.union([[0, 10], [2, 5], [6, 8]]), 10);
assert.equal(model.union([[0, 10], [5, 15]]), 15); // 20 would double-count overlap.
assert.equal(model.union([[0.5, 1.5], [1, 2.5]]), 2);
assert.equal(model.union([]), 0);
for (const bad of [[[3, 2]], [[0, Infinity]], [[NaN, 1]]]) assert.throws(() => model.union(bad), RangeError);

// Four-KiB boundaries split bursts, even when every beat is fully covered.
const page = model.geometry({address: 3968, rows: 1, rowBytes: 256, stride: 256});
assert.equal(page.beats, 2);
assert.equal(page.bursts, 2);
assert.equal(page.partial, 0);
assert.deepEqual(page.rows[0].bursts.map(b => [b.address, b.beats]), [[3968, 1], [4096, 1]]);
const limit = model.geometry({address: 0, rows: 1, rowBytes: 640, stride: 640, maxBeats: 2});
assert.deepEqual(limit.rows[0].bursts.map(b => b.beats), [2, 2, 1]);

// Frozen SDMA ST geometry controls, normalized only modulo 4096.
const st16 = model.geometry({address: 576, rows: 1, rowBytes: 128, stride: 144});
assert.deepEqual([st16.beats, st16.bursts, st16.partial, st16.partialBursts], [2, 1, 2, 1]);
assert.deepEqual(st16.rows[0].words.map(w => [w.lo, w.hi]), [[64, 128], [0, 64]]);
assert.equal(st16.useful, 128);
assert.equal(st16.writeBytes + st16.readOldBytes, 512);
const st15 = model.geometry({address: 3840, rows: 72, rowBytes: 256, stride: 288});
assert.deepEqual([st15.beats, st15.bursts, st15.partial, st15.partialBursts], [198, 76, 108, 58]);
assert.deepEqual(st15.rows.flatMap((r, i) => r.bursts.length > 1 ? [i] : []), [15, 29, 43, 57]);
assert.equal(st15.useful, 18432);
assert.equal(st15.writeBytes + st15.readOldBytes, 39168);
// Independent coverage oracle: every useful byte is represented once per row;
// every burst is on a single page and respects the configured beat limit.
for (const g of [page, limit, st16, st15]) {
  let useful = 0;
  for (const row of g.rows) {
    const covered = new Set();
    for (const word of row.words) {
      assert.ok(word.lo >= 0 && word.hi <= 128 && word.hi > word.lo);
      for (let byte = word.lo; byte < word.hi; byte++) {
        const address = word.address + byte;
        assert.ok(!covered.has(address));
        covered.add(address);
      }
    }
    useful += covered.size;
    for (const burst of row.bursts) {
      assert.ok(burst.beats > 0 && burst.beats <= 32);
      assert.equal(Math.floor(burst.address / 4096), Math.floor((burst.address + burst.beats * 128 - 1) / 4096));
    }
  }
  assert.equal(useful, g.useful);
}
assert.throws(() => model.geometry({address: 0, rows: 1, rowBytes: 1, stride: 0, boundary: 100}), RangeError);
assert.throws(() => model.geometry({address: Number.MAX_SAFE_INTEGER, rows: 2, rowBytes: 128, stride: 128}), RangeError);

// Current PeEngine macro arithmetic under the ideal-WL1 bench profile.
// Historical RTL is deliberately different; never fit constants to erase it.
// Source: 72_pe_envelope.tsv mtc1/2/3/4/6/12, with separate current-source math.
const bf16 = [
  // count, minis, reads, span, creditStream, array, writePath, prediction, RTL
  [1, 12, 2, 2, 132, 134, 92, 212, 204],
  [2, 6, 4, 4, 75, 79, 94, 157, 156],
  [3, 4, 6, 6, 58, 64, 96, 142, 144],
  [4, 3, 8, 10, 53, 61, 98, 139, 144],
  [6, 2, 12, 18, 47, 60, 102, 138, 144],
  [12, 1, 24, 42, 42, 72, 114, 150, 156]
];
for (const [count, minis, reads, span, credit, array, writePath, prediction, rtl] of bf16) {
  const r = model.bf16Mini({MTC_count: count});
  assert.deepEqual([r.mini_tiles, r.reads_per_mini, r.cold_span, r.stream_credit_ceil, r.array_cycles, r.write_path_total, r.cycles],
    [minis, reads, span, credit, array, writePath, prediction]);
  assert.deepEqual([r.passes, r.C_beats, r.K_passes, r.A, r.II, r.write_cycles, r.weight_cycles], [24, 12, 1, 2, 2, 8, 24]);
  assert.equal(r.mini_tiles * r.words_per_mini, 24); // shape's activation work is conserved.
  assert.equal(r.mini_tiles * r.reads_per_mini, 24);
  assert.equal(r.config.weight_bytes_per_cycle, 2048);
  assert.equal(r.config.wl1_attached, false);
  assert.equal(r.inputs.MTC_raw, count - 1);
  assert.equal(model.difference(r.cycles, rtl).cycles, prediction - rtl);
}
assert.equal(model.bf16Mini().cycles, 157);
const halfPeriod = model.bf16Mini({MTC_count: 2});
assert.equal(halfPeriod.stream_selected, 75);
assert.notEqual(halfPeriod.stream_selected, 6 * Math.ceil(12.5)); // per-mini rounding is wrong.
assert.ok(model.bf16Mini({MTC_count: 12}).cycles > model.bf16Mini({MTC_count: 6}).cycles);
const mutable = model.bf16Mini(); mutable.config.pipe_latency = 0;
assert.equal(model.bf16Mini().config.pipe_latency, 69); // Calls share no mutable state.
for (const bad of [{MTC_count: 5}, {MTC_count: 2, MTC_raw: 2}, {C: 512}, {MTW_count: 4}, {mode: 'KW'},
  {activation_dtype: 'FP8'}, {weight_bytes_per_cycle: 683}, {MTC_count: '2'}, {MTC_count: Infinity}, null]) {
  assert.throws(() => model.bf16Mini(bad), RangeError);
}

// Independently frozen DT block examples: 63_dt_calibration.tsv lines38/44/47/96.
// The first two controls used Lwr=2; changing it to9 is a prediction, not those rows.
const dt = [
  // W,C,Lwr,R,write,NB,Bl,XFER,exec,command-to-done
  [8, 20, 2, 256, 320, 32, 4, 384, 433, 436],
  [16, 24, 2, 512, 384, 32, 8, 512, 565, 568],
  [16, 1, 2, 256, 16, 16, 1, 256, 286, 289],
  [16, 32, 9, 512, 512, 32, 16, 512, 580, 583]
];
for (const [W, C, Lwr, R, write, NB, Bl, XFER, exec, total] of dt) {
  const r = model.dtPartial({H: 16, W, C, Lrd: 9, Lwr});
  assert.deepEqual([r.R, r.write, r.NB, r.Bl, r.XFER, r.exec, r.command_to_done], [R, write, NB, Bl, XFER, exec, total]);
}
const partial = model.dtPartial();
assert.deepEqual(partial.blockPairs.map(b => [b.fill, b.drain, b.charged]), [[8, 16, 16], [8, 4, 8]]);
assert.deepEqual([partial.exec, partial.wrong_max_exec, partial.max_sum_underestimate], [433, 369, 64]);
assert.equal(partial.logical_payload_bytes, 5120);
assert.equal(partial.read_capacity_bytes, 8192); // Neither value is the historical strobe byte count6144.
assert.equal(model.dtPartial({W: 16, C: 24, Lwr: 9}).exec, 572);
assert.equal(model.dtPartial({W: 16, C: 1, Lwr: 9}).exec, 293);
for (const W of [1, 8, 16, 17, 31, 32]) for (const C of [1, 4, 16, 20, 32]) {
  const r = model.dtPartial({H: 1, W, C});
  const swapped = model.dtPartial({H: 1, W: C, C: W});
  assert.equal(r.XFER, swapped.XFER); // Transposing both axes preserves the per-block service sum.
  assert.equal(r.R, swapped.write);
  assert.equal(r.write, swapped.R);
  assert.equal(r.NB, swapped.NB);
  assert.ok(r.XFER >= r.R && r.XFER >= r.write);
  assert.ok(r.max_sum_underestimate >= 0);
  assert.ok(r.read_capacity_bytes >= r.logical_payload_bytes);
  assert.ok(r.write_capacity_bytes >= r.logical_payload_bytes);
  const doubledH = model.dtPartial({H: 2, W, C});
  assert.equal(doubledH.XFER, 2 * r.XFER);
  assert.equal(doubledH.NB, 2 * r.NB);
  assert.equal(doubledH.exec - r.exec, r.XFER + r.NB); // Initial/final latency is paid once.
}
for (const bad of [{order: 0}, {N: 2}, {format: 'FP32'}, {reshape: true}, {W: 0}, {C: 1.5}, {H: Infinity},
  {Lrd: 1}, {Lwr: 16}, {contention: true}, null]) assert.throws(() => model.dtPartial(bad), RangeError);

assert.deepEqual(model.difference(157, 156).cycles, 1);
close(model.difference(150, 156).percent, -100 / 26);
assert.deepEqual(model.difference(0, 10), {cycles: -10, percent: -100});
assert.deepEqual(model.difference(Number.MAX_VALUE, Number.MAX_VALUE / 2).percent, 100);
for (const bad of [Infinity, -Infinity, NaN, '1', null, undefined]) {
  assert.throws(() => model.difference(1, bad), RangeError);
  assert.throws(() => model.difference(bad, 1), RangeError);
}
for (const bad of [0, -1]) assert.throws(() => model.difference(1, bad), RangeError);
assert.throws(() => model.difference(-1, 1), RangeError);
assert.throws(() => model.difference(Number.MAX_VALUE, Number.MIN_VALUE), RangeError);

console.log('PASS: CycleSim casebook arithmetic; BF16 six-case ledger, DT four controls and partial-block counterexample, interval union, 4KiB/RMW geometry, finite-input and profile boundaries. No CycleSim/RTL was run.');

// Descriptor-level LSU checks. Oracle enumerates byte addresses, independently
// of the model's axis-collapse/run decomposition. Use dense byte geometry here.
const lsu = (tile,src=tile,dst=tile,extra={}) => model.lsu({tile,src,dst,...extra});
const ld4k=lsu([1,1,1,4096]);
assert.deepEqual([ld4k.beats,ld4k.bursts,ld4k.duration,ld4k.occupancy],[32,1,139,33]);
assert.deepEqual(ld4k.commands.map(c=>c.start),[0,33,66,99,132,165]);
const half=lsu([1,1,64,32],[1,1,64,64],[1,1,64,32],{bits:16});
assert.deepEqual([half.useful,half.beats,half.primingRuns,half.duration,half.occupancy],[4096,64,0,171,65]);
const prime=lsu([1,1,32,64],[1,1,32,128],[1,1,32,64],{bits:16});
assert.deepEqual([prime.beats,prime.primingRuns,prime.duration,prime.occupancy],[32,32,170,64]);
const s16=lsu([1,1,1,64],[1,1,1,64],[1,8,1,72],{store:true,bits:16,address:576});
assert.deepEqual([s16.beats,s16.bursts,s16.partialBeats,s16.partialBursts,s16.duration,s16.occupancy],[2,1,2,1,130,41]);
const s15=lsu([1,1,72,64],[1,1,72,64],[1,8,72,72],{store:true,bits:32,address:3840});
assert.deepEqual([s15.beats,s15.bursts,s15.partialBeats,s15.partialBursts,s15.duration,s15.occupancy],[198,76,108,58,2669,2580]);
assert.equal(s15.transferBytes+s15.readOldBytes,39168);
// Absolute address translations by whole pages must preserve geometry/timing.
for(const shift of [4096,8192,2**32]) {
 const shifted=lsu([1,1,72,64],[1,1,72,64],[1,8,72,72],{store:true,bits:32,address:3840+shift});
 assert.deepEqual([shifted.beats,shifted.bursts,shifted.partialBursts,shifted.duration],[198,76,58,2669]);
}
// Equal flat byte counts are not equal costs; merge rules differ by direction.
const paddedLoad=lsu([1,1,2,4],[1,1,2,16],[1,1,2,4],{dense:false});
const paddedStore=lsu([1,1,2,4],[1,1,2,4],[1,1,2,16],{store:true,dense:false});
assert.equal(paddedLoad.runs.length,1);assert.equal(paddedLoad.runs[0].bytes,32);
assert.equal(paddedStore.runs.length,2);assert.deepEqual(paddedStore.runs.map(r=>r.bytes),[4,4]);
const dstStrided=lsu([1,1,4,32],[1,1,4,32],[1,1,4,64]);
assert.equal(dstStrided.runs.length,1); // L2 destination cannot split LD global source.
for(const tile of [[2,2,3,8],[1,3,2,16],[2,1,2,32]]) {
 const src=[tile[0]+1,tile[1]+1,tile[2]+1,tile[3]+8],base=4000;
 const r=lsu(tile,src,tile,{address:base});const expected=new Set(),actual=new Set();
 for(let n=0;n<tile[0];n++)for(let h=0;h<tile[1];h++)for(let w=0;w<tile[2];w++)for(let c=0;c<tile[3];c++)expected.add(base+((n*src[1]+h)*src[2]+w)*src[3]+c);
 for(const run of r.runs)for(let a=run.address;a<run.address+run.bytes;a++) {assert.ok(!actual.has(a));actual.add(a);}
 assert.deepEqual(actual,expected);
 // Enumerate covered 128B cells per run; padding/overfetch must not lose data.
 for(const run of r.runs) {
  const wanted=new Set(Array.from({length:run.bytes},(_,i)=>Math.floor((run.address+i)/128)));
  const delivered=new Set();
  for(const burst of run.bursts) {
   assert.ok(burst.beats<=32);assert.equal(Math.floor(burst.address/4096),Math.floor((burst.address+burst.beats*128-1)/4096));
   for(let i=0;i<burst.beats;i++)delivered.add(burst.address/128+i);
  }
  assert.deepEqual(delivered,wanted);
 }
}
// Resource schedule: capacity holds, exclusivity holds, and an earlier start
// is impossible under the specified free-resource/slot constraints.
const longHead=lsu([1,1,1,128],undefined,undefined,{store:true,pathExtra:56});
assert.deepEqual(longHead.commands.map(c=>c.start),[0,38,76,114,162,200]);
for(const r of [ld4k,s16,s15,longHead])for(let t=0;t<r.commands.at(-1).end;t++) {
 assert.ok(r.commands.filter(c=>t>=c.start&&t<c.start+r.hold).length<=r.depth);
 assert.ok(r.commands.filter(c=>t>=c.start&&t<c.release).length<=1);
}
// Match every calculator case to the independent fixed inputs and ensure
// live browser computation does not require recorded RTL timing fields.
const lsCases=require('../config/cyclesim-cases.json').groups;
for(const name of ['ld-model','st-model'])for(const c of lsCases[name].cases) {
 const r=model.lsu(c.lsuModel);assert.ok(r.duration>0);assert.equal(r.terms.reduce((s,t)=>s+t[1],0),r.duration);
}
for(const bad of [{tile:[1,1,1,4],src:[1,1,1,2],dst:[1,1,1,4]}, {tile:[1,1,1,4],src:[1,1,1,4],dst:[1,1,1,4],bits:4}, {tile:[1,1,1,4],src:[1,1,1,4],dst:[1,1,1,4],store:true,local:true}])assert.throws(()=>model.lsu(bad),RangeError);
console.log('LSU descriptor byte oracle, partial-burst controls and finite-slot schedule: passed');
