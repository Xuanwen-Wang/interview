'use strict';

const assert = require('node:assert/strict');
const model = require('../web/pe-model.js');
const slots = new Set();
for (let k = 0; k < 128; k++) {
  for (let c = 0; c < 128; c++) {
    const v = model.locate(k, c);
    const slot = [v.group, v.round, v.hub, v.mc, v.byte].join(':');
    assert(!slots.has(slot), 'Each weight byte has a distinct physical slot');
    slots.add(slot);
    // Independently reconstruct coordinates from the two-round MC return layout.
    const a = 8 * v.round + 4 * v.hub + Math.floor(v.mc / 4);
    const p = 2 * (v.mc % 4) + Math.floor(v.byte / 16);
    assert.equal(16 * v.group + a, k);
    assert.equal(16 * p + v.byte % 16, c);
    assert.equal(v.groupByte, 128 * a + 16 * p + v.byte % 16);
    assert.equal(16 * v.pe + 2 * v.mac + v.lane, c);
  }
  for (const blocks of [1, 2]) {
    let direct = 0;
    for (let c = 0; c < 128 * blocks; c++) direct += (c % 5 - 2) * ((3 * k + 2 * c) % 7 - 3);
    assert.equal(model.accumulate(k, blocks).output, direct, 'PE partial sums equal the full dot product');
  }
}
assert.equal(slots.size, 16384);
const budget = (changes = {}) => model.budget({w:4, r:23, hubs:2, mhz:400, cElements:4096, ...changes});
const close = (a, b) => assert(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
close(budget().interval, 46 / 15);
close(budget().tbps, 2.1370434782608694);
close(budget().fp8Tops, 13.1072);
close(budget({w:1}).weightCeiling, 15 / 46);
close(budget({w:2}).weightCeiling, 30 / 46);
close(budget().weightCeiling, 1);
close(budget({hubs:1}).interval, 92 / 15);
close(budget({r:10}).interval, 2);
close(budget({mhz:500}).interval, budget().interval);
assert.equal(budget().cTiles, 2);
assert.equal(budget({w:8}).cTiles, 4);
assert.equal(budget({w:16}).cTiles, 8);
assert.equal(budget({w:16, cElements:512}).cTiles, 1);
assert.throws(() => model.locate(128, 0), RangeError);
assert.throws(() => model.locate(0, -1), RangeError);
console.log('PE teaching model: 16,384 byte slots, 256 dot products, bandwidth and residency checks passed. This is not RTL simulation.');
