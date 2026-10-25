'use strict';

// Independent hand calculations and behavioral invariants for teaching models.
const assert = require('node:assert/strict');
const model = require('../web/performance-explorer.js');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < Math.max(1e-9, Math.abs(expected) * 1e-10), `${actual} != ${expected}`);

const gemv = model.roofline({m:1,overheadUs:0});
assert.equal(gemv.flops,33554432);
assert.equal(gemv.bytes,33570816);
close(gemv.transferUs,16.785408);
close(gemv.budgetTflops,gemv.ceilingTflops);
const gemm = model.roofline();
assert.equal(gemm.flops,2147483648);
assert.equal(gemm.bytes,34603008);
close(gemm.conditionalUs,22.301504);
// More compute cannot improve a bandwidth-limited budget at fixed traffic.
close(model.roofline({peakTflops:400}).conditionalUs,gemm.conditionalUs);
assert.ok(model.roofline({bandwidthTbps:4}).conditionalUs < gemm.conditionalUs);
assert.equal(model.roofline({m:1024}).dominant,'compute');
for (const m of [1,8,64,256,1024,4096]) {
  for (const overheadUs of [0,5,30]) {
    const r = model.roofline({m,overheadUs});
    assert.ok(r.budgetTflops <= r.ceilingTflops * (1 + 1e-12));
    assert.ok(r.conditionalUs >= r.computeUs && r.conditionalUs >= r.transferUs);
  }
}

const overlap = model.overlap();
assert.equal(overlap.overlapMs,3);
assert.equal(overlap.totalMs,11);
close(overlap.speedup,14/11);
for (const [computeMs,communicationMs] of [[8,6],[6,8],[1,20],[20,1]]) {
  const serial = model.overlap({computeMs,communicationMs,fraction:0});
  const parallel = model.overlap({computeMs,communicationMs,fraction:1});
  assert.equal(serial.totalMs,computeMs+communicationMs);
  assert.equal(parallel.totalMs,Math.max(computeMs,communicationMs));
  assert.ok(parallel.communicationStartMs >= 0);
}
assert.ok(model.overlap({penaltyMs:8}).savedMs < 0);

const decode = model.workload();
assert.equal(decode.parameters,5670699008);
assert.equal(decode.kvBytes,2*2**30);
assert.equal(decode.kvWriteBytes,2**20);
assert.equal(decode.bytes,13489930240);
close(decode.lowerMs,6.74496512);
const twiceBatch = model.workload({batch:16});
assert.equal(twiceBatch.weightBytes,decode.weightBytes);
assert.equal(twiceBatch.kvBytes,2*decode.kvBytes);
assert.equal(twiceBatch.flops,2*decode.flops);
const twiceContext = model.workload({context:4096});
assert.equal(twiceContext.linearFlops,decode.linearFlops);
assert.equal(twiceContext.attentionFlops,2*decode.attentionFlops);
assert.equal(twiceContext.kvBytes,2*decode.kvBytes);
assert.equal(twiceContext.kvWriteBytes,decode.kvWriteBytes);
const mha = model.workload({kvHeads:32});
assert.equal(mha.kvBytes,4*decode.kvBytes);
assert.equal(mha.attentionFlops,decode.attentionFlops);
for (const batch of [1,8,32,128]) {
  for (const context of [512,2048,8192,32768]) {
    const r = model.workload({batch,context});
    assert.ok(Number.isFinite(r.lowerMs) && r.lowerMs > 0);
    assert.ok(r.lowerMs >= r.computeMs && r.lowerMs >= r.transferMs);
  }
}
console.log('PASS: performance teaching models; hand calculations, bottleneck changes, overlap endpoints, KV scaling and GQA invariants.');
