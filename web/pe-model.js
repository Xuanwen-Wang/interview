'use strict';

// KC FP8 normal packing only. This maps bytes; it does not simulate RTL timing.
const PEModel = Object.freeze({
  locate(k, c) {
    if (!Number.isInteger(k) || !Number.isInteger(c) || k < 0 || k >= 128 || c < 0 || c >= 128) throw new RangeError('Expected local k,c in [0,128)');
    const group = Math.floor(k / 16), alu = k % 16;
    const pe = Math.floor(c / 16), u = c % 16;
    return {group, pe, alu, mac:Math.floor(u / 2), lane:u % 2,
      groupByte:alu * 128 + pe * 16 + u,
      round:Math.floor(alu / 8), hub:Math.floor((alu % 8) / 4),
      mc:4 * (alu % 4) + Math.floor(pe / 2), byte:16 * (pe % 2) + u};
  },
  activation(c) { return c % 5 - 2; },
  weight(k, c) { return (3 * k + 2 * c) % 7 - 3; },
  accumulate(k, blocks) {
    if (![1, 2].includes(blocks)) throw new RangeError('Teaching example has one or two C blocks');
    const partials = Array.from({length:8}, (_, p) => Array.from({length:blocks}, (_, t) => {
      let sum = 0;
      for (let u = 0; u < 16; u++) { const c = 128 * t + 16 * p + u; sum += PEModel.activation(c) * PEModel.weight(k, c); }
      return sum;
    }));
    const ol1 = partials.map(row => row.reduce((a, b) => a + b, 0));
    return {partials, ol1, output:ol1.reduce((a, b) => a + b, 0)};
  },
  budget({w, r, hubs, mhz, cElements}) {
    if (![w,r,mhz,cElements].every(x=>Number.isFinite(x)&&x>0) || ![1,2].includes(hubs) || !Number.isInteger(w) || w > 16 || cElements % 128) throw new RangeError('Invalid teaching parameters');
    const bytesPerCycle = 8 * hubs * 16 * 32 * Math.min(1, 15 / r);
    const interval = 16384 / bytesPerCycle;
    const cUnits = cElements / 128, c = Math.min(cUnits, Math.floor(64 / w));
    const cTiles = Math.ceil(cUnits / c);
    return {bytesPerCycle, interval, tbps:bytesPerCycle * mhz / 1e6,
      fp8Tops:16384 * 2 * mhz / 1e6, weightCeiling:Math.min(1,w/interval),
      requiredBytesPerCycle:16384 / w, c, cTiles, canRetain:cTiles<=2};
  }
});

if (typeof module !== 'undefined' && module.exports) module.exports = PEModel;
