'use strict';

// Small, explicit calculations used by the casebook. These do not run the NPU.
function cycleCaseInput(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Expected a parameter object');
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new RangeError('Unsupported parameter for this casebook profile');
}

function cycleCaseInteger(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`Unsupported ${name}`);
}

var CycleCaseModel = Object.freeze({
  union(intervals) {
    const sorted = intervals.map(x => [x[0], x[1]]).sort((a, b) => a[0] - b[0]);
    let total = 0, end = -Infinity;
    for (const [start, stop] of sorted) {
      if (!Number.isFinite(start) || !Number.isFinite(stop) || stop < start) throw new RangeError('Invalid interval');
      total += Math.max(0, stop - Math.max(start, end));
      end = Math.max(end, stop);
    }
    return total;
  },
  geometry({address, rows, rowBytes, stride, beatBytes = 128, boundary = 4096, maxBeats = 32}) {
    for (const n of [address, rows, rowBytes, stride, beatBytes, boundary, maxBeats]) {
      if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('Geometry must use non-negative integers');
    }
    if (!rows || !rowBytes || !beatBytes || !boundary || !maxBeats || boundary % beatBytes) throw new RangeError('Empty or incompatible geometry');
    if (![rows * rowBytes, address + (rows - 1) * stride + rowBytes].every(Number.isSafeInteger)) throw new RangeError('Geometry exceeds safe integer arithmetic');
    const result = {beats: 0, bursts: 0, partial: 0, partialBursts: 0, useful: rows * rowBytes, rows: []};
    for (let r = 0; r < rows; r++) {
      const start = address + r * stride, stop = start + rowBytes;
      const first = Math.floor(start / beatBytes) * beatBytes;
      const words = [], bursts = [];
      for (let a = first; a < stop; a += beatBytes) {
        const lo = Math.max(start, a) - a, hi = Math.min(stop, a + beatBytes) - a;
        words.push({address: a, lo, hi});
        if (hi - lo < beatBytes) result.partial++;
      }
      for (let i = 0; i < words.length;) {
        const a = words[i].address;
        const count = Math.min(maxBeats, words.length - i, (boundary - a % boundary) / beatBytes);
        const partial = words.slice(i, i + count).some(word => word.hi - word.lo < beatBytes);
        bursts.push({address: a, beats: count, partial});
        if (partial) result.partialBursts++;
        i += count;
      }
      result.beats += words.length;
      result.bursts += bursts.length;
      result.rows.push({start, words, bursts});
    }
    result.writeBytes = result.beats * beatBytes;
    result.readOldBytes = result.partial * beatBytes;
    return result;
  },
  // PeEngine macro arithmetic for the six frozen BF16 KC MTC controls only.
  // The ideal WL1 bench supplies 2048 B/group/cycle. Production attaches WL1.
  // No RTL durations or fitted per-case corrections enter this calculation.
  bf16Mini(input = {}) {
    cycleCaseInput(input, ['N', 'H', 'W', 'C', 'K', 'MTW_count', 'MTK_count', 'MTC_count', 'MTC_raw', 'activation_dtype', 'weight_dtype', 'output_dtype', 'mode']);
    const fixed = {N: 1, H: 1, W: 2, C: 768, K: 128, MTW_count: 2, MTK_count: 1,
      activation_dtype: 'BF16', weight_dtype: 'BF16', output_dtype: 'FP32', mode: 'KC'};
    for (const [key, value] of Object.entries(fixed)) {
      if (Object.hasOwn(input, key) && input[key] !== value) throw new RangeError(`bf16Mini requires ${key}=${value}`);
    }
    const count = input.MTC_count === undefined ? 2 : input.MTC_count;
    if (![1, 2, 3, 4, 6, 12].includes(count)) throw new RangeError('MTC_count must be one of 1, 2, 3, 4, 6, 12');
    if (Object.hasOwn(input, 'MTC_raw') && input.MTC_raw !== count - 1) throw new RangeError('MTC_raw must equal MTC_count - 1');
    const config = {act_credit_rtt: 17, act_credit_capacity: 2, weight_bytes_per_cycle: 2048,
      wl1_attached: false, pipe_latency: 69, write_path_latency: 73, l2_read_latency: 9, l2_write_latency: 9, int4_path: false};
    const Ea = 64, Ek = 128, Eo = 32;
    const paddedW = Math.ceil(fixed.W / fixed.MTW_count) * fixed.MTW_count;
    const cBeats = Math.ceil(fixed.C / Ea), kPasses = Math.ceil(fixed.K / Ek);
    const miniW = Math.min(fixed.MTW_count, fixed.W), miniC = Math.min(count, cBeats), miniK = Math.min(fixed.MTK_count, kPasses);
    const area = Math.min(16, miniW * miniK), ii = Math.max(1, 4 / area);
    const words = miniW * miniC, reads = words * miniK;
    const miniTiles = fixed.N * fixed.H * Math.ceil(paddedW / fixed.MTW_count) * Math.ceil(cBeats / count) * Math.ceil(kPasses / fixed.MTK_count);
    const passes = fixed.N * fixed.H * paddedW * cBeats * kPasses;
    const span = reads <= 4 + area ? reads : 4 + area + Math.ceil((reads - 4 - area) * ii);
    const extra = words <= 2 ? 1 : 0;
    const arrayFloor = Math.ceil(miniTiles * reads * ii);
    const creditNumerator = miniTiles * (span + words + extra + config.act_credit_rtt);
    const creditStream = Math.ceil(creditNumerator / config.act_credit_capacity);
    const stream = Math.max(arrayFloor, creditStream), array = reads + stream;
    const weightBytes = passes * 2048, weightCycles = Math.ceil(weightBytes / config.weight_bytes_per_cycle);
    const writeCycles = fixed.N * fixed.H * paddedW * Math.ceil(fixed.K / 128) * (128 / Eo);
    const workPath = Math.max(array, weightCycles) + config.pipe_latency + config.l2_write_latency;
    const writePath = reads + writeCycles + config.write_path_latency + config.l2_write_latency;
    return {profile: 'bf16-kc-ideal-wl1-mtc-sweep', basis: 'current-source arithmetic; not a new RTL measurement',
      inputs: {...fixed, MTC_count: count, MTC_raw: count - 1}, config,
      Ea, Ek, Eo, padded_W: paddedW, C_beats: cBeats, K_passes: kPasses, K_write_blocks: Math.ceil(fixed.K / 128), passes,
      mini_W: miniW, mini_C: miniC, mini_K: miniK, mini_tiles: miniTiles,
      words_per_mini: words, reads_per_mini: reads, A: area, II: ii, cold_span: span, short_burst_extra: extra,
      stream_array_floor: arrayFloor, stream_credit_numerator: creditNumerator,
      stream_credit_denominator: config.act_credit_capacity, stream_credit_ceil: creditStream,
      stream_selected: stream, first_mini_fill: reads, array_cycles: array,
      compute_cycles_diagnostic_only: Math.round(passes * ii),
      read_cycles_diagnostic_only: fixed.N * fixed.H * paddedW * cBeats * Math.ceil(kPasses / fixed.MTK_count),
      write_cycles: writeCycles, weight_demand_bytes_rate_account: weightBytes, weight_cycles: weightCycles,
      weight_demand_scope: 'per pegroup rate accounting; not DRAM physical bytes',
      work_plus_envelope: workPath, write_path_total: writePath, cycles: Math.max(workPath, writePath)};
  },
  // Rectangular DT_TRA BF16/order4 corner-turn blocks, N=1, ideal L2 only.
  // The timing fixtures retain destination surface=[1,H,W,C]; they do not
  // certify the numerical layout of a compact NCHW output. No contention model.
  dtPartial(input = {}) {
    cycleCaseInput(input, ['N', 'H', 'W', 'C', 'Lrd', 'Lwr', 'order', 'format', 'reshape']);
    const {N = 1, H = 16, W = 8, C = 20, Lrd = 9, Lwr = 2, order = 4, format = 'BF16', reshape = false} = input;
    if (N !== 1 || order !== 4 || format !== 'BF16' || reshape !== false) throw new RangeError('dtPartial requires N=1, order=4, BF16, DT_TRA');
    for (const [name, value] of Object.entries({H, W, C})) cycleCaseInteger(value, name, 1, 4096);
    cycleCaseInteger(Lrd, 'Lrd', 2, 12);
    // DtEngine rejects larger Lwr at its write-response FIFO knee.
    cycleCaseInteger(Lwr, 'Lwr', 1, 15);
    const E = 16;
    const chunks = size => Array.from({length: Math.ceil(size / E)}, (_, index) => Math.min(E, size - index * E));
    const f = chunks(W), d = chunks(C), blockPairs = [];
    for (let row = 0; row < f.length; row++) {
      for (let column = 0; column < d.length; column++) {
        blockPairs.push({row, column, fill: f[row], drain: d[column], charged: Math.max(f[row], d[column])});
      }
    }
    const R = H * W * d.length, write = H * f.length * C, NB = H * blockPairs.length;
    const Bl = Math.min(f[0], d[d.length - 1]);
    const perTraversal = blockPairs.reduce((total, block) => total + block.charged, 0), XFER = H * perTraversal;
    const fixedTerms = Bl + Lrd + Lwr + 2, exec = XFER + NB + fixedTerms;
    const wrongMaxExec = Math.max(R, write) + NB + fixedTerms;
    return {profile: 'dt-tra-bf16-order4-ideal-l2', basis: 'current-source arithmetic; arbitrary new shapes are not measured RTL',
      input: {N, H, W, C, Lrd, Lwr, order, format, reshape}, E, f, d, blockPairs, per_traversal: perTraversal,
      R, write, NB, Bl, XFER, exec, head: 3, command_to_done: exec + 3,
      wrong_max_exec: wrongMaxExec, max_sum_underestimate: exec - wrongMaxExec,
      logical_payload_bytes: H * W * C * 2, read_capacity_bytes: R * 32, write_capacity_bytes: write * 32,
      recorded_destination_surface: [1, H, W, C],
      boundary: 'inst_start to inst_done; command_to_done additionally includes head=3; ideal always-ready fixed-latency L2, no bank conflicts or response-FIFO saturation'};
  },
  difference(model, rtl) {
    if (!Number.isFinite(rtl) || !(rtl > 0) || !Number.isFinite(model) || model < 0) throw new RangeError('Invalid comparison');
    const cycles = model - rtl, percent = 100 * (cycles / rtl);
    if (!Number.isFinite(cycles) || !Number.isFinite(percent)) throw new RangeError('Comparison exceeds finite arithmetic');
    return {cycles, percent};
  }
});
if (typeof module !== 'undefined' && module.exports) module.exports = CycleCaseModel;
