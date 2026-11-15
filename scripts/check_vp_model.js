'use strict';
const assert = require('node:assert/strict');
const vp = require('../web/vp-architecture.js');

// Enumerate every logical element independently of packet grouping.
for (const dtype of ['bf16', 'fp32']) {
  const bytes = dtype === 'bf16' ? 2 : 4;
  for (const width of [1, 31, 32, 33, 63, 64, 65, 131, 4096]) {
    for (let row = 0; row < 4; row++) {
      const positions = new Set();
      for (let col = 0; col < width; col++) {
        const p = vp.locate(dtype, row, col, width);
        assert.equal(p.offset, (row * width + col) * bytes);
        assert.equal(p.group * 128 + p.byteInGroup, col * bytes);
        assert.equal(p.first + (p.engine === 'B' ? 32 : 0) + p.lane, col);
        assert.ok(p.position < p.valid && p.lane < 32);
        if (dtype === 'fp32') assert.equal(p.engine, 'A');
        positions.add(`${p.group}:${p.engine}:${p.lane}`);
      }
      assert.equal(positions.size, width);
    }
  }
}
assert.equal(vp.locate('bf16', 1, 37).offset, 8266);
assert.equal(vp.locate('fp32', 1, 37).offset, 16532);
assert.equal(vp.locate('bf16', 0, 31).engine, 'A');
assert.equal(vp.locate('bf16', 0, 32).engine, 'B');
assert.equal(vp.locate('bf16', 0, 64).group, 1);
for (const args of [['bf16',4,0],['fp32',0,4096],['bf16',0,-1],['int8',0,0]])
  assert.throws(() => vp.locate(...args), RangeError);

// Directly sum input values, including a partial final window.
for (const width of [1, 128, 131, 4096]) {
  for (let row = 0; row < 4; row++) {
    const data = Array.from({length: width}, () => row + 1);
    const expectedSum = data.reduce((s, x) => s + x*x, 0);
    const last = vp.reduction(row, 0, width).last;
    let previous = 0;
    for (let step = 0; step <= last; step++) {
      const s = vp.reduction(row, step, width);
      assert.equal(s.sum, data.slice(0, s.processed).reduce((n, x) => n + x*x, 0));
      assert.ok(s.sum >= previous);
      previous = s.sum;
      assert.equal(s.done, step === last);
      if (s.collected < s.windows) assert.equal(s.coefficient, null);
      if (s.coefficient !== null) {
        assert.equal(s.sum, expectedSum);
        assert.ok(Math.abs(s.coefficient - 1/Math.sqrt(expectedSum/width + 1e-6)) < 1e-12);
      }
      if (s.emitted) assert.notEqual(s.coefficient, null);
      if (s.done) assert.equal(s.emitted, s.windows);
    }
  }
}
assert.equal(vp.reduction(1, 1).sum, 512);
assert.equal(vp.reduction(1, 32).coefficient, null);
assert.notEqual(vp.reduction(1, 33).coefficient, null);
assert.equal(vp.reduction(2, 0).sum, 0);
assert.throws(() => vp.reduction(0, 66), RangeError);

for (const scenario of ['normal', 'late-y', 'blocked-write']) {
  const states = vp.pipeline(scenario);
  let paired = false;
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    if (s.x !== null && s.y !== null) paired = true;
    if (s.z !== null) { assert.ok(paired); assert.equal(s.z, 1.5 * -2); }
    if (s.waiting) {
      assert.ok(i > 0);
      for (const key of ['x', 'y', 'z', 'pending']) assert.equal(s[key], states[i-1][key]);
      assert.equal(s.done, false);
    }
    if (s.pending) assert.equal(s.done, false);
    assert.equal(s.done, i === states.length-1);
  }
  assert.equal(states.at(-2).pending, 1);
  assert.equal(states.at(-1).pending, 0);
  assert.equal(states.at(-1).z, -3);
}
assert.throws(() => vp.pipeline('unknown'), RangeError);
console.log('VP logical coordinates, reduction scope, state retention and completion: PASS');
