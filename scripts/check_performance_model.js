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

// Public Qwen3-8B Gate dimensions; expected counts were computed separately.
const qwenGate = model.roofline({m:8,n:12288,overheadUs:0});
assert.equal(qwenGate.flops,805306368);
assert.equal(qwenGate.bytes,100925440);
close(qwenGate.transferUs,50.46272);
const qwenPrefill = model.roofline({m:2048,n:12288,overheadUs:0});
assert.equal(qwenPrefill.flops,206158430208);
assert.equal(qwenPrefill.bytes,167772160);
close(qwenPrefill.intensity,1228.8);
assert.equal(qwenPrefill.dominant,'compute');
// Swapping K/N preserves this cold-read byte model, not real kernel latency.
const qwenDown = model.roofline({m:8,k:12288,n:4096,overheadUs:0});
assert.equal(qwenDown.bytes,qwenGate.bytes);
assert.equal(qwenDown.flops,qwenGate.flops);
assert.equal(model.roofline({m:105}).dominant,'transfer');
assert.equal(model.roofline({m:106}).dominant,'compute');
for(const n of [4096,12288]) {
  let previousIntensity=0;
  for(const m of [1,8,64,256,1024,2048,4096]) {
    const r=model.roofline({m,n});
    assert.ok(r.intensity>previousIntensity);
    assert.ok(r.intensity<m); // Activation/output bytes prevent I == M.
    assert.ok(r.budgetTflops<r.ceilingTflops);
    previousIntensity=r.intensity;
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
const stepMetrics = model.stepMetrics();
assert.equal(stepMetrics.sequences,32);
assert.equal(stepMetrics.perSequenceTps,25);
assert.equal(stepMetrics.perCardTps,200);
assert.equal(stepMetrics.instanceTps,800);
assert.equal(stepMetrics.tokensPerStep,32);
const fractionalNormalization = model.stepMetrics({concurrencyPerCard:2.5});
assert.equal(fractionalNormalization.sequences,10);
// This checks arithmetic only; it does not identify a dashboard's topology.
const alternativeStep = model.stepMetrics({stepMs:34.767});
assert.equal(alternativeStep.perSequenceTps.toFixed(2),'28.76');
assert.equal(alternativeStep.perCardTps.toFixed(2),'230.10');
for (const cards of [1,4,8]) {
  for (const acceptedPerSequence of [0,0.5,1,3]) {
    const r = model.stepMetrics({cards,acceptedPerSequence});
    close(r.instanceTps,cards*r.perCardTps);
    close(r.instanceTps,r.sequences*r.perSequenceTps);
    close(r.instanceTps,r.tokensPerStep/0.04);
  }
}
const windowMetrics = model.windowMetrics();
assert.equal(windowMetrics.rps,2);
assert.equal(windowMetrics.instanceTps,512);
assert.equal(windowMetrics.perCardTps,128);
close(windowMetrics.goodputRps,4/3);
assert.equal(windowMetrics.averageOutputTokens,256);
close(windowMetrics.sloFraction,2/3);
close(windowMetrics.instanceTps,windowMetrics.rps*windowMetrics.averageOutputTokens);
const emptyWindow = model.windowMetrics({successes:0,outputTokens:0,sloSuccesses:0});
assert.equal(emptyWindow.rps,0);
assert.equal(emptyWindow.instanceTps,0);
assert.equal(emptyWindow.goodputRps,0);
assert.equal(emptyWindow.averageOutputTokens,null);
assert.equal(emptyWindow.sloFraction,null);
assert.equal(model.windowMetrics({sloSuccesses:0}).goodputRps,0);
assert.equal(model.windowMetrics({sloSuccesses:120}).goodputRps,2);
assert.equal(model.windowMetrics({cards:8}).instanceTps,512);
assert.equal(model.windowMetrics({cards:8}).perCardTps,64);
for (const invalid of [0,-1,NaN,Infinity,-Infinity,'40',null]) {
  assert.throws(()=>model.stepMetrics({stepMs:invalid}),RangeError);
  assert.throws(()=>model.windowMetrics({seconds:invalid}),RangeError);
}
for (const invalid of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) {
  assert.throws(()=>model.stepMetrics({cards:invalid}),RangeError);
  assert.throws(()=>model.windowMetrics({cards:invalid}),RangeError);
}
for (const invalid of [-1,NaN,Infinity]) {
  assert.throws(()=>model.stepMetrics({acceptedPerSequence:invalid}),RangeError);
  assert.throws(()=>model.windowMetrics({outputTokens:invalid}),RangeError);
}
assert.throws(()=>model.stepMetrics({concurrencyPerCard:0}),RangeError);
assert.throws(()=>model.stepMetrics({concurrencyPerCard:0.3,cards:4}),RangeError);
assert.throws(()=>model.stepMetrics({stepMs:Number.MIN_VALUE}),RangeError);
assert.throws(()=>model.stepMetrics({acceptedPerSequence:Number.MAX_VALUE}),RangeError);
assert.throws(()=>model.windowMetrics({seconds:Number.MIN_VALUE}),RangeError);
assert.throws(()=>model.windowMetrics({sloSuccesses:121}),RangeError);
assert.throws(()=>model.windowMetrics({successes:0,outputTokens:1,sloSuccesses:0}),RangeError);
assert.throws(()=>model.windowMetrics({outputTokens:1.5}),RangeError);
assert.throws(()=>model.windowMetrics({successes:-1}),RangeError);
console.log('PASS: performance teaching models; roofline, overlap, KV/GQA, step/window throughput and invalid-input boundaries.');
